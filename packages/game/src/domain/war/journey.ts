import type { WorldClock } from '../calendar';
import { cloneData } from '../village/core/clone';
import type { NewVillageEvent } from '../village/core/inbox';
import { directionBetween, type GridCell } from '../village/people/world-grid';
import {
  cellKey,
  gridOf,
  MissingData,
  sameCell,
  tickContext,
  type TickContext,
  type TickOut,
  stampNotices,
} from './campaign-tick';
import type {
  CampaignGroup,
  CampaignNotice,
  CampaignVillage,
  CampaignWorld,
} from './campaign-types';
import type {
  JourneyIntent,
  JourneyMember,
  JourneyOrder,
  JourneyState,
  JourneyStep,
} from './journey-types';
import { predatorDay, wildlifeOfMap } from './journey-predators';
import { marchSpeed, type GroupPace } from './march';
import { MARCH_FOREST, marchCellAt } from './march-grid';
import { missingMaps, sendGroup, settleGoal, stepMover } from './movement';
import { JOURNEY } from './rules-war';
import { lookOnMap, type KnowledgeOut } from './seen';
import { dayOfTick, hoursPerTick, TICKS_PER_SECOND, tickOfMs } from './ticks';
import { edgeCrossing } from './world-route';

// Výjezd vojvody po taktech (lord-control.md – Rozkazy, Na místě a návrat, Pohyb, Zásoby a zima;
// plán 2026-11-13 – Úloha 1): čistá funkce výchozího stavu a záznamu rozkazů s číslem taktu jako
// tažení (`campaign.ts`), se kterým sdílí takty, pohyb po mapách (`movement.ts`), tempo
// (`marchSpeed`) a svět (`CampaignWorld`). Takt po taktu: kontrola členů doma na začátku nového
// dne, rozkazy taktu podle `seq`, konec čekání, pohyb. Proti tažení výjezd neveze zásoby, nemrzne,
// bez hráče se nerozpadá a vsím na cestě nic neohlašuje – muži jedí dál ze zásob své vsi. Výsledek
// nezávisí na tom, po jakých kouscích taktů se počítá – stav je JSON a takt čte jen stav, rozkazy
// a svět. Jen det-math (`domain/war/**`): výjezd počítá worker i web.

/** Vstup nového výjezdu (vyslání): skupina stojí doma a dostane první rozkaz. */
export interface NewJourney {
  id: string;
  seed: number;
  playerId: string;
  houseId: string;
  leaderName: string;
  home: CampaignVillage;
  members: JourneyMember[];
  /** Skutečný okamžik vyslání – výjezd se počítá od taktu po tom, ve kterém leží. */
  startMs: number;
  /** První rozkaz (lord-control.md – Rozkazy). */
  order: JourneyOrder;
}

/**
 * Výchozí stav výjezdu: jedna skupina doma s prvním rozkazem `order`. Rozkaz, který neplatí (přes
 * okraj na nesousední políčko), se zahodí – skupina stojí doma a po čekání výjezd skončí.
 */
export function newJourney(input: NewJourney, clock: WorldClock): JourneyState {
  const tick = tickOfMs(input.startMs, clock);
  const state: JourneyState = {
    kind: 'journey',
    id: input.id,
    seed: input.seed,
    tick,
    day: dayOfTick(tick, clock),
    throughDay: dayOfTick(tick + 1, clock) - 1,
    phase: 'out',
    playerId: input.playerId,
    houseId: input.houseId,
    leaderName: input.leaderName,
    home: structuredClone(input.home),
    members: structuredClone(input.members),
    groups: [
      {
        id: 0,
        order: 'follow-leader',
        cell: { ...input.home.cell },
        pos: { ...input.home.pos },
        goal: null,
        route: [],
        leg: null,
        arrived: true,
      },
    ],
    arrivedTick: tick,
  };
  applyOrder(state, input.order);
  return state;
}

/** Skončený výjezd se už nepočítá. */
export function journeyFinished(state: JourneyState): boolean {
  return state.phase === 'done';
}

/**
 * Dopočte výjezd z `state` do taktu `toTick` (včetně). Rozkazy s taktem nejvýš `state.tick`
 * (v minulosti) a cizí rozkazy se zahodí; ostatní platí přesně ve svém taktu v pořadí `seq`.
 * Chybí-li mapa nebo ves (`waiting`), výsledek je stav na konci posledního celého taktu. Vstupní
 * stav ani rozkazy nemění.
 */
