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

/** Oči napadené vsi (domy) a opevnění bojiště v jednom herním dni. */
export interface WarSceneDefender {
  eyes: Pos[];
  forts: BattleFort[];
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
    const view = await viewOn(deps, point.state, cell, 'attack', { eyes: [], forts: [] });
    if (view) views.push(view);
  }
  return views.find((v) => v.battle !== null) ?? views[0] ?? null;
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
    forts:
      fortifications.length > 0
        ? battleForts((await deps.cells.mapOf(cell)).landscape, fortifications)
        : [],
  };
  deps.defenders?.set(key, defender);
  return defender;
}
