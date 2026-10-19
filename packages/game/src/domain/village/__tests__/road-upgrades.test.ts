import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { partWalkDistance } from '../fields';
import { squareCareWork, squareWalkDistance } from '../orchard';
import { keepingApples, roadGroundOf, roadPieces, roadsInWork, updateRoads } from '../paths/roads';
import { PATH_FORD, PATH_WATER, PATH_WETLAND, type PathTerrain } from '../paths/terrain';
import { refreshWalkDistances } from '../paths/village';
import {
  groundWalkLength,
  roadPieceCost,
  walkGraph,
  walkGroundOf,
  walkingDistances,
  type WalkGround,
  type WalkRoad,
} from '../paths/walking';
import { roadUpgradeCost, roadUpgradeOptions, startRoadUpgrade } from '../road-upgrades';
import { ORCHARD, ROAD_UPGRADES, ROAD_WALK } from '../rules';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, Road, RoadApple, VillageState } from '../types';
import { dwellingForestDistance, fuelExtraPerDay } from '../wood';
import { LANDSCAPE, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vylepšení pevné cesty a chůze podle stupně (roads.md – Vylepšení cesty, Rychlejší chůze).
// Krajina testu: louka 300 × 300 m, potok (vodní políčka bez osy) z ∈ (75, 90), les x < −90.

const YEAR = 365.25;
const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const LAYER = obstaclesOf(LANDSCAPE);

/** Ves čtyř obydlí kolem počátku, každá domácnost se čtyřmi dospělými. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: DAY - 2 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
  s.people = [1, 2, 3, 4].flatMap((d) =>
    [30, 28, 22, 20].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: DAY - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = DAY;
  return s;
}

/** Pevná cesta (100 m po ose z) s mokřinou 20 m a jedním brodem. */
function road(grade: Road['grade'] = 'trodden', ground = { wet: [[30, 50]], fords: [60] }): Road {
  return {
    id: 7,
    points: [
      { x: 30, z: -20 },
      { x: 30, z: 80 },
    ],
    bornDay: DAY - 20 * 365,
    grade,
    traffic: [5],
    spots: [],
    ground: { wet: ground.wet as [number, number][], fords: ground.fords },
  };
}

function withRoad(s: VillageState, r: Road = road()): VillageState {
  s.roads = {
    nextId: 20,
    roads: [r],
    trees: [],
    candidates: [],
    labor: { from: DAY, days: 0, shares: [] },
  };
  return s;
}

/** Terén 40 × 40 buněk po 2 m od (0, 0): mokřina pro z ∈ [20, 30), voda pro z ∈ [30, 34). */
function terrainBand(): PathTerrain {
  const width = 40;
  const height = 40;
  const flags = new Uint8Array(width * height);
  const cost = new Float32Array(width * height).fill(1);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const z = j * 2;
      const c = j * width + i;
      if (z >= 20 && z < 30) flags[c] = PATH_WETLAND;
      if (z >= 30 && z < 34) {
        flags[c] = i < 5 ? PATH_WATER | PATH_FORD : PATH_WATER;
        cost[c] = i < 5 ? 5 : Infinity;
      }
    }
  }
  return {
    width,
    height,
    originX: 0,
    originZ: 0,
    cellM: 2,
    window: { i0: 0, j0: 0, i1: width - 1, j1: height - 1 },
    cost,
    flags,
  };
}

