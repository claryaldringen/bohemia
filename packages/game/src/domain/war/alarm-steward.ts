import type { Landscape } from '../landscape';
import { villageCentre } from '../village/people/departure';
import type { VillageState } from '../village/types';
import { alarmCellOf, alarmEnded, alarmVillage, refugeHosts } from './alarm';
import type { AlarmVillage } from './alarm-types';
import { gridOf, MissingData } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignPlace, CampaignState } from './campaign-types';
import { alarmTaken, departFlight, withoutTaken } from './evacuation';
import { stanceOf } from './flight';
import { lordHomeAt } from './lord-home';
import { sendMessenger, warnDomain } from './messenger';
import {
  refugeHostOf,
  refugeOptions,
  stewardAlarmChoice,
  type RefugeOptions,
} from './refuge-choice';
import { WAR } from './rules-war';
import { absentTicks } from './ticks';

// Kdo za varovanou ves rozhoduje (war.md – Hráč ve vsi a mimo ni; Varování, poslové a útěk do
// hradiště; plán 2026-11-14 – Rozhodnutí plánu 3, Úloha 5b). Martin 14. 11. 2026: „Pokud je ve
// vesnici, tak … je na něm, jak zorganizuje obranu, či evakuaci. Pokud ve vesnici není, vesničané
// se zachovají podle nastavení.“ a „Pokud je hráč ve své vesnici, tak jí ovládá.“ Vsi NPC rodů
// a vsi, kde vojvoda není doma, rozhodnou pravidlem správce hned (lhůta hráče odpadá); ves
// s vojvodou doma – i se zapnutým správcem – se zeptá, zda je hráč u hry (`askedTick` – worker
// odpoví záměrem `alarm-presence`), a rozhoduje hráč, dokud u hry je – bez přítomnosti déle než
// 1 herní den (`absentTicks`) rozhodne správce. Vzdáním vojvody varování vsi končí (`alarmEnded`).
// Pravidlo
// (`stewardAlarmChoice`): posel do hradiště pána vždy, jde-li (vesničan pěšky, bez vesničana muž
// rodu – Martin 9. 11. 2026 „Ano“); s postojem evakuace a bez vlastního útočiště lidé do hradiště,
// stihnou-li to – „se vším“, jinak „jen lidé“ –, jinak do lesa. Totéž hradiště pro posly do vsí
// své domény (od příchodu posla vsi).

/**
 * Rozhodnutí za vsi ve varování v taktu `tick` (po spatření a poslech – `campaignTick`): ves, která
 * o vojsku ví a za kterou ještě nerozhodl správce, se zařídí podle `deciderOf` – správce rozhodne
 * pravidlem, hráč nic, 'ask' zapíše dotaz na přítomnost. Ves, kde už volil hráč
 * (`decided: 'player'`), převezme správce, když za ni teď rozhoduje nastavení (`playerLeft` –
 * vojvoda vyběhl jako posel, odjel, je v zajetí, nebo hráč není u hry), dokud jsou lidé doma.
 * Hradiště hráče (NPC hradiště – `hillfortHeard` v `messenger.ts`), ke kterému doběhl posel vsi
 * a které posly do domény ještě nerozeslalo, se zařídí podle téhož pravidla. Ves, kterou posel
 * správce právě varoval, rozhodne v témž taktu. Správce rozhoduje jednou – i když pravidlo nic
 * nepustí. Ves, jejíž varování skončilo vzdáním vojvody (`alarmEnded`), už nerozhoduje nikdo.
 */
export function decideAlarms(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  const alarm = s.alarm;
  if (!alarm) return;
  const done = new Set<string>();
  for (;;) {
    const v = alarm.villages.find((x) => !done.has(x.villageId));
    if (!v) return;
    done.add(v.villageId);
    if (v.warnTick > tick || alarmEnded(s, v.villageId)) continue;
    if (v.decided !== 'steward') decideVillage(s, v, tick, ctx, out);
    decideDomain(s, v, tick, ctx, out);
  }
}

/**
 * Kdo za ves v taktu rozhoduje – Rozhodnutí plánu 3 a Úloha 5b; 'ask' = zapsat askedTick a čekat.
 * V tomto pořadí: ves bez hráče (`withoutPlayer` – NPC rod, vojvoda není doma) → správce hned;
 * čeká se na odpověď (`askedTick`) → hráč; bez údaje o přítomnosti → zeptat se; hráč u hry nebyl
 * (`presenceTick` null) nebo je pryč déle než `absentTicks` → správce; jinak hráč. Zapnutý správce
 * pořadí nemění (Martin 14. 11. 2026: „Pokud je hráč ve své vesnici, tak jí ovládá.“).
 */
