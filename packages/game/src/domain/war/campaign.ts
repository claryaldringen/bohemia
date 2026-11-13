import type { WorldClock } from '../calendar';
import type { NewVillageEvent, VillageEventBody } from '../village/core/inbox';
import { cloneData } from '../village/core/clone';
import type { HerdSpecies, Person, PersonRef, Prisoner, VillageState } from '../village/types';
import { isLineMan } from '../village/people/dynasty';
import { AGE } from '../village/rules';
import { createRandom, deriveSeed } from '../landscape/random';
import { surrenders } from './surrender';
import type { GridCell } from '../village/people/world-grid';
import type {
  CampaignGroup,
  CampaignGuard,
  CampaignIntent,
  CampaignMember,
  CampaignNotice,
  CampaignPlace,
  CampaignReturnReason,
  IntentBody,
  CampaignState,
  CampaignStep,
  CampaignVillage,
  CampaignWorld,
} from './campaign-types';
import { deserters } from './desertion';
import {
  battleForts,
  battleTick,
  commandFighter,
  openBattle,
  type BattleField,
  type BattleState,
} from './battle';
import { defenderRoster, type Defender, type GuardGuest } from './defenders';
import { ageYears, isAway } from '../village/people/people';
import { stanceOf } from './flight';
import { refugeRout } from './rout';
import { planDefense, type RefugeLoad } from './stance';
import {
  lootCapacity,
  lootTotals,
  guardPrisonerKey,
  noLoot,
  prisonerKey,
  raidChronicle,
  raidLoot,
  sumLoot,
  type CampaignReturn,
  type RaidResult,
} from './raid-apply';
import type { Pos } from './march-grid';
import { marchSpeed, type GroupPace } from './march';
import { missingMaps, sendGroup, settleGoal, stepMover } from './movement';
import { WAR } from './rules-war';
import type { KnowledgeOut } from './seen';
import { discoverBuildings } from './sight';
import { targetSeen, trackTrail, trailKnowledge } from './campaign-knowledge';
import { frostDay } from './season';
import { npcIntents, npcLeader } from './npc-commander';
import { inFight, setGroupOrder } from './orders';
import { dayOfTick, hoursPerTick, TICKS_PER_SECOND, tickRandom } from './ticks';
import {
  alarmVillage,
  isAlarmIntent,
  isDefenderIntent,
  isWarned,
  sightAlarms,
  type AlarmIntentBody,
} from './alarm';
import { decideAlarms } from './alarm-steward';
import {
  catchMessengers,
  moveMessengers,
  recallMessengers,
  sendMessenger,
  warnDomain,
} from './messenger';
import {
  alarmTaken,
  catchFlights,
  departFlight,
  flightFoodDay,
  moveFlights,
  settleFlights,
  withoutTaken,
} from './evacuation';
import {
  cellKey,
  gridOf,
  MissingData,
  sameCell,
  tickContext,
  villageEvent,
  type TickContext,
  type TickOut,
} from './campaign-tick';

// Tažení po taktech (plán 2026-11-03 – rozhodnutí 12, Úloha 6.5): čistá funkce výchozího stavu,
// seedu a záznamu záměrů s číslem taktu. Takt po taktu: denní krok (jídlo, mráz) na začátku
// nového dne, záměry taktu podle `seq`, pak fáze (pochod, nájezd, návrat). Výsledek nezávisí na
// tom, po jakých kouscích taktů se počítá – stav je JSON a takt čte jen stav, záměry a svět.
// Jen det-math (`domain/war/**`): tažení počítá worker i web.

/** Vstup nového tažení (vyslání – Ú6.6): muži stojí ve shromaždišti, skupiny podle `member.group`. */
export interface NewCampaign {
  id: string;
  warId: string;
  seed: number;
  /** Takt vyslání – tažení se počítá od dalšího. */
  tick: number;
  playerId: string;
  leaderName: string;
  commander: PersonRef;
  deputy: PersonRef | null;
  assembly: CampaignVillage;
  target: CampaignVillage;
  members: CampaignMember[];
  foodKg: number;
  liveCommand: boolean;
  /** Přepadení bez opovědi (kronika nájezdu). */
  ambush?: boolean;
  /** Domovské vsi mužů – kam jdou hloučky po rozpadu (`CampaignState.homes`). */
  homes?: Record<string, CampaignPlace>;
  /** Rod vůdce – komu patří znalost z tažení (`CampaignState.houseId`). */
  houseId?: string;
}

/** Výchozí stav tažení ve shromaždišti (fáze `assembling`). */
export function newCampaign(input: NewCampaign, clock: WorldClock): CampaignState {
  const groupIds = [...new Set(input.members.map((m) => m.group))].sort((a, b) => a - b);
  const groups: CampaignGroup[] = groupIds.map((id) => ({
    id,
    order: 'follow-leader',
    cell: { ...input.assembly.cell },
    pos: { ...input.assembly.pos },
    goal: null,
    route: [],
    leg: null,
    arrived: true,
  }));
  return {
    id: input.id,
    warId: input.warId,
    seed: input.seed,
    tick: input.tick,
    day: dayOfTick(input.tick, clock),
    throughDay: dayOfTick(input.tick + 1, clock) - 1,
    phase: 'assembling',
    playerId: input.playerId,
    leaderName: input.leaderName,
    commander: { ...input.commander },
    deputy: input.deputy ? { ...input.deputy } : null,
    assembly: structuredClone(input.assembly),
    target: structuredClone(input.target),
    members: structuredClone(input.members),
    groups,
    supplies: { foodKg: input.foodKg },
    loot: { foodKg: 0, herd: 0 },
    captives: [],
    liveCommand: input.liveCommand,
    ...(input.ambush ? { ambush: true as const } : {}),
    ...(input.homes ? { homes: structuredClone(input.homes) } : {}),
    discovered: [],
    ...(input.houseId === undefined ? {} : { houseId: input.houseId }),
    returnReason: null,
  };
}

/** Skončené tažení se už nepočítá. */
export function campaignFinished(state: CampaignState): boolean {
  return state.phase === 'done';
}

/**
 * Dopočte tažení z `state` do taktu `toTick` (včetně). Záměry s taktem nejvýš `state.tick`
 * (v minulosti) a cizí záměry se zahodí – kromě záměrů obránce (`isDefenderIntent`): rozkaz
 * obráncům `breakout` dává držitel napadené vsi (právo ověřil use-case `orderBreakout`), `alarm-*`
 * majitel varované vsi – nikdy vůdce tažení; ostatní platí přesně ve svém taktu v pořadí `seq`.
 * Chybí-li mapa nebo ves (`waiting`), výsledek je stav na konci posledního celého taktu.
 * Vstupní stav ani záměry nemění.
 */
export function stepCampaign(
  state: CampaignState,
  toTick: number,
  intents: readonly CampaignIntent[],
  world: CampaignWorld,
): CampaignStep {
  const pending = intents
    .filter(
      (i) =>
        i.tick > state.tick &&
        i.tick <= toTick &&
        isDefenderIntent(i.body) !== (i.byPlayer === state.playerId),
    )
    .sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  const ctx = tickContext(world);
  const villageEvents: NewVillageEvent[] = [];
  const notices: CampaignNotice[] = [];
  const knowledge: KnowledgeOut[] = [];
  const withKnowledge = (): { knowledge?: KnowledgeOut[] } =>
    knowledge.length > 0 ? { knowledge } : {};
  let current = state;
  let next = 0;
  const upfront = missingMaps(state, world);
  if (upfront.length > 0) {
    return { state, villageEvents, notices, waiting: { cells: upfront, villageIds: [] } };
  }
  while (current.tick < toTick && !campaignFinished(current)) {
    const tick = current.tick + 1;
    let end = next;
    while (end < pending.length && pending[end]!.tick === tick) end++;
    const out: TickOut = { events: [], notices: [] };
    try {
      current = campaignTick(current, tick, pending.slice(next, end), ctx, out);
    } catch (error) {
      if (!(error instanceof MissingData)) throw error;
      return {
        state: current,
        villageEvents,
        notices,
        ...withKnowledge(),
        waiting: { cells: error.cells, villageIds: error.villageIds },
      };
    }
    next = end;
    villageEvents.push(...out.events);
    notices.push(...out.notices);
    knowledge.push(...(out.knowledge ?? []));
  }
  return { state: current, villageEvents, notices, ...withKnowledge(), waiting: null };
}

