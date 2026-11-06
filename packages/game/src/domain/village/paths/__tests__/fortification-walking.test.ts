import { describe, expect, it } from 'vitest';
import {
  addGate,
  fortificationArea,
  fortificationOutline,
  fortSegments,
  fortWalls,
  type FortGate,
} from '../../fortification';
import type { Fortification } from '../../fortification/types';
import type { Point } from '../../polygon';
import { house, LANDSCAPE, part, pathTestTerrain } from '../../__tests__/paths-fixtures';
import { computePathNetwork } from '../network';
import type { PathPoint, PathVillage } from '../network-types';
import { routePaths } from '../route-paths';
import { storedRoutes } from '../routes';
import { pathFortificationsOf } from '../village';
import {
  walkGraph,
  walkingDistances,
  walkingRoute,
  withFortWalk,
  type WalkGround,
  type WalkRoad,
} from '../walking';

// Chodci a opevnění (fortifications.md – Obvod, Brány; Martin 6. 11. 2026: opevnění blokuje
// chodce celým obvodem kromě bran): odhad chůze simulace i trasy postav ve scéně (`walkingRoute`)
// jdou přes stěnu jen branou – rovné úseky k pěšině a od ní k cíli i pevná cesta, která stěnu
// protne mimo bránu, stěnou nevedou.

// palisáda kolem 4 × 4 čtverců (plocha x, z ∈ [−30, 30]) s jedinou branou na severu (x = −7,5)
const CELLS = Array.from({ length: 16 }, (_, k) => ({ x: 8 + (k % 4), y: 8 + Math.floor(k / 4) }));
const AREA = fortificationArea(CELLS, null, LANDSCAPE);
if ('error' in AREA) throw new Error('plocha opevnění testu');
const OUTLINE = fortificationOutline(AREA, 'palisade');

function fort(gates: readonly PathPoint[]): Fortification {
  let list: FortGate[] = [];
  for (const p of gates) {
    const next = addGate(OUTLINE, list, p);
    if ('error' in next) throw new Error(next.error);
    list = next;
  }
  return {
    id: 900,
    grid: null,
    cells: CELLS,
    kind: 'palisade',
    segments: fortSegments(OUTLINE).map((s) => ({ index: s.index, builtDay: 1, state: 1 })),
    gates: list,
  };
}

const FORT = fort([{ x: -7.5, z: -30 }]);
const WALLS = fortWalls(LANDSCAPE, FORT);
const TERRAIN = pathTestTerrain();
const HOME = { x: -15, z: -15 };
const FIELD = { x: 52.5, z: 7.5 };

/** Ves uvnitř opevnění (jen severní brána), pole vně na východě. */
const VILLAGE: PathVillage = {
  dwellings: [house(1, HOME.x, HOME.z)],
  fields: [{ id: 7, parts: [part(FIELD.x, FIELD.z)] }],
  fortifications: pathFortificationsOf({ fortifications: [FORT], constructions: [] }, LANDSCAPE),
};

/** Je bod uvnitř konvexního čtyřúhelníku (víc než 1 cm od okraje)? */
function inQuad(q: readonly Point[], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const c = ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) / len;
    if (Math.abs(c) < 0.01) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Místa trasy (po 5 cm) ve stěně opevnění – nezávisle na tom, jak to počítá chůze. */
function wallHits(points: readonly PathPoint[], quads: readonly Point[][]): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const z = a.z + ((b.z - a.z) * s) / n;
      if (quads.some((q) => inQuad(q, x, z))) out.push({ x, z });
    }
  }
  return out;
}

const PLAIN_GROUND: WalkGround = { terrain: TERRAIN };
const GROUND = withFortWalk(PLAIN_GROUND, VILLAGE.fortifications);

/** Pěšiny stálých tras testovací vsi (síť pěšin s opevněním – trasy jdou branou). */
function villageLines(): ReturnType<typeof routePaths> {
  const network = computePathNetwork({ village: VILLAGE, terrain: TERRAIN, keepRoutes: true });
  return routePaths(storedRoutes(network), new Map(), TERRAIN.cellM);
}

describe('chodci a opevnění – jen branou (fortifications.md – Brány)', () => {
  it('ves bez opevnění: půda chůze beze změny', () => {
    expect(withFortWalk(PLAIN_GROUND, undefined)).toBe(PLAIN_GROUND);
    expect(withFortWalk(PLAIN_GROUND, [])).toBe(PLAIN_GROUND);
  });

  it('z domu uvnitř na pole vně branou – rovně k síti ani od ní stěnou ne', () => {
    const lines = villageLines();
    expect(lines.length).toBeGreaterThan(0);
    const graph = walkGraph(lines, { ground: GROUND });
    for (const [from, to] of [
      [HOME, FIELD],
      [FIELD, HOME],
      [
        { x: 0, z: 0 },
        { x: 45, z: -20 },
      ],
      [
        { x: 20, z: 20 },
        { x: 40, z: 40 },
      ],
    ] as const) {
      const route = walkingRoute(graph, from, to, GROUND);
      expect(wallHits(route.points, WALLS.walls)).toEqual([]);
      expect(wallHits(route.points, WALLS.gates).length).toBeGreaterThan(0);
      // odhad simulace je táž cena
      expect(walkingDistances(graph, [from], [to], GROUND)[0]).toBe(route.cost);
    }
  });

  it('pevná cesta přes stěnu vedle brány – chodec projde branou, ne sloupem', () => {
    // brána x ∈ [−9,5; −5,5]; cesta protne stěnu 1,5–2,5 m vedle ní
    const road: WalkRoad = {
      points: [
        { x: -3, z: -70 },
        { x: -3, z: -10 },
      ],
      grade: 'improved',
    };
    const graph = walkGraph([], { roads: [road], ground: GROUND });
    const route = walkingRoute(graph, { x: -3, z: -12 }, { x: -3, z: -68 }, GROUND);
    expect(route.points.length).toBeGreaterThan(2);
    expect(wallHits(route.points, WALLS.walls)).toEqual([]);
    expect(wallHits(route.points, WALLS.gates).length).toBeGreaterThan(0);
  });

  it('pevná cesta přes stěnu daleko od brány – po ní stěnou nejde', () => {
    const road: WalkRoad = {
      points: [
        { x: 20, z: -70 },
        { x: 20, z: -10 },
      ],
      grade: 'improved',
    };
    const lines = villageLines();
    const graph = walkGraph(lines, { roads: [road], ground: GROUND });
    const route = walkingRoute(graph, { x: 20, z: -12 }, { x: 20, z: -68 }, GROUND);
    expect(wallHits(route.points, WALLS.walls)).toEqual([]);
    // bez opevnění rovně po cestě
    const plain = walkGraph(lines, { roads: [road], ground: PLAIN_GROUND });
    const before = walkingRoute(plain, { x: 20, z: -12 }, { x: 20, z: -68 }, PLAIN_GROUND);
    expect(before.cost).toBeLessThan(route.cost);
  });
});
