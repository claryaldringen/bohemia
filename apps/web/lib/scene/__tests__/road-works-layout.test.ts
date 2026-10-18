import { describe, expect, it } from 'vitest';
import type { SceneRoad, SceneRoadApple } from '../../village-view';
import {
  BRIDGE_LENGTH_M,
  DITCH,
  LOG_SPACING_M,
  appleStaking,
  appleStakingKey,
  axisPart,
  bridgePieces,
  ditchLines,
  logPieces,
  roadBands,
  roadWorksKey,
  stakingLines,
  stonePieces,
} from '../road-works-layout';
import { nearestRoad, pickVillageTarget } from '../village-picking';

/** Úsek 100 m po ose x s mokřinou 40–60 m a brodem v 70 m. */
const road = (extra: Partial<SceneRoad> = {}): SceneRoad => ({
  id: 3,
  points: [
    { x: 0, z: 0 },
    { x: 50, z: 0 },
    { x: 100, z: 0 },
  ],
  grade: 'trodden',
  ground: { wet: [[40, 60]], fords: [70] },
  ...extra,
});

describe('vylepšené cesty ve scéně (road-works-layout)', () => {
  it('kus osy mezi vzdálenostmi i přes zlom', () => {
    expect(axisPart(road().points, 20, 80)).toEqual([
      { x: 20, z: 0 },
      { x: 50, z: 0 },
      { x: 80, z: 0 },
    ]);
    expect(axisPart(road().points, 30, 30)).toEqual([]);
  });

  it('pásy: vyšlapaná, upravená širší; rozestavěná úprava od začátku úseku', () => {
    expect(roadBands([road()]).trodden).toHaveLength(1);
    expect(roadBands([road()]).improved).toHaveLength(0);
    expect(roadBands([road({ grade: 'improved' })]).improved).toHaveLength(1);
    const half = roadBands([road({ upgrade: { grade: 'improved', progress: 0.3 } })]);
    expect(half.improved[0]!.points.at(-1)).toEqual({ x: 30, z: 0 });
    expect(half.trodden[0]!.points[0]).toEqual({ x: 30, z: 0 });
    // napojení obou kusů se nevytrácí, volné konce úseku ano
    expect(half.improved[0]!.openEnd).toBe(false);
    expect(half.trodden[0]!.openStart).toBe(false);
    expect(half.improved[0]!.openStart).toBe(true);
  });

  it('strouha vlevo od osy jen u upravené části a ne přes brod', () => {
    expect(ditchLines([road()])).toEqual([]);
    const lines = ditchLines([road({ grade: 'improved' })]);
    expect(lines).toHaveLength(2);
    for (const line of lines) for (const p of line) expect(p.z).toBeCloseTo(DITCH.offsetM, 9);
    expect(lines[0]!.at(-1)!.x).toBeCloseTo(67, 6);
    expect(lines[1]![0]!.x).toBeCloseTo(73, 6);
  });

  it('kameny upravené cesty hustě v mokřině a u brodu, na pásu cesty, deterministicky', () => {
    expect(stonePieces([road()])).toEqual([]);
    const stones = stonePieces([road({ grade: 'improved' })]);
    const wet = stones.filter((s) => s.x >= 40 && s.x <= 60).length / 20;
    const dry = stones.filter((s) => s.x >= 5 && s.x <= 35).length / 30;
    expect(wet).toBeGreaterThan(dry * 3);
    for (const s of stones) expect(Math.abs(s.z)).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(stonePieces([road({ grade: 'improved' })])).toEqual(stones);
  });

  it('hať: kmeny napříč po mokřině, rozestavěná po podílu průběhu', () => {
    expect(logPieces([road({ grade: 'improved' })])).toEqual([]);
    const full = logPieces([road({ grade: 'causeway' })]);
    expect(full.length).toBeCloseTo(20 / LOG_SPACING_M, -1);
    for (const log of full) {
      expect(log.x).toBeGreaterThanOrEqual(40);
      expect(log.x).toBeLessThanOrEqual(60);
      // kmen napříč osou x: natočení ≈ 90°
      expect(Math.abs(Math.abs(log.rotationY) - Math.PI / 2)).toBeLessThan(0.1);
    }
    const half = logPieces([
      road({ grade: 'improved', upgrade: { grade: 'causeway', progress: 0.5 } }),
    ]);
    expect(half.length).toBeCloseTo(full.length / 2, -1);
    expect(Math.max(...half.map((l) => l.x))).toBeLessThan(51);
  });

  it('lávka přes brod: nejdřív kůly a prahy, pak celá; podél osy', () => {
    expect(
      bridgePieces([road({ grade: 'improved', upgrade: { grade: 'causeway', progress: 0.1 } })]),
    ).toEqual([]);
    const posts = bridgePieces([
      road({ grade: 'improved', upgrade: { grade: 'causeway', progress: 0.5 } }),
    ]);
    expect(posts.map((b) => b.stage)).toEqual(['posts']);
    const done = bridgePieces([road({ grade: 'causeway' })]);
    expect(done).toHaveLength(1);
    expect(done[0]!).toMatchObject({ x: 70, z: 0, stage: 'deck' });
    expect(done[0]!.ends[1][0] - done[0]!.ends[0][0]).toBeCloseTo(BRIDGE_LENGTH_M, 9);
  });

  it('vytyčení od zadání: úprava podél zbytku úseku, hať kolem mokřiny a brodu', () => {
    expect(stakingLines([road()])).toEqual([]);
    const improve = stakingLines([road({ upgrade: { grade: 'improved', progress: 0 } })]);
    expect(improve).toHaveLength(2);
    expect(improve[0]![0]![0]).toBeCloseTo(0, 9);
    const causeway = stakingLines([
      road({ grade: 'improved', upgrade: { grade: 'causeway', progress: 0.2 } }),
    ]);
    expect(causeway).toHaveLength(4);
  });

  it('klíč se mění s průběhem po setinách a se stupněm', () => {
    const a = roadWorksKey([road({ upgrade: { grade: 'improved', progress: 0.301 } })]);
    expect(roadWorksKey([road({ upgrade: { grade: 'improved', progress: 0.302 } })])).toBe(a);
    expect(roadWorksKey([road({ upgrade: { grade: 'improved', progress: 0.33 } })])).not.toBe(a);
    expect(roadWorksKey([road({ grade: 'improved' })])).not.toBe(roadWorksKey([road()]));
  });
});

