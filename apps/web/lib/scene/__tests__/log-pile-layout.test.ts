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
  STACK_REACH_M,
  logPileLayout,
  logPileSite,
  logStackSite,
  pileWidth,
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

describe('logStackSite – hromada klád u lesa (forest.md – Klučení lesa pro pole)', () => {
  /** Střed políčka (x, y) ve světě. */
  const center = (x: number, y: number): { x: number; z: number } => ({
    x: -240 + (x + 0.5) * 15,
    z: -240 + (y + 0.5) * 15,
  });
  const part = (x: number, y: number) => ({
    cell: { x, y },
    ...center(x, y),
    size: 15,
    stage: 'founding' as const,
  });
  /** Pole v lese: čtverce 26–27 × 10–11, kotva uprostřed prvního. */
  const fields: SceneVillage['fields'] = [
    { id: 1, parts: [part(26, 10), part(27, 10), part(26, 11), part(27, 11)] },
  ];
  const anchor = center(26, 10);
  const village: SceneVillage = { dwellings: [dwelling(1, 0, 0)], fields };
  /**
   * Hustý les: strom každé 3 m kolem pole (svět x 150–180, z −90…−60) kromě dílů pole a pruhu
   * 8 m západně od něj – jediné volné místo pro hromadu.
   */
  const forest = (() => {
    const list = [];
    let id = 1;
    for (let x = 110; x < 230; x += 3) {
      for (let z = -130; z < -20; z += 3) {
        if (x >= 142 && x <= 181 && z >= -91 && z <= -59) continue;
        list.push({
          id: id++,
          kind: 'tree' as const,
          look: 'oak-1' as const,
          x,
          z,
          rotation: 0,
          scale: 1,
        });
      }
    }
    return packObstacles(list, SIZE, 15);
  })();

  const footprint = (site: { x: number; z: number; rotation: number; stacks?: number }) =>
    rectangleCorners(site.x, site.z, pileWidth(site.stacks ?? 3), PILE_DEPTH_M, site.rotation);

  it('do STACK_REACH_M od kotvy, mimo díly pole; stejný vstup, stejné místo', () => {
    const site = logStackSite(landscape, village, empty, NO_OBSTACLE_CHANGES, anchor)!;
    expect(site).not.toBeNull();
    expect(Math.hypot(site.x - anchor.x, site.z - anchor.z)).toBeLessThanOrEqual(STACK_REACH_M);
    for (const [x, z] of footprint(site)) {
      const tx = Math.floor((x + 240) / 15);
      const ty = Math.floor((z + 240) / 15);
      expect(fields[0]!.parts.some((p) => p.cell.x === tx && p.cell.y === ty)).toBe(false);
    }
    expect(logStackSite(landscape, village, empty, NO_OBSTACLE_CHANGES, anchor)).toEqual(site);
  });

  it('mezi stojícími stromy jen na volném místě – pařezy nevadí', () => {
    const site = logStackSite(landscape, village, forest, NO_OBSTACLE_CHANGES, anchor)!;
    expect(site).not.toBeNull();
    const pile = footprint(site);
    for (let i = 0; i < forest.x.length; i++) {
      expect(pointInPolygon([forest.x[i]!, forest.z[i]!], pile)).toBe(false);
    }
    // všechny stromy pokácené – pařezy hromadě nepřekážejí, místo je blíž kotvě nebo stejné
    const stumps = { removed: [], stumps: [...forest.id], saplings: [] };
    const felled = logStackSite(landscape, village, forest, stumps, anchor)!;
    expect(Math.hypot(felled.x - anchor.x, felled.z - anchor.z)).toBeLessThanOrEqual(
      Math.hypot(site.x - anchor.x, site.z - anchor.z),
    );
  });

  it('předchozí místo, které je pořád volné, zůstane', () => {
    const previous = logStackSite(landscape, village, empty, NO_OBSTACLE_CHANGES, anchor)!;
    const moved = { ...previous, x: previous.x - 4 };
    expect(logStackSite(landscape, village, empty, NO_OBSTACLE_CHANGES, anchor, moved)).toEqual(
      moved,
    );
  });

  it('bez volného místa null – nikdy do vody, na pole ani na cestu', () => {
    const water: Landscape = {
      ...landscape,
      surface: new Uint8Array(SIZE * SIZE).fill(SURFACE_CODES.water),
    };
    expect(logStackSite(water, village, empty, NO_OBSTACLE_CHANGES, anchor)).toBeNull();
    const road = {
      id: 1,
      grade: 'path' as const,
      points: [
        { x: anchor.x, z: anchor.z - 30 },
        { x: anchor.x, z: anchor.z + 30 },
      ],
    } as unknown as NonNullable<SceneVillage['roads']>[number];
    const site = logStackSite(
      landscape,
      { ...village, roads: [road] },
      empty,
      NO_OBSTACLE_CHANGES,
      anchor,
    )!;
    for (const [x] of footprint(site)) expect(Math.abs(x - anchor.x)).toBeGreaterThan(2.9);
  });

  it('na místě pro méně hranic se ukáže nejvýš 21 klád na hranici, v jeho šířce', () => {
    const logs = logPileLayout(MAX_SHOWN_LOGS, 1);
    expect(logs).toHaveLength(21);
    for (const log of logs) {
      expect(Math.abs(log.x)).toBeLessThanOrEqual(pileWidth(1) / 2 - LOG_RADIUS_M * 0.8);
    }
  });
});
