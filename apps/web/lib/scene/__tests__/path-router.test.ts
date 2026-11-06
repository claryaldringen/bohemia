import { describe, expect, it } from 'vitest';
import {
  DWELLING_PATH_BOX_M,
  PATH_WALK,
  walkWallsOf,
  type PathTerrain,
  type StoredRoute,
  type WalkGround,
} from '@bohemia/game';
import { routeWalker } from '../path-router';
import { createVillagerPose, route, shuttle } from '../villager-motion';
import { houseBox } from '../villager-plan';

const CELL_M = 5;

/** Trasa po ose x od buňky `x0` o `n` (sudé) kroků na východ, buňky po 5 m. */
function east(from: string, to: string, x0: number, n: number, trips = 100): StoredRoute {
  return { from, to, purpose: 'water', trips, start: [x0, 0], steps: 'A'.repeat(n / 2) };
}

describe('routeWalker – chůze postav po uložených trasách', () => {
  it('od brány po trase k cíli; po trase rychlejší tempo, odbočky mimo cestu', () => {
    const walker = routeWalker([east('d:1', 'water', 0, 20)], CELL_M);
    const r = walker.route({ x: -2, z: 4 }, { x: 102, z: 3 })!;
    expect(r.points[0]).toEqual([-2, 4]);
    expect(r.points[r.points.length - 1]).toEqual([102, 3]);
    // body trasy jsou středy buněk (0 až 100 m) – postava jde přesně po nich
    expect(r.points[1]![0]).toBeCloseTo(0, 6);
    expect(r.points[r.points.length - 2]![0]).toBeCloseTo(100, 6);
    expect(r.pace).toHaveLength(r.points.length - 1);
    expect(r.pace[0]).toBe(1);
    expect(r.pace[r.pace.length - 1]).toBe(1);
    for (const p of r.pace.slice(1, -1)) expect(p).toBeCloseTo(PATH_WALK.speed, 9);
  });

  it('s id domácnosti vyhraje její vlastní trasa, i když je cizí blíž', () => {
    const own = { ...east('d:1', 'field', 0, 20), start: [0, 6] as [number, number] };
    const foreign = east('d:2', 'field', 0, 20);
    const walker = routeWalker([foreign, own], CELL_M);
    const a = { x: 0, z: 1 };
    const b = { x: 100, z: 1 };
    // bez id vyhraje geometricky bližší (cizí), s id vlastní
    expect(walker.route(a, b)!.points[1]![1]).toBeCloseTo(0, 6);
    expect(walker.route(a, b, undefined, 1)!.points[1]![1]).toBeCloseTo(6 * CELL_M, 6);
    // bez vlastní trasy v dosahu zůstane záloha geometricky
    expect(walker.route(a, b, undefined, 9)!.points[1]![1]).toBeCloseTo(0, 6);
  });

  it('zpět po téže trase obráceně', () => {
    const walker = routeWalker([east('d:1', 'water', 0, 20)], CELL_M);
    const r = walker.route({ x: 100, z: 1 }, { x: 0, z: 1 })!;
    expect(r.points[1]![0]).toBeCloseTo(100, 6);
    expect(r.points[r.points.length - 2]![0]).toBeCloseTo(0, 6);
  });

  it('bez trasy u začátku a cíle se jde rovnou', () => {
    expect(routeWalker([], CELL_M).route({ x: 0, z: 0 }, { x: 50, z: 0 })).toBeNull();
    const walker = routeWalker([east('d:1', 'water', 0, 20)], CELL_M);
    expect(walker.route({ x: 0, z: 200 }, { x: 50, z: 200 })).toBeNull();
    // cíl daleko od konce trasy (mimo dosah)
    expect(walker.route({ x: 0, z: 0 }, { x: 100, z: 90 })).toBeNull();
    // díl daleko v poli: s dosahem po trase k poli a dál rovně
    expect(walker.route({ x: 0, z: 0 }, { x: 100, z: 90 }, 100)).not.toBeNull();
  });

  it('pochůzka domácnosti končí na konci její trasy pro vodu; cizí domácnost nic', () => {
    const walker = routeWalker([east('d:1', 'water', 0, 20), east('d:2', 'wood', 0, 10)], CELL_M);
    const end = walker.errand(1, 'water')!;
    expect(end.x).toBeCloseTo(100, 6);
    expect(end.z).toBeCloseTo(0, 6);
    expect(walker.errand(1, 'wood')).toBeNull();
    expect(walker.errand(3, 'water')).toBeNull();
    expect(walker.errand(2, 'wood')!.x).toBeCloseTo(50, 6);
  });

  it('postava jde po pěšině rychleji (a rychleji kráčí)', () => {
    const points: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const options = {
      outClip: 'walk' as const,
      outSpeed: 1,
      endClip: 'weed' as const,
      endS: 0,
      backClip: 'carry' as const,
      backSpeed: 1,
      restClip: 'idle' as const,
      restS: 0,
      phase: 0,
    };
    const plain = shuttle(route(points), options);
    const trodden = shuttle(route(points, [4 / 3]), options);
    const a = plain(50, [], createVillagerPose());
    const b = trodden(50, [], createVillagerPose());
    expect(a.x).toBeCloseTo(50, 6);
    expect(b.x).toBeCloseTo(50 * (4 / 3), 6);
    expect(b.pace).toBeCloseTo(4 / 3, 9);
  });
});