describe('mokřina a brod v terénu a na ose cesty', () => {
  it('mokřina je suchá rovina do 3 buněk od vody, dál ne', () => {
    const t = pathTestTerrain();
    const at = (x: number, z: number): number =>
      t.flags[
        Math.round((z - t.originZ) / t.cellM) * t.width + Math.round((x - t.originX) / t.cellM)
      ]!;
    expect(at(0, 82.5) & PATH_WATER).toBeTruthy();
    expect(at(0, 71.25) & PATH_WETLAND).toBeTruthy();
    expect(at(0, 93.75) & PATH_WETLAND).toBeTruthy();
    expect(at(0, 82.5) & PATH_WETLAND).toBeFalsy();
    expect(at(0, 50) & PATH_WETLAND).toBeFalsy();
  });

  it('osa cesty: úseky v mokřině a brod uprostřed vody', () => {
    const ground = roadGroundOf(
      [
        { x: 4, z: 0 },
        { x: 4, z: 60 },
      ],
      terrainBand(),
    );
    expect(ground.wet).toHaveLength(1);
    // buňky po 2 m – hranice mokřiny o buňku přesně
    expect(Math.abs(ground.wet[0]![0] - 19)).toBeLessThan(1.5);
    expect(Math.abs(ground.wet[0]![1] - 29)).toBeLessThan(1.5);
    expect(ground.fords).toHaveLength(1);
    expect(ground.fords[0]!).toBeGreaterThan(29);
    expect(ground.fords[0]!).toBeLessThan(35);
    // přes neprůchodnou vodu (ne brod) cesta nevede – brod se nepočítá
    const elsewhere = roadGroundOf(
      [
        { x: 40, z: 0 },
        { x: 40, z: 60 },
      ],
      terrainBand(),
    );
    expect(elsewhere.fords).toEqual([]);
  });
});

describe('chůze podle stupně cesty, mokřiny a brodů', () => {
  const ground: WalkGround = { terrain: terrainBand() };

  it('rovně: mokřina dvojnásobně, každé vstoupení do vody + 30 m', () => {
    const a = { x: 20, z: 0 };
    expect(groundWalkLength(null, a, { x: 20, z: 18 })).toBeCloseTo(18, 9);
    expect(groundWalkLength(ground, a, { x: 20, z: 18 })).toBeCloseTo(18, 9);
    // 10 m mokřiny (z 20–30) navíc
    expect(groundWalkLength(ground, a, { x: 20, z: 29 })).toBeCloseTo(29 + 10, 0);
    // přes vodu: mokřina, brod + 30 m
    const across = groundWalkLength(ground, a, { x: 20, z: 40 });
    expect(across).toBeGreaterThan(40 + 10 + ROAD_WALK.fordExtraM - 2);
    expect(across).toBeLessThan(40 + 10 + ROAD_WALK.fordExtraM + 2);
  });

  it('po cestě: vyšlapaná 1,5×, upravená 1,7×, mokřina 0,5× (s hatí 1,7×), brod + 30 m bez lávky', () => {
    const plain = (grade: Road['grade']): WalkRoad => ({
      points: [],
      grade,
      ground: { wet: [], fords: [] },
    });
    // Martin (19. 10. 2026): „stálá vyšlapaná cesta 1.5“, „Upravená cesta: 1.7“
    expect(roadPieceCost(plain('trodden'), 0, 150)).toBeCloseTo(100, 9);
    expect(roadPieceCost(plain('improved'), 0, 170)).toBeCloseTo(100, 9);
    expect(roadPieceCost(plain('causeway'), 0, 170)).toBeCloseTo(100, 9);
    const wet = (grade: Road['grade']): WalkRoad => ({
      points: [],
      grade,
      ground: { wet: [[10, 20]], fords: [30] },
    });
    // 30 m sucho po upravené + 10 m mokřiny po upravené + brod 30
    expect(roadPieceCost(wet('improved'), 0, 40)).toBeCloseTo(30 / 1.7 + 10 / 0.5 + 30, 9);
    // hať a lávka: i přes mokřinu 1,7×, brod bez zdržení
    expect(roadPieceCost(wet('causeway'), 0, 40)).toBeCloseTo(40 / 1.7, 9);
    // kus osy jen zčásti v mokřině
    expect(roadPieceCost(wet('trodden'), 15, 25)).toBeCloseTo(5 / 0.5 + 5 / 1.5, 9);
  });

  it('po pevné cestě bez ohledu na povrch – pole, les ani svah chůzi nezdraží (Martin)', () => {
    // chůze (walking.ts) zná z půdy jen mokřinu a vodu: drahý terén (les, svah) ji nemění
    const band = terrainBand();
    const rough: WalkGround = {
      terrain: { ...band, cost: band.cost.map((c) => (c === Infinity ? c : c * 10)) },
    };
    const r: WalkRoad = {
      points: [
        { x: 10, z: 0 },
        { x: 10, z: 18 },
      ],
      grade: 'trodden',
      ground: { wet: [], fords: [] },
    };
    const walk = (g: WalkGround): number =>
      walkingDistances(
        walkGraph([], { roads: [r], ground: g }),
        [{ x: 10, z: 0 }],
        [{ x: 10, z: 18 }],
        g,
      )[0]!;
    expect(walk(rough)).toBe(walk(ground));
    expect(walk(ground)).toBeCloseTo(18 / ROAD_WALK.speed.trodden, 9);
  });

  it('pole za potokem: bez cesty zdraží, po hati a lávce zlevní', () => {
    const origin = [{ x: 4, z: 0 }];
    const target = [{ x: 4, z: 70 }];
    const none = walkingDistances(walkGraph([]), origin, target, ground)[0]!;
    expect(none).toBeGreaterThan(70 + 10 + 25);
    const axis = [
      { x: 4, z: 0 },
      { x: 4, z: 70 },
    ];
    const roadOf = (grade: Road['grade']): WalkRoad => ({
      points: axis,
      grade,
      ground: roadGroundOf(axis, ground.terrain),
    });
    const trodden = walkingDistances(
      walkGraph([], { roads: [roadOf('trodden')], ground }),
      origin,
      target,
      ground,
    )[0]!;
    const causeway = walkingDistances(
      walkGraph([], { roads: [roadOf('causeway')], ground }),
      origin,
      target,
      ground,
    )[0]!;
    expect(trodden).toBeLessThan(none);
    expect(causeway).toBeLessThan(trodden);
    expect(causeway).toBeCloseTo(70 / 1.7, 0);
  });
});

