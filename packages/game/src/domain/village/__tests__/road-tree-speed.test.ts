import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundField, foundVillage } from '../actions';
import { cartGrid, cartRoadSpeed, type CartGrid, type CartRoad } from '../paths/cart';
import {
  computePathNetwork,
  pathNetworkKey,
  type PathNetwork,
  type PathVillage,
} from '../paths/network';
import { lineRoads, roadLining } from '../paths/road-lining';
import { PATH_WATER, PATH_WETLAND, type PathTerrain } from '../paths/terrain';
import { refreshWalkDistances, walkStageKey } from '../paths/village';
import { roadTreeSpeed, roadWalkSpeed } from '../paths/walk-speed';
import {
  fastestWalkShare,
  FASTEST_WALK_SHARE,
  roadPieceCost,
  walkGraph,
  walkingDistances,
  type WalkRoad,
} from '../paths/walking';
import { ROAD_TREE_ID_BASE } from '../road-trees';
import { CART_SPEED, ROAD_TREES, ROAD_WALK } from '../rules';
import { advanceVillage } from '../simulate';
import type { Person, Road, RoadApple, RoadLining, RoadTree, VillageState } from '../types';
import { LANDSCAPE, house, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stromy u cesty zrychlí chůzi (roads.md; Martin 20. 10. 2026: „Stromy u cesty musí přídat něco
// málo k rychlosti jak chodců tak vozů. šlo by přidat třeba 0.03? A pokud to budou jabloně,
// přidalo by se 0.05.“).

const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const YEAR = 365.25;
/** Strom uchycený před tolika lety (keř 8 let, pak strom). */
const rootedYearsAgo = (years: number, day = DAY): number => day - Math.ceil(years * YEAR);

/** Rovný úsek po ose x z `from` do `to` (z = `z`) s místy na stromy po `spacing` m střídavě. */
function straightRoad(id: number, from: number, to: number, z = 0, spacing = 16): Road {
  const spots = [];
  for (let k = 0, x = from + spacing / 2; x < to; k++, x += spacing) {
    spots.push({ id: id * 1000 + k, x, z: z + (k % 2 === 0 ? 3 : -3) });
  }
  return {
    id,
    points: [
      { x: from, z },
      { x: to, z },
    ],
    bornDay: DAY - 3650,
    grade: 'trodden',
    traffic: [],
    spots,
  };
}

/** Strom na místě `spot` uchycený v den `rootedDay` (umře za 300 let). */
function treeAt(spot: Road['spots'][number], rootedDay: number): RoadTree {
  return {
    id: ROAD_TREE_ID_BASE + spot.id,
    spot: spot.id,
    x: spot.x,
    z: spot.z,
    species: 'oak',
    rootedDay,
    diesDay: rootedDay + Math.round(300 * YEAR),
  };
}

/** Jabloně podél úseku po 10 m střídavě od `from` do `to` (m na ose x), vysazené v `plantedDay`. */
function applesAlong(
  road: Road,
  from: number,
  to: number,
  plantedDay: number | null,
  z = 0,
): RoadApple[] {
  const out: RoadApple[] = [];
  for (let k = 0, x = from + 5; x < to; k++, x += 10) {
    out.push({
      id: ROAD_TREE_ID_BASE + 500_000 + road.id * 1000 + k,
      roadId: road.id,
      x,
      z: z + (k % 2 === 0 ? 3 : -3),
      distanceM: 50,
      plantedDay,
    });
  }
  return out;
}

const bySpot = (trees: readonly RoadTree[]): Map<number, RoadTree> =>
  new Map(trees.map((t) => [t.spot, t]));

describe('olemování úseku stromy (roadLining)', () => {
  const road = straightRoad(1, 0, 200);
  const grown = rootedYearsAgo(30);

  it('stromy po celé délce = celý úsek, napůl olemovaný polovina, bez stromů nic', () => {
    const all = road.spots.map((s) => treeAt(s, grown));
    expect(roadLining(road, bySpot(all), [], DAY)).toEqual({ trees: 1, apples: 0 });
    const half = road.spots.filter((s) => s.x < 100).map((s) => treeAt(s, grown));
    expect(roadLining(road, bySpot(half), [], DAY)).toEqual({ trees: 0.5, apples: 0 });
    expect(roadLining(road, new Map(), [], DAY)).toEqual({ trees: 0, apples: 0 });
  });

  it('keř, souš ani pařez se nepočítá; strom odstraněný stavbou taky ne', () => {
    const shrubs = road.spots.map((s) => treeAt(s, rootedYearsAgo(ROAD_TREES.shrubYears - 1)));
    expect(roadLining(road, bySpot(shrubs), [], DAY).trees).toBe(0);
    // souš (umřel před rokem) a pařez (před 15 lety)
    const dead = (yearsAgo: number): RoadTree[] =>
      road.spots.map((s) => ({
        ...treeAt(s, rootedYearsAgo(400)),
        diesDay: rootedYearsAgo(yearsAgo),
      }));
    expect(roadLining(road, bySpot(dead(1)), [], DAY).trees).toBe(0);
    expect(roadLining(road, bySpot(dead(ROAD_TREES.snagYears + 5)), [], DAY).trees).toBe(0);
    const all = road.spots.map((s) => treeAt(s, grown));
    const removed = new Set(all.map((t) => t.id));
    expect(roadLining(road, bySpot(all), [], DAY, removed).trees).toBe(0);
  });

  it('jabloně: vysazené živé po celé délce = celý úsek, čekající na výsadbu ani souš ne', () => {
    const planted = applesAlong(road, 0, 200, rootedYearsAgo(10));
    expect(roadLining(road, new Map(), planted, DAY)).toEqual({ trees: 0, apples: 1 });
    expect(roadLining(road, new Map(), applesAlong(road, 0, 200, null), DAY).apples).toBe(0);
    // po ≈ 60 letech souš
    const old = applesAlong(road, 0, 200, rootedYearsAgo(65));
    expect(roadLining(road, new Map(), old, DAY).apples).toBe(0);
  });

  it('jabloně platí, kde jsou, jinde ostatní stromy', () => {
    const trees = road.spots.map((s) => treeAt(s, grown));
    const apples = applesAlong(road, 0, 100, rootedYearsAgo(10));
    expect(roadLining(road, bySpot(trees), apples, DAY)).toEqual({ trees: 0.5, apples: 0.5 });
  });

  it('podíl po desetinách – jeden strom navíc ho nezmění vždy', () => {
    const long = straightRoad(2, 0, 1000);
    const grownTrees = long.spots.map((s) => treeAt(s, grown));
    const shares = [30, 31, 32].map(
      (n) => roadLining(long, bySpot(grownTrees.slice(0, n)), [], DAY).trees,
    );
    for (const share of shares) expect(Math.round(share * 10)).toBeCloseTo(share * 10, 9);
    expect(shares[0]).toBe(shares[1]);
  });
});

describe('rychlost po cestě se stromy (roadTreeSpeed)', () => {
  const full = (trees: number, apples: number): RoadLining => ({ trees, apples });

  it('stromy +0,03, jabloně +0,05 – přičte se k rychlosti chůze i vozu (Martin)', () => {
    expect(roadTreeSpeed(undefined)).toBe(0);
    expect(roadTreeSpeed(full(0, 0))).toBe(0);
    expect(roadTreeSpeed(full(1, 0))).toBeCloseTo(0.03, 12);
    expect(roadTreeSpeed(full(0, 1))).toBeCloseTo(0.05, 12);
    expect(roadTreeSpeed(full(0.5, 0))).toBeCloseTo(0.015, 12);
    // vyšlapaná pěšky 1,5 → 1,53, vyježděná vozem 1,6 → 1,63; s jabloněmi 1,55 a 1,65
    expect(roadWalkSpeed('trodden', false, roadTreeSpeed(full(1, 0)))).toBeCloseTo(1.53, 12);
    expect(cartRoadSpeed('trodden', true, false, roadTreeSpeed(full(1, 0)))).toBeCloseTo(1.63, 12);
    expect(roadWalkSpeed('trodden', false, roadTreeSpeed(full(0, 1)))).toBeCloseTo(1.55, 12);
    expect(cartRoadSpeed('trodden', true, false, roadTreeSpeed(full(0, 1)))).toBeCloseTo(1.65, 12);
  });

  it('stejný přírůstek v chůzi i ve vozové síti, v mokřině a na hati v mokřině nic', () => {
    const gain = roadTreeSpeed(full(0.4, 0.6));
    for (const grade of ['trodden', 'improved'] as const) {
      expect(roadWalkSpeed(grade, false, gain) - roadWalkSpeed(grade, false)).toBeCloseTo(gain, 12);
      expect(
        cartRoadSpeed(grade, false, false, gain) - cartRoadSpeed(grade, false, false),
      ).toBeCloseTo(gain, 12);
      expect(roadWalkSpeed(grade, true, gain)).toBe(roadWalkSpeed(grade, true));
      expect(cartRoadSpeed(grade, false, true, gain)).toBe(cartRoadSpeed(grade, false, true));
    }
  });

  it('chůze po úseku: suchý kus rychleji, mokřina a brod beze změny', () => {
    const road = (lined?: RoadLining): WalkRoad => ({
      points: [],
      grade: 'trodden',
      ground: { wet: [[100, 120]], fords: [130] },
      ...(lined ? { lined } : {}),
    });
    const plain = roadPieceCost(road(), 0, 150);
    const lined = roadPieceCost(road(full(1, 0)), 0, 150);
    // 130 m sucho, 20 m mokřiny, brod + 30 m
    expect(plain).toBeCloseTo(130 / 1.5 + 20 / ROAD_WALK.wetSpeed + ROAD_WALK.fordExtraM, 9);
    expect(lined).toBeCloseTo(130 / 1.53 + 20 / ROAD_WALK.wetSpeed + ROAD_WALK.fordExtraM, 9);
    // jen mokřina a brod – beze změny
    expect(roadPieceCost(road(full(1, 0)), 100, 120)).toBe(roadPieceCost(road(), 100, 120));
    expect(roadPieceCost(road(full(0, 1)), 125, 135)).toBeCloseTo(
      10 / 1.55 + ROAD_WALK.fordExtraM,
      9,
    );
  });

  it('vzdálenost chůze po stromořadí je kratší; bez stromů stejná jako dřív', () => {
    const axis = [
      { x: 0, z: 0 },
      { x: 300, z: 0 },
    ];
    const walk = (lined?: RoadLining): number =>
      walkingDistances(
        walkGraph([], { roads: [{ points: axis, grade: 'trodden', ...(lined ? { lined } : {}) }] }),
        [{ x: 0, z: 0 }],
        [{ x: 300, z: 0 }],
      )[0]!;
    expect(walk()).toBeCloseTo(300 / 1.5, 9);
    expect(walk(full(0, 0))).toBe(walk());
    expect(walk(full(1, 0))).toBeCloseTo(300 / 1.53, 9);
    expect(walk(full(0, 1))).toBeCloseTo(300 / 1.55, 9);
  });

  it('nejrychlejší chůze (odhad dosahu seče) počítá se stromy, bez nich beze změny', () => {
    expect(fastestWalkShare(undefined)).toBe(FASTEST_WALK_SHARE);
    expect(fastestWalkShare([{ grade: 'improved', lined: full(0, 0) }])).toBe(FASTEST_WALK_SHARE);
    expect(fastestWalkShare([{ grade: 'improved', lined: full(0, 1) }])).toBeCloseTo(1 / 1.75, 12);
  });
});

describe('vozová síť po cestě se stromy', () => {
  const terrain = pathTestTerrain();
  /** Mokřina v pásu x ∈ [30, 60] a voda (brod) v x ∈ [90, 95] přes celou krajinu. */
  const marsh: PathTerrain = {
    ...terrain,
    flags: terrain.flags.map((f, c) => {
      const x = terrain.originX + (c % terrain.width) * terrain.cellM;
      if (x >= 30 && x <= 60) return f | PATH_WETLAND;
      return f;
    }),
  };
  const at = (grid: CartGrid, x: number, z: number): number =>
    grid.cost[
      Math.round((z - grid.originZ) / grid.cellM) * grid.width +
        Math.round((x - grid.originX) / grid.cellM)
    ]!;
  const axis = (z: number): { x: number; z: number }[] => [
    { x: -60, z },
    { x: 120, z },
  ];
  const wet = { wet: [[90, 120]] as [number, number][], fords: [] };

  it('ceny buněk = 1 / (rychlost cesty + přírůstek); mokřina a hať v mokřině beze změny', () => {
    const roads: CartRoad[] = [
      { id: 1, points: axis(-120), grade: 'trodden', cart: true, lined: { trees: 1, apples: 0 } },
      { id: 2, points: axis(-105), grade: 'trodden', cart: true, lined: { trees: 0, apples: 1 } },
      { id: 3, points: axis(-90), grade: 'trodden', cart: true },
      { id: 4, points: axis(-45), grade: 'trodden', ground: wet, lined: { trees: 0, apples: 1 } },
      { id: 5, points: axis(-30), grade: 'improved', ground: wet, lined: { trees: 0, apples: 1 } },
    ];
    const grid = cartGrid({ village: { dwellings: [], fields: [], roads }, terrain: marsh });
    const close = (cost: number, speed: number): void => expect(cost).toBeCloseTo(1 / speed, 5);
    close(at(grid, 0, -120), 1.63);
    close(at(grid, 0, -105), 1.65);
    close(at(grid, 0, -90), CART_SPEED.road.cart);
    // mimo mokřinu rychleji, v mokřině jako bez stromů
    close(at(grid, 0, -45), CART_SPEED.road.trodden + 0.05);
    close(at(grid, 45, -45), CART_SPEED.wet);
    close(at(grid, 0, -30), CART_SPEED.road.improved + 0.05);
    close(at(grid, 45, -30), CART_SPEED.road.improved);
  });

  it('brod pod cestou se stromy zůstává brodem', () => {
    const water = terrain.flags.findIndex((f) => (f & PATH_WATER) !== 0);
    expect(water).toBeGreaterThanOrEqual(0);
    const wx = terrain.originX + (water % terrain.width) * terrain.cellM;
    const wz = terrain.originZ + Math.floor(water / terrain.width) * terrain.cellM;
    const across = [
      { x: wx, z: wz - 20 },
      { x: wx, z: wz + 20 },
    ];
    const without = cartGrid({
      village: { dwellings: [], fields: [], roads: [{ id: 1, points: across, grade: 'trodden' }] },
      terrain,
    });
    const lined = cartGrid({
      village: {
        dwellings: [],
        fields: [],
        roads: [{ id: 1, points: across, grade: 'trodden', lined: { trees: 1, apples: 0 } }],
      },
      terrain,
    });
    expect(lined.cost[water]).toBe(without.cost[water]);
  });
});

describe('síť pěšin – trasy se ke stromořadí stahují', () => {
  const terrain = pathTestTerrain();
  /** Dvě souběžné cesty od domu k potoku – x = −7,5 a x = 7,5. */
  const roads = (lined: 'west' | 'east' | null): NonNullable<PathVillage['roads']> =>
    [-7.5, 7.5].map((x, k) => ({
      id: k + 1,
      points: [
        { x, z: 8 },
        { x, z: 73 },
      ],
      grade: 'trodden' as const,
      ...((lined === 'west' && k === 0) || (lined === 'east' && k === 1)
        ? { lined: { trees: 0, apples: 1 } }
        : {}),
    }));
  const village = (lined: 'west' | 'east' | null, zeros = false): PathVillage => ({
    dwellings: [house(1, 0, 0)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 2, adults: 4, elders: 0 }, shares: [] },
    roads: zeros
      ? roads(null).map((r) => ({ ...r, lined: { trees: 0, apples: 0 } }))
      : roads(lined),
  });
  const near = (network: PathNetwork, x: number): number =>
    network.lines
      .flatMap((l) => l.points)
      .filter((p) => Math.abs(p.x - x) < 2 && p.z > 20 && p.z < 60).length;

  it('k vodě se jde po cestě se stromy', () => {
    const west = computePathNetwork({ village: village('west'), terrain });
    const east = computePathNetwork({ village: village('east'), terrain });
    expect(near(west, -7.5)).toBeGreaterThan(near(west, 7.5));
    expect(near(east, 7.5)).toBeGreaterThan(near(east, -7.5));
  });

  it('bez stromů (i s nulovým olemováním) síť i klíč beze změny', () => {
    const plain = computePathNetwork({ village: village(null), terrain });
    expect(computePathNetwork({ village: village(null, true), terrain })).toEqual(plain);
    expect(pathNetworkKey(village(null, true))).toBe(pathNetworkKey(village(null)));
    expect(pathNetworkKey(village('west'))).not.toBe(pathNetworkKey(village(null)));
  });
});

/** Ves s hotovou zemnicí v (−60, −40), dvěma páry dospělých a polem na východě (z = −37,5). */
function withField(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: -60, z: -40, rotation: 0 } }),
  );
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: DAY - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 22), adult(5, 21)];
  s.constructions = [];
  s.storesKg = 4000;
  s.dwellings[0]!.builtDay = DAY - 20 * 365;
  const cells = [12, 13, 14, 15, 16].map((x) => ({ x, y: 7 }));
  return foundField(s, DAY, {
    parts: cells.map((cell) => {
      const cx = -142.5 + cell.x * 15;
      const cz = -142.5 + cell.y * 15;
      return {
        cell,
        areaM2: 225,
        distanceM: Math.hypot(cx + 60, cz + 40),
        naturalFertility: 60,
        surface: 'meadow' as const,
        obstacleCost: 0,
      };
    }),
  });
}

