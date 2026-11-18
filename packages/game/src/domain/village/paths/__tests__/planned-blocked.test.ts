import { describe, expect, it } from 'vitest';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { plotHousePosition } from '../../placement/placement-geometry';
import type { Road, VillageRoads } from '../../types';
import {
  BLOCK_MIN_RUN_M,
  plannedBlockedAt,
  stretchesUnderBuilding,
  type PlannedBuilding,
} from '../planned-blocked';
import { abandonBlockedStretches, blockedRun } from '../roads-overgrow';

// Náhled zásahu stavby do cest (paths.md – Stavba přes cestu, Náhled u kurzoru – Martin
// 18. 11. 2026): žlutě se vyznačí kusy, které by pravidlo kusu pod stavbou po postavení opustilo.

/** Rovná vyšlapaná cesta z (x0, z0) do (x1, z1). */
function line(id: number, x0: number, z0: number, x1: number, z1: number): Road {
  return {
    id,
    points: [
      { x: x0, z: z0 },
      { x: x1, z: z1 },
    ],
    bornDay: 0,
    grade: 'trodden',
    traffic: [0],
    spots: [],
  };
}

function roadsOf(list: readonly Road[]): VillageRoads {
  return {
    nextId: 100,
    roads: list.map((r) => structuredClone(r)),
    trees: [],
    labor: { from: 0, days: 0, shares: [] },
  };
}

/** Délka kusu osy (m). */
function lengthOf(points: readonly { x: number; z: number }[]): number {
  let sum = 0;
  for (let k = 1; k < points.length; k++) {
    sum += Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z);
  }
  return sum;
}

// pozemek polozemnice na políčku (10, 10) – čtverec x, z ∈ [0, 15]
const PLOT = { cell: { x: 10, y: 10 }, variant: 'center' as const };
const PLANNED: PlannedBuilding = {
  kind: 'dwelling',
  type: 'polozemnice',
  position: plotHousePosition(LANDSCAPE, PLOT),
  plot: PLOT,
};