describe('vylepšení pevné cesty', () => {
  it('ceny: upravená 15 čd na 100 m, hať 1 strom a 2 čd na 2 m, lávka 4 stromy a 15 čd', () => {
    expect(roadUpgradeCost(road(), 'improved')).toEqual({ manDays: 15, trees: 0 });
    expect(roadUpgradeCost(road(), 'causeway')).toEqual({
      manDays: (20 / 2) * ROAD_UPGRADES.causewayPer2M.manDays + ROAD_UPGRADES.footbridge.manDays,
      trees: 10 + ROAD_UPGRADES.footbridge.trees,
    });
  });

  it('nabídka: vyšlapaná – úprava, hať až po úpravě; bez mokřiny a brodu hať není', () => {
    const s = withRoad(village());
    const options = roadUpgradeOptions(s, 7, DAY, null);
    expect(options.map((o) => o.upgrade)).toEqual(['improved', 'causeway']);
    expect(options[0]!.blocked).toBeNull();
    expect(options[1]!.blocked).toMatch(/upravit/);
    const dry = withRoad(village(), road('trodden', { wet: [], fords: [] }));
    expect(roadUpgradeOptions(dry, 7, DAY, null).map((o) => o.upgrade)).toEqual(['improved']);
    const improved = withRoad(village(), road('improved'));
    expect(roadUpgradeOptions(improved, 7, DAY, null).map((o) => o.upgrade)).toEqual(['causeway']);
    expect(roadUpgradeOptions(improved, 7, DAY, null)[0]!.blocked).toBeNull();
    // bez dřeva (prázdná vrstva, žádné klády) hať nejde
    expect(roadUpgradeOptions(improved, 7, DAY, LAYER)[0]!.blocked).toMatch(/dřevo/);
    expect(roadUpgradeOptions(withRoad(village(), road('causeway')), 7, DAY, null)).toEqual([]);
  });

  it('vylepšení je stavba ze společné práce – po dokončení nový stupeň a kronika', () => {
    const s = withRoad(village());
    const started = startRoadUpgrade(s, DAY, 7, 'improved', null);
    const c = started.constructions.at(-1)!;
    expect(c).toMatchObject({ kind: 'road', roadIds: [7], roadGrade: 'improved', cost: 15 });
    expect(roadsInWork(started.constructions).has(7)).toBe(true);
    expect(() => startRoadUpgrade(started, DAY, 7, 'improved', null)).toThrow(/vylepšuje/);
    const later = advanceVillage(started, DAY + 60, null);
    expect(later.roads!.roads[0]!.grade).toBe('improved');
    expect(later.constructions.some((x) => x.kind === 'road')).toBe(false);
    expect(later.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'construction-finished', constructionKind: 'road' }),
    );
    // hať a lávka: dřevo z hromady klád, práce i s kácením zbytku
    later.woodLogs = 20;
    const causeway = startRoadUpgrade(later, later.lastDay, 7, 'causeway', null);
    expect(causeway.woodLogs).toBeCloseTo(20 - 14, 9);
    const done = advanceVillage(causeway, later.lastDay + 120, null);
    expect(done.roads!.roads[0]!.grade).toBe('causeway');
  });

  it('cesta, která se vylepšuje, nezaroste', () => {
    // úsek stranou vsi, kudy nikdo nechodí – kusy čtyři roky tiché
    const points = [
      { x: 100, z: -130 },
      { x: 140, z: -130 },
    ];
    const far = {
      ...road(),
      points,
      traffic: [0, 0, 0, 0, 0],
      quiet: roadPieces(points).map((p) => ({ x: p.x, z: p.z, years: 4 })),
    };
    const s = withRoad(village(), far);
    const started = startRoadUpgrade(s, DAY, 7, 'improved', null);
    started.constructions.at(-1)!.cost = 1e9;
    updateRoads(started, dayIndexOf({ year: 600, month: 11, day: 1 }), LANDSCAPE, null);
    expect(started.roads!.roads.some((r) => r.id === 7)).toBe(true);
    const idle = withRoad(village(), far);
    updateRoads(idle, dayIndexOf({ year: 600, month: 11, day: 1 }), LANDSCAPE, null);
    expect(idle.roads!.roads.some((r) => r.id === 7)).toBe(false);
  });
});