/**
 * Jeden takt – na kopii stavu (když chybí data, kopie se zahodí). Kopie chrání i stav předchozího
 * taktu a vše, co do něj takt vložil (události a upozornění ven, data ze světa a záměrů). Ruční
 * kopie čistých dat (`cloneData`) je ≈ 5× rychlejší než `structuredClone` (u pochodu 20 tažení byla
 * kopie polovina času smyčky); sdílené odkazy uvnitř stavu rozdělí jako kontrolní bod v JSON – stav
 * sdílí jen záznamy, které se nemění na místě (prázdná `route` bojovníků z `openBattle`, `seenAt`
 * varovaných vsí, `PersonRef` zajatců). Stopa (`trail`, Úloha 11) se nekopíruje – mění se jen
 * novým objektem (`trackTrail`), kopie by s délkou cesty rostla každý takt.
 */
function campaignTick(
  state: CampaignState,
  tick: number,
  intents: readonly CampaignIntent[],
  ctx: TickContext,
  out: TickOut,
): CampaignState {
  const { trail, ...rest } = state;
  const s: CampaignState = cloneData(rest);
  if (trail) s.trail = trail;
  s.tick = tick;
  const day = dayOfTick(tick, ctx.world.clock);
  s.throughDay = dayOfTick(tick + 1, ctx.world.clock) - 1;
  while (s.day < day) {
    s.day++;
    dailyStep(s, out);
  }
  for (const intent of intents) applyIntent(s, intent, ctx, out);
  command(s, tick, ctx, out);
  if (npcLeads(s)) {
    // NPC velitel rozhoduje ze stavu na začátku taktu; opevnění cíle musí být načtené
    const field = s.phase === 'raiding' && s.battle ? battleFieldOf(s, ctx) : null;
    syncControl(s);
    for (const body of npcIntents(s, ctx.world, field)) applyBody(s, body, out, true);
  }
  switch (s.phase) {
    case 'assembling':
    case 'done':
      break;
    case 'marching':
      moveGroups(s, ctx);
      trackGroups(s);
      if (allArrived(s) && s.groups.some((g) => sameCell(g.cell, s.target.cell))) {
        s.phase = 'raiding';
      }
      break;
    case 'raiding':
      raidTick(s, tick, ctx, out);
      break;
    case 'returning':
    case 'disbanded':
      moveGroups(s, ctx);
      trackGroups(s);
      if (allArrived(s)) finish(s, ctx, out);
      break;
  }
  // po pohybu: spatření vesničany (varování – Úloha 2 plánu 2026-11-09), posli (pohyb, chycení –
  // Úloha 5), rozhodnutí správce a NPC (Úloha 11), skupiny uprchlíků (pohyb, dostižení – Úloha 8),
  // pak dny nájezdu
  if (s.phase !== 'assembling' && s.phase !== 'done') {
    sightAlarms(s, tick, ctx, out);
    moveMessengers(s, ctx, out);
    catchMessengers(s, ctx, out);
    decideAlarms(s, tick, ctx, out);
    moveFlights(s, ctx, out);
    catchFlights(s, ctx, out);
    watchVillages(s, ctx, out);
  }
  // boj skončil (výhra, porážka, ústup) – výsledek nájezdu do vsí jednou (Ú6.10)
  reportRaid(s, ctx, out);
  // nájezd skončil (i obratem, rozpadem) – co muži o mapě cíle vědí, jde rodu vůdce (Úloha 11)
  if (state.phase === 'raiding' && s.phase !== 'raiding') shareTarget(s, ctx, out);
  return s;
}

/**
 * Stopa skupin, ve kterých je aspoň jeden muž na nohou, po pohybu (Úloha 11) – jen záznam pro
 * znalost rodu (`trackTrail`).
 */
function trackGroups(s: CampaignState): void {
  const manned = new Set(s.members.flatMap((m) => (m.status === 'active' ? [m.group] : [])));
  for (const g of s.groups) if (manned.has(g.id)) trackTrail(s, g.cell, [g.pos]);
}

/**
 * Konec nájezdu (Úloha 11): stopa a objevená obydlí cílové vsi ve stavu, jak je muži viděli
 * (`targetSeen` – den taktu, ves čtená jako v boji). Ves, která na mapě už není – jen stopa; bez
 * stopy i obydlí (starší bod bez stopy, nic neobjevili) se nic nevydá.
 */
function shareTarget(s: CampaignState, ctx: TickContext, out: TickOut): void {
  const map = ctx.world.landscapeOf(s.target.cell);
  if (map === null) throw new MissingData([{ ...s.target.cell }], []);
  const here = map.villageIds.includes(s.target.villageId) && s.discovered.length > 0;
  const village = here ? ctx.world.villageAt(s.target.villageId, s.day) : null;
  if (here && village === null) throw new MissingData([], [s.target.villageId]);
  const seen = targetSeen(s, village);
  if (seen.trail.length === 0 && seen.parts.length === 0) return;
  (out.knowledge ??= []).push({ cell: { ...s.target.cell }, seen });
}

/**
 * Vsi, na jejichž mapě vojsko po taktu stojí (Ú6.7 – war.md, Ves během nájezdu nepracuje). Ves,
 * které vojsko škodí, dostane na každý den, kdy na její mapě stojí, `raid-day` na týž den (bariéra
 * drží ves před tím dnem – ještě ho nespočítala) – až od chvíle, kdy o vojsku ví (`isWarned` –
 * war.md, Varování: „Do té doby lidé pracují dál“), nebo když se na její mapě bojuje (cíl
 * v nájezdu). Signál hrozby `army-seen` jde s varováním (`sightAlarms`). Automatický posel z prošlé
 * vsi (Ú6.7) zmizel – posla posílá hráč nebo správce (plán 2026-11-09 – Úloha 5).
 */
function watchVillages(s: CampaignState, ctx: TickContext, out: TickOut): void {
  const cells = new Map<string, GridCell>();
  for (const g of s.groups) {
    if (!s.members.some((m) => m.group === g.id && m.status === 'active')) continue;
    cells.set(cellKey(g.cell), g.cell);
  }
  for (const cell of cells.values()) {
    const map = ctx.world.landscapeOf(cell);
    if (map === null) throw new MissingData([{ ...cell }], []);
    for (const villageId of map.villageIds) {
      if (ctx.world.villageAt(villageId, s.day) === null) throw new MissingData([], [villageId]);
      if (ctx.world.harmless?.(villageId, s.playerId)) continue;
      const fighting = s.phase === 'raiding' && villageId === s.target.villageId;
      if (!fighting && !isWarned(s, villageId, s.tick)) continue;
      const days = (s.raidDays ??= {});
      if (days[villageId] !== s.day) {
        days[villageId] = s.day;
        villageEvent(s, out, villageId, s.day, { kind: 'raid-day', campaignId: s.id });
      }
    }
  }
}

/**
 * Denní krok na začátku herního dne `s.day` (war.md – Pohyb – Zásoby, Zima): mráz venku (ve
 * shromaždišti se muži zotaví) a jídlo – 1 kg na muže a den. Když jídlo dojde na pochodu,
 * vojsko se obrátí domů (Martin 2. 11. 2026). Skupiny uprchlíků na cestě do hradiště jedí ze svých
 * zásob (Úloha 8 plánu 2026-11-09).
 */
