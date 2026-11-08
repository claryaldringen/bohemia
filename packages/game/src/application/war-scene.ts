import {
  battleForts,
  isCampaignParticipant,
  warSceneView,
  type BattleFort,
  type BattleSide,
  type CampaignState,
  type Pos,
  type WarSceneBuilding,
  type WarSceneView,
} from '../domain/war';
import { sameCell, type GridCell } from '../domain/village/world-grid';
import { sightGrid, type SightGridCache } from './campaign-view';
import type { CampaignCells, CampaignRepository } from './campaigns';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Válka ve scéně vlastní mapy (war.md – Ve scéně; scene.md – Vojsko, boj a mlha války): scéna hry
// ukazuje mapu sídla hráče – tam může stát jeho vojsko (shromaždiště, návrat, průchod) a tam ho
// může napadnout cizí. Obránce tažení nevede ani v něm nemá muže, vidí ho tedy jen očima své vsi
// (domy a obránci na nohou) – stejná mlha války jako `campaignView`.

/**
 * Napadená ves v jednom herním dni: oči obránce (domy), domy pro útočníka (scéna z nich ukáže jen
 * objevené) a opevnění bojiště.
 */
export interface WarSceneDefender {
  eyes: Pos[];
  forts: BattleFort[];
  buildings: WarSceneBuilding[];
}

/**
 * Mezipaměť obránce po herních dnech (klíč `ves@den`) – scéna se ptá 2× za sekundu a stav vsi
 * (u velké vsi přes 1 MB JSON) se tak čte jednou za herní den, ne při každém dotazu.
 */
export interface WarSceneDefenderCache {
  get(key: string): WarSceneDefender | undefined;
  set(key: string, defender: WarSceneDefender): void;
}

export interface WarSceneDeps {
  settlements: Pick<SettlementRepository, 'find'>;
  /** `stampsOf` – id vsi sídla bez stavu; `find` – stav vsi jen při novém dni (a mřížka dohledu). */
  villages: Pick<VillageRepository, 'stampsOf' | 'find'>;
  campaigns: Pick<CampaignRepository, 'activeOf' | 'activeAgainst' | 'checkpoint'>;
  cells: CampaignCells;
  grids?: SightGridCache;
  defenders?: WarSceneDefenderCache;
}

/**
 * Válka na mapě sídla `settlementId`, kterou hráč vidí ve scéně: napadená ves z pohledu obránce,
 * jinak vlastní vojsko na mapě (pochod). Boj má přednost před pochodem, napadení před vlastním
 * vojskem. null – sídlo není hráče, nebo na mapě žádná válka vidět není.
 */
export async function warSceneFor(
  deps: WarSceneDeps,
  input: { playerId: string; settlementId: string },
): Promise<WarSceneView | null> {
  const settlement = await deps.settlements.find(input.settlementId);
  if (!settlement || settlement.ownerId !== input.playerId || !settlement.worldCell) return null;
  const cell: GridCell = { x: settlement.worldCell.x, y: settlement.worldCell.y };
  const [village] = await deps.villages.stampsOf([settlement.id]);
  const views: WarSceneView[] = [];
  if (village) {
    for (const id of await deps.campaigns.activeAgainst(village.id)) {
      const point = await deps.campaigns.checkpoint(id);
      // vlastní vojsko proti vlastní vsi nejde – útočník je jiný hráč (nebo NPC)
      if (!point || point.state.playerId === input.playerId || !present(point.state, cell)) {
        continue;
      }
      const defender = await defenderOf(deps, village.id, cell, point.state.day);
      if (!defender) continue;
      const view = await viewOn(deps, point.state, cell, 'defend', defender);
      if (view) views.push(view);
    }
  }
  for (const id of await deps.campaigns.activeOf(input.playerId)) {
    const point = await deps.campaigns.checkpoint(id);
    if (!point || !present(point.state, cell)) continue;
    const view = await viewOn(deps, point.state, cell, 'attack', {
      eyes: [],
      forts: [],
      buildings: [],
    });
    if (view) views.push(view);
  }
  return views.find((v) => v.battle !== null) ?? views[0] ?? null;
}

