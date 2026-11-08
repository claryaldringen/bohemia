import { describe, expect, it } from 'vitest';
import {
  addGate,
  fortificationArea,
  areaOutline,
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
import { WALL_CLIMB_M, cutsWall } from '../walk-walls';
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
if ('error' in AREA) throw new Error('plocha opevnění testu: ' + AREA.error);
const OUTLINE = areaOutline(AREA, 'palisade');

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

/** Opevnění z libovolných čtverců (gates = střed úseku, ke kterému se přidá brána). */
function shapedFort(
  cells: readonly { x: number; y: number }[],
  gateAt: PathPoint | null,
): Fortification {
  const area = fortificationArea(cells, null, LANDSCAPE);
  if ('error' in area) throw new Error('plocha opevnění testu: ' + area.error);
  const outline = areaOutline(area, 'palisade');
  let gates: FortGate[] = [];
  if (gateAt) {
    const next = addGate(outline, gates, gateAt);
    if ('error' in next) throw new Error(next.error);
    gates = next;
  }
  return {
    id: 901,
    grid: null,
    cells: [...cells],
    kind: 'palisade',
    segments: fortSegments(outline).map((s) => ({ index: s.index, builtDay: 1, state: 1 })),
    gates,
  };
}

describe('objížďka stěn po 10 m – hrany nikdy neřežou zeď (návrh Clauda 8. 11. 2026)', () => {
  const sq = (n: number, m: number, x0 = 8, y0 = 8): { x: number; y: number }[] =>
    Array.from({ length: n * m }, (_, k) => ({ x: x0 + (k % n), y: y0 + Math.floor(k / n) }));
  const shapes: [string, { x: number; y: number }[], PathPoint | null][] = [
    ['čtverec 4 × 4 s bránou', sq(4, 4), { x: -7.5, z: -30 }],
    ['pás 8 × 2 bez brány', sq(8, 2), null],
    ['písmeno L (ostrý ohyb)', [...sq(5, 2), ...sq(2, 5, 8, 10)], null],
    ['malý čtverec 2 × 2', sq(2, 2), null],
    ['písmeno T (dva ostré ohyby)', [...sq(6, 2), ...sq(2, 3, 10, 10)], null],
  ];
  for (const [name, cells, gate] of shapes) {
    it(name, () => {
      const walls = withFortWalk(
        PLAIN_GROUND,
        pathFortificationsOf(
          { fortifications: [shapedFort(cells, gate)], constructions: [] },
          LANDSCAPE,
        ),
      ).walls;
      expect(walls).toBeDefined();
      const w = walls!;
      expect(w.detour.length).toBeGreaterThanOrEqual(4);
      w.detour.forEach((p, i) => {
        expect(cutsWall(w, p, w.detour[(i + 1) % w.detour.length]!)).toBe(false);
      });
      // před bránou stojí bod, ze kterého je vidět do jejího středu
      for (const c of w.centers) expect(w.detour.some((p) => !cutsWall(w, p, c))).toBe(true);
    });
  }
});

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

  it('bez pěšiny na straně cíle – rovně objížďkou přes bránu, ne přes zeď', () => {
    const graph = walkGraph([], { ground: GROUND });
    for (const [from, to] of [
      [HOME, FIELD],
      [FIELD, HOME],
      [
        { x: 20, z: 20 },
        { x: 20, z: 45 },
      ],
    ] as const) {
      const route = walkingRoute(graph, from, to, GROUND);
      expect(wallHits(route.points, WALLS.walls)).toEqual([]);
      expect(wallHits(route.points, WALLS.gates).length).toBeGreaterThan(0);
      expect(route.cost).toBeLessThan(WALL_CLIMB_M);
      expect(route.costs.reduce((a, b) => a + b, 0)).toBeCloseTo(route.cost, 6);
      expect(walkingDistances(graph, [from], [to], GROUND)[0]).toBe(route.cost);
    }
  });

  it('opevnění bez brány – přes zeď jen jako poslední záchrana (s přirážkou)', () => {
    const closed = withFortWalk(
      PLAIN_GROUND,
      pathFortificationsOf({ fortifications: [fort([])], constructions: [] }, LANDSCAPE),
    );
    const graph = walkGraph([], { ground: closed });
    const route = walkingRoute(graph, HOME, FIELD, closed);
    expect(route.cost).toBeGreaterThanOrEqual(WALL_CLIMB_M);
    expect(walkingDistances(graph, [HOME], [FIELD], closed)[0]).toBe(route.cost);
  });
});
