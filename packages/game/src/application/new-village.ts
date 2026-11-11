import { CURRENT_LAYER_VERSIONS, generateAcceptedLandscape } from '../domain/landscape';
import {
  cellLandscapeSeed,
  createSkeletonCache,
  dryCellNear,
  isDry,
  isolatedLandscapeSeed,
  skeletonSlice,
  type OccupiedCell,
} from '../domain/world';
import type { HouseRepository } from './houses';
import { SEAT_CELL, neighbourCell, sameCell, type Direction8 } from '../domain/village';
import type { GridCell } from '../domain/village/people/world-grid';
import type { Settlement, SettlementRepository, WorldCell } from './settlements';
import type { VillageRepository } from './villages';

// Sídlo nové mapy pro odchod do nové vsi (migration.md – fáze 4) – sdílí ho odchod hráče
// (`leaveVillage`) i vybavení schránky odchodu syna (`settleStewardDepartures`).

/** Tím směrem už leží vlastní ves hráče. */
export const OWN_MAP_THERE = 'Tím směrem už leží tvoje ves – stěhování mezi vsemi zatím není.';
/** Na cílovém políčku leží mapa jiného hráče. */
export const FOREIGN_MAP_THERE = 'Tam leží ves jiného rodu.';
/** Sídlo, ze kterého se odchází, nemá polohu v mřížce (jen sídelní ji dostane). */
export const NO_WORLD_CELL = 'Tahle mapa nemá místo ve světě – na novou mapu odtud nejde odejít.';
/** Tím směrem vede řeka nebo stezka kostry a v dosahu není volná suchá mapa (ves syna jen na suché). */
export const NO_DRY_MAP_THERE = 'Tím směrem není volná krajina bez řeky a stezky.';

/** Sídlo nové mapy, nebo důvod, proč tam odejít nejde. */
type TargetResult = { ok: true; settlement: Settlement } | { ok: false; reason: string };

/**
 * Sídlo nové mapy ve směru `direction` od sídla `from`: sídelní sídlo bez polohy dostane
 * (0, 0); na sousedním políčku mřížky vznikne nové sídlo s novou krajinou, nebo se použije
 * vlastní sídlo bez vsí, které tam už je. Vlastní ves tím směrem → OWN_MAP_THERE. Ves syna je jen
 * na suché mapě (world-skeleton.md – Otevřené otázky 3): volným políčkem s řekou nebo stezkou
 * kostry se nejde – ves vznikne na nejbližším suchém (`sonCell`), sídlo bez výřezu kostry.
 * Odříznutý rod (newcomers.md) zakládá v místní mřížce – `isolatedTarget`.
 */
export async function targetSettlement(
  deps: {
    settlements: SettlementRepository;
    villages: VillageRepository;
    worldSeed: number;
    /** Rod hráče – seed krajiny vsi v místní mřížce odříznutého rodu; bez něj podle hráče. */
    houses?: Pick<HouseRepository, 'activeOf'>;
  },
  from: Settlement,
  playerId: string,
  direction: Direction8,
): Promise<TargetResult> {
  if (from.worldCell === null && from.localCell) {
    return isolatedTarget(deps, from, from.localCell, playerId, direction);
  }
  let cell = from.worldCell;
  if (cell === null) {
    if (!from.isSeat) return { ok: false, reason: NO_WORLD_CELL };
    const placed = await deps.settlements.assignWorldCell(from.id, SEAT_CELL);
    cell = placed?.worldCell ?? null;
    if (cell === null) return { ok: false, reason: NO_WORLD_CELL };
  }
  const occupied = await deps.settlements.occupiedCells();
  const targetCell = sonCell(
    deps.worldSeed,
    cell,
    neighbourCell(cell, direction),
    occupied,
    playerId,
  );
  if (targetCell === null) return { ok: false, reason: NO_DRY_MAP_THERE };
  const active = await deps.settlements.listActive(playerId);
  const existing = active.find((s) => s.worldCell !== null && sameCell(s.worldCell, targetCell));
  if (existing) {
    const villages = await deps.villages.listBySettlement(existing.id);
    return villages.length > 0
      ? { ok: false, reason: OWN_MAP_THERE }
      : { ok: true, settlement: existing };
  }
  const foreign = occupied.some((o) => o.ownerId !== playerId && sameCell(o.cell, targetCell));
  if (foreign) return { ok: false, reason: FOREIGN_MAP_THERE };
  const accepted = generateAcceptedLandscape(cellLandscapeSeed(deps.worldSeed, targetCell));
  const created = await deps.settlements.create({
    ownerId: playerId,
    landscapeSeed: accepted.seed,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: targetCell,
  });
  if (created) return { ok: true, settlement: created };
  // souběžný odchod týmž směrem mezitím sídlo založil
  const again = (await deps.settlements.listActive(playerId)).find(
    (s) => s.worldCell !== null && sameCell(s.worldCell, targetCell),
  );
  if (again) return { ok: true, settlement: again };
  // políčko mezitím zabral jiný hráč
  return { ok: false, reason: FOREIGN_MAP_THERE };
}