/**
 * Válka na mapě `cell` z pohledu útočníka – účastníka tažení `campaignId` (vůdce i vazal ve službě;
 * war.md – Ve scéně: mlha války na cizí mapě): celé vojsko tažení, obránci jen v dohledu jeho mužů
 * na nohou, z cílové vsi jen objevené domy a hradby. Žádné akce nad cizí vsí – jen pohled.
 * null – hráč tažení nezná, tažení skončilo, nebo na mapě vojsko nestojí (scéna se vrátí domů).
 */
export async function warSceneOnMap(
  deps: WarSceneDeps,
  input: { playerId: string; campaignId: string; cell: GridCell },
): Promise<WarSceneView | null> {
  const point = await deps.campaigns.checkpoint(input.campaignId);
  if (!point || !isCampaignParticipant(point.state, input.playerId)) return null;
  const state = point.state;
  const cell: GridCell = { x: input.cell.x, y: input.cell.y };
  if (state.phase === 'done' || state.phase === 'disbanded' || !present(state, cell)) return null;
  const onTarget = sameCell(state.target.cell, cell);
  const target = onTarget ? await defenderOf(deps, state.target.villageId, cell, state.day) : null;
  // dohled v lese jako v pohledu na tažení – mřížka mapy cíle jen při boji
  const grid =
    onTarget && state.battle?.outcome === 'ongoing' ? await sightGrid(deps, state) : null;
  return warSceneView(state, {
    cell,
    side: 'attack',
    grid,
    eyes: [],
    forts: target?.forts ?? [],
    buildings: target?.buildings ?? [],
  });
}

/** Je vojsko tažení na mapě – skupina na ní stojí, nebo tu běží boj. */
function present(state: CampaignState, cell: GridCell): boolean {
  const onTarget = state.target.cell.x === cell.x && state.target.cell.y === cell.y;
  return (
    state.groups.some((g) => g.cell.x === cell.x && g.cell.y === cell.y) ||
    (onTarget && state.battle?.outcome === 'ongoing')
  );
}

async function viewOn(
  deps: WarSceneDeps,
  state: CampaignState,
  cell: GridCell,
  side: BattleSide,
  defender: WarSceneDefender,
): Promise<WarSceneView | null> {
  // dohled v lese jen pro obránce na mapě cíle (útočník vidí celé vlastní vojsko)
  const onTarget = state.target.cell.x === cell.x && state.target.cell.y === cell.y;
  const grid = side === 'defend' && onTarget ? await sightGrid(deps, state) : null;
  return warSceneView(state, { cell, side, grid, eyes: defender.eyes, forts: defender.forts });
}

/** Domy a opevnění napadené vsi v den `day` – z mezipaměti, jinak jednou ze stavu vsi. */
async function defenderOf(
  deps: WarSceneDeps,
  villageId: string,
  cell: GridCell,
  day: number,
): Promise<WarSceneDefender | null> {
  const key = `${villageId}@${day}`;
  const cached = deps.defenders?.get(key);
  if (cached) return cached;
  const village = await deps.villages.find(villageId);
  if (!village) return null;
  const fortifications = village.state.fortifications ?? [];
  const defender: WarSceneDefender = {
    eyes: village.state.dwellings.map((d) => ({ x: d.position.x, z: d.position.z })),
    buildings: village.state.dwellings.map((d) => ({
      id: d.id,
      type: d.type,
      position: { x: d.position.x, z: d.position.z, rotation: d.position.rotation },
    })),
    forts:
      fortifications.length > 0
        ? battleForts((await deps.cells.mapOf(cell)).landscape, fortifications)
        : [],
  };
  deps.defenders?.set(key, defender);
  return defender;
}
