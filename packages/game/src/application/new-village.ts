import { CURRENT_LAYER_VERSIONS, generateAcceptedLandscape } from '../domain/landscape';
import { cellLandscapeSeed } from '../domain/world';
import { SEAT_CELL, neighbourCell, sameCell, type Direction8 } from '../domain/village';
import type { Settlement, SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Sídlo nové mapy pro odchod do nové vsi (migration.md – fáze 4) – sdílí ho odchod hráče
// (`leaveVillage`) i vybavení schránky odchodu syna (`settleStewardDepartures`).

/** Tím směrem už leží vlastní ves hráče. */
export const OWN_MAP_THERE = 'Tím směrem už leží tvoje ves – stěhování mezi vsemi zatím není.';
/** Na cílovém políčku leží mapa jiného hráče. */
export const FOREIGN_MAP_THERE = 'Tam leží ves jiného rodu.';
/** Sídlo, ze kterého se odchází, nemá polohu v mřížce (jen sídelní ji dostane). */
export const NO_WORLD_CELL = 'Tahle mapa nemá místo ve světě – na novou mapu odtud nejde odejít.';

/**
 * Sídlo nové mapy ve směru `direction` od sídla `from`: sídelní sídlo bez polohy dostane
 * (0, 0); na sousedním políčku mřížky vznikne nové sídlo s novou krajinou, nebo se použije
 * vlastní sídlo bez vsí, které tam už je. Vlastní ves tím směrem → OWN_MAP_THERE.
 */
export async function targetSettlement(
  deps: { settlements: SettlementRepository; villages: VillageRepository; worldSeed: number },
  from: Settlement,
  playerId: string,
  direction: Direction8,
): Promise<{ ok: true; settlement: Settlement } | { ok: false; reason: string }> {
  let cell = from.worldCell;
  if (cell === null) {
    if (!from.isSeat) return { ok: false, reason: NO_WORLD_CELL };
    const placed = await deps.settlements.assignWorldCell(from.id, SEAT_CELL);
    cell = placed?.worldCell ?? null;
    if (cell === null) return { ok: false, reason: NO_WORLD_CELL };
  }
  const targetCell = neighbourCell(cell, direction);
  const active = await deps.settlements.listActive(playerId);
  const existing = active.find((s) => s.worldCell !== null && sameCell(s.worldCell, targetCell));
  if (existing) {
    const villages = await deps.villages.listBySettlement(existing.id);
    return villages.length > 0
      ? { ok: false, reason: OWN_MAP_THERE }
      : { ok: true, settlement: existing };
  }
  const foreign = (await deps.settlements.occupiedCells()).some(
    (o) => o.ownerId !== playerId && sameCell(o.cell, targetCell),
  );
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