describe('cesta s prací hráče nezaroste (roads.md – návrh Clauda, 19. 10. 2026)', () => {
  const NOV = dayIndexOf({ year: 600, month: 11, day: 1 });
  /** Úsek stranou vsi, kudy nikdo nechodí – kusy čtyři roky tiché, letos pátý. */
  const far = (grade: Road['grade'] = 'trodden'): Road => {
    const points = [
      { x: 100, z: -130 },
      { x: 140, z: -130 },
    ];
    return {
      ...road(grade),
      points,
      traffic: [0, 0, 0, 0, 0],
      quiet: roadPieces(points).map((p) => ({ x: p.x, z: p.z, years: 4 })),
    };
  };
  const apple = (plantedDay: number | null): RoadApple => ({
    id: 2 ** 30 + 1,
    roadId: 7,
    x: 120,
    z: -127,
    distanceM: 150,
    plantedDay,
  });
  /** Stojí úsek po roční kontrole? */
  const stays = (r: Road, apples?: RoadApple[]): boolean => {
    const s = withRoad(village(), r);
    if (apples) s.roads!.apples = apples;
    updateRoads(s, NOV, LANDSCAPE, null);
    return s.roads!.roads.some((x) => x.id === 7);
  };

  it('vyšlapaná cesta bez provozu zaroste, upravená a hať s lávkou ne', () => {
    expect(stays(far())).toBe(false);
    expect(stays(far('improved'))).toBe(true);
    expect(stays(far('causeway'))).toBe(true);
  });

  it('cesta s vysazenými jabloněmi nezaroste; až jabloně dožijí, zarůst může', () => {
    expect(stays(far(), [apple(NOV - Math.round(10 * YEAR))])).toBe(true);
    // jabloně se teprve sázejí
    expect(stays(far(), [apple(null)])).toBe(true);
    // souš po jabloni cestu nedrží
    expect(stays(far(), [apple(NOV - Math.round((ORCHARD.endYear + 2) * YEAR))])).toBe(false);
    expect(keepingApples({ apples: [apple(NOV - 400)] }, NOV)).toHaveLength(1);
    expect(keepingApples({ apples: [apple(NOV - Math.round(70 * YEAR))] }, NOV)).toEqual([]);
    expect(keepingApples({}, NOV)).toEqual([]);
  });
});