export function stepJourney(
  state: JourneyState,
  toTick: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): JourneyStep {
  const pending = intents
    .filter((i) => i.tick > state.tick && i.tick <= toTick && i.byPlayer === state.playerId)
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
  while (current.tick < toTick && !journeyFinished(current)) {
    const tick = current.tick + 1;
    let end = next;
    while (end < pending.length && pending[end]!.tick === tick) end++;
    const out: TickOut = { events: [], notices: [], knowledge: [] };
    try {
      current = journeyTick(current, tick, pending.slice(next, end), ctx, out);
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
    notices.push(...stampNotices(out.notices, `journey:${current.id}:${tick}`));
    knowledge.push(...(out.knowledge ?? []));
  }
  return { state: current, villageEvents, notices, ...withKnowledge(), waiting: null };
}

/**
 * Jeden takt – na kopii stavu (když chybí data, kopie se zahodí; `cloneData` jako u tažení). Po
 * pohybu se vsím na mapě nic neohlašuje – výjezd není vojsko (lord-control.md – Soused) –, jen se
 * muži rozhlédnou (`discover`). Znalost map (`seen`) se nekopíruje: `lookAround` ji na místě
 * nemění a co se změní, vrátí jako nový objekt – kopie by s délkou cesty rostla každý takt.
 */
function journeyTick(
  state: JourneyState,
  tick: number,
  intents: readonly JourneyIntent[],
  ctx: TickContext,
  out: TickOut,
): JourneyState {
  const { seen, ...rest } = state;
  const s: JourneyState = cloneData(rest);
  if (seen) s.seen = seen;
  s.tick = tick;
  const day = dayOfTick(tick, ctx.world.clock);
  s.throughDay = dayOfTick(tick + 1, ctx.world.clock) - 1;
  while (s.day < day) {
    s.day++;
    homeDay(s, ctx);
    if (!journeyFinished(s)) predators(s, ctx, out);
    if (journeyFinished(s)) {
      shareKnowledge(s, groupOf(s).cell, out);
      return s;
    }
  }
  // bez vojvody se zbytek vrací sám – rozkazy hráče se zahodí
  if (lordRides(s)) for (const intent of intents) applyOrder(s, intent.body);
  if (
    s.phase === 'out' &&
    s.arrivedTick !== null &&
    tick - s.arrivedTick > waitTicks(ctx.world.clock)
  ) {
    turnHome(s);
  }
  const before = groupOf(s).cell;
  moveGroup(s, ctx, out);
  const g = groupOf(s);
  // přechod okrajem – co o mapě, kterou skupina opustila, věděli, jde rodu
  if (!sameCell(g.cell, before)) shareKnowledge(s, before, out);
  discover(s, ctx);
  // dojetí – skupina na mapě stojí; co viděla cestou i z místa, kde stanula, jde rodu
  if (s.arrivedTick === tick) shareKnowledge(s, g.cell, out);
  return s;
}

/**
 * Znalost mapy `cell` do úložiště rodu (Úloha 10): celé, co o ní výjezd zná – sloučení
 * (`mergeKnowledge`) z toho vezme, co je novější. Domovská mapa a mapa bez záznamu nic nevydají.
 */
function shareKnowledge(s: JourneyState, cell: GridCell, out: TickOut): void {
  const seen = s.seen?.[cellKey(cell)];
  if (seen) (out.knowledge ??= []).push({ cell: { x: cell.x, y: cell.y }, seen });
}

/** Jediná skupina výjezdu. */
function groupOf(s: JourneyState): CampaignGroup {
  const g = s.groups[0];
  if (!g) throw new RangeError(`Výjezd ${s.id} nemá skupinu.`);
  return g;
}

/** Jede s výjezdem živý vojvoda? Bez něj hráč výjezd neřídí. */
function lordRides(s: JourneyState): boolean {
  return s.members.some((m) => m.lord && m.status === 'active');
}

/** Čekání na místě v taktech (`JOURNEY.waitDays` herních dní) – jako `absentTicks` u tažení. */
function waitTicks(clock: WorldClock): number {
  return Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
}

/**
 * Denní krok na začátku herního dne `s.day` – jen kontrola členů doma (lord-control.md – Zásoby
 * a zima: žádné jídlo, mráz ani dezerce). Muži zůstávají ve stavu domovské vsi, jedí z jejích zásob
 * a mohou tam zemřít (stáří, hlad): kdo ve stavu vsi není, je `fallen`. Zemře-li vojvoda, zbytek se
 * vrací sám; bez živých členů výjezd končí – nikdo se nevrací, události nejsou. Domovská ves, která
 * zanikla (`villageGone`), výjezd ukončí taky bez událostí – není, komu je poslat. Ves, která den
 * ještě nemá spočtený, krok zastaví jako u tažení (`MissingData`).
 */
function homeDay(s: JourneyState, ctx: TickContext): void {
  const home = s.home.villageId;
  const village = ctx.world.villageAt(home, s.day);
  if (village === null) {
    if (!ctx.world.villageGone?.(home)) throw new MissingData([], [home]);
    s.phase = 'done';
    return;
  }
  const living = new Set(village.people.map((p) => p.id));
  for (const m of s.members) {
    if (m.status === 'active' && !living.has(m.ref.personId)) m.status = 'fallen';
  }
  afterLosses(s);
}

/** Bez živých členů výjezd končí; bez vojvody se zbytek vrací sám. */
function afterLosses(s: JourneyState): void {
  if (!s.members.some((m) => m.status === 'active')) s.phase = 'done';
  else if (s.phase === 'out' && !lordRides(s)) turnHome(s);
}

/**
 * Šelmy (lord-control.md – Nebezpečí, bod 3): stojí-li skupina na začátku dne v hustém lese
 * (`MARCH_FOREST` pod jejím místem), losuje se (`predatorDay`) podle zvěře mapy (`wildlifeOfMap` –
 * stav vsi na mapě; ves čte jako `discover`, žádnou další). Zraněný dostane `wounded` a `woundedDay`,
 * zabitý je `fallen` (zemře-li vojvoda, zbytek se vrací sám); ves dostane `journey-casualty`.
 */
function predators(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const g = groupOf(s);
  const grid = gridOf(g.cell, s.day, ctx);
  if ((grid.flags[marchCellAt(grid, g.pos)]! & MARCH_FOREST) === 0) return;
  const map = ctx.world.landscapeOf(g.cell);
  if (map === null) throw new MissingData([{ ...g.cell }], []);
  const villageId = map.villageIds[0];
  const village = villageId === undefined ? null : ctx.world.villageAt(villageId, s.day);
  if (villageId !== undefined && village === null) throw new MissingData([], [villageId]);
  const hits = predatorDay({
    members: s.members,
    inForest: true,
    wildlife: wildlifeOfMap(map, village),
    seed: s.seed,
    day: s.day,
  });
  for (const hit of hits) {
    const m = s.members[hit.index]!;
    if (hit.outcome === 'dead') m.status = 'fallen';
    else {
      m.wounded = true;
      m.woundedDay = s.day;
    }
    out.events.push({
      villageId: s.home.villageId,
      day: s.day,
      ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
      body: {
        kind: 'journey-casualty',
        journeyId: s.id,
        personId: m.ref.personId,
        outcome: hit.outcome,
        by: hit.by,
      },
    });
  }
  if (hits.length > 0) afterLosses(s);
}

/**
 * Rozkaz hráče (lord-control.md – Rozkazy): nový rozkaz nahradí starý a zruší čekání; „Jdi sem“
 * a „Přes okraj“ vrátí i vracející se výjezd ven. „Přes okraj“ na nesousední políčko se zahodí.
 */
function applyOrder(s: JourneyState, order: JourneyOrder): void {
  const g = groupOf(s);
  switch (order.kind) {
    case 'go':
      sendGroup(g, { cell: g.cell, pos: order.pos });
      s.phase = 'out';
      break;
    case 'cross':
      if (directionBetween(g.cell, order.cell) === null) return;
      // cíl do pohledu: místo naproti na okraji sousední mapy; skupina zastaví, kde okraj přejde
      sendGroup(g, { cell: order.cell, pos: edgeCrossing(g.cell, order.cell, g.pos) });
      s.phase = 'out';
      break;
    case 'home':
      sendGroup(g, s.home);
      s.phase = 'returning';
      break;
  }
  s.arrivedTick = null;
}

/** Návrat domů bez rozkazu – po čekání, nebo když vojvoda zemřel. */
function turnHome(s: JourneyState): void {
  s.phase = 'returning';
  s.arrivedTick = null;
  sendGroup(groupOf(s), s.home);
}

/** Složení skupiny pro tempo (`marchSpeed`) – jen živí muži; výjezd stádo nevede. */
function paceOf(s: JourneyState): GroupPace {
  const pace: GroupPace = { onFoot: 0, riders: 0, woundedOnFoot: 0, herd: 0 };
  for (const m of s.members) {
    if (m.status !== 'active') continue;
    if (m.mounted) pace.riders++;
    else if (m.wounded) pace.woundedOnFoot++;
    else pace.onFoot++;
  }
  return pace;
}

/**
 * Pohyb skupiny o jeden takt jako u vojska (`moveGroups` – lord-control.md, Pohyb): metry louky
 * tempem nejpomalejšího (`marchSpeed` – jen jezdci × 1,5, sníh × 0,75) po úseku mapy, brány jsou
 * v míru otevřené (mřížka pochodu je zavírá jen v boji). Skupina stojí, když dojde do cíle nebo
 * dál nemá kudy; „Přes okraj“ končí přechodem – stojí tam, kde na sousední mapu vstoupila. Od
 * taktu dojetí běží čekání (`arrivedTick`); dojetí při návratu výjezd ukončí.
 */
function moveGroup(s: JourneyState, ctx: TickContext, out: TickOut): void {
  const g = groupOf(s);
  if (g.arrived || g.goal === null) return;
  settleGoal(g, s.day, ctx);
  const stepM = marchSpeed(paceOf(s), s.day) / TICKS_PER_SECOND;
  const step = stepMover(g, g.goal.pos, stepM, s.day, ctx);
  // ven vede přes okraj jen rozkaz „Přes okraj“ (trasa o jednom políčku); domů se jede dál
  const acrossEdge = step === 'crossed' && s.phase === 'out';
  if (step === 'moved' || (step === 'crossed' && !acrossEdge)) return;
  g.arrived = true;
  s.arrivedTick = s.tick;
  if (acrossEdge) g.goal = { cell: { ...g.cell }, pos: { ...g.pos } };
  if (s.phase === 'returning') finish(s, out);
}

/**
 * Objevování po pohybu (lord-control.md – Co vojvoda vidí): na každé cizí mapě si výjezd pamatuje
 * stopu a naposled viděné stavby a opevnění (`lookAround`); vlastní mapu hráč zná celou – domovská
 * mapa se neukládá. Ves na mapě se čte jako při pohybu (`gridOf`, `villageAt` pro den taktu) – ves
 * bez spočteného dne krok zastaví (`MissingData`). Jiná ves na mapě (stará zanikla, novou založil
 * nováček) – stavby staré vsi k ní nepatří, zůstane jen stopa.
 */
function discover(s: JourneyState, ctx: TickContext): void {
  const g = groupOf(s);
  if (journeyFinished(s) || sameCell(g.cell, s.home.cell)) return;
  const grid = gridOf(g.cell, s.day, ctx);
  const villageId = ctx.world.landscapeOf(g.cell)?.villageIds[0];
  const village = villageId === undefined ? null : ctx.world.villageAt(villageId, s.day);
  if (villageId !== undefined && village === null) throw new MissingData([], [villageId]);
  const key = cellKey(g.cell);
  const prev = s.seen?.[key];
  const next = lookOnMap(prev, { villageId, village, eyes: [g.pos], grid, day: s.day });
  if (next !== prev) s.seen = { ...s.seen, [key]: next };
}

/**
 * Konec výjezdu doma (lord-control.md – Na místě a návrat): domovská ves dostane `away-ends` – muži
 * jsou od začátku dalšího dne zase doma (schránka na následující den jako výsledky tažení; `ref`
 * je jedinečný: takt a pořadí v něm) – a hráč upozornění „Bořivoj se vrátil.“. Vrátí-li se družina
 * bez vojvody (zemřel doma), upozornění nejde – nevrátil se (návrh Clauda).
 */
function finish(s: JourneyState, out: TickOut): void {
  s.phase = 'done';
  const day = s.day + 1;
  out.events.push({
    villageId: s.home.villageId,
    day,
    ref: `journey:${s.id}:${s.tick}:${out.events.length}`,
    body: { kind: 'away-ends', refId: s.id, untilDay: day },
  });
  if (!lordRides(s)) return;
  out.notices.push({
    playerId: s.playerId,
    kind: 'journey-returned',
    payload: { journeyId: s.id, leader: s.leaderName },
    gameDay: s.day,
  });
}