describe('obdélník domu pro pěšiny sedí s postavami ve scéně', () => {
  it('DWELLING_PATH_BOX_M = houseBox (dům se šíjí)', () => {
    for (const type of ['zemnice', 'polozemnice'] as const) {
      const scene = houseBox(type);
      const box = DWELLING_PATH_BOX_M[type];
      expect(box.minX).toBeCloseTo(scene.minX, 9);
      expect(box.maxX).toBeCloseTo(scene.maxX, 9);
      expect(box.minZ).toBeCloseTo(scene.minZ, 9);
      expect(box.maxZ).toBeCloseTo(scene.maxZ, 9);
    }
  });

  it('odhad délky chůze po síti (walkLength) – po trase kratší chůze, mimo ni rovně, stejně znovu', () => {
    const walker = routeWalker([east('d:1', 'water', 0, 40)], CELL_M);
    // po celé trase (200 m) rychleji než rovně – PATH_WALK
    const along = walker.walkLength!({ x: 0, z: 0 }, { x: 200, z: 0 });
    expect(along).toBeLessThan(200);
    expect(along).toBeCloseTo(200 / PATH_WALK.speed, 0);
    // daleko od sítě rovně
    const off = walker.walkLength!({ x: 0, z: 400 }, { x: 30, z: 440 });
    expect(off).toBeCloseTo(50, 6);
    // stejný dotaz = stejný výsledek (čistá funkce sítě)
    expect(walker.walkLength!({ x: 0, z: 0 }, { x: 200, z: 0 })).toBe(along);
    expect(
      routeWalker([east('d:1', 'water', 0, 40)], CELL_M).walkLength!(
        { x: 0, z: 0 },
        { x: 200, z: 0 },
      ),
    ).toBe(along);
  });
});

describe('routeWalker – stěnou opevnění jen branou (fortifications.md – Brány)', () => {
  /** Půda se stěnou (obdélník x × z) – `route` z půdy čte jen stěny, terén nepotřebuje. */
  const walled = (x0: number, x1: number, z0: number, z1: number): (() => WalkGround) => {
    const walls = walkWallsOf([
      {
        walls: [
          [
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
          ],
        ],
        gates: [],
      },
    ])!;
    return () => ({ terrain: {} as PathTerrain, walls });
  };

  it('uložená trasa přes stěnu ani odbočka z ní přes stěnu se nevezme', () => {
    const routes = [east('d:1', 'water', 0, 20)];
    const target = { x: 102, z: 20 };
    expect(routeWalker(routes, CELL_M).route({ x: 0, z: 0 }, target)).not.toBeNull();
    // stěna přes osu trasy
    const across = routeWalker(routes, CELL_M, { ground: walled(49, 51, -10, 10) });
    expect(across.route({ x: 0, z: 0 }, target)).toBeNull();
    // stěna mezi koncem trasy a cílem
    const leg = routeWalker(routes, CELL_M, { ground: walled(90, 115, 9, 11) });
    expect(leg.route({ x: 0, z: 0 }, target)).toBeNull();
    // stěna stranou – trasa platí
    const aside = routeWalker(routes, CELL_M, { ground: walled(40, 60, 30, 32) });
    expect(aside.route({ x: 0, z: 0 }, target)).not.toBeNull();
  });
});
