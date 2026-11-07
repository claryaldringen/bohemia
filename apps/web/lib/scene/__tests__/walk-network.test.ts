import { describe, expect, it } from 'vitest';
import { ROAD_WALK, walkGraph, walkingDistances, type StoredRoute } from '@bohemia/game';
import { WALK_PACE_MAX, routeWalker } from '../path-router';
import { scheduledLength, scheduledWalk, walkRoute } from '../villager-plan';
import { errandPath } from '../villager-plan-traffic';
import type { Context, House, VillagerGround, VillagerPaths } from '../villager-plan-types';

// Postavy chodí po síti vsi týmž modelem jako odhad simulace (paths.md – Odhad vzdáleností, kudy
// chodí postavy ve scéně): kratší z rovně a „rovně k síti, po pěšinách a pevných cestách a rovně
// k cíli“ – i když uložená trasa domácnosti končí daleko od cíle (řada na velkém poli, skupinka
// stromů pro dřevo).

const CELL_M = 5;

/** Trasa po ose x od buňky `x0` o `n` (sudé) buněk na východ, buňky po 5 m. */
function east(from: string, to: string, x0: number, n: number): StoredRoute {
  return { from, to, purpose: 'water', trips: 100, start: [x0, 0], steps: 'A'.repeat(n / 2) };
}

/** Pevná cesta oklikou: od domu na sever k (0, 120) a na východ k (150, 120). */
const ROAD = {
  points: [
    { x: 0, z: 10 },
    { x: 0, z: 120 },
    { x: 150, z: 120 },
  ],
  grade: 'improved' as const,
};

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: () => null,
  treesIn: () => [],
};

/** Pěšina domácnosti 1 ode dveří (0, 0) na kraj pole (50, 0) a pevná cesta oklikou. */
function walker(): ReturnType<typeof routeWalker> {
  return routeWalker([east('d:1', 'field', 0, 10)], CELL_M, { roads: [ROAD] });
}

const DOOR = { x: 0, z: 0 };

