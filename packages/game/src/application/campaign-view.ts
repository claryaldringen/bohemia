import type { WorldClock } from '../domain/calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../domain/landscape';
import {
  campaignView,
  isCampaignParticipant,
  leadsLive,
  marchGrid,
  type CampaignPlace,
  type CampaignState,
  type CampaignView,
  type GroupOrder,
  type IntentBody,
  type MarchGrid,
  type Pos,
  type SurrenderOrder,
} from '../domain/war';
import type { Dwelling } from '../domain/village/types';
import { directionBetween, sameCell } from '../domain/village/world-grid';
import { queueCampaignIntent, type CampaignCells, type CampaignRepository } from './campaigns';
import type { VillageRepository } from './villages';

// Živé vedení a pohled na tažení (war.md – Velení, Mlha války; plán 2026-11-03 – Úloha 6.14):
// pohled hráče (vlastní muži celí, cizí jen v dohledu, stavby jen objevené) a záměry hráče
// – vést muže, rozkaz skupině, volba ke vzdaným, přítomnost. Server záměr ověří a odmítnutí
// nic neprozradí (jedna odpověď `false` pro každý důvod).

/** Mezipaměť mřížek pochodu mapy cíle – pohled se ptá 2× za sekundu, mřížka se mění po dnech. */
export interface SightGridCache {
  get(key: string): MarchGrid | undefined;
  set(key: string, grid: MarchGrid): void;
}

export interface CampaignViewDeps {
  campaigns: Pick<CampaignRepository, 'checkpoint'>;
  cells: CampaignCells;
  villages: Pick<VillageRepository, 'find'>;
  grids?: SightGridCache;
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
  // cizí bojovníci a objevené stavby jsou jen na mapě cíle – mřížku a ves načte, jen když jsou
  const defenders = state.battle?.fighters.some((f) => f.side === 'defend') ?? false;
  const grid = defenders ? await sightGrid(deps, state) : null;
  const dwellings: readonly Dwelling[] =
    state.discovered.length > 0
      ? ((await deps.villages.find(state.target.villageId))?.state.dwellings ?? [])
      : [];
  return campaignView(state, { playerId, sinceTick, grid, buildings: dwellings });
}

/** Mřížka mapy cíle v den tažení (dohled v lese) – jako ji bere boj (`gridOf`). */
export async function sightGrid(
  deps: Pick<CampaignViewDeps, 'cells' | 'villages' | 'grids'>,
  state: CampaignState,
): Promise<MarchGrid> {
  const key = `${state.id}@${state.day}`;
  const cached = deps.grids?.get(key);
  if (cached) return cached;
  const map = await deps.cells.mapOf(state.target.cell);
  const villageId = map.villageIds[0];
  const village = villageId === undefined ? null : await deps.villages.find(villageId);
  const grid = marchGrid(map.landscape, map.obstacles, village?.state ?? null, { day: state.day });
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
 * Zapíše pokyn hráče jako záměr na takt teď + 2. Odmítne (false) pokyn hráče, který tažení
 * nevede živě (velí jiný muž, velitel padl nebo je zajat), cíl, který hráč nezná (neobjevená
 * stavba, muž mimo dohled, místo mimo dosah), a pokyn do skončeného tažení. Přítomnost smí
 * poslat jen vůdce živého tažení.
 */
export async function commandCampaign(
  deps: CampaignCommandDeps,
  input: { playerId: string; campaignId: string; command: CampaignCommand; nowMs: number },
): Promise<boolean> {
  const checkpoint = await deps.campaigns.checkpoint(input.campaignId);
  if (!checkpoint) return false;
  const state = checkpoint.state;
  const body = await intentOf(deps, state, input.playerId, input.command);
  if (body === null) return false;
  const queued = await queueCampaignIntent(deps, {
    campaignId: input.campaignId,
    playerId: input.playerId,
    body,
    nowMs: input.nowMs,
  });
  return queued !== null;
}

async function intentOf(
  deps: CampaignViewDeps,
  state: CampaignState,
  playerId: string,
  command: CampaignCommand,
): Promise<IntentBody | null> {
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

/** Záměr velitele k cíli, který hráč zná (vidí ho, nebo ho objevil). */
async function leadIntent(
  deps: CampaignViewDeps,
  state: CampaignState,
  playerId: string,
  target: LeaderTarget,
): Promise<IntentBody | null> {
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
      return { kind: 'march', to: { cell: { x: cell.x, y: cell.y }, pos: { x: pos.x, z: pos.z } } };
    }
    case 'building': {
      const building = view.discovered.find((b) => b.id === target.id);
      if (!building) return null;
      return { kind: 'march', to: { cell: { ...state.target.cell }, pos: building.pos } };
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
