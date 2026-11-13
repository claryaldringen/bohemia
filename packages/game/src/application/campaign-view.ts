import type { WorldClock } from '../domain/calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../domain/landscape';
import {
  campaignView,
  isCampaignParticipant,
  knownTarget,
  leadsLive,
  marchGrid,
  reachableGoal,
  targetTrail,
  type CampaignPlace,
  type CampaignState,
  type CampaignView,
  type GroupOrder,
  type IntentBody,
  type MarchGrid,
  type Pos,
  type SeenCell,
  type SurrenderOrder,
} from '../domain/war';
import type { Dwelling } from '../domain/village/types';
import { directionBetween, sameCell, type GridCell } from '../domain/village/people/world-grid';
import { queueCampaignIntent, type CampaignCells, type CampaignRepository } from './campaigns';
import type { HouseRepository } from './houses';
import type { KnowledgeRepository } from './knowledge';
import type { VillageRepository } from './villages';

// Živé vedení a pohled na tažení (war.md – Velení, Mlha války; plán 2026-11-03 – Úloha 6.14):
// pohled hráče (vlastní muži celí, cizí jen v dohledu, stavby jen objevené) a záměry hráče
// – vést muže, rozkaz skupině, volba ke vzdaným, přítomnost. Server záměr ověří a odmítnutí
// nic neprozradí (jedna odpověď `refused` pro každý důvod) – kromě místa, kam se vojsko hráče
// nedostane (`unreachable`, hráč ho vidí na své mapě).

/** Mezipaměť mřížek pochodu mapy cíle – pohled se ptá 2× za sekundu, mřížka se mění po dnech. */
export interface SightGridCache {
  get(key: string): MarchGrid | undefined;
  set(key: string, grid: MarchGrid): void;
}

export interface CampaignViewDeps extends KnowledgeOfTargetDeps {
  campaigns: Pick<CampaignRepository, 'checkpoint'>;
  cells: CampaignCells;
  villages: Pick<VillageRepository, 'find'>;
  grids?: SightGridCache;
}

/** Porty znalosti rodu pro pohled útočníka na mapu cíle (plán 2026-11-13 – Úloha 11). */
export interface KnowledgeOfTargetDeps {
  /** Úložiště znalosti rodu; bez něj rod nic neví – pohled jako před Úlohou 11. */
  knowledge?: Pick<KnowledgeRepository, 'of'>;
  /** Rod hráče – vazal ve službě a body bez `houseId`; bez něj jen rod vůdce ze stavu. */
  houses?: Pick<HouseRepository, 'activeOf'>;
}

/** Pohled hráče na tažení; null = tažení není, nebo v něm hráč nemá vůdcovství ani muže. */
export async function campaignViewFor(
  deps: CampaignViewDeps,
  input: { playerId: string; campaignId: string; sinceTick: number },
): Promise<CampaignView | null> {
  const checkpoint = await deps.campaigns.checkpoint(input.campaignId);
  if (!checkpoint || !isCampaignParticipant(checkpoint.state, input.playerId)) return null;
  return viewOf(deps, checkpoint.state, input.playerId, input.sinceTick);
}

async function viewOf(
  deps: CampaignViewDeps,
  state: CampaignState,
  playerId: string,
  sinceTick: number,
): Promise<CampaignView | null> {
  // cizí bojovníci a objevené stavby jsou jen na mapě cíle – mřížku a ves načte, jen když jsou;
  // ves i kvůli známým stavbám, na jejichž místo už muži tažení mohli dohlédnout (Úloha 11)
  const known = await knowledgeOfTarget(deps, state, playerId);
  const defenders = state.battle?.fighters.some((f) => f.side === 'defend') ?? false;
  const grid = defenders ? await sightGrid(deps, state) : null;
  const looked = (known?.parts.length ?? 0) > 0 && targetTrail(state).length > 0;
  const dwellings: readonly Dwelling[] | null =
    state.discovered.length > 0 || looked
      ? ((await deps.villages.find(state.target.villageId))?.state.dwellings ?? [])
      : null;
  const view = campaignView(state, { playerId, sinceTick, grid, buildings: dwellings ?? [] });
  const seen = view && knownTarget(state, known, { dwellings, grid });
  return view && seen ? { ...view, known: seen } : view;
}

/**
 * Znalost rodu hráče o mapě cíle tažení (plán 2026-11-13 – Úloha 11) – jeden dotaz na pohled. Rod
 * vůdce je ve stavu tažení (`houseId`); vazal ve službě vidí znalost svého rodu, bod bez `houseId`
 * rod hráče. Bez úložiště znalosti nebo rodu null.
 */
export async function knowledgeOfTarget(
  deps: KnowledgeOfTargetDeps,
  state: CampaignState,
  playerId: string,
): Promise<SeenCell | null> {
  if (!deps.knowledge) return null;
  const own = state.playerId === playerId ? state.houseId : undefined;
  const houseId = own ?? (await deps.houses?.activeOf(playerId))?.id;
  return houseId === undefined ? null : deps.knowledge.of(houseId, state.target.cell);
}

