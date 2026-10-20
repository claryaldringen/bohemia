import { describe, expect, it } from 'vitest';
import {
  NO_OBSTACLE_CHANGES,
  SURFACE_CODES,
  dwellingClearing,
  dwellingFootprint,
  dwellingShape,
  packObstacles,
  pointInPolygon,
  polygonsOverlap,
  rectangleCorners,
  type Landscape,
} from '@bohemia/game';
import type { SceneVillage } from '../../village-view';
import {
  LOG_RADIUS_M,
  MAX_SHOWN_LOGS,
  PILE_DEPTH_M,
  PILE_WIDTH_M,
  logPileLayout,
  logPileSite,
} from '../log-pile-layout';

const SIZE = 32;
/** Krajina 32 × 32 políček po 15 m se středem v počátku; les ve sloupcích x ≥ 24 (svět ≥ 120 m). */
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: Uint8Array.from({ length: SIZE * SIZE }, (_, i) =>
    i % SIZE >= 24 ? SURFACE_CODES.forest : SURFACE_CODES.meadow,
  ),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 16, y: 16 },
  stream: [],
  obstacleLayer: null,
};
const empty = packObstacles([], SIZE, 15);
const dwelling = (id: number, x: number, z: number): SceneVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
});

describe('logPileLayout', () => {
  it('kolik klád, tolik kmenů – nejvýš MAX_SHOWN_LOGS', () => {
    expect(logPileLayout(0)).toEqual([]);
    expect(logPileLayout(7)).toHaveLength(7);
    expect(logPileLayout(MAX_SHOWN_LOGS + 40)).toHaveLength(MAX_SHOWN_LOGS);
    expect(logPileLayout(4.7)).toHaveLength(4);
  });

  it('hromada ubývá shora: menší hromada je začátek větší, spodní řada leží na zemi', () => {
    const big = logPileLayout(30);
    expect(logPileLayout(12)).toEqual(big.slice(0, 12));
    const bottom = big.slice(0, 6);
    for (const log of bottom) expect(log.y).toBeCloseTo(log.radius, 9);
    // kmeny se nepřekrývají (střed od středu aspoň součet poloměrů bez vůle na nerovnost)
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        const a = big[i]!;
        const b = big[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius - 0.06);
      }
    }
  });

  it('všechny kmeny leží v půdorysu hromady', () => {
    for (const log of logPileLayout(MAX_SHOWN_LOGS)) {
      expect(Math.abs(log.x)).toBeLessThanOrEqual(PILE_WIDTH_M / 2 - LOG_RADIUS_M * 0.8);
      expect(Math.abs(log.z) + log.length / 2).toBeLessThanOrEqual(PILE_DEPTH_M / 2 + 0.01);
    }
  });
});

describe('logPileSite', () => {
  it('bez obydlí žádná hromada', () => {
    const village: SceneVillage = { dwellings: [], fields: [] };
    expect(logPileSite(landscape, village, empty, NO_OBSTACLE_CHANGES)).toBeNull();
  });

  it('leží u obydlí nejblíž lesu – vedle něj, mimo vyklizené plochy ostatních obydlí', () => {
    const near = dwelling(2, 60, 0);
    // sousední obydlí hned vedle (dál od lesu) – hromada nesmí na jeho vyklizenou plochu
    const neighbour = dwelling(3, 50, 0);
    const village: SceneVillage = {
      dwellings: [dwelling(1, -100, 0), near, neighbour],
      fields: [],
    };
    const site = logPileSite(landscape, village, empty, NO_OBSTACLE_CHANGES)!;
    expect(Math.hypot(site.x - near.position.x, site.z - near.position.z)).toBeLessThan(10);
    const pile = rectangleCorners(site.x, site.z, PILE_WIDTH_M, PILE_DEPTH_M, site.rotation);
    expect(
      polygonsOverlap(pile, dwellingFootprint(near.type, near.position, dwellingShape(near))),
    ).toBe(false);
    for (const d of [village.dwellings[0]!, neighbour]) {
      expect(polygonsOverlap(pile, dwellingClearing(d.type, d.position, dwellingShape(d)))).toBe(
        false,
      );
    }
  });

  it('vyhne se poli a stromům – jde na další volné místo', () => {
    const home = dwelling(1, 0, 0);
    const village: SceneVillage = { dwellings: [home], fields: [] };
    const first = logPileSite(landscape, village, empty, NO_OBSTACLE_CHANGES)!;
    // strom přesně uprostřed prvního místa
    const tree = packObstacles(
      [{ id: 1, kind: 'tree', look: 'oak-1', x: first.x, z: first.z, rotation: 0, scale: 1 }],
      SIZE,
      15,
    );
    const second = logPileSite(landscape, village, tree, NO_OBSTACLE_CHANGES)!;
    expect(second).not.toEqual(first);
    const pile = rectangleCorners(second.x, second.z, PILE_WIDTH_M, PILE_DEPTH_M, second.rotation);
    expect(pointInPolygon([first.x, first.z], pile)).toBe(false);
    // pokácený strom (pařez) překáží taky, odstraněný ne
    const removed = { removed: [1], stumps: [], saplings: [] };
    expect(logPileSite(landscape, village, tree, removed)).toEqual(first);
  });

  it('bez volného místa se hromada nekreslí – nikdy do vody ani na pole', () => {
    // obydlí na ostrůvku jednoho políčka louky uprostřed vody
    const island: Landscape = {
      ...landscape,
      surface: Uint8Array.from({ length: SIZE * SIZE }, (_, i) =>
        i === 16 * SIZE + 16 ? SURFACE_CODES.meadow : SURFACE_CODES.water,
      ),
    };
    const village: SceneVillage = { dwellings: [dwelling(1, 7.5, 7.5)], fields: [] };
    expect(logPileSite(island, village, empty, NO_OBSTACLE_CHANGES)).toBeNull();
    // kolem obydlí samá pole
    const parts = [];
    for (let y = 10; y < 23; y++) {
      for (let x = 10; x < 23; x++) {
        parts.push({ cell: { x, y }, x: 0, z: 0, size: 15, stage: 'sown' as const });
      }
    }
    const farm: SceneVillage = { dwellings: [dwelling(1, 7.5, 7.5)], fields: [{ id: 2, parts }] };
    expect(logPileSite(landscape, farm, empty, NO_OBSTACLE_CHANGES)).toBeNull();
  });
});