function dailyStep(s: CampaignState, out: TickOut): void {
  flightFoodDay(s);
  const outside = s.phase !== 'assembling' && s.phase !== 'done';
  const active = s.members.filter((m) => m.status === 'active');
  for (const m of active) {
    const delta = frostDay(m, outside, s.day);
    m.health += delta.health;
    m.vigor += delta.vigor;
  }
  if (!outside) return;
  desert(s, out);
  const need = active.length * WAR.foodKgPerManDay;
  const eaten = Math.min(need, s.supplies.foodKg);
  s.supplies.foodKg -= eaten;
  if (eaten < need && s.phase === 'marching') turnBack(s, 'supplies');
}

/**
 * Dezerce nucených (war.md – Vojsko): dezertér s příbuznými v cíli cíl varuje – ves dostane
 * signál `army-seen` dřív, než vojsko dorazí (jeden za den, ať se nezdvojí).
 */
function desert(s: CampaignState, out: TickOut): void {
  let warns = false;
  for (const m of deserters(s)) {
    m.status = 'deserted';
    warns ||= m.kin === true;
  }
  if (!warns) return;
  const day = s.day + 1;
  out.events.push({
    villageId: s.target.villageId,
    day,
    ref: `camp:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'threat-signal', signal: { kind: 'army-seen', day: s.day } },
  });
}

/**
 * Záměr hráče v taktu – každý jeho záměr je i přítomnost u tažení (war.md – Velení: Hráč odejde
 * od tažení); vrátí-li se, převezme velení od zástupce.
 */
function applyIntent(
  s: CampaignState,
  intent: CampaignIntent,
  ctx: TickContext,
  out: TickOut,
): void {
  // záměr obránce varované vsi – hráč obránce u tažení není
  if (isAlarmIntent(intent.body)) {
    applyAlarm(s, intent.byPlayer, intent.body, ctx, out);
    return;
  }
  if (s.liveCommand) {
    s.presenceTick = intent.tick;
    delete s.absent;
  }
  applyBody(s, intent.body, out, false);
}

/**
 * Záměr obránce varované vsi (plán 2026-11-09 – Rozhodnutí plánu): platí jen od hráče, kterému ves
 * patří (`AlarmVillage.owner`), a jen když ves o vojsku ví; co nejde (`refugeOptions`), se zahodí.
 */
function applyAlarm(
  s: CampaignState,
  byPlayer: string,
  body: AlarmIntentBody,
  ctx: TickContext,
  out: TickOut,
): void {
  const v = alarmVillage(s, body.village);
  if (!v || v.owner.playerId !== byPlayer || !isWarned(s, v.villageId, s.tick)) return;
  switch (body.kind) {
    case 'alarm-messenger':
      sendMessenger(s, v.villageId, ctx, out, {
        by: 'player',
        ...(body.personId === undefined ? {} : { personId: body.personId }),
      });
      return;
    case 'alarm-domain':
      // hradiště hráče rozešle posly do vybraných vsí domény (Úloha 6, Otevřené 5)
      warnDomain(s, v.villageId, ctx, out, body.to);
      return;
    case 'alarm-flee':
      // evakuace do hradiště nebo do lesa (Úloha 8, Otevřené 7)
      departFlight(s, v.villageId, body.mode, ctx, out, { by: 'player' });
      return;
  }
}

/** Úkon tažení od hráče, nebo od NPC velitele (`npc`) – co ve fázi nedává smysl, se zahodí. */
function applyBody(s: CampaignState, body: IntentBody, out: TickOut, npc: boolean): void {
  const leads = npc || s.liveCommand;
  switch (body.kind) {
    case 'set-out':
      if (s.phase !== 'assembling') return;
      s.phase = 'marching';
      for (const g of s.groups) sendGroup(g, s.target);
      chronicle(s, out, s.assembly.villageId, 'set-out');
      return;
    case 'march':
      if (!leads) return;
      if (s.phase === 'raiding' && s.battle && sameCell(body.to.cell, s.target.cell)) {
        commandFighter(s.battle, leaderFighter(s, npc), { goal: body.to.pos });
        return;
      }
      if (s.phase !== 'marching') return;
      for (const g of s.groups) sendGroup(g, body.to);
      return;
    case 'turn-back':
      // vede-li jiný muž, hráč na tažení vliv nemá (war.md – Velení)
      if (!leads) return;
      if (s.phase === 'marching' || s.phase === 'raiding') {
        turnBack(s, npc ? (body.reason ?? 'order') : 'order');
      }
      return;
    case 'set-order':
      if (s.phase === 'done' || s.phase === 'disbanded') return;
      setGroupOrder(s, body.group, body.order, body.at ?? null);
      return;
    case 'strike':
      if (s.phase === 'raiding' && s.battle && leads) {
        commandFighter(s.battle, leaderFighter(s, npc), { strike: body.target });
      }
      return;
    case 'choose-surrendered':
      // jen živé vedení, jen existující skupina a jen než boj skončí
      if (!s.liveCommand || !s.groups.some((g) => g.id === body.group)) return;
      if (s.phase === 'done' || s.phase === 'disbanded' || s.raidDay !== undefined) return;
      s.surrendered = body.choice;
      return;
    case 'presence':
      return;
    case 'breakout':
      // rozkaz obráncům – platí na začátku příštího taktu boje (`battleTick` má bojiště)
      if (s.phase !== 'raiding' || s.battle?.outcome !== 'ongoing') return;
      s.battle.breakoutOrder = {
        fort: body.fort,
        ...(body.segment === undefined ? {} : { segment: body.segment }),
      };
      return;
    case 'plunder':
      // jen NPC velitel: silné opevnění nenapadne a drží ves mimo útočiště (war.md – Velení)
      if (!npc || s.phase !== 'raiding' || s.battle?.outcome !== 'ongoing') return;
      s.battle.outcome = 'attackers';
      s.battle.plundered = true;
      return;
  }
}

/** Takty bez přítomnosti hráče, po kterých velení převezme zástupce (war.md – Čísla: 1 herní den). */
function absentTicks(ctx: TickContext): number {
  return Math.round((WAR.absentLeaderDays * 24) / hoursPerTick(ctx.world.clock));
}

/** Vede tažení NPC velitel? Velí jiný muž, velitel padl, nebo je hráč pryč a vede zástupce. */
function npcLeads(s: CampaignState): boolean {
  return (s.phase === 'marching' || s.phase === 'raiding') && (!s.liveCommand || s.absent === true);
}

/**
 * Velení (war.md – Velení a příprava tažení; Ú6.12): padne-li nebo je-li zajat velitel, velí zástupce
 * a vede NPC (hráč už vliv nemá); bez zástupce, nebo padne-li i on, se výprava rozpadne. Hráč, který
 * je u živého vedení pryč déle než 1 herní den, předá velení zástupci (po návratu ho převezme);
 * bez zástupce se výprava rozpadne.
 */
function command(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  if (s.phase === 'assembling' || s.phase === 'done' || s.phase === 'disbanded') return;
  const commander = s.members.find((m) => sameRef(m.ref, s.commander));
  const deputyRef = s.deputy;
  const deputy = deputyRef ? s.members.find((m) => sameRef(m.ref, deputyRef)) : undefined;
  const hasDeputy = deputy?.status === 'active';
  if (commander && (commander.status === 'fallen' || commander.status === 'captive')) {
    if (!hasDeputy) {
      disband(s, out);
      return;
    }
    s.liveCommand = false;
    delete s.absent;
    return;
  }
  if (!s.liveCommand || s.absent) return;
  const since = (s.presenceTick ??= tick);
  if (tick - since <= absentTicks(ctx)) return;
  if (hasDeputy) s.absent = true;
  else disband(s, out);
}

/**
 * Rozpad výpravy (war.md – Velení: Rozpad; návrh Clauda): boj končí, lidé jdou domů po hloučcích
 * podle vsí nejkratší cestou, nesou, co mají, a nebojují – jen se brání; ranění jdou s nimi.
 * Hlouček se sejde u skupiny svého prvního muže. Kořist a odvedení dojdou do vsi shromaždiště
 * jako při návratu. Kronika vsí: „Výprava Bořivoje se rozpadla.“, hráčům upozornění.
 */
function disband(s: CampaignState, out: TickOut): void {
  if (s.phase === 'raiding') leaveBattle(s);
  s.phase = 'disbanded';
  delete s.absent;
  const byHome = new Map<string, CampaignMember[]>();
  for (const m of s.members) {
    if (m.status !== 'active') continue;
    byHome.set(m.ref.villageId, [...(byHome.get(m.ref.villageId) ?? []), m]);
  }
  const old = new Map(s.groups.map((g) => [g.id, g]));
  let id = s.groups.reduce((max, g) => Math.max(max, g.id), -1) + 1;
  const groups: CampaignGroup[] = [];
  for (const [villageId, men] of byHome) {
    const from = old.get(men[0]!.group) ?? s.groups[0];
    if (!from) continue;
    const g: CampaignGroup = {
      id: id++,
      order: 'follow-leader',
      cell: { ...from.cell },
      pos: { ...from.pos },
      goal: null,
      route: [],
      leg: null,
      arrived: true,
    };
    for (const m of men) m.group = g.id;
    sendGroup(g, s.homes?.[villageId] ?? s.assembly);
    groups.push(g);
  }
  s.groups = groups;
  const villages = new Set([...s.members.map((m) => m.ref.villageId), s.assembly.villageId]);
  for (const villageId of villages) chronicle(s, out, villageId, 'disbanded');
  for (const playerId of new Set([s.playerId, ...s.members.map((m) => m.playerId)])) {
    out.notices.push({
      playerId,
      kind: 'campaign-disbanded',
      payload: { campaignId: s.id, leader: s.leaderName },
      gameDay: s.day,
    });
  }
}

/**
 * Kdo v boji poslouchá pokyny: NPC velitel řídí velitele, dokud bojuje, jinak zástupce
 * (`npcLeader`); živé vedení jen hráčova muže. Ostatní útočníci jdou podle rozkazu skupiny.
 */
function syncControl(s: CampaignState): void {
  const b = s.battle;
  if (!b || b.outcome !== 'ongoing') return;
  const id = npcLeads(s) ? (npcLeader(b)?.id ?? null) : s.liveCommand ? b.commander : null;
  for (const f of b.fighters) {
    if (f.side !== 'attack') continue;
    const controlled = f.id === id;
    if (f.controlled === controlled) continue;
    f.controlled = controlled;
    if (!controlled) {
      f.chosen = null;
      f.goal = null;
    }
  }
}

/** Id bojovníka, kterému jde pokyn: u NPC ten, koho řídí (`npcLeader`), jinak velitel tažení. */
function leaderFighter(s: CampaignState, npc: boolean): string {
  if (npc && s.battle) return npcLeader(s.battle)?.id ?? commanderFighter(s);
  return commanderFighter(s);
}

/** Obrat domů ke shromaždišti (rozpad po hloučcích do domovských vsí – `disband`). */
function turnBack(s: CampaignState, reason: CampaignReturnReason): void {
  if (s.phase === 'raiding') leaveBattle(s);
  s.phase = 'returning';
  s.returnReason = reason;
  for (const g of s.groups) sendGroup(g, s.assembly);
}

/**
 * Takt na mapě cíle – boj muž po muži (war.md – Boj; Ú6.8). První takt postaví bojiště: obránce
 * vsi ve výchozím postoji u domů (`defenderRoster`; postoje, včasný útěk a skryté jámy – Ú6.9)
 * a muže tažení u jejich skupin; každý takt pak `battleTick` s náhodou taktu.
 * Konec boje: útočníci drží bojiště → kořist a škody ve vsi (Ú6.10), zajetí raněných mužů rodu
 * a vzdaných (Ú6.11), pak domů; útočníci poraženi → domů (rozpad po hloučcích, prchající domů
 * a rozhodnutí NPC velitele – Ú6.12; raněné na bojišti zajme obránce – Ú6.11).
 */
function raidTick(s: CampaignState, tick: number, ctx: TickContext, out: TickOut): void {
  // vlastní vojska a vojska pána a vazalů jsou neškodná – nikdo neútočí ani neutíká
  if (!s.battle && ctx.world.harmless?.(s.target.villageId, s.playerId)) {
    turnBack(s, 'arrived');
    return;
  }
  const field = battleFieldOf(s, ctx);
  if (!s.battle) {
    s.battle = campaignBattle(s, ctx, field);
    s.battle.openTick = tick;
    // přítomný hráč se dozví, že u vsi stojí cizí vojsko (war.md – Obránci: Přítomný hráč)
    const watcher = ctx.world.watcherOf?.(s.target.villageId);
    if (watcher && watcher.playerId !== s.playerId) {
      out.notices.push({
        playerId: watcher.playerId,
        kind: 'foreign-army',
        payload: { villageId: s.target.villageId, name: watcher.name },
        gameDay: s.day,
      });
    }
  }
  syncControl(s);
  battleTick(s.battle, field, tickRandom(s.seed, tick, 'battle'));
  discover(s, s.battle, field, ctx);
  trackTrail(s, s.target.cell, attackEyes(s.battle));
  const fallenBefore = new Set(s.members.flatMap((m, i) => (m.status === 'fallen' ? [i] : [])));
  syncMembers(s, s.battle);
  // padlý muž rodu – smrt a nástupnictví ve vsi hned (war.md – Ztráty), ne až po návratu
  s.members.forEach((m, i) => {
    if (m.line && m.status === 'fallen' && !fallenBefore.has(i)) {
      post(s, out, m.ref.villageId, {
        kind: 'line-man-fell',
        personId: m.ref.personId,
        campaignId: s.id,
      });
    }
  });
  // padlí, ranění, odvedení, kořist a průlomy jdou do vsí jako vnější události (rozhodnutí 13 –
  // `reportRaid` na konci taktu)
  if (s.battle.outcome === 'attackers') turnBack(s, 'arrived');
  else if (s.battle.outcome === 'defenders') turnBack(s, 'routed');
}

/**
 * Mlha války (war.md – Mlha války; Ú6.14): stavby cílové vsi, na které dohlédl kterýkoli muž
 * tažení na nohou, zůstanou objevené (`discovered`). Ves, která už na mapě není, nemá co objevit.
 */
function discover(
  s: CampaignState,
  battle: BattleState,
  field: BattleField,
  ctx: TickContext,
): void {
  if (!ctx.world.landscapeOf(s.target.cell)?.villageIds.includes(s.target.villageId)) return;
  const village = ctx.world.villageAt(s.target.villageId, s.day);
  if (village === null) throw new MissingData([], [s.target.villageId]);
  s.discovered = discoverBuildings(s.discovered, village.dwellings, attackEyes(battle), field.grid);
}

/** Oči útoku v boji – muži tažení, kteří bojují (ne ležící ani prchající). */
function attackEyes(battle: BattleState): Pos[] {
  return battle.fighters.filter((f) => f.side === 'attack' && inFight(f)).map((f) => f.pos);
}

/** Id bojovníka velitele tažení (pokyny hráče v boji). */
function commanderFighter(s: CampaignState): string {
  const i = s.members.findIndex((m) => sameRef(m.ref, s.commander));
  return `a:${i}`;
}

const sameRef = (a: PersonRef, b: PersonRef): boolean =>
  a.villageId === b.villageId && a.personId === b.personId;

/** Bojiště v den `s.day`: mřížka mapy cíle a opevnění cílové vsi. */
function battleFieldOf(s: CampaignState, ctx: TickContext): BattleField {
  const grid = gridOf(s.target.cell, s.day, ctx);
  const map = ctx.world.landscapeOf(s.target.cell);
  if (map === null) throw new MissingData([{ ...s.target.cell }], []);
  const key = `${s.target.villageId}@${s.day}`;
  let forts = ctx.forts.get(key);
  if (!forts && !map.villageIds.includes(s.target.villageId)) forts = [];
  if (!forts) {
    const village = ctx.world.villageAt(s.target.villageId, s.day);
    if (village === null) throw new MissingData([], [s.target.villageId]);
    forts = battleForts(map.landscape, village.fortifications ?? []);
    ctx.forts.set(key, forts);
    ctx.fuel.set(key, forts.length > 0 ? fuelOf(village) : []);
  }
  const fuel = ctx.fuel.get(key) ?? [];
  return {
    grid,
    geo: map.landscape,
    forts,
    day: s.day,
    hoursPerTick: hoursPerTick(ctx.world.clock),
    ...(fuel.length > 0 ? { fuel } : {}),
  };
}

/**
 * Dříví vsi na otepi (fortifications.md – Přechod hradby – Oheň): hromady klád s kládami; les
 * bere boj z mřížky.
 */
function fuelOf(village: VillageState): Pos[] {
  return (village.logStacks ?? []).filter((x) => x.logs > 0).map((x) => ({ x: x.x, z: x.z }));
}

/** Výchozí boj: muži tažení na mapě cíle, kteří stojí na nohou, a obránci vsi. */
function campaignBattle(s: CampaignState, ctx: TickContext, field: BattleField): BattleState {
  // ves na mapě cíle už není (zanikla, odešla) – nikdo nebrání
  const onMap = ctx.world.landscapeOf(s.target.cell)?.villageIds.includes(s.target.villageId);
  const village = onMap ? ctx.world.villageAt(s.target.villageId, s.day) : null;
  if (onMap && village === null) throw new MissingData([], [s.target.villageId]);
  const groups = new Map(s.groups.map((g) => [g.id, g]));
  const attackers = s.members.flatMap((m, member) => {
    const g = groups.get(m.group);
    if (m.status !== 'active' || m.wounded || !g || !sameCell(g.cell, s.target.cell)) return [];
    return [{ member, group: m.group, m, g }];
  });
  // šik po skupinách – pět v řadě po 2 m, ať muži nestojí v jednom bodě
  const rank = new Map<number, number>();
  const fighters = attackers.map(({ member, group, m, g }) => {
    const k = rank.get(group) ?? 0;
    rank.set(group, k + 1);
    return {
      member,
      group,
      line: m.line,
      mounted: m.mounted,
      strength: m.strength * m.vigor,
      ...(m.bowSkill !== undefined ? { bowSkill: m.bowSkill } : {}),
      health: m.health,
      pos: { x: g.pos.x + ((k % 5) - 2) * 2, z: g.pos.z + Math.floor(k / 5) * 2 },
    };
  });
  // Ú6.10 / aplikace: muži rodu v jiných vsích hráče (`lineMenElsewhere`) – zatím jen tato ves.
  // Ves se podle postoje rozdělí dřív, než dojde na boj (útěk, útočiště, vzdání – Ú6.9).
  // hosté z ochrany pánem se brání se vsí podle jejího postoje (vassalage.md – Ochrana vojskem);
  // muži uprchlíků v hradišti také (war.md – Varování – Místo v hradišti; plán 2026-11-09, Úloha 9)
  const { guests, refugees } = village
    ? guardGuestsOf(s, village, ctx)
    : { guests: [], refugees: 0 };
  if (guests.length > 0) {
    s.guards = guests.map(({ guard }) => guard);
  }
  // kdo dnes s tažením odešel (posel – Úloha 5), v boji nestojí (stav vsi je ze včerejška)
  const home = village
    ? withoutTaken(village, alarmTaken(s, s.target.villageId, s.day, ctx.world.clock))
    : null;
  const defenders = home
    ? defenderRoster(home, s.day, { guests: guests.map(({ guest }) => guest) })
    : [];
  const refugeLoad = home ? refugeLoadOf(home, guests, defenders, refugees) : undefined;
  const plan = home
    ? planDefense({
        state: home,
        day: s.day,
        stance: stanceOf(home),
        defenders,
        attackers: fighters.map((a) => ({ pos: a.pos, mounted: a.mounted })),
        field,
        // ves o vojsku ví (vesničan, posel – Úloha 2 plánu 2026-11-09), nebo ji varoval posel
        // starého tažení (Ú6.7 – `armySeen` jen ze starých bodů) – postoj dřív
        warned: isWarned(s, s.target.villageId, s.tick) || home.armySeen?.campaignId === s.id,
        ...(refugeLoad ? { refugeLoad } : {}),
      })
    : null;
  return openBattle({
    attackers: fighters,
    ...(plan ? { shelter: plan.shelter } : {}),
    defenders: plan ? plan.fighters : [],
    groups: s.groups.map((g) => ({
      id: g.id,
      order: g.order,
      holdAt: g.holdAt ?? null,
      ...(g.assault ? { assault: g.assault } : {}),
    })),
    commander: indexOf(s, s.commander),
    deputy: s.deputy ? indexOf(s, s.deputy) : null,
    liveCommand: s.liveCommand,
  });
}

/**
 * Hosté z ochrany i ze svolání v cílové vsi (`guests` druhu `protection` / `service`), kteří jsou
 * opravdu tam: osoba ve stavu domovské vsi (ke dni `s.day − 1` – jinak takt čeká) je pryč u této vsi s týmž druhem a od 16 let.
 * Uprchlíci v hradišti (druh `refuge` – war.md, Varování – Místo v hradišti): muži od 16 let
 * (`refugeeFighter`) jsou hosté v boji, ostatní přítomní jen v počtu `refugees` (zabírají útočiště).
 * Pořadí podle domovské vsi a osoby; čísla v boji −1, −2, …
 */
function guardGuestsOf(
  s: CampaignState,
  village: VillageState,
  ctx: TickContext,
): { guests: { guest: GuardGuest; guard: CampaignGuard }[]; refugees: number } {
  const entries = (village.guests ?? [])
    .filter((g) => g.kind === 'protection' || g.kind === 'service' || g.kind === 'refuge')
    .map((g) => ({ ref: g.ref, kind: g.kind as 'protection' | 'service' | 'refuge' }))
    .sort((a, b) =>
      a.ref.villageId === b.ref.villageId
        ? a.ref.personId - b.ref.personId
        : a.ref.villageId < b.ref.villageId
          ? -1
          : 1,
    );
  const refs = entries.map((e) => e.ref);
  const missing = [...new Set(refs.map((r) => r.villageId))].filter(
    (id) => ctx.world.villageAt(id, s.day) === null,
  );
  if (missing.length > 0) throw new MissingData([], missing);
  const out: { guest: GuardGuest; guard: CampaignGuard }[] = [];
  let refugees = 0;
  for (const { ref, kind } of entries) {
    const home = ctx.world.villageAt(ref.villageId, s.day)!;
    const p = home.people.find((x) => x.id === ref.personId);
    if (!p || p.away?.kind !== kind || p.away.hostVillageId !== s.target.villageId) continue;
    if (!isAway(p, s.day)) continue;
    const refugee = kind === 'refuge';
    if (refugee && !refugeeFighter(p, s.day)) {
      refugees++;
      continue;
    }
    if (ageYears(p.bornDay, s.day) < WAR.army.minAge) continue;
    const id = -(out.length + 1);
    out.push({
      guest: { id, person: structuredClone(p), ...(refugee ? { refugee: true as const } : {}) },
      guard: {
        id,
        ...(kind === 'protection' ? {} : { kind }),
        ref: { ...ref },
        ...(p.name === undefined ? {} : { name: p.name }),
        ...(p.noble ? { noble: true as const } : {}),
        ...(refugee && !p.line && !p.noble ? { villager: true as const } : {}),
      },
    });
  }
  return { guests: out, refugees };
}

/**
 * Bojuje uprchlík v hradišti (plán 2026-11-09 – Otevřené 9)? Muž od 16 let (`WAR.army.minAge`) – muž
 * rodu v každém věku, vesničan do stáří (`AGE.elder` – jako obránce doma); ženy, děti a starší
 * nebojují.
 */
function refugeeFighter(p: Person, day: number): boolean {
  const age = ageYears(p.bornDay, day);
  return p.sex === 'male' && age >= WAR.army.minAge && (isLineMan(p) || age < AGE.elder);
}

/**
 * Uprchlíci v hradišti, kteří nebojují (`StanceInput.refugeLoad`): ženy, děti a starší (`refugees`)
 * a ranění muži (host bez místa v soupisu obránců), se stády pobytů (`RefugeStay.herd`). Bez
 * uprchlíků undefined – rozdělení vsi jako dřív.
 */
function refugeLoadOf(
  village: VillageState,
  guests: readonly { guest: GuardGuest }[],
  defenders: readonly Defender[],
  refugees: number,
): RefugeLoad | undefined {
  const men = guests.filter(({ guest }) => guest.refugee).length;
  const herd: Record<HerdSpecies, number> = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  for (const stay of village.refugeStays ?? []) {
    for (const sp of Object.keys(herd) as HerdSpecies[]) herd[sp] += Math.max(0, stay.herd[sp]);
  }
  if (men === 0 && refugees === 0 && !Object.values(herd).some((n) => n > 0)) return undefined;
  const wounded = men - defenders.filter((d) => d.refugee).length;
  return { people: refugees + wounded, herd };
}

function indexOf(s: CampaignState, ref: PersonRef): number | null {
  const i = s.members.findIndex((m) => sameRef(m.ref, ref));
  return i < 0 ? null : i;
}

/** Zdraví a ztráty mužů tažení z boje: padlý `fallen`, raněný `wounded` (zpomalí návrat). */
function syncMembers(s: CampaignState, b: BattleState): void {
  for (const f of b.fighters) {
    const m = f.side === 'attack' ? s.members[f.ref] : undefined;
    if (!m || m.status !== 'active') continue;
    m.health = f.health;
    if (f.state !== 'down') continue;
    if (f.killed) m.status = 'fallen';
    else {
      m.wounded = true;
      m.woundedDay ??= s.day;
    }
  }
}

/**
 * Konec boje pro tažení: skupiny se sejdou tam, kde stojí jejich muži (velitel, jinak první
 * na nohou), a jdou odtud. Ustoupí-li velitel, jeho muži spořádaně s ním (war.md – Boj).
 */
function leaveBattle(s: CampaignState): void {
  const b = s.battle;
  if (!b) return;
  if (b.outcome === 'ongoing') b.outcome = 'withdrawn';
  syncMembers(s, b);
  const lead = b.fighters.find((f) => f.id === b.commander && f.state !== 'down');
  for (const g of s.groups) {
    const men = b.fighters.filter(
      (f) => f.side === 'attack' && f.group === g.id && f.state !== 'down',
    );
    const at = men.find((f) => f.id === lead?.id) ?? men[0];
    if (at) g.pos = { ...at.pos };
  }
}

/**
 * Konec tažení: muži doma (`campaign-return` – kořist a odvedení do vsi shromaždiště), zápis do
 * kronik domovských vsí a upozornění vůdci.
 */
function finish(s: CampaignState, ctx: TickContext, out: TickOut): void {
  reportRaid(s, ctx, out);
  // posli, kteří ještě běží, se vrátí domů, skupiny uprchlíků dojdou – další takty nebudou
  // (Úloha 5, 8)
  recallMessengers(s, ctx, out);
  settleFlights(s, ctx, out);
  // po rozpadu jen muži domů – kronika a upozornění šly už při rozpadu
  const disbanded = s.phase === 'disbanded';
  s.phase = 'done';
  const homes = [...new Set(s.members.map((m) => m.ref.villageId))];
  const spoils =
    s.loot.detail !== undefined ||
    (s.loot.people?.length ?? 0) > 0 ||
    (s.loot.prisoners?.length ?? 0) > 0;
  if (spoils && !homes.includes(s.assembly.villageId)) homes.push(s.assembly.villageId);
  for (const villageId of homes) {
    post(s, out, villageId, { kind: 'campaign-return', result: returnOf(s, villageId) });
    if (!disbanded) chronicle(s, out, villageId, 'returned');
  }
  // kudy muži šli a odkud se dívali, jde rodu vůdce – stopy cizích map (Úloha 11)
  const trails = trailKnowledge(s);
  if (trails.length > 0) (out.knowledge ??= []).push(...trails);
  if (disbanded) return;
  out.notices.push({
    playerId: s.playerId,
    kind: 'campaign-returned',
    payload: { campaignId: s.id, reason: s.returnReason },
    gameDay: s.day,
  });
}

/**
 * Zápis do kroniky vsi přes schránku – na následující den (ves může mít dnešek spočítaný; výsledky
 * tažení jdou do vsi vždy den nato – rozhodnutí 13). `ref` je jedinečný: takt a pořadí v něm.
 */
function chronicle(
  s: CampaignState,
  out: TickOut,
  villageId: string,
  step: 'set-out' | 'returned' | 'disbanded',
): void {
  const day = s.day + 1;
  villageEvent(s, out, villageId, day, {
    kind: 'chronicle',
    event: { day, kind: 'campaign', step, leader: s.leaderName },
  });
}

/** Událost do schránky vsi na následující den (rozhodnutí 13); `ref` = takt a pořadí v něm. */
function post(s: CampaignState, out: TickOut, villageId: string, body: VillageEventBody): void {
  villageEvent(s, out, villageId, s.day + 1, body);
}

/** Návrat do vsi `villageId`: její muži zpět (ne zajatí), ranění, padlí vesničané, kořist. */
function returnOf(s: CampaignState, villageId: string): CampaignReturn {
  const mine = s.members.filter((m) => m.ref.villageId === villageId);
  const home = villageId === s.assembly.villageId;
  return {
    campaignId: s.id,
    back: mine
      .filter((m) => m.status === 'active' || m.status === 'deserted')
      .map((m) => m.ref.personId),
    wounded: mine
      .filter((m) => m.status === 'active' && m.wounded)
      .map((m) => ({ personId: m.ref.personId, day: m.woundedDay ?? s.day })),
    fallen: mine.filter((m) => m.status === 'fallen' && !m.line).map((m) => m.ref.personId),
    ...(home && s.loot.detail ? { loot: structuredClone(s.loot.detail) } : {}),
    ...(home && s.loot.people?.length ? { people: structuredClone(s.loot.people) } : {}),
    ...(home && s.loot.prisoners?.length ? { prisoners: structuredClone(s.loot.prisoners) } : {}),
  };
}

/**
 * Výsledek nájezdu (war.md – Ztráty, Kořist; Ú6.10) – jednou, když boj skončí: padlí a ranění
 * obránci; drží-li útočníci bojiště, i odvedení (vzdaní – rozkaz `surrendered`, výchozí odvést;
 * muže rodu a šlechtice zajme až Ú6.11) a kořist do nosnosti. Napadená ves dostane `raid-result`
 * a průlomy opevnění, ves shromaždiště zápis do kroniky; kořist a odvedení jdou s vojskem.
 */
function reportRaid(s: CampaignState, ctx: TickContext, out: TickOut): void {
  const b = s.battle;
  if (!b || b.outcome === 'ongoing' || s.raidDay !== undefined) return;
  const map = ctx.world.landscapeOf(s.target.cell);
  if (map === null) throw new MissingData([{ ...s.target.cell }], []);
  let village: VillageState | null = null;
  if (map.villageIds.includes(s.target.villageId)) {
    village = ctx.world.villageAt(s.target.villageId, s.day);
    if (village === null) throw new MissingData([], [s.target.villageId]);
  }
  s.raidDay = s.day;
  if (village === null) return;
  // co tažení z vsi dnes odvedlo (posel, skupina uprchlíků – Úloha 8), stav vsi ještě nezná
  const home = withoutTaken(village, alarmTaken(s, s.target.villageId, s.day, ctx.world.clock));
  const full = raidResultOf(s, b, home, ctx);
  // hosté z ochrany: ztráty jdou do domovských vsí, napadená ves dostane jen své lidi
  const guards = new Map((s.guards ?? []).map((g) => [g.id, g]));
  const own = (ids: readonly number[]): number[] => ids.filter((id) => !guards.has(id));
  const result: RaidResult = { ...full, fallen: own(full.fallen), wounded: own(full.wounded) };
  const hostCaptured = own(full.captured ?? []);
  if (hostCaptured.length > 0) result.captured = hostCaptured;
  else {
    delete result.captured;
    delete result.captorVillageId;
  }
  post(s, out, s.target.villageId, { kind: 'raid-result', result });
  const guardCaptured = reportGuards(s, out, full, guards);
  for (const [fortificationId, report] of breachesOf(b, village)) {
    post(s, out, s.target.villageId, { kind: 'fortification-breach', fortificationId, ...report });
  }
  // kronika útočníka počítá i hosty z ochrany – padli a byli zajati v tomto nájezdu
  const counts = {
    fallen: full.fallen.length,
    wounded: full.wounded.length,
    led: full.led.length,
    loot: full.loot,
  };
  post(s, out, s.assembly.villageId, {
    kind: 'chronicle',
    event: raidChronicle(s.day + 1, full, counts),
  });
  const totals = lootTotals(result.loot);
  const prisoners = [
    ...capturedPrisoners(s, home, hostCaptured),
    ...guardCaptured.map((g) => guardPrisoner(s, g)),
  ];
  const people = [...(s.loot.people ?? []), ...ledPeople(home, result.led)];
  const allPrisoners = [...(s.loot.prisoners ?? []), ...prisoners];
  s.loot = {
    foodKg: s.loot.foodKg + totals.foodKg,
    herd: s.loot.herd + totals.herd,
    // kořist z dostižených uprchlíků (Úloha 8) se sloučí
    detail: s.loot.detail ? sumLoot(s.loot.detail, result.loot) : structuredClone(result.loot),
    // odvedení a zajatí poslové a uprchlíci (Úloha 5, 8) zůstávají v kořisti
    ...(people.length > 0 ? { people } : {}),
    ...(allPrisoners.length > 0 ? { prisoners: allPrisoners } : {}),
  };
  for (const personId of [...result.led, ...hostCaptured]) {
    s.captives.push({ villageId: s.target.villageId, personId });
  }
  for (const g of guardCaptured) s.captives.push({ ...g.ref });
}

/**
 * Ztráty hostů z ochrany (vassalage.md – Ochrana vojskem): domovská ves dostane `guard-losses`
 * (padlý muž rodu = smrt s nástupnictvím, ranění, zajatí), chráněná ves `guests-leave` za padlé
 * a zajaté. Vrací zajaté hosty (pořadí podle čísla v boji).
 */
function reportGuards(
  s: CampaignState,
  out: TickOut,
  full: RaidResult,
  guards: ReadonlyMap<number, CampaignGuard>,
): CampaignGuard[] {
  if (guards.size === 0) return [];
  const pick = (ids: readonly number[] | undefined): CampaignGuard[] =>
    (ids ?? [])
      .filter((id) => guards.has(id))
      .sort((a, b) => b - a)
      .map((id) => guards.get(id)!);
  const fallen = pick(full.fallen);
  const wounded = pick(full.wounded);
  const captured = pick(full.captured);
  const homes = [...new Set([...fallen, ...wounded, ...captured].map((g) => g.ref.villageId))];
  const idsAt = (list: readonly CampaignGuard[], villageId: string): number[] =>
    list.filter((g) => g.ref.villageId === villageId).map((g) => g.ref.personId);
  for (const villageId of homes.sort()) {
    post(s, out, villageId, {
      kind: 'guard-losses',
      campaignId: s.id,
      villageId,
      fallen: idsAt(fallen, villageId),
      wounded: idsAt(wounded, villageId),
      captured: idsAt(captured, villageId),
      captorVillageId: s.assembly.villageId,
    });
  }
  for (const away of ['protection', 'service', 'refuge'] as const) {
    const gone = [...fallen, ...captured]
      .filter((g) => (g.kind ?? 'protection') === away)
      .map((g) => ({ ...g.ref }));
    if (gone.length > 0) {
      post(s, out, s.target.villageId, { kind: 'guests-leave', away, guests: gone });
    }
  }
  return captured;
}

/** Zajatec z hostů ochrany pro ves shromaždiště (klíč s domovskou vsí – `guardPrisonerKey`). */
function guardPrisoner(s: CampaignState, g: CampaignGuard): Prisoner {
  return {
    id: guardPrisonerKey(s.id, g.ref),
    ref: { ...g.ref },
    ...(g.name === undefined ? {} : { name: g.name }),
    ...(g.noble ? { noble: true as const } : {}),
    sinceDay: s.day + 1,
  };
}

/** Padlí, ranění, odvedení a kořist z boje a stavu napadené vsi v den konce boje (bez toho, co tažení dnes odvedlo). */
function raidResultOf(
  s: CampaignState,
  b: BattleState,
  village: VillageState,
  ctx: TickContext,
): RaidResult {
  const fallen: number[] = [];
  const wounded: number[] = [];
  for (const f of b.fighters) {
    if (f.side !== 'defend' || f.state !== 'down') continue;
    (f.killed ? fallen : wounded).push(f.ref);
  }
  const won = b.outcome === 'attackers';
  const led: number[] = [];
  const captured: number[] = [];
  const shelter = b.shelter;
  if (won) {
    const people = new Map(village.people.map((p) => [p.id, p]));
    const order = s.surrendered ?? 'lead';
    // vzdaný nebo raněný muž rodu / šlechtic: útočník ho zajme (NPC vždy), pobije, nebo nechá
    const takeMan = (id: number): void => {
      const choice = s.liveCommand ? order : 'lead';
      const w = wounded.indexOf(id);
      if (choice === 'lead') captured.push(id);
      else if (choice === 'kill') fallen.push(id);
      else return;
      if (w >= 0) wounded.splice(w, 1);
    };
    // host z ochrany je muž rodu pána – zajme se jako muž rodu; muž uprchlíků, který není muž rodu
    // ani šlechtic, padne při „pobít“, jinak zůstane v hradišti (odvést ho zatím nelze – Později)
    const guard = new Set((s.guards ?? []).map((g) => g.id));
    const villagers = new Set((s.guards ?? []).filter((g) => g.villager).map((g) => g.id));
    for (const id of yieldedOf(b, village, s.day)) {
      if (villagers.has(id)) {
        if (order === 'kill') fallen.push(id);
        continue;
      }
      if (guard.has(id)) {
        takeMan(id);
        continue;
      }
      const p = people.get(id);
      if (!p) continue;
      if (p.line || p.noble) takeMan(id);
      else if (order === 'lead') led.push(id);
      else if (order === 'kill') fallen.push(id);
    }
    // raněný muž rodu na bojišti, kterého útočník obklíčil, se vzdá s pravděpodobností 80 %
    for (const f of b.fighters) {
      if (f.side !== 'defend' || f.state !== 'down' || f.killed) continue;
      const p = people.get(f.ref);
      const lineMan =
        (guard.has(f.ref) && !villagers.has(f.ref)) || (p !== undefined && (p.line || p.noble));
      if (!lineMan || captured.includes(f.ref) || fallen.includes(f.ref)) continue;
      const rng = createRandom(deriveSeed(s.seed, `surrender:${f.ref}`));
      if (surrenders({ mounted: false }, { hopeless: true, freeRoute: false }, rng)) {
        takeMan(f.ref);
      }
    }
  }
  const base = {
    campaignId: s.id,
    leader: s.leaderName,
    ...(s.assembly.name === undefined ? {} : { from: s.assembly.name }),
    ...(s.target.name === undefined ? {} : { target: s.target.name }),
    declared: s.ambush !== true,
    fallen: fallen.sort((x, y) => x - y),
    wounded: wounded.sort((x, y) => x - y),
    led: led.sort((x, y) => x - y),
    ...(captured.length > 0
      ? {
          captured: captured.sort((x, y) => x - y),
          captorVillageId: s.assembly.villageId,
        }
      : {}),
  };
  if (!won) return { ...base, loot: noLoot(), pitsFound: [] };
  // útočiště je dobyté, až útočník stál uvnitř obvodu (fortifications.md – Bod zlomu a probíjení);
  // NPC velitel silné opevnění nenapadl – vzal jen, co je venku (`plunder`)
  const refugeTaken = b.plundered !== true && (b.taken ?? []).length > 0;
  const fit = s.members.filter((m) => m.status === 'active' && !m.wounded).length;
  const { loot, pitsFound } = raidLoot({
    village,
    day: s.day,
    shelter,
    refugeTaken,
    // nosnost bez kořisti, kterou už nesou (dostižení uprchlíci – Úloha 8)
    capacityKg: Math.max(0, lootCapacity(fit, s.supplies.foodKg) - s.loot.foodKg),
    seed: s.seed,
    daysInVillage: (b.ticks * hoursPerTick(ctx.world.clock)) / 24,
  });
  return { ...base, loot, pitsFound };
}

/**
 * Vzdaní (id): skupiny domů před bojem (`ShelterReport.surrendered`), obránci za hradbou, kteří se
 * při bodu zlomu vzdali (`Fighter.surrendered`), a lidé v dobytém útočišti, kteří neutekli
 * (`refugeRout` – děti, matky malých dětí, staří, ranění; zdraví dospělí utečou).
 */
function yieldedOf(b: BattleState, village: VillageState, day: number): number[] {
  const shelter = b.shelter;
  const out = [...(shelter?.surrendered ?? [])];
  const fighters = new Set<number>();
  for (const f of b.fighters) {
    if (f.side !== 'defend') continue;
    fighters.add(f.ref);
    if (f.surrendered && !out.includes(f.ref)) out.push(f.ref);
  }
  const taken = new Set(b.taken ?? []);
  if (b.plundered === true || taken.size === 0 || !shelter) return out;
  const at = shelter.refugeAt;
  const inside = shelter.refuge.filter(
    (id, i) =>
      !fighters.has(id) && !out.includes(id) && (at === undefined || taken.has(at[i] ?? -1)),
  );
  return [...out, ...refugeRout(village.people, day, inside).surrendered];
}

/** Průlomy opevnění pro schránku vsi: prolomené díly, z nich vypálené a díly s vypálenou branou. */
interface BreachReport {
  segments: number[];
  burned?: number[];
  gatesBurned?: number[];
}

/** Prolomené úseky po opevněních vsi (id opevnění → průlomy); pořadí jako `battleForts`. */
function breachesOf(b: BattleState, village: VillageState): Map<number, BreachReport> {
  const forts = village.fortifications ?? [];
  const byFort = new Map<number, BreachReport>();
  const add = (list: number[], segment: number): void => {
    if (!list.includes(segment)) list.push(segment);
  };
  for (const br of b.breaches) {
    const fort = forts[br.fort];
    if (!br.progress.breached || !fort) continue;
    const report = byFort.get(fort.id) ?? { segments: [] };
    add(report.segments, br.segment);
    if (br.method === 'burn') {
      add((report.burned ??= []), br.segment);
      if (br.spot === 'gate') add((report.gatesBurned ??= []), br.segment);
    }
    byFort.set(fort.id, report);
  }
  const bySegment = (x: number, y: number): number => x - y;
  for (const r of byFort.values()) {
    r.segments.sort(bySegment);
    r.burned?.sort(bySegment);
    r.gatesBurned?.sort(bySegment);
  }
  return byFort;
}

/** Zajatci z nájezdu (muži rodu a šlechtici napadené vsi) pro ves shromaždiště. */
function capturedPrisoners(
  s: CampaignState,
  village: VillageState,
  ids: readonly number[],
): Prisoner[] {
  const wanted = new Set(ids);
  return village.people
    .filter((p) => wanted.has(p.id))
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: prisonerKey(s.id, p.id),
      ref: { villageId: s.target.villageId, personId: p.id },
      ...(p.name === undefined ? {} : { name: p.name }),
      ...(p.noble ? { noble: true as const } : {}),
      sinceDay: s.day + 1,
    }));
}

/** Snímek odvedených lidí ze stavu napadené vsi (v pořadí id). */
function ledPeople(village: VillageState, ids: readonly number[]): Person[] {
  const wanted = new Set(ids);
  return village.people
    .filter((p) => wanted.has(p.id))
    .sort((a, b) => a.id - b.id)
    .map((p) => structuredClone(p));
}

function allArrived(s: CampaignState): boolean {
  return s.groups.every((g) => g.arrived);
}

/** Složení skupiny pro tempo; stádo kořisti jde se skupinou velitele (návrh Clauda). */
function paceOf(s: CampaignState, g: CampaignGroup): GroupPace {
  const pace: GroupPace = { onFoot: 0, riders: 0, woundedOnFoot: 0, herd: 0 };
  for (const m of s.members) {
    if (m.group !== g.id || m.status !== 'active') continue;
    if (m.mounted) pace.riders++;
    else if (m.wounded) pace.woundedOnFoot++;
    else pace.onFoot++;
  }
  // po rozpadu jde stádo s hloučkem do vsi shromaždiště (tam patří kořist)
  const herdMan =
    s.phase === 'disbanded'
      ? s.members.find((m) => m.status === 'active' && m.ref.villageId === s.assembly.villageId)
      : s.members.find((m) => sameRef(m.ref, s.commander));
  const herdGroup = herdMan?.group ?? s.groups[0]?.id;
  if (g.id === herdGroup) pace.herd = s.loot.herd;
  return pace;
}

/**
 * Pohyb skupin o jeden takt: metry louky tempem skupiny (`marchSpeed` ÷ takty za sekundu) po
 * úseku mapy. Konec úseku na okraji = přechod na sousední mapu (zbytek taktu se nevyužije), konec
 * úseku v cíli = skupina stojí. Skupina bez mužů, nebo která nemá kudy, stojí. Před úsekem k cíli
 * se cíl v neprůchodné buňce posune na nejbližší dosažitelné místo (`settleGoal`).
 */
function moveGroups(s: CampaignState, ctx: TickContext): void {
  for (const g of s.groups) {
    if (g.arrived || g.goal === null) continue;
    const pace = paceOf(s, g);
    if (pace.onFoot + pace.riders + pace.woundedOnFoot === 0) {
      g.arrived = true;
      continue;
    }
    settleGoal(g, s.day, ctx);
    const step = stepMover(g, g.goal.pos, marchSpeed(pace, s.day) / TICKS_PER_SECOND, s.day, ctx);
    if (step === 'arrived' || step === 'stuck') g.arrived = true;
  }
}