/** Mřížka mapy cíle v den tažení (dohled v lese) – jako ji bere boj (`gridOf`). */
export function sightGrid(
  deps: Pick<CampaignViewDeps, 'cells' | 'villages' | 'grids'>,
  state: CampaignState,
): Promise<MarchGrid> {
  return mapGrid(deps, state.target.cell, state.day);
}

/** Mřížka pochodu mapy políčka v den `day` – krajina, překážky a první ves na mapě (`gridOf`). */
export async function mapGrid(
  deps: Pick<CampaignViewDeps, 'cells' | 'villages' | 'grids'>,
  cell: GridCell,
  day: number,
): Promise<MarchGrid> {
  const key = `${cell.x},${cell.y}@${day}`;
  const cached = deps.grids?.get(key);
  if (cached) return cached;
  const map = await deps.cells.mapOf(cell);
  const villageId = map.villageIds[0];
  const village = villageId === undefined ? null : await deps.villages.find(villageId);
  const grid = marchGrid(map.landscape, map.obstacles, village?.state ?? null, { day });
  deps.grids?.set(key, grid);
  return grid;
}

/** Běžící tažení hráče v panelu Vojsko – cíl a fáze. */
export interface CampaignSummary {
  id: string;
  targetName: string | null;
  phase: CampaignState['phase'];
  /** Tažení vede živě on sám (jinak velí jiný muž, nebo jde jako vazal ve službě). */
  liveCommand: boolean;
  /** Je vůdce tažení – vést smí jen on; vazal ve službě tažení jen sleduje svými muži. */
  leads: boolean;
}

/**
 * Běžící tažení, která hráč vede nebo ve kterých jdou jeho muži (vazal ve službě – vlastní muže
 * hráč vidí vždy; plán 2026-11-03 – Úloha 6.17), od nejstaršího.
 */
export async function campaignsOf(
  deps: { campaigns: Pick<CampaignRepository, 'activeOf' | 'checkpoint'> },
  input: { playerId: string },
): Promise<CampaignSummary[]> {
  const out: CampaignSummary[] = [];
  for (const id of await deps.campaigns.activeOf(input.playerId)) {
    const point = await deps.campaigns.checkpoint(id);
    if (!point || !isCampaignParticipant(point.state, input.playerId)) continue;
    const s = point.state;
    const leads = s.playerId === input.playerId;
    out.push({
      id,
      targetName: s.target.name ?? null,
      phase: s.phase,
      liveCommand: leads && s.liveCommand,
      leads,
    });
  }
  return out;
}

/** Cíl velitele: místo na mapě, objevená stavba, cizí muž v dohledu, nebo domů (ústup). */
export type LeaderTarget =
  | { kind: 'place'; place: CampaignPlace }
  | { kind: 'building'; id: number }
  | { kind: 'fighter'; id: string }
  | { kind: 'home' };

/** Pokyn hráče do tažení (server actions `commandLeader`, `setGroupOrder`, …). */
export type CampaignCommand =
  | { kind: 'lead'; target: LeaderTarget }
  | { kind: 'order'; group: number; order: GroupOrder; at?: Pos }
  | { kind: 'surrendered'; group: number; choice: SurrenderOrder }
  | { kind: 'presence' };

export interface CampaignCommandDeps extends CampaignViewDeps {
  campaigns: Pick<CampaignRepository, 'checkpoint' | 'addIntent'>;
  world: WorldClock;
}

/** Okraj mapy od středu (m) – místo mimo mapu není cíl. */
const MAP_EDGE_M = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;

const GROUP_ORDERS: readonly GroupOrder[] = ['follow-leader', 'attack-all', 'hold-place'];
const SURRENDER_ORDERS: readonly SurrenderOrder[] = ['kill', 'lead', 'leave'];

/**
 * Výsledek pokynu: takt, na který se záměr zapsal (mapa tažení do něj ukazuje cíl z kliku, pak cíl
 * ze stavu), nebo odmítnutí. `unreachable` – místo na mapě skupiny velitele, ke kterému ani
 * k jeho okolí skupina nedojde (stojí sevřená v neprůchodných buňkách; důvod u kurzoru); ostatní
 * důvody jedna odpověď `refused` (nic se neprozradí).
 */
export type CampaignCommandResult =
  { queued: true; tick: number } | { queued: false; reason: 'refused' | 'unreachable' };

const REFUSED: CampaignCommandResult = { queued: false, reason: 'refused' };

/**
 * Zapíše pokyn hráče jako záměr na takt teď + 2. Odmítne pokyn hráče, který tažení nevede živě
 * (velí jiný muž, velitel padl nebo je zajat), cíl, který hráč nezná (neobjevená stavba, muž mimo
 * dohled, místo mimo dosah), pokyn do skončeného tažení a místo, kam skupina velitele nedojde
 * (`unreachable`). Přítomnost smí poslat jen vůdce živého tažení.
 */