export function deciderOf(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
): 'steward' | 'player' | 'ask' {
  if (withoutPlayer(s, v, ctx)) return 'steward';
  if (v.askedTick !== undefined) return 'player';
  if (v.presenceTick === undefined) return 'ask';
  if (v.presenceTick === null || tick - v.presenceTick > absentTicks(ctx.world.clock)) {
    return 'steward';
  }
  return 'player';
}

/**
 * Je ves bez hráče (war.md – Hráč ve vsi a mimo ni: „Hráč je tam, kde je vojvoda“)? NPC rod, nebo
 * hráčův muž není doma (`lordHomeAt` – i když ho tažení dnes odvedlo jako posla, se skupinou
 * uprchlíků nebo do zajetí). Zapnutý správce na tom nic nemění (Martin 14. 11. 2026: „Pokud je
 * hráč ve své vesnici, tak jí ovládá.“ – Úloha 5b, přebíjí Rozhodnutí plánu 3).
 */
function withoutPlayer(s: CampaignState, v: AlarmVillage, ctx: TickContext): boolean {
  return v.owner.npc || !lordHomeAt(s, v.villageId, v.owner, ctx);
}

/**
 * Záměr vlastníka varované vsi je přítomnost hráče u hry (Rozhodnutí plánu 2): odpověď na dotaz
 * (`askedTick` zmizí) a `presenceTick` = pozdější ze známé přítomnosti a `seen` (`alarm-presence` –
 * `seenTick`, jiný záměr – jeho takt); null jen, když žádnou neznáme.
 */
export function notePresence(v: AlarmVillage, seen: number | null): void {
  delete v.askedTick;
  const known = v.presenceTick ?? null;
  if (known === null) v.presenceTick = seen;
  else if (seen !== null) v.presenceTick = Math.max(known, seen);
}

/**
 * Co potřebuje varovaná ves `v` po taktu `s.tick` vědět o přítomnosti hráče – odpovídá worker
 * záměrem `alarm-presence` (plán 2026-11-14 – Rozhodnutí plánu 2, Úloha 6): 'ask' – ves hráče se
 * ptá (`askedTick`; odpověď dostane každý dotaz, i hradiště, kde vesnickou část už rozhodl
 * správce); 'refresh' – známá přítomnost je stará `presenceRefreshTicks` a víc a o vsi ještě může
 * rozhodnout (`presenceMatters`); jinak null. NPC ves nic; hráč u hry nebyl (`presenceTick` null) –
 * za ves už rozhodl správce, obnova nic nezmění.
 */
export function presenceWanted(s: CampaignState, v: AlarmVillage): 'ask' | 'refresh' | null {
  if (v.owner.npc || v.owner.playerId === null) return null;
  if (v.askedTick !== undefined) return 'ask';
  if (typeof v.presenceTick !== 'number') return null;
  if (s.tick - v.presenceTick < WAR.alarm.presenceRefreshTicks) return null;
  return presenceMatters(s, v) ? 'refresh' : null;
}

/**
 * Rozhodne o vsi ještě přítomnost hráče (`deciderOf`)? Vesnickou část nerozhodl nikdo, nebo hráč
 * a lidé jsou doma (`playerLeft` – Ruling 4: hráč, který po volbě dál hraje, o ves nepřijde), nebo
 * hradiště s doběhlým poslem vsi posly do domény ještě nerozeslalo (`decideDomain`). Ne po vzdání
 * vojvody (`alarmEnded` – varování skončilo).
 */
function presenceMatters(s: CampaignState, v: AlarmVillage): boolean {
  if (alarmEnded(s, v.villageId)) return false;
  if (v.decided === undefined || (v.decided === 'player' && v.flight === undefined)) return true;
  return v.domain === undefined && heardTick(s, v.villageId) !== null;
}

function stateOf(s: CampaignState, villageId: string, ctx: TickContext): VillageState {
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  return state;
}

/**
 * Pravidlo správce za ves (Otevřené 6), rozhoduje-li za ni správce (`deciderOf`; ves, kde už volil
 * hráč, jen dokud jsou lidé doma – `playerLeft`): co ves může (`refugeOptions` – stav bez toho, co
 * tažení dnes odvedlo), postoj a vlastní útočiště (`refugeHostOf` – hotové opevnění s plochou) →
 * `stewardAlarmChoice`; posel vyběhne první, skupina odejde bez něj (`departFlight` volbu ověří
 * znovu). Na volbu hráče jen naváže – posla ani skupinu podruhé nepošle. `decided` = správce,
 * i když nic nešlo. 'ask' – dotaz na přítomnost (`askedTick`).
 */