/**
 * Políčko vsi syna ve směru `target`: obsazené políčko (vlastní sídlo k použití, nebo cizí mapa)
 * a suché políčko zůstanou; volné políčko s kostrou nahradí nejbližší suché bez cizí mapy
 * (`dryCellNear`) – vlastní sídlo na něm se použije jako na sousedním políčku. Null – v dosahu
 * žádné suché.
 */
function sonCell(
  worldSeed: number,
  from: GridCell,
  target: GridCell,
  occupied: readonly OccupiedCell[],
  playerId: string,
): GridCell | null {
  if (occupied.some((o) => sameCell(o.cell, target))) return target;
  const cache = createSkeletonCache(worldSeed);
  if (isDry(skeletonSlice(worldSeed, target, cache))) return target;
  const foreign = (c: GridCell): boolean =>
    occupied.some((o) => o.ownerId !== playerId && sameCell(o.cell, c));
  return dryCellNear(worldSeed, from, target, (c) => !foreign(c), cache);
}

/**
 * Odchod v odříznuté krajině (newcomers.md – Odříznutá krajina): soused v místní mřížce rodu,
 * krajina z vlastního seedu (`isolated:<rod>:x,y`); cizí mapy tu nejsou. Při umístění na mapu
 * světa se celý shluk přesune se zachováním vzájemných poloh.
 */
async function isolatedTarget(
  deps: Parameters<typeof targetSettlement>[0],
  fromSettlement: Settlement,
  from: WorldCell,
  playerId: string,
  direction: Direction8,
): Promise<TargetResult> {
  const targetCell = neighbourCell(from, direction);
  const atTarget = (list: Settlement[]): Settlement | undefined =>
    list.find((s) => s.localCell && sameCell(s.localCell, targetCell));
  const existing = atTarget(await deps.settlements.listActive(playerId));
  if (existing) {
    const villages = await deps.villages.listBySettlement(existing.id);
    return villages.length > 0
      ? { ok: false, reason: OWN_MAP_THERE }
      : { ok: true, settlement: existing };
  }
  const key = (await deps.houses?.activeOf(playerId))?.id ?? playerId;
  const accepted = generateAcceptedLandscape(
    isolatedLandscapeSeed(deps.worldSeed, `${key}:${targetCell.x},${targetCell.y}`),
  );
  const created = await deps.settlements.create({
    ownerId: playerId,
    landscapeSeed: accepted.seed,
    layerVersions: CURRENT_LAYER_VERSIONS,
    localCell: targetCell,
  });
  if (created) return { ok: true, settlement: created };
  // rod mezitím umístěn na mapu světa (podmíněný zápis – newcomers.md): odchod pokračuje ve světě
  const moved = await deps.settlements.find(fromSettlement.id);
  if (moved && moved.worldCell !== null) {
    return targetSettlement(deps, moved, playerId, direction);
  }
  // souběžný odchod týmž směrem mezitím sídlo založil (unikátní index místní mřížky)
  const again = atTarget(await deps.settlements.listActive(playerId));
  return again ? { ok: true, settlement: again } : { ok: false, reason: OWN_MAP_THERE };
}
