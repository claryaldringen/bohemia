import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import type { SceneEarthwork, SceneRoad, SceneRoadApple } from '../../village-view';
import { IMPROVED_WORN_LAYER, ROAD_WIDTH_M, ribbonSections } from '../path-ribbon';
import { roadRibbonMeshes } from '../road-works';
import {
  BRIDGE_LENGTH_M,
  LOG_LENGTH_M,
  LOG_SCALE,
  LOG_SPACING_M,
  STAKING_OFFSET_M,
  appleStaking,
  appleStakingKey,
  axisPart,
  bridgePieces,
  logPieces,
  roadBands,
  roadWorksKey,
  stakingLines,
  SLOPE_GRASS_YEARS,
  WAGON_STAKING_OFFSET_M,
  earthworkSlopeGrid,
  wagonStakingLines,
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

  it('rozestavěná úprava obráceného úseku roste od konce osy (stavba jde po cestě)', () => {
    const back = roadBands([
      road({ upgrade: { grade: 'improved', progress: 0.3, fromEnd: true } }),
    ]);
    expect(back.improved[0]!.points[0]).toEqual({ x: 70, z: 0 });
    expect(back.improved[0]!.points.at(-1)).toEqual({ x: 100, z: 0 });
    expect(back.trodden[0]!.points.at(-1)).toEqual({ x: 70, z: 0 });
    const staking = stakingLines([
      road({
        ground: { wet: [], fords: [] },
        upgrade: { grade: 'improved', progress: 0.3, fromEnd: true },
      }),
    ]);
    expect(staking[0]![0]![0]).toBeCloseTo(0, 9);
    expect(staking[0]!.at(-1)![0]).toBeCloseTo(70, 9);
  });

  it('přechod mezi stupni bez schodu: širší pás se k užšímu zúží, koleje se vytratí', () => {
    const next = (extra: Partial<SceneRoad>): SceneRoad => ({
      id: 4,
      points: [
        { x: 160, z: 0 },
        { x: 100, z: 0 },
      ],
      grade: 'trodden',
      ...extra,
    });
    const improved = roadBands([road({ grade: 'improved' }), next({})]);
    expect(improved.improved[0]!.narrowEnd).toBeCloseTo(
      ROAD_WIDTH_M.trodden / ROAD_WIDTH_M.improved,
      9,
    );
    expect(improved.improved[0]!.narrowStart).toBeUndefined();
    expect(improved.trodden[0]).not.toHaveProperty('narrowStart');
    expect(improved.trodden[0]).not.toHaveProperty('narrowEnd');
    // pás se zúží jen u přechodu – průřez na konci užší, kus před ním plný
    const sections = ribbonSections(
      improved.improved[0]!,
      IMPROVED_WORN_LAYER,
      () => 1,
      () => 1,
    );
    const plain = ribbonSections(
      { ...improved.improved[0]!, narrowEnd: undefined },
      IMPROVED_WORN_LAYER,
      () => 1,
      () => 1,
    );
    expect(sections.at(-1)!.half / plain.at(-1)!.half).toBeCloseTo(
      ROAD_WIDTH_M.trodden / ROAD_WIDTH_M.improved,
      6,
    );
    expect(sections[sections.length - 12]!.half).toBeCloseTo(plain[plain.length - 12]!.half, 9);
    // vozová → pěší: zúží se, koleje se u přechodu vytratí
    const cart = roadBands([road({ cart: true }), next({})]);
    expect(cart.cart[0]!.narrowEnd).toBeCloseTo(ROAD_WIDTH_M.trodden / ROAD_WIDTH_M.cart, 9);
    expect(cart.ruts.every((r) => r.openEnd)).toBe(true);
    // rozestavěná úprava: upravený kus se k vyšlapanému zúží
    const half = roadBands([road({ upgrade: { grade: 'improved', progress: 0.3 } })]);
    expect(half.improved[0]!.narrowEnd).toBeCloseTo(
      ROAD_WIDTH_M.trodden / ROAD_WIDTH_M.improved,
      9,
    );
    // rozcestí (tři konce) se nezužuje – je tam plácek
    const fork = roadBands([
      road({ grade: 'improved' }),
      next({}),
      next({
        id: 5,
        points: [
          { x: 100, z: 40 },
          { x: 100, z: 0 },
        ],
      }),
    ]);
    expect(fork.improved[0]!.narrowEnd).toBeUndefined();
  });

  it('upravená cesta je jen širší pás – bez strouhy a kamenů (Martin, 19. 10. 2026)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial('decal', scene);
    const meshes = (grade: SceneRoad['grade'], upgrade?: SceneRoad['upgrade']): string[] =>
      roadRibbonMeshes(scene, [road({ grade, ...(upgrade ? { upgrade } : {}) })], {
        height: () => 0,
        smoothHeight: () => 0,
        material: () => material,
        lift: { worn: 0.05, earth: 0.055, gravel: 0.06 },
        alphaIndex: { worn: 3, earth: 3.5, gravel: 3.7 },
      }).map((m) => m.name);
    expect(meshes('trodden')).toEqual(['roads-worn', 'roads-earth']);
    expect(meshes('improved')).toEqual(['roads-improved-worn', 'roads-improved-earth']);
    // vozová cesta (roads.md – Vozová cesta): pás 3,5 m a zpevněné koleje se štěrkem
    expect(meshes('wagon')).toEqual([
      'roads-wagon-worn',
      'roads-wagon-earth',
      'roads-wagon-gravel',
    ]);
    // rozestavěná úprava: od začátku úseku širší, dál vyšlapaná – žádný další pás
    expect(meshes('trodden', { grade: 'improved', progress: 0.4 }).sort()).toEqual(
      ['roads-earth', 'roads-improved-earth', 'roads-improved-worn', 'roads-worn'].sort(),
    );
    // mimo mokřinu a brod žádné díly (kameny ani strouha nejsou)
    expect(logPieces([road({ grade: 'improved' })])).toEqual([]);
    expect(bridgePieces([road({ grade: 'improved' })])).toEqual([]);
    engine.dispose();
  });

  it('hať: kmeny napříč po mokřině na šířku upravené cesty, rozestavěná po podílu průběhu', () => {
    expect(logPieces([road({ grade: 'improved' })])).toEqual([]);
    const full = logPieces([road({ grade: 'causeway' })]);
    expect(full.length).toBeCloseTo(20 / (LOG_SPACING_M * LOG_SCALE), -1);
    for (const log of full) {
      // kmen dlouhý jako upravená cesta široká (±4 %) – hať navazuje bez zúžení
      expect(Math.abs((LOG_LENGTH_M * log.scale) / ROAD_WIDTH_M.improved - 1)).toBeLessThan(0.041);
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
    // provázek po okrajích širší upravené cesty
    for (const [, z] of improve[0]!) expect(Math.abs(z)).toBeCloseTo(STAKING_OFFSET_M, 9);
    expect(STAKING_OFFSET_M).toBeGreaterThan(ROAD_WIDTH_M.improved / 2);
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

  it('klik na kterýkoli úsek cesty hráče vybere celou cestu (id prvního úseku řetězu)', () => {
    const chain = {
      dwellings: [],
      fields: [],
      roads: [
        road({ id: 9 }),
        {
          id: 2,
          points: [
            { x: 100, z: 0 },
            { x: 160, z: 0 },
          ],
          grade: 'improved' as const,
        },
      ],
    };
    const options = {
      ground: { x: 20, z: 1 },
      groundHeight: () => 0,
      cellOf: () => ({ x: 0, y: 0 }),
    };
    expect(pickVillageTarget(chain, ray, options)).toEqual({ kind: 'road', id: 2 });
    expect(pickVillageTarget(chain, ray, { ...options, ground: { x: 130, z: 1 } })).toEqual({
      kind: 'road',
      id: 2,
    });
  });
});

describe('vozová cesta ve scéně (roads.md – Vozová cesta)', () => {
  const profile = [
    { x: 0, z: 0, y: 1 },
    { x: 0, z: 20, y: 1 },
    { x: 0, z: 40, y: 1 },
  ];
  const earthwork = (over: Partial<SceneEarthwork> = {}): SceneEarthwork => ({
    id: 1,
    profile,
    reachedM: 40,
    shownM: 40,
    pieces: [{ toM: 40, ageYears: 0 }],
    ...over,
  });
  // terén 2 m nad plání (úvoz), dál od osy svah 1 : 1 k terénu
  const base = (): number => 3;
  const height = (x: number): number => Math.min(3, 1 + Math.max(0, Math.abs(x) - 2.75));

  it('hlína na svazích podle úpravy terénu, s věkem zaroste trávou', () => {
    const fresh = earthworkSlopeGrid([earthwork()], (x) => height(x), base, 1)!;
    const old = earthworkSlopeGrid(
      [earthwork({ pieces: [{ toM: 40, ageYears: SLOPE_GRASS_YEARS }] })],
      (x) => height(x),
      base,
      1,
    )!;
    const max = (a: Float32Array): number => Math.max(...a);
    expect(max(fresh.alphas)).toBeGreaterThan(0.9);
    expect(max(old.alphas)).toBeLessThan(0.2);
    // kde se terén nezměnil, hlína není
    const lanes = fresh.positions.length / 2 / profile.length;
    expect(fresh.alphas[0]).toBe(0);
    expect(fresh.alphas[lanes - 1]).toBe(0);
    // nehotová část osy svahy nemá
    expect(earthworkSlopeGrid([earthwork({ shownM: 0 })], (x) => height(x), base, 1)).toBeNull();
  });

  it('vytyčení: nehotová část stavby a náhled trasy po obou okrajích vozovky', () => {
    expect(wagonStakingLines([earthwork({ shownM: 10, building: true })], [])).toHaveLength(2);
    expect(wagonStakingLines([earthwork()], [])).toHaveLength(0);
    expect(wagonStakingLines([], [profile])).toHaveLength(2);
    const [left] = wagonStakingLines([], [profile]);
    expect(Math.abs(left![0]![0])).toBeCloseTo(WAGON_STAKING_OFFSET_M, 6);
  });
});