function decideVillage(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
  out: TickOut,
): void {
  const by = v.decided === 'player' ? playerLeft(s, v, tick, ctx) : deciderOf(s, v, tick, ctx);
  if (by === 'ask') v.askedTick = tick;
  if (by !== 'steward') return;
  const { options, home, village, landscape } = alarmChoices(s, v, tick, ctx);
  const ownRefuge = refugeHostOf(v.villageId, home, landscape, village.cell, s.day) !== null;
  const choice = stewardAlarmChoice(options, stanceOf(home), ownRefuge);
  if (choice.messenger) sendMessenger(s, v.villageId, ctx, out, { by: 'steward' });
  if (choice.flee !== null) departFlight(s, v.villageId, choice.flee, ctx, out, { by: 'steward' });
  v.decided = 'steward';
}

/**
 * Ves, kde už volil hráč: zbytek převezme správce, když za ni teď rozhoduje nastavení (`deciderOf`
 * – vojvoda není doma, nebo hráč déle než `absentTicks` není u hry; Úloha 5b – doslovné čtení
 * „hráč není u hry → nastavení“) a lidé jsou ještě doma – skupina uprchlíků bere všechny přítomné
 * (`flightLoad`), po ní správce nemá co rozhodnout. Co hráč zvolil, správce nezopakuje (posel –
 * `messengerSent`, útěk – tato podmínka). Přítomnost po volbě obnovuje worker (Úloha 6).
 */
function playerLeft(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
): 'steward' | 'player' {
  return v.flight === undefined && deciderOf(s, v, tick, ctx) === 'steward' ? 'steward' : 'player';
}

/** Co varovaná ves v taktu může – `alarmChoices`. */
export interface AlarmChoices {
  options: RefugeOptions;
  /** Stav vsi bez lidí, zásob a dobytka, které tažení dnes už odvedlo (posel, skupina). */
  home: VillageState;
  /** Políčko a střed vsi. */
  village: CampaignPlace;
  /** Krajina mapy vsi (vlastní útočiště – `refugeHostOf`). */
  landscape: Landscape;
}

/**
 * Co varovaná ves `v` v taktu `tick` může (`refugeOptions`) – pravidlo správce i pohled hráče
 * (Úloha 12 – zašedlé volby s důvodem a odhady): stav vsi bez toho, co tažení dnes odvedlo,
 * kandidáti hradišť (`refugeHosts`), mřížka mapy vsi, místo a čas spatření, běžící posel a odešlá
 * skupina. `messengerId` = posel, kterého vybral hráč. Chybí-li data, takt čeká (`MissingData`).
 */
export function alarmChoices(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
  messengerId?: number,
): AlarmChoices {
  const state = stateOf(s, v.villageId, ctx);
  const cell = alarmCellOf(v);
  const map = ctx.world.landscapeOf(cell);
  if (map === null) throw new MissingData([{ ...cell }], []);
  const home = withoutTaken(state, alarmTaken(s, v.villageId, s.day, ctx.world.clock));
  const { hosts } = refugeHosts(s, v.villageId, cell, ctx);
  const village = { cell, pos: villageCentre(state) };
  const options = refugeOptions({
    state: home,
    day: s.day,
    village,
    grid: gridOf(cell, s.day, ctx),
    seenAt: v.seenAt,
    sinceSeenTicks: tick - v.seenTick,
    hosts,
    messengerSent: v.messenger !== undefined,
    fled: v.flight !== undefined,
    ...(messengerId === undefined ? {} : { messengerId }),
  });
  return { options, home, village, landscape: map.landscape };
}

/**
 * Hradiště hráče rozešle posly do domény (Otevřené 5) za správce: doběhl-li k němu posel vsi
 * (`heardTick`) a posly ještě nerozeslalo (`AlarmVillage.domain`) – podle `deciderOf` jako ves
 * (bez hráče hned, hráč u hry sám, bez přítomnosti po `absentTicks`; 'ask' – dotaz). NPC hradiště
 * rozesílá samo při příchodu (`hillfortHeard`); bez portu domény nic.
 */
function decideDomain(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
  out: TickOut,
): void {
  if (v.owner.npc || v.domain !== undefined || !ctx.world.domainOf) return;
  const heard = heardTick(s, v.villageId);
  if (heard === null || heard > tick) return;
  const by = deciderOf(s, v, tick, ctx);
  if (by === 'ask') v.askedTick = tick;
  if (by !== 'steward') return;
  warnDomain(s, v.villageId, ctx, out, null);
}

/**
 * Takt, kdy do hradiště `villageId` doběhl první posel vsi (ne posel jiného hradiště do domény –
 * `AlarmVillage.messenger` odesílatele); žádný – null.
 */
export function heardTick(s: CampaignState, villageId: string): number | null {
  let heard: number | null = null;
  for (const m of s.alarm?.messengers ?? []) {
    if (m.toVillageId !== villageId || m.status !== 'arrived' || m.doneTick === undefined) continue;
    if (alarmVillage(s, m.fromVillageId)?.messenger !== m.refId) continue;
    if (heard === null || m.doneTick < heard) heard = m.doneTick;
  }
  return heard;
}
