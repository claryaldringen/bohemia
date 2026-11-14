import type { Landscape } from '../landscape';
import { villageCentre } from '../village/people/departure';
import type { VillageState } from '../village/types';
import { alarmCellOf, alarmVillage, refugeHosts } from './alarm';
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
import { absentTicks } from './ticks';

// Kdo za varovanou ves rozhoduje (war.md – Hráč ve vsi a mimo ni; Varování, poslové a útěk do
// hradiště; plán 2026-11-14 – Rozhodnutí plánu 3). Martin 14. 11. 2026: „Pokud je ve vesnici, tak
// … je na něm, jak zorganizuje obranu, či evakuaci. Pokud ve vesnici není, vesničané se zachovají
// podle nastavení.“ Vsi NPC rodů, vsi se zapnutým správcem a vsi, kde vojvoda není doma, rozhodnou
// pravidlem správce hned (lhůta hráče odpadá); ves s vojvodou doma se zeptá, zda je hráč u hry
// (`askedTick` – worker odpoví záměrem `alarm-presence`), a rozhoduje hráč, dokud u hry je – bez
// přítomnosti déle než 1 herní den (`absentTicks`) rozhodne správce. Pravidlo
// (`stewardAlarmChoice`): posel do hradiště pána vždy, jde-li (vesničan pěšky, bez vesničana muž
// rodu – Martin 9. 11. 2026 „Ano“); s postojem evakuace a bez vlastního útočiště lidé do hradiště,
// stihnou-li to – „se vším“, jinak „jen lidé“ –, jinak do lesa. Totéž hradiště pro posly do vsí
// své domény (od příchodu posla vsi).

/**
 * Rozhodnutí za vsi ve varování v taktu `tick` (po spatření a poslech – `campaignTick`): ves, která
 * o vojsku ví a za kterou ještě nerozhodl správce, se zařídí podle `deciderOf` – správce rozhodne
 * pravidlem, hráč nic, 'ask' zapíše dotaz na přítomnost. Ves, kde už volil hráč
 * (`decided: 'player'`), převezme správce jen bez hráče, dokud jsou lidé doma (vojvoda vyběhl
 * jako posel, je v zajetí – Review Focus 2); přítomnost u hry ji už nepřepne. Hradiště hráče (NPC
 * hradiště – `hillfortHeard` v `messenger.ts`), ke kterému doběhl posel vsi a které posly do
 * domény ještě nerozeslalo, se zařídí podle téhož pravidla. Ves, kterou posel správce právě
 * varoval, rozhodne v témž taktu. Správce rozhoduje jednou – i když pravidlo nic nepustí.
 */
export function decideAlarms(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  const alarm = s.alarm;
  if (!alarm) return;
  const done = new Set<string>();
  for (;;) {
    const v = alarm.villages.find((x) => !done.has(x.villageId));
    if (!v) return;
    done.add(v.villageId);
    if (v.warnTick > tick) continue;
    if (v.decided !== 'steward') decideVillage(s, v, tick, ctx, out);
    decideDomain(s, v, tick, ctx, out);
  }
}

/**
 * Kdo za ves v taktu rozhoduje – Rozhodnutí plánu 3; 'ask' = zapsat askedTick a čekat. V tomto
 * pořadí: ves bez hráče (`withoutPlayer` – NPC rod, zapnutý správce, vojvoda není doma) → správce
 * hned; čeká se na odpověď (`askedTick`) → hráč; bez údaje o přítomnosti → zeptat se; hráč u hry
 * nebyl (`presenceTick` null) nebo je pryč déle než `absentTicks` → správce; jinak hráč.
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
 * Je ves bez hráče (war.md – Hráč ve vsi a mimo ni: „Ostatní vsi rodu a vsi se správcem jsou bez
 * hráče“)? NPC rod, zapnutý správce, nebo hráčův muž není doma (`lordHomeAt` – i když ho tažení
 * dnes odvedlo jako posla nebo se skupinou uprchlíků).
 */
function withoutPlayer(s: CampaignState, v: AlarmVillage, ctx: TickContext): boolean {
  if (v.owner.npc) return true;
  // zapnutý správce rozhoduje podle nastavení i s vojvodou doma (Rozhodnutí plánu 3 – návrh
  // Clauda, Martinovi předloženo 14. 11. 2026, zatím bez odpovědi; jiná volba = jen tento řádek)
  if (stateOf(s, v.villageId, ctx).steward?.on === true) return true;
  return !lordHomeAt(s, v.villageId, v.owner, ctx);
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

function stateOf(s: CampaignState, villageId: string, ctx: TickContext): VillageState {
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  return state;
}

/**
 * Pravidlo správce za ves (Otevřené 6), rozhoduje-li za ni správce (`deciderOf`; ves, kde už volil
 * hráč, jen bez hráče – `withoutPlayer`): co ves může (`refugeOptions` – stav bez toho, co tažení
 * dnes odvedlo), postoj a vlastní útočiště (`refugeHostOf` – hotové opevnění s plochou) →
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
  const by = v.decided === 'player' ? playerLeft(s, v, ctx) : deciderOf(s, v, tick, ctx);
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
 * Ves, kde už volil hráč: zbytek převezme správce, jen když ves zůstala bez hráče a lidé jsou ještě
 * doma – skupina uprchlíků bere všechny přítomné (`flightLoad`), po ní správce nemá co rozhodnout.
 */
function playerLeft(s: CampaignState, v: AlarmVillage, ctx: TickContext): 'steward' | 'player' {
  return v.flight === undefined && withoutPlayer(s, v, ctx) ? 'steward' : 'player';
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