describe('vzdálenost práce chůzí – pole, sad, palivo', () => {
  /** Ves s polem a sadem za potokem (z ≈ 97) a polem před ním. */
  function farmed(): VillageState {
    const s = village();
    const cell = (x: number, y: number) => ({ x, y });
    const part = (c: { x: number; y: number }) => {
      const cx = -142.5 + c.x * 15;
      const cz = -142.5 + c.y * 15;
      return {
        cell: c,
        areaM2: 225,
        distanceM: Math.hypot(cx, cz),
        naturalFertility: 60,
        surface: 'meadow' as const,
        obstacleCost: 0,
      };
    };
    const field = foundField(s, DAY, {
      parts: [cell(9, 16), cell(10, 16), cell(9, 17), cell(10, 17), cell(9, 12), cell(10, 12)].map(
        part,
      ),
    });
    field.orchards = [
      {
        id: 300,
        squares: [
          {
            cell: cell(11, 17),
            areaM2: 225,
            distanceM: Math.hypot(22.5, 112.5),
            plantingCost: 0,
            plantingDone: 0,
            plantedDay: DAY - 3000,
          },
        ],
        plantedDay: DAY - 3000,
      } as never,
    ];
    return field;
  }

  it('za potokem dál než vzdušnou čarou (brod + 30 m, mokřina), před potokem ne', () => {
    const s = farmed();
    refreshWalkDistances(s, DAY, LANDSCAPE, null);
    const beyond = s.parts.find((p) => p.cell?.y === 16)!;
    const before = s.parts.find((p) => p.cell?.y === 12)!;
    expect(partWalkDistance(beyond)).toBeGreaterThan(beyond.distanceM + 25);
    expect(partWalkDistance(before)).toBeLessThanOrEqual(before.distanceM + 1e-9);
    const square = s.orchards![0]!.squares[0]!;
    expect(squareWalkDistance(square)).toBeGreaterThan(square.distanceM + 25);
    // práce v sadu podle chůze
    expect(squareCareWork(square)).toBeGreaterThan(
      squareCareWork({ ...square, walkDistanceM: undefined }),
    );
  });

  it('hať a lávka přes potok práci za potokem zlevní; po dokončení vylepšení se přepočítá', () => {
    const axis = [
      { x: 0, z: 10 },
      { x: 0, z: 60 },
      { x: 0, z: 110 },
    ];
    const ground = roadGroundOf(axis, walkGroundOf(LANDSCAPE).terrain);
    expect(ground.wet.length).toBeGreaterThan(0);
    const base: Road = { ...road('improved'), points: axis, ground };
    const s = withRoad(farmed(), base);
    refreshWalkDistances(s, DAY, LANDSCAPE, null);
    const improved = partWalkDistance(s.parts.find((p) => p.cell?.y === 16)!);
    s.roads!.roads[0]!.grade = 'causeway';
    refreshWalkDistances(s, DAY, LANDSCAPE, null);
    const causeway = partWalkDistance(s.parts.find((p) => p.cell?.y === 16)!);
    expect(causeway).toBeLessThan(improved);
  });

  it('palivo: chůze k okraji lesa místo vzdušné vzdálenosti', () => {
    const s = village();
    for (const d of s.dwellings) d.forestDistanceM = 50;
    expect(fuelExtraPerDay(s)).toBe(0);
    refreshWalkDistances(s, DAY, LANDSCAPE, null);
    // les x < −90 – k okraji lesa ≈ 90 m, chůzí aspoň vzdušnou čarou
    for (const d of s.dwellings) {
      expect(d.forestWalkM).toBeDefined();
      expect(dwellingForestDistance(d)).toBe(d.forestWalkM);
      expect(d.forestWalkM!).toBeGreaterThan(60);
    }
    // bez krajiny (kalibrace) zůstane vzdušná vzdálenost
    const calibration = advanceVillage(village(), DAY + 5, null);
    expect(calibration.dwellings.every((d) => d.forestWalkM === undefined)).toBe(true);
  });
});
