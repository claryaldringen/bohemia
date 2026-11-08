import {
  battleForts,
  warSceneView,
  type BattleFort,
  type BattleSide,
  type CampaignState,
  type Pos,
  type WarSceneView,
} from '../domain/war';
import type { GridCell } from '../domain/village/world-grid';
import { sightGrid, type SightGridCache } from './campaign-view';
import type { CampaignCells, CampaignRepository } from './campaigns';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Válka ve scéně vlastní mapy (war.md – Ve scéně; scene.md – Vojsko, boj a mlha války): scéna hry
// ukazuje mapu sídla hráče – tam může stát jeho vojsko (shromaždiště, návrat, průchod) a tam ho
// může napadnout cizí. Obránce tažení nevede ani v něm nemá muže, vidí ho tedy jen očima své vsi
// (domy a obránci na nohou) – stejná mlha války jako `campaignView`.

export interface WarSceneDeps {
  settlements: Pick<SettlementRepository, 'find'>;
  villages: Pick<VillageRepository, 'listBySettlement' | 'find'>;
  campaigns: Pick<CampaignRepository, 'activeOf' | 'activeAgainst' | 'checkpoint'>;
  cells: CampaignCells;
  grids?: SightGridCache;
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
  const [village] = await deps.villages.listBySettlement(settlement.id);
  const views: WarSceneView[] = [];
  if (village) {
    const eyes: Pos[] = village.state.dwellings.map((d) => ({
      x: d.position.x,
      z: d.position.z,
    }));
    for (const id of await deps.campaigns.activeAgainst(village.id)) {
      const point = await deps.campaigns.checkpoint(id);
      // vlastní vojsko proti vlastní vsi nejde – útočník je jiný hráč (nebo NPC)
      if (!point || point.state.playerId === input.playerId) continue;
      const forts =
        point.state.battle?.outcome === 'ongoing'
          ? await fortsOf(deps, cell, village.state.fortifications ?? [])
          : [];
      const view = await viewOn(deps, point.state, cell, 'defend', eyes, forts);
      if (view) views.push(view);
    }
  }
  for (const id of await deps.campaigns.activeOf(input.playerId)) {
    const point = await deps.campaigns.checkpoint(id);
    if (!point) continue;
    const view = await viewOn(deps, point.state, cell, 'attack', [], []);
    if (view) views.push(view);
  }
  return views.find((v) => v.battle !== null) ?? views[0] ?? null;
}

async function viewOn(
  deps: WarSceneDeps,
  state: CampaignState,
  cell: GridCell,
  side: BattleSide,
  eyes: readonly Pos[],
  forts: readonly BattleFort[],
): Promise<WarSceneView | null> {
  // dohled v lese jen pro obránce na mapě cíle (útočník vidí celé vlastní vojsko)
  const onTarget = state.target.cell.x === cell.x && state.target.cell.y === cell.y;
  const anyHere = state.groups.some((g) => g.cell.x === cell.x && g.cell.y === cell.y);
  if (!anyHere && !(onTarget && state.battle?.outcome === 'ongoing')) return null;
  const grid = side === 'defend' && onTarget ? await sightGrid(deps, state) : null;
  return warSceneView(state, { cell, side, grid, eyes, forts });
}

async function fortsOf(
  deps: WarSceneDeps,
  cell: GridCell,
  fortifications: Parameters<typeof battleForts>[1],
): Promise<BattleFort[]> {
  if (fortifications.length === 0) return [];
  const map = await deps.cells.mapOf(cell);
  return battleForts(map.landscape, fortifications);
}
