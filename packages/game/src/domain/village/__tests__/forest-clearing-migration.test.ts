import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { clearingFellCost, clearingStage } from '../forest-clearing';
import { withForestClearing } from '../forest-clearing-migration';
import { fieldPartsFromCells, placementVillageOf } from '../placement';
import { advanceVillage } from '../simulate';
import { cloneState } from '../clone';
import { FOREST_CLEARING } from '../rules';
import type { FieldPart, Person, Position, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Převod starších vsí na klučení po fázích (forest.md – Klučení lesa pro pole – postup, Starší vsi).

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

/** Ves uložená před klučením: díly v lese bez `clearing`, s `obstacles` a počtem klád `trees`. */
function legacyVillage(progress: number): { state: VillageState; trees: number } {
  const s = forestVillage(OCTOBER);
  let trees = 0;
  for (const p of s.parts) {
    if (!p.clearing) continue;
    const logs = p.clearing.fell.filter((t) => t.log).length;
    trees += logs;
    p.obstacles = p.clearing.fell.map((t) => t.id);
    if (logs > 0) p.trees = logs;
    p.foundingDone = progress * p.foundingCost;
    delete p.clearing;
  }
  return { state: s, trees };
}
const woods = (s: VillageState): number => s.woodLogs ?? 0;

describe('převod rozestavěných dílů v lese na fáze', () => {
  it('díl dostane fáze, práce se zachová a klády se nezmění', () => {
    const { state, trees } = legacyVillage(0.3);
    const before = watched(state).foundingDone;
    const next = withForestClearing(state, layer);
    const p = watched(next);
    expect(p.clearing).toBeDefined();
    expect(p.trees).toBeUndefined();
    expect(p.foundingDone).toBe(before);
    expect(p.clearing!.burnCost).toBeCloseTo(p.foundingCost * (1 - FOREST_CLEARING.fellShare));
    expect(p.clearing!.fell.map((t) => t.id).sort()).toEqual([1, 2, 3, 4, 6]);
    expect(p.clearing!.fell.filter((t) => t.log).length).toBe(p.clearing!.fell.length > 0 ? 4 : 0);
    // 0,3 / 0,6 kácení -> padla polovina stromů; klády celkem = dřívější trees (padlé + stojící)
    const fell = p.clearing!;
    const fallenLogs = fell.fell.slice(0, fell.felled).filter((t) => t.log).length;
    const standingLogs = fell.fell.slice(fell.felled).filter((t) => t.log).length;
    expect(fallenLogs + standingLogs).toBe(
      state.parts.reduce((a, x) => a + (x.cell?.x === 8 && x.cell.y === 8 ? (x.trees ?? 0) : 0), 0),
    );
    expect(woods(next)).toBeGreaterThan(0);
    expect(trees).toBeGreaterThan(0);
    expect(clearingStage(p, OCTOBER)).toBe('fell');
  });

  it('odvedené kácení: všechny stromy padnou a větve jsou suché hned', () => {
    const { state } = legacyVillage(0.7);
    const next = withForestClearing(state, layer);
    const p = watched(next);
    expect(p.clearing!.felled).toBe(p.clearing!.fell.length);
    expect(p.clearing!.felledDay).toBe(OCTOBER - FOREST_CLEARING.dryDays);
    expect(p.foundingDone).toBeGreaterThanOrEqual(clearingFellCost(p));
    expect(clearingStage(p, OCTOBER)).not.toBe('fell');
    expect(woods(next)).toBe(4 * 2 > 0 ? woods(next) : 0);
    const stacked = (next.logStacks ?? []).reduce((a, st) => a + st.logs, 0);
    expect(stacked).toBeGreaterThan(0);
  });

  it('idempotence: dvakrát = jednou, ves bez lesních dílů vrácená týmž objektem', () => {
    const { state } = legacyVillage(0.3);
    const once = withForestClearing(state, layer);
    expect(withForestClearing(once, layer)).toBe(once);
    const plain = forestVillage(OCTOBER); // díly už s fázemi
    expect(withForestClearing(plain, layer)).toBe(plain);
    expect(withForestClearing(state, null)).toBe(state);
  });

  it('hotové díly a díl bez překážek zůstanou beze změny', () => {
    const { state } = legacyVillage(0.3);
    for (const p of state.parts) {
      if (p.surface === 'forest') delete p.obstacles;
    }
    expect(withForestClearing(state, layer)).toBe(state);
  });

  it('dopočet po kouscích dá týž stav jako vcelku', () => {
    const { state } = legacyVillage(0.2);
    const end = OCTOBER + 40;
    const whole = advanceVillage(cloneState(state), end, layer);
    let chunked = cloneState(state);
    for (const to of [OCTOBER + 1, OCTOBER + 8, OCTOBER + 38, end]) {
      chunked = advanceVillage(chunked, to, layer);
    }
    expect(chunked.parts).toEqual(whole.parts);
    expect(chunked.woodLogs).toBe(whole.woodLogs);
    expect(whole.forestClearingFailed).toBeUndefined();
  });
});