describe('chůze po síti vsi (pěšiny stálých tras a pevné cesty)', () => {
  it('na vzdálenou řadu pole jde po pevné cestě oklikou, když je po ní chůze kratší', () => {
    const paths = walker();
    const row = { x: 150, z: 118 };
    // rovně ≈ 191 m, po pěšině domácnosti a přes pole ≈ 192 m, po cestě ≈ 164 m chůze
    const r = walkRoute({ houses: [], ground: GROUND, graves: [], paths }, DOOR, row, 1)!;
    expect(r.points[0]).toEqual([0, 0]);
    expect(r.points[r.points.length - 1]).toEqual([150, 118]);
    expect(r.points.some(([x, z]) => x === 0 && z === 120)).toBe(true);
    // po cestě svižněji, ale nejvýš tempem plné pěšiny (rychleji by krok vypadal jako běh)
    expect(r.pace!.slice(1, -1).every((p) => Math.abs(p - WALK_PACE_MAX) < 1e-9)).toBe(true);
    // trasu vybere odhad simulace (cesta je s rychlostí cesty kratší než rovně); délka chůze
    // v rozvrhu je délka trasy tempem nejvýš WALK_PACE_MAX – o kus víc než cena odhadu
    const lines = [
      {
        points: Array.from({ length: 11 }, (_, k) => ({ x: k * CELL_M, z: 0 })),
        strength: Array.from({ length: 11 }, () => 1),
        years: [],
        openStart: true,
        openEnd: true,
      },
    ];
    const estimate = walkingDistances(walkGraph(lines, { roads: [ROAD] }), [DOOR], [row])[0]!;
    expect(estimate).toBeCloseTo(10 + 260 / ROAD_WALK.speed.improved + 2, 6);
    expect(estimate).toBeLessThan(Math.hypot(row.x, row.z));
    expect(paths.walkLength!(DOOR, row)).toBeCloseTo(r.walkLength!, 6);
    expect(paths.walkLength!(DOOR, row)).toBeGreaterThan(estimate);
  });

  it('po nakreslené trase v čase rozvrhu nikdy rychleji než WALK_PACE_MAX× chůze', () => {
    // ves se dvěma pěšinami domácností, cestou oklikou a druhou cestou napříč
    const paths = routeWalker(
      [east('d:1', 'water', 0, 10), { ...east('d:2', 'water', -20, 30), start: [-20, -12] }],
      CELL_M,
      {
        roads: [
          ROAD,
          {
            points: [
              { x: -150, z: -40 },
              { x: 60, z: -40 },
              { x: 200, z: 80 },
            ],
            grade: 'trodden' as const,
          },
        ],
      },
    );
    const ctx = { houses: [], ground: GROUND, graves: [], paths };
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let networked = 0;
    for (let k = 0; k < 300; k++) {
      const a = { x: -180 + rnd() * 380, z: -150 + rnd() * 300 };
      const b = { x: -180 + rnd() * 380, z: -150 + rnd() * 300 };
      const r = walkRoute(ctx, a, b, 1 + (k % 2))!;
      if (r.points.length > 2) networked++;
      // rozvrh: doba chůze = délka chůze ÷ přirozená rychlost; postava jde po nakreslené trase
      const speed = r.length / paths.walkLength!(a, b);
      expect(speed).toBeLessThanOrEqual(WALK_PACE_MAX + 1e-9);
      for (const p of r.pace ?? []) expect(p).toBeLessThanOrEqual(WALK_PACE_MAX + 1e-9);
    }
    expect(networked).toBeGreaterThan(30);
  });

  it('krátká cesta, kde je rovně kratší, jde rovně', () => {
    const paths = walker();
    const near = { x: 25, z: 30 };
    const r = walkRoute({ houses: [], ground: GROUND, graves: [], paths }, DOOR, near, 1)!;
    expect(r.points).toEqual([
      [0, 0],
      [25, 30],
    ]);
  });

  it('pro dřevo ke skupince stromů po cestě, ne rovně (i bez trasy domácnosti pro dřevo)', () => {
    const trees = Array.from({ length: 12 }, (_, i) => ({
      x: 150 + (i % 4) * 3,
      z: 124 + Math.floor(i / 4) * 3,
    }));
    const ground: VillagerGround = {
      ...GROUND,
      treesIn: (x, z, half) =>
        trees.filter((t) => Math.abs(t.x - x) <= half && Math.abs(t.z - z) <= half),
    };
    const home = {
      id: 1,
      position: { x: 0, z: -6, rotation: 0 },
      box: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
    } as unknown as House;
    const ctx = { houses: [home], graves: [], ground, paths: walker() } as unknown as Context;
    const r = errandPath(ctx, home, DOOR, 'wood')!;
    expect(r).not.toBeNull();
    expect(r.points.some(([x, z]) => x === 0 && z === 120)).toBe(true);
  });

  it('trasa domácnosti má přednost, jen když je skoro stejně krátká jako odhad (jinak rovně)', () => {
    const b = { x: 40, z: 0 };
    const detour = (lift: number): VillagerPaths => ({
      route: (from, to) => ({
        points: [
          [from.x, from.z],
          [from.x, lift],
          [to.x, lift],
          [to.x, to.z],
        ],
        pace: [1, 1.3, 1],
      }),
      errand: () => null,
      network: () => null,
      walkLength: (from, to) => Math.hypot(to.x - from.x, to.z - from.z),
    });
    const ctx = (paths: VillagerPaths) => ({ houses: [], ground: GROUND, graves: [], paths });
    // oklika 40 m stranou: chůze ≈ 111 m proti 40 m rovně – rovně
    expect(walkRoute(ctx(detour(40)), DOOR, b, 1)!.points).toEqual([
      [0, 0],
      [40, 0],
    ]);
    // trasa těsně vedle přímky (o 1 m): chůze ≈ 33 m – po trase domácnosti
    expect(walkRoute(ctx(detour(1)), DOOR, b, 1)!.points).toHaveLength(4);
  });

  it('rozvrh: jediná schůdná trasa je dlouhá oklika – rozvrh dá čas na ni (ne rovně, ne během)', () => {
    // přímka vede přes vodu (z = 0, x 5–15), uložená trasa domácnosti jde oklikou 40 m stranou
    const wet: VillagerGround = {
      ...GROUND,
      walkable: (x, z) => !(Math.abs(z) < 2 && x > 5 && x < 15),
    };
    const b = { x: 20, z: 0 };
    const paths: VillagerPaths = {
      route: (from, to) => ({
        points: [
          [from.x, from.z],
          [from.x, 40],
          [to.x, 40],
          [to.x, to.z],
        ],
        pace: [1, 1.3, 1],
      }),
      errand: () => null,
      network: () => null,
      walkLength: (from, to) => Math.hypot(to.x - from.x, to.z - from.z),
    };
    const ctx = { houses: [], graves: [], ground: wet, paths } as unknown as Context;
    // trasa existuje (100 m), ale v čase odhadu (20 m chůze) by postava běžela 5× – rovně ne
    expect(walkRoute(ctx, DOOR, b, 1)!.length).toBeCloseTo(100, 6);
    expect(scheduledWalk(ctx, DOOR, b, 1, 20)).toBeNull();
    // délka rozvrhu je délka okliky (návrh Clauda 2. 11. 2026 – roh domu, voda), po ní se jde
    expect(scheduledLength(ctx, DOOR, b)).toBeCloseTo(100, 6);
    expect(scheduledWalk(ctx, DOOR, b, 1)!.points).toHaveLength(4);
    // s délkou chůze, ve které se oklika ujde, po ní
    const slow = { ...ctx, paths: { ...paths, walkLength: () => 90 } } as unknown as Context;
    expect(scheduledWalk(slow, DOOR, b, 1)!.points).toHaveLength(4);
  });
});