describe('náhled zásahu stavby do cest (paths.md – Stavba přes cestu, Náhled u kurzoru)', () => {
  const blocked = plannedBlockedAt(LANDSCAPE, PLANNED)!;

  it('plocha pozemku je neprůchodná, okolí ne', () => {
    expect(blocked(7.5, 7.5)).toBe(true);
    expect(blocked(1, 14)).toBe(true);
    expect(blocked(-3, 7.5)).toBe(false);
    expect(blocked(7.5, 40)).toBe(false);
  });

  it('cesta přes pozemek se vyznačí celým průchodem a pravidlo opustí tentýž kus', () => {
    const roads = [line(1, 7.5, -30, 7.5, 45), line(2, 40, -30, 40, 45)];
    const stretches = stretchesUnderBuilding(roads, blocked);
    expect(stretches.map((s) => s.roadId)).toEqual([1]);
    const points = stretches[0]!.points;
    expect(lengthOf(points)).toBeGreaterThanOrEqual(BLOCK_MIN_RUN_M);
    expect(lengthOf(points)).toBeGreaterThan(14);
    expect(points.every((p) => blocked(p.x, p.z))).toBe(true);
    // skutečnost: pravidlo opustí právě tuhle cestu a vyznačený kus leží v opuštěném kusu
    const state = roadsOf(roads);
    expect(abandonBlockedStretches(state, [], undefined, blocked)).toBe(true);
    const abandoned = state.roads.filter((r) => r.abandoned);
    expect(abandoned).toHaveLength(1);
    const zs = abandoned[0]!.points.map((p) => p.z);
    expect(Math.min(...zs)).toBeLessThanOrEqual(points[0]!.z);
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(points.at(-1)!.z);
    expect(state.roads.find((r) => r.id === 2)!.abandoned).toBeUndefined();
  });

  it('kratší zásah (roh pozemku) síť nezmění – nic se nevyznačí ani neopustí', () => {
    // cesta končí kus za plotem pozemku – do plochy zasáhne, ale méně než BLOCK_MIN_RUN_M
    const roads = [line(3, 7.5, 40, 7.5, 14)];
    const run = blockedRun(roads[0]!.points, blocked);
    expect(run).toBeGreaterThan(0);
    expect(run).toBeLessThan(BLOCK_MIN_RUN_M);
    expect(stretchesUnderBuilding(roads, blocked)).toEqual([]);
    expect(abandonBlockedStretches(roadsOf(roads), [], undefined, blocked)).toBe(false);
  });

  it('bez cest nic; opuštěná cesta a cesta ve vylepšení se nehodnotí jako v pravidle', () => {
    expect(stretchesUnderBuilding([], blocked)).toEqual([]);
    const through = line(4, 7.5, -30, 7.5, 45);
    expect(stretchesUnderBuilding([{ ...through, abandoned: true }], blocked)).toEqual([]);
    expect(stretchesUnderBuilding([through], blocked, new Set([4]))).toEqual([]);
  });

  it('cesta, která plochou projde dvakrát, má dva kusy – pravidlo opustí oba', () => {
    // tam po z = 3, za pozemkem obrat a zpátky po z = 12
    const loop: Road = {
      ...line(5, -12, 3, 28, 3),
      points: [
        { x: -12, z: 3 },
        { x: 28, z: 3 },
        { x: 28, z: 12 },
        { x: -12, z: 12 },
      ],
    };
    const stretches = stretchesUnderBuilding([loop], blocked);
    expect(stretches.map((s) => s.roadId)).toEqual([5, 5]);
    expect(stretches.every((s) => lengthOf(s.points) >= BLOCK_MIN_RUN_M)).toBe(true);
    const state = roadsOf([loop]);
    expect(abandonBlockedStretches(state, [], undefined, blocked)).toBe(true);
    expect(state.roads.filter((r) => r.abandoned)).toHaveLength(2);
  });

  it('svatyně cestu přeruší; modla (4 m) je na pravidlo krátká – nevyznačí se ani neopustí', () => {
    const at = { x: 40, z: -40, rotation: 0 };
    const across = [line(6, -10, -40, 90, -40)];
    const shrine = plannedBlockedAt(LANDSCAPE, { kind: 'sacred', type: 'shrine', position: at })!;
    expect(shrine(40, -40)).toBe(true);
    expect(shrine(40, -70)).toBe(false);
    expect(stretchesUnderBuilding(across, shrine).map((s) => s.roadId)).toEqual([6]);
    expect(abandonBlockedStretches(roadsOf(across), [], undefined, shrine)).toBe(true);
    const idol = plannedBlockedAt(LANDSCAPE, { kind: 'sacred', type: 'idol', position: at })!;
    expect(blockedRun(across[0]!.points, idol)).toBeGreaterThan(0);
    expect(stretchesUnderBuilding(across, idol)).toEqual([]);
    expect(abandonBlockedStretches(roadsOf(across), [], undefined, idol)).toBe(false);
  });

  it('volné obydlí, humno a ohrada zaberou svou plochu', () => {
    const house = plannedBlockedAt(LANDSCAPE, {
      kind: 'dwelling',
      type: 'zemnice',
      position: { x: 40, z: 40, rotation: 0 },
    })!;
    expect(house(40, 40)).toBe(true);
    expect(house(40, 52)).toBe(false);
    const floor = plannedBlockedAt(LANDSCAPE, {
      kind: 'threshing-floor',
      position: { x: -40, z: 40, rotation: 0 },
    })!;
    expect(floor(-40, 40)).toBe(true);
    const pen = plannedBlockedAt(LANDSCAPE, {
      kind: 'pen',
      squares: [{ cell: { x: 12, y: 8 }, x: 37.5, z: -22.5, size: 15 }],
    })!;
    expect(pen(37.5, -22.5)).toBe(true);
    expect(pen(37.5, -45)).toBe(false);
    expect(plannedBlockedAt(LANDSCAPE, { kind: 'cemetery', squares: [] })).toBeNull();
  });
});
