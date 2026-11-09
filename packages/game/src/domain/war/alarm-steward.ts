import type { Landscape } from '../landscape';
import { villageCentre } from '../village/departure';
import type { VillageState } from '../village/types';
import { alarmCellOf, alarmVillage, refugeHosts } from './alarm';
import type { AlarmOwner, AlarmVillage } from './alarm-types';
import { gridOf, MissingData } from './campaign-tick';
import type { TickContext, TickOut } from './campaign-tick';
import type { CampaignPlace, CampaignState } from './campaign-types';
import { alarmTaken, departFlight, withoutTaken } from './evacuation';
import { stanceOf } from './flight';
import { sendMessenger, warnDomain } from './messenger';
import {
  refugeHostOf,
  refugeOptions,
  stewardAlarmChoice,
  type RefugeOptions,
} from './refuge-choice';
import { WAR } from './rules-war';

// Kdo za varovanou ves rozhoduje (war.md – Varování, poslové a útěk do hradiště: „Správce za
// nepřítomného hráče … ano platí“; plán 2026-11-09 – Úloha 11, Otevřené 6, Review Focus 6). Martin
// 9. 11. 2026: ves se zapnutým správcem a vsi NPC rodů rozhodují hned; ves hráče bez správce čeká
// na jeho volbu nejvýš 1 herní den (`WAR.alarm.playerGraceTicks`), pak se zařídí podle pravidla
// správce („Ok, nechme to, jak jsi navrhl“). Pravidlo (`stewardAlarmChoice`): posel do hradiště
// pána vždy, jde-li (vesničan pěšky, bez vesničana muž rodu – Martin „Ano“); s postojem „raději
// utéct“ a bez vlastního útočiště lidé do hradiště, stihnou-li to – „se vším“, jinak „jen lidé“ –,
// jinak do lesa. Totéž hradiště pro posly do vsí své domény (od příchodu posla vsi).

/**
 * Rozhodnutí za vsi ve varování v taktu `tick` (po spatření a poslech – `campaignTick`): ves, která
 * o vojsku ví a nikdo za ni ještě nerozhodl (`AlarmVillage.decided`), rozhodne pravidlem správce
 * hned (NPC rod, zapnutý správce), nebo po lhůtě hráče od varování. Hradiště hráče (NPC hradiště –
 * `hillfortHeard` v `messenger.ts`), ke kterému doběhl posel vsi a které posly do domény ještě
 * nerozeslalo, je se správcem rozešle hned, bez něj po lhůtě od příchodu posla. Ves, kterou posel
 * správce právě varoval, rozhodne v témž taktu. Rozhoduje se jednou – i když pravidlo nic nepustí.
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
    if (v.decided === undefined) decideVillage(s, v, tick, ctx, out);
    decideDomain(s, v, tick, ctx, out);
  }
}

/** Rozhoduje za ves pravidlo správce už teď (NPC, zapnutý správce), nebo až po lhůtě hráče od `since`? */
function stewardDecides(
  owner: AlarmOwner,
  state: VillageState,
  tick: number,
  since: number,
): boolean {
  return owner.npc || state.steward?.on === true || tick >= since + WAR.alarm.playerGraceTicks;
}

function stateOf(s: CampaignState, villageId: string, ctx: TickContext): VillageState {
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  return state;
}

/**
 * Pravidlo správce za ves (Otevřené 6): co ves může (`refugeOptions` – stav bez toho, co tažení
 * dnes odvedlo), postoj a vlastní útočiště (`refugeHostOf` – hotové opevnění s plochou) →
 * `stewardAlarmChoice`; posel vyběhne první, skupina odejde bez něj (`departFlight` volbu ověří
 * znovu). `decided` = správce, i když nic nešlo.
 */
function decideVillage(
  s: CampaignState,
  v: AlarmVillage,
  tick: number,
  ctx: TickContext,
  out: TickOut,
): void {
  const state = stateOf(s, v.villageId, ctx);
  if (!stewardDecides(v.owner, state, tick, v.warnTick)) return;
  const { options, home, village, landscape } = alarmChoices(s, v, tick, ctx);
  const ownRefuge = refugeHostOf(v.villageId, home, landscape, village.cell, s.day) !== null;
  const choice = stewardAlarmChoice(options, stanceOf(home), ownRefuge);
  if (choice.messenger) sendMessenger(s, v.villageId, ctx, out, { by: 'steward' });
  if (choice.flee !== null) departFlight(s, v.villageId, choice.flee, ctx, out, { by: 'steward' });
  v.decided ??= 'steward';
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
 * (`heardTick`) a posly ještě nerozeslalo (`AlarmVillage.domain`) – se správcem hned, bez něj po
 * lhůtě od příchodu posla. NPC hradiště rozesílá samo při příchodu (`hillfortHeard`); bez portu
 * domény nic.
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
  if (!stewardDecides(v.owner, stateOf(s, v.villageId, ctx), tick, heard)) return;
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