describe('olemování ve stavu vsi (lineRoads, refreshWalkDistances)', () => {
  /** Ves s cestou od obydlí k poli (z = −46) se stromy, které dorostou z keře 10. 6. */
  function withRoad(): VillageState {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const road = straightRoad(1, -55, 100, -46);
    const rooted = DAY + 9 - Math.ceil(ROAD_TREES.shrubYears * YEAR);
    s.roads = {
      nextId: 10,
      roads: [road],
      trees: road.spots.map((spot) => treeAt(spot, rooted)),
      labor: { from: DAY, days: 0, shares: [] },
    };
    return s;
  }
  const far = (s: VillageState): number =>
    s.parts.find((p) => p.cell?.x === 16)!.walkDistanceM ?? Infinity;

  it('nový úsek dostane olemování hned, změna stromů se promítne až 1. dne v měsíci', () => {
    const s = withRoad();
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    // keře – zatím nic
    expect(s.roads!.roads[0]!.lined).toEqual({ trees: 0, apples: 0 });
    const before = far(s);
    const stages = s.walkStages;
    // 15. 6. jsou to stromy, ale chůze se přepočítá až 1. 7.
    refreshWalkDistances(s, DAY + 14, LANDSCAPE, null);
    expect(s.roads!.roads[0]!.lined).toEqual({ trees: 0, apples: 0 });
    expect(far(s)).toBe(before);
    const july = dayIndexOf({ year: 600, month: 7, day: 1 });
    refreshWalkDistances(s, july, LANDSCAPE, null);
    expect(s.roads!.roads[0]!.lined!.trees).toBeGreaterThanOrEqual(0.9);
    expect(s.walkStages).not.toBe(stages);
    expect(far(s)).toBeLessThan(before);
  });

  it('bez stromů u cest klíč stadií beze změny a olemování nulové', () => {
    const s = withRoad();
    s.roads!.trees = [];
    const key = walkStageKey(s, DAY + 2);
    lineRoads(s, DAY + 2, true);
    expect(s.roads!.roads[0]!.lined).toEqual({ trees: 0, apples: 0 });
    expect(walkStageKey(s, DAY + 2)).toBe(key);
  });

  it('určí jen chybějící, 1. dne v měsíci všechny; strom odstraněný stavbou se nepočítá', () => {
    const s = withRoad();
    const july = dayIndexOf({ year: 600, month: 7, day: 1 });
    s.roads!.roads[0]!.lined = { trees: 0.2, apples: 0 };
    lineRoads(s, july, false);
    expect(s.roads!.roads[0]!.lined).toEqual({ trees: 0.2, apples: 0 });
    lineRoads(s, july, true);
    expect(s.roads!.roads[0]!.lined!.trees).toBeGreaterThanOrEqual(0.9);
    s.clearedObstacles = s.roads!.trees.map((t) => ({ id: t.id, day: july }));
    lineRoads(s, july, true);
    expect(s.roads!.roads[0]!.lined).toEqual({ trees: 0, apples: 0 });
  });
});
