import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/people/world-grid';
import { sameCell } from '../domain/village/people/world-grid';
import {
  hoursPerTick,
  INTENT_LEAD_TICKS,
  inSight,
  JOURNEY,
  tickOfMs,
  type CampaignPlace,
  type JourneyOrder,
  type JourneyPhase,
  type JourneyState,
  type Pos,
  type SeenCell,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import { mapGrid, type SightGridCache } from './campaign-view';
import type { CampaignCells } from './campaigns';
import type { HouseRepository } from './houses';
import { orderAim } from './journey-order';
import type { JourneyRepository } from './journeys';
import { houseName } from './negotiation-chronicle';
import { findPlayerVillage, type PlayerVillagesDeps } from './player-villages';
import type { VillageRepository } from './villages';

// Rozkazy a pohled na výjezd vojvody (lord-control.md – Rozkazy, Na místě a návrat, Soused; plán
// 2026-11-13 – Úloha 5). Web volá tyhle use-casy; stav počítá worker, tady se jen čte kontrolní
// bod a zapisují záměry hráče.

/** Pohled hráče na vlastní běžící výjezd. */
export interface JourneyView {
  journeyId: string;
  tick: number;
  day: number;
  phase: JourneyPhase;
  /** Políčko světa, na kterém skupina je. */
  cell: GridCell;
  home: GridCell;
  men: { personId: number; lord: boolean; mounted: boolean; wounded: boolean }[];
  group: { pos: Pos; goal: CampaignPlace | null; arrived: boolean };
  /** Celé dny zbývající do automatického návratu (3, 2, 1) – jen když skupina stojí na místě. */
  waitDaysLeft: number | null;
  /** Vojvoda žije – hráč smí rozkazovat. */
  controllable: boolean;
  /**
   * Co muži viděli na mapě, na které skupina je (stopa a naposled viděné stavby – Úloha 6); na
   * domovské mapě, kterou hráč zná celou, a dokud nic neviděli, null.
   */
  seen: SeenCell | null;
}

export interface JourneyReadDeps {
  journeys: Pick<JourneyRepository, 'activeOf' | 'checkpoint'>;
  world: WorldClock;
}

/**
 * Pohled hráče na jeho běžící výjezd; null = hráč žádný nemá. Pohled cizího hráče na cizí výjezd
 * neexistuje – výjezd se hledá podle hráče. Muži, kteří padli nebo zemřeli doma, se neukazují.
 */
export async function journeyViewFor(
  deps: JourneyReadDeps,
  input: { playerId: string },
): Promise<JourneyView | null> {
  const id = await deps.journeys.activeOf(input.playerId);
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const state = point?.state;
  const group = state?.groups[0];
  if (!state || !group || state.playerId !== input.playerId) return null;
  return {
    journeyId: state.id,
    tick: state.tick,
    day: state.day,
    phase: state.phase,
    cell: { ...group.cell },
    home: { ...state.home.cell },
    men: state.members
      .filter((m) => m.status === 'active')
      .map((m) => ({
        personId: m.ref.personId,
        lord: m.lord,
        mounted: m.mounted,
        wounded: m.wounded,
      })),
    group: { pos: { ...group.pos }, goal: group.goal, arrived: group.arrived },
    waitDaysLeft: waitDaysLeft(state, deps.world),
    controllable: state.members.some((m) => m.lord && m.status === 'active'),
    seen: state.seen?.[cellKey(group.cell)] ?? null,
  };
}

/** Celé dny do návratu: 3 hned po dojetí, pak 2, 1; skupina, která jede, nebo se vrací – null. */
function waitDaysLeft(state: JourneyState, world: WorldClock): number | null {
  if (state.phase !== 'out' || state.arrivedTick === null) return null;
  const elapsedDays = ((state.tick - state.arrivedTick) * hoursPerTick(world)) / 24;
  return Math.max(1, Math.ceil(JOURNEY.waitDays - elapsedDays));
}

export interface JourneyCommandDeps extends JourneyReadDeps {
  journeys: Pick<JourneyRepository, 'activeOf' | 'checkpoint' | 'addIntent'>;
  cells: CampaignCells;
  villages: Pick<VillageRepository, 'find'>;
  grids?: SightGridCache;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku (`houseAtWarOn`)? */
  atWar: (playerId: string, cell: GridCell) => Promise<boolean>;
}

export type JourneyCommandResult =
  | { queued: true; tick: number }
  | { queued: false; reason: 'refused' | 'unreachable' | 'war-there' };

const REFUSED: JourneyCommandResult = { queued: false, reason: 'refused' };

/**
 * Zapíše rozkaz hráče jako záměr na takt teď + `INTENT_LEAD_TICKS`. Rozkaz se ověří vůči políčku
 * a poloze, kde skupina podle kontrolního bodu je (`orderAim` – totéž ověření jako při vyslání).
 * Odmítne (`refused`) hráče bez běžícího výjezdu, výjezd bez živého vojvody a vstup, který nedává
 * smysl (bod mimo mapu, nekonečné číslo, `cross` na nesousední políčko); `unreachable` – skupina
 * na místo nedojde; `war-there` – políčko patří rodu, se kterým je rod hráče ve válce.
 */
export async function commandJourney(
  deps: JourneyCommandDeps,
  input: { playerId: string; command: JourneyOrder; nowMs: number },
): Promise<JourneyCommandResult> {
  const id = await deps.journeys.activeOf(input.playerId);
  const point = id === null ? null : await deps.journeys.checkpoint(id);
  const state = point?.state;
  const group = state?.groups[0];
  if (!id || !state || !group || state.playerId !== input.playerId) return REFUSED;
  if (state.phase === 'done' || !state.members.some((m) => m.lord && m.status === 'active')) {
    return REFUSED;
  }
  const command = input.command;
  const grid = command.kind === 'go' ? await mapGrid(deps, group.cell, state.day) : null;
  const aim = orderAim(command, group.cell, group.pos, () => grid!);
  if (aim === 'invalid') return REFUSED;
  if (aim === 'unreachable') return { queued: false, reason: 'unreachable' };
  if (aim !== null && (await deps.atWar(input.playerId, aim))) {
    return { queued: false, reason: 'war-there' };
  }
  const tick = tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS;
  const queued = await deps.journeys.addIntent(id, {
    tick,
    byPlayer: input.playerId,
    body: command,
  });
  return queued === null ? REFUSED : { queued: true, tick: queued.tick };
}

/** Cizí (nebo vlastní) jezdec na mapě vsi – co o něm hostitel smí vědět. */
export interface JourneyVisitor {
  journeyId: string;
  own: boolean;
  /** Jméno vojvody. */
  leader: string;
  /** Jméno rodu (jako v panelu Rod). */
  house: string;
  tick: number;
  pos: Pos;
  /** Cíl na této mapě; jiný cíl hostitel nevidí. */
  goal: Pos | null;
  men: { lord: boolean; mounted: boolean }[];
}

export interface VisitorsDeps extends PlayerVillagesDeps {
  journeys: Pick<JourneyRepository, 'onCell' | 'checkpoint'>;
  houses: Pick<HouseRepository, 'byId'>;
  cells: CampaignCells;
  grids?: SightGridCache;
}

/**
 * Jezdci na mapě vsi `villageId` hráče. Hostitel je vidí jako obránce ve válce – lidmi a domy vsi
 * (`inSight`: 150 m, v lese 50 m); vlastní výjezd hráče je vidět vždy. Ves jiného hráče: prázdno.
 * Ves jezdce na cestě nijak nereaguje (lord-control.md – Soused) – tohle je jen pohled.
 */
export async function visitorsOn(
  deps: VisitorsDeps,
  input: { playerId: string; villageId: string },
): Promise<JourneyVisitor[]> {
  const own = await findPlayerVillage(deps, input);
  const cell = own?.settlement.worldCell;
  if (!own || !cell) return [];
  const states: JourneyState[] = [];
  for (const id of await deps.journeys.onCell(cell)) {
    const state = (await deps.journeys.checkpoint(id))?.state;
    if (state) states.push(state);
  }
  if (states.length === 0) return [];
  const village = own.village.state;
  const eyes = village.dwellings.map((d) => ({ x: d.position.x, z: d.position.z }));
  const grid = states.some((s) => s.playerId !== input.playerId)
    ? await mapGrid(deps, cell, village.lastDay)
    : null;
  const visitors: JourneyVisitor[] = [];
  for (const state of states) {
    const group = state.groups[0];
    if (!group || !sameCell(group.cell, cell)) continue;
    const mine = state.playerId === input.playerId;
    if (!mine && !eyes.some((e) => inSight(grid, e, group.pos))) continue;
    const house = await deps.houses.byId(state.houseId);
    visitors.push({
      journeyId: state.id,
      own: mine,
      leader: state.leaderName,
      house: house ? await houseName(deps, house) : state.leaderName,
      tick: state.tick,
      pos: { ...group.pos },
      goal: group.goal && sameCell(group.goal.cell, cell) ? { ...group.goal.pos } : null,
      men: state.members
        .filter((m) => m.status === 'active')
        .map((m) => ({ lord: m.lord, mounted: m.mounted })),
    });
  }
  return visitors;
}