describe('vytyčení výsadby jabloní u cesty', () => {
  const apple = (id: number, x: number, z: number, stage: SceneRoadApple['stage'] = 'planting') =>
    ({ id, roadId: 3, x, z, stage, growth: 0, fruit: false }) satisfies SceneRoadApple;

  it('kolík na každém čekajícím místě, provázek po každé straně podél osy', () => {
    const apples = [
      apple(1, 30, 3),
      apple(2, 10, 3),
      apple(3, 20, -3),
      apple(4, 40, -3),
      apple(5, 50, 3, 'tree'),
    ];
    const { lines, pegs } = appleStaking([road()], apples);
    expect(pegs).toHaveLength(4);
    expect(lines).toHaveLength(2);
    // seřazené podél osy
    expect(lines[0]).toEqual([
      [10, 3],
      [30, 3],
    ]);
    expect(lines[1]).toEqual([
      [20, -3],
      [40, -3],
    ]);
    // jediné místo na straně – jen kolík
    expect(appleStaking([road()], [apple(1, 30, 3)]).lines).toEqual([]);
    expect(appleStakingKey(apples)).toBe('1,2,3,4');
    expect(appleStaking([road()], [apple(5, 50, 3, 'tree')])).toEqual({ lines: [], pegs: [] });
  });
});

describe('výběr úseku cesty kliknutím', () => {
  const village = {
    dwellings: [],
    fields: [],
    roads: [road()],
  };
  const ray = { origin: { x: 20, y: 50, z: 1 }, direction: { x: 0, y: -1, z: 0 } };

  it('do 2,5 m od osy se vybere úsek, dál nic', () => {
    expect(nearestRoad(village, { x: 20, z: 2 }, 2.5)).toBe(3);
    expect(nearestRoad(village, { x: 20, z: 4 }, 2.5)).toBeNull();
    const options = {
      ground: { x: 20, z: 1 },
      groundHeight: () => 0,
      cellOf: () => ({ x: 0, y: 0 }),
    };
    expect(pickVillageTarget(village, ray, options)).toEqual({ kind: 'road', id: 3 });
    expect(pickVillageTarget(village, ray, { ...options, ground: { x: 20, z: 6 } })).toBeNull();
  });
});