export async function commandCampaign(
  deps: CampaignCommandDeps,
  input: { playerId: string; campaignId: string; command: CampaignCommand; nowMs: number },
): Promise<CampaignCommandResult> {
  const checkpoint = await deps.campaigns.checkpoint(input.campaignId);
  if (!checkpoint) return REFUSED;
  const state = checkpoint.state;
  const body = await intentOf(deps, state, input.playerId, input.command);
  if (body === null) return REFUSED;
  if (body === 'unreachable') return { queued: false, reason: 'unreachable' };
  const queued = await queueCampaignIntent(deps, {
    campaignId: input.campaignId,
    playerId: input.playerId,
    body,
    nowMs: input.nowMs,
  });
  return queued === null ? REFUSED : { queued: true, tick: queued.tick };
}

async function intentOf(
  deps: CampaignViewDeps,
  state: CampaignState,
  playerId: string,
  command: CampaignCommand,
): Promise<IntentBody | 'unreachable' | null> {
  if (command.kind === 'presence') {
    const running = state.phase !== 'done' && state.phase !== 'disbanded';
    return state.playerId === playerId && state.liveCommand && running
      ? { kind: 'presence' }
      : null;
  }
  if (!leadsLive(state, playerId)) return null;
  const hasGroup = (id: number): boolean => state.groups.some((g) => g.id === id);
  switch (command.kind) {
    case 'order':
      if (!hasGroup(command.group) || !GROUP_ORDERS.includes(command.order)) return null;
      if (command.at !== undefined && (command.order !== 'hold-place' || !onMap(command.at))) {
        return null;
      }
      return { kind: 'set-order', group: command.group, order: command.order, at: command.at };
    case 'surrendered':
      if (!hasGroup(command.group) || !SURRENDER_ORDERS.includes(command.choice)) return null;
      return { kind: 'choose-surrendered', group: command.group, choice: command.choice };
    case 'lead':
      return leadIntent(deps, state, playerId, command.target);
  }
}

/**
 * Dojde skupina velitele na místo? Jen na pochodu (záměr `march` jinde pohne bojovníkem, nebo se
 * zahodí) a na mapě, na které skupina stojí: cíl v neprůchodné buňce posune tažení na nejbližší
 * dosažitelné místo (`reachableGoal`, war.md – Pohyb – Cíl v neprůchodné buňce); žádné = nedojde.
 * Na jiné mapě se cíl posune, až na ni skupina vstoupí.
 */
async function reachable(
  deps: CampaignViewDeps,
  state: CampaignState,
  groupId: number,
  place: CampaignPlace,
): Promise<boolean> {
  const group = state.groups.find((g) => g.id === groupId);
  if (state.phase !== 'marching' || !group || !sameCell(group.cell, place.cell)) return true;
  const grid = await mapGrid(deps, place.cell, state.day);
  return reachableGoal(grid, group.pos, place.pos) !== null;
}

/** Záměr velitele k cíli, který hráč zná (vidí ho, nebo ho objevil). */
async function leadIntent(
  deps: CampaignViewDeps,
  state: CampaignState,
  playerId: string,
  target: LeaderTarget,
): Promise<IntentBody | 'unreachable' | null> {
  if (target.kind === 'home') return { kind: 'turn-back' };
  const view = await viewOf(deps, state, playerId, state.tick);
  const commander = view?.men.find((m) => m.commander);
  if (!view || !commander) return null;
  switch (target.kind) {
    case 'place': {
      const { cell, pos } = target.place;
      if (!onMap(pos) || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return null;
      // známé je políčko velitele, jeho sousedé a mapa cíle
      const near =
        sameCell(cell, commander.cell) || directionBetween(commander.cell, cell) !== null;
      if (!near && !sameCell(cell, state.target.cell)) return null;
      if (!(await reachable(deps, state, commander.group, target.place))) return 'unreachable';
      return { kind: 'march', to: { cell: { x: cell.x, y: cell.y }, pos: { x: pos.x, z: pos.z } } };
    }
    case 'building': {
      // objevený dům, nebo dům, který rod zná ze znalosti (místo, kde ho muži viděli – Úloha 11)
      const building = view.discovered.find((b) => b.id === target.id);
      const known = Number.isInteger(target.id)
        ? view.known?.parts.find((p) => p.key === `dwelling:${target.id}`)
        : undefined;
      const pos = building?.pos ?? known?.pos;
      if (!pos) return null;
      return { kind: 'march', to: { cell: { ...state.target.cell }, pos: { x: pos.x, z: pos.z } } };
    }
    case 'fighter': {
      const foe = view.foreign.find((f) => f.id === target.id);
      if (!foe || foe.state === 'down' || foe.state === 'fled') return null;
      return { kind: 'strike', target: foe.id };
    }
  }
}

function onMap(pos: Pos): boolean {
  return (
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.z) &&
    Math.abs(pos.x) <= MAP_EDGE_M &&
    Math.abs(pos.z) <= MAP_EDGE_M
  );
}
