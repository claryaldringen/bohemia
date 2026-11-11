import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { fieldPartsFromCells, placementVillageOf } from '../placement';
import type { FieldPart, Person, Position, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Společná ves v lese pro testy klučení (forest-clearing-fixes a forest-clearing-migration).

export const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
export const HOME: Position = { x: -60, z: 0, rotation: 0 };
export const OCTOBER = dayIndexOf({ year: 600, month: 10, day: 1 });
export const look = { tree: 'beech-1', youngTree: 'fir-young-1', snag: 'snag-1' } as const;
export const obstacle = (
  id: number,
  kind: keyof typeof look,
  x: number,
  z: number,
): ObstaclePlacement => ({
  id,
  kind,
  look: look[kind],
  x,
  z,
  rotation: 0,
  scale: 1,
});
// čtverec (8, 8) = svět 0–15 m: čtyři dospělé stromy a souš
export const layer: ObstacleLayer = packObstacles(
  [
    obstacle(1, 'tree', 12, 4),
    obstacle(2, 'tree', 2, 4),
    obstacle(3, 'snag', 6, 6),
    obstacle(4, 'tree', 3, 9),
    obstacle(6, 'tree', 7, 12),
  ],
  16,
  15,
);

export function forestVillage(day: number): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day, dwellingPosition: HOME }));
  const adult = (id: number): Person => ({ id, bornDay: day - 30 * 366, dwellingId: 1 });
  s.people = [adult(2), adult(3)];
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 0;
  s.logStacks = [];
  s.lastDay = day;
  const preview = fieldPartsFromCells(
    landscape,
    placementVillageOf(s, day),
    block(6, 8, 3, 2),
    [HOME],
    layer,
  );
  return foundField(s, day, { parts: preview.parts });
}
export const watched = (s: VillageState): FieldPart =>
  s.parts.find((p) => p.cell?.x === 8 && p.cell.y === 8)!;
