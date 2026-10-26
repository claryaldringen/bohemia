import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { clearingFellCost, clearingStage, fellDueTrees } from '../forest-clearing';
import { giveWayToRoads } from '../land-taken';
import { fieldPartsFromCells, placementVillageOf } from '../placement';
import { advanceVillage } from '../simulate';
import { logsFromClearedTrees } from '../wood';
import { build } from '../simulate-build';
import type { FieldPart, Person, Position, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Opravy klučení po recenzi: zmenšený a odebraný díl (land-taken) a pojistka schnutí.

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const HOME: Position = { x: -60, z: 0, rotation: 0 };
const OCTOBER = dayIndexOf({ year: 600, month: 10, day: 1 });
const look = { tree: 'beech-1', youngTree: 'fir-young-1', snag: 'snag-1' } as const;
const obstacle = (
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
const layer: ObstacleLayer = packObstacles(
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

function forestVillage(day: number): VillageState {
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
const watched = (s: VillageState): FieldPart =>
  s.parts.find((p) => p.cell?.x === 8 && p.cell.y === 8)!;
const logsTotal = (s: VillageState): number => s.woodLogs ?? 0; // hromady u lesa jsou součástí woodLogs
/** Dopočet o `days` dní, aby část stromů padla. */
function advanced(days: number): VillageState {
  let s = forestVillage(OCTOBER);
  for (let d = OCTOBER + 1; d <= OCTOBER + days; d++) s = advanceVillage(s, d, layer);
  return s;
}
const land = (id: number, roadM2: number) => new Map([[id, { roadM2, cutM2: 0, cut: null }]]);

describe('zmenšený a odebraný díl v lese', () => {
  it('zmenšený díl zkrátí stojící stromy úměrně, padlé zůstanou', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    const n = p.clearing!.fell.length;
    expect(n).toBeGreaterThanOrEqual(4);
    p.clearing!.felled = 1;
    giveWayToRoads(s, OCTOBER, land(p.id, 112.5), 225);
    const after = watched(s);
    expect(after.areaM2).toBeCloseTo(112.5);
    expect(after.clearing!.felled).toBe(1);
    expect(after.clearing!.fell.length).toBe(1 + Math.round((n - 1) * 0.5));
    expect(after.clearing!.fell.length).toBeLessThan(n);
  });

  it('odebraný díl: klády jen za nepokácené dospělé, záznamy pokácených zmizí', () => {
    const s = advanced(0);
    const p = watched(s);
    p.foundingDone = 0.7 * clearingFellCost(p);
    fellDueTrees(s, p, OCTOBER);
    expect(p.clearing!.felled).toBeGreaterThan(0);
    const ids = p.clearing!.fell.map((t) => t.id);
    const standing = p.clearing!.fell.slice(p.clearing!.felled).filter((t) => t.log).length;
    const before = logsTotal(s);
    expect((s.felledTrees ?? []).some((f) => ids.includes(f.id))).toBe(true);
    giveWayToRoads(s, OCTOBER + 2, land(p.id, 225), 225);
    expect(watched(s)).toBeUndefined();
    expect(logsTotal(s) - before).toBe(logsFromClearedTrees(standing));
    expect((s.felledTrees ?? []).some((f) => ids.includes(f.id))).toBe(false);
  });

  it('zmenšený díl: částečný burnCost úměrný ceně', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    const ratio = p.clearing!.burnCost / p.foundingCost;
    giveWayToRoads(s, OCTOBER, land(p.id, 112.5), 225);
    const after = watched(s);
    expect(after.clearing!.burnCost / after.foundingCost).toBeCloseTo(ratio);
  });
});

describe('pojistka schnutí', () => {
  it('díl s nulovou prací kácení dostane felledDay a nezůstane ve fázi schnutí bez konce', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    p.foundingCost = p.clearing!.burnCost; // práce kácení = 0
    p.foundingDone = 0;
    expect(p.clearing!.felledDay).toBeUndefined();
    s.constructions.find((c) => c.kind === 'field')!.cost = s.parts.reduce(
      (a, x) => a + x.foundingCost,
      0,
    );
    build(s, OCTOBER, 0);
    expect(watched(s).clearing!.felledDay).toBe(OCTOBER);
    expect(clearingStage(watched(s), OCTOBER + 1)).toBe('dry');
    fellDueTrees(s, watched(s), OCTOBER);
  });
});
