import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { fellTrees, obstacleChangesAt, plantOnStump } from '../../core/obstacles';
import { ROAD_SACRED, roadUpgradeOptions, startRoadUpgrade } from '../road-upgrades';
import { keepSwathsClearOfWoods, roadSwathTally, swathTally, withRoadSwaths } from '../road-swath';
import { ROAD_SWATH, TREE_REGROWTH_YEARS } from '../../rules';
import { sacredSitesOf } from '../../people/sacred';
import { advanceVillage } from '../../core/simulate';
import { addTrailRoads } from '../../paths/roads-trails';
import { trailTerrain } from '../../paths/terrain';
import { planTrail, startTrail, trailOptions, trailRoutes } from '../../trade/trail';
import type { Dwelling, Person, Road, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Průsek lesem (roads.md – Průsek lesem, trade.md – Zemská stezka; Martin, 19. 10. 2026: „Tam,
// kde zemská stezka prochází lesem, ať se les vykácí.“). Krajina testu: louka 300 × 300 m, les
// pro x < −90 (sloupce 0–3), potok z ∈ (75, 90).

const YEAR = 365.25;
const DAY = dayIndexOf({ year: 600, month: 6, day: 2 });

const place = (
  id: number,
  x: number,
  z: number,
  kind: ObstaclePlacement['kind'] = 'tree',
  look: ObstaclePlacement['look'] = 'beech-1',
): ObstaclePlacement => ({ id, kind, look, x, z, rotation: 0, scale: 1 });

/**
 * Les: buky po 4 m (x −136 … −96 – u kraje mapy terén pěšin nesahá) v řadách z = 0 (pás cesty), ±2 (strana průseku) a ±6 (mimo
 * průsek); keře v pásu; strom na louce u cesty (x −60); dubový háj (x −140 … −120, z 40 … 60).
 */
function forestLayer(): {
  layer: ObstacleLayer;
  road: number[];
  side: number[];
  outside: number[];
} {
  const placements: ObstaclePlacement[] = [];
  const road: number[] = [];
  const side: number[] = [];
  const outside: number[] = [];
  let id = 1;
  for (let x = -136; x <= -96; x += 4) {
    road.push(id);
    placements.push(place(id++, x, 0));
    for (const z of [-2, 2]) {
      side.push(id);
      placements.push(place(id++, x, z));
    }
    for (const z of [-6, 6]) {
      outside.push(id);
      placements.push(place(id++, x, z));
    }
  }
  placements.push(place(900, -60, 1));
  placements.push(place(901, -100, 1, 'shrub', 'shrub-1'));
  // dubový háj – stromy hájů se nekácí (happiness.md)
  id = 1000;
  for (let x = -140; x <= -120; x += 5) {
    for (let z = 40; z <= 60; z += 5) placements.push(place(id++, x, z, 'tree', 'oak-1'));
  }
  placements.sort((a, b) => a.id - b.id);
  return { layer: packObstacles(placements, 20, 15), road, side, outside };
}

const { layer, road: ROADBED, side: SIDE, outside: OUTSIDE } = forestLayer();

/** Ves čtyř obydlí kolem počátku. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const home = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: DAY - 2 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [home(1, 0, 0), home(2, 18, -4), home(3, -18, -4), home(4, 0, -22)];
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
  s.clearedObstacles = [];
  s.felledTrees = [];
  return s;
}

/** Pevná cesta po ose z = 0 od louky do lesa. */
function forestRoad(extra: Partial<Road> = {}): Road {
  return {
    id: 7,
    points: [
      { x: -30, z: 0 },
      { x: -150, z: 0 },
    ],
    bornDay: DAY - 20 * 365,
    grade: 'trodden',
    traffic: [5],
    spots: [],
    ground: { wet: [], fords: [] },
    ...extra,
  };
}

function withRoad(s: VillageState, road: Road = forestRoad()): VillageState {
  s.roads = {
    nextId: 50,
    roads: [road],
    trees: [],
    labor: { from: DAY, days: 0, shares: [] },
  };
  return s;
}

describe('průsek lesem – co se vykácí', () => {
  it('v lese pruh 3,5 m od osy: v pásu cesty i s pařezem, po stranách pařez zůstane', () => {
    const tally = roadSwathTally(withRoad(village()), forestRoad(), DAY, layer, LANDSCAPE);
    expect(tally.cleared).toEqual([...ROADBED, 901].sort((a, b) => a - b));
    expect(tally.felled).toEqual(SIDE);
    expect(tally.trees).toBe(ROADBED.length + SIDE.length);
    // strom 3 + pařez 2 v pásu, strom 3 po stranách, keř 0,5
    expect(tally.cost).toBeCloseTo(ROADBED.length * 5 + SIDE.length * 3 + 0.5, 6);
    // mimo pruh a na louce nic
    for (const id of [...OUTSIDE, 900]) {
      expect([...tally.cleared, ...tally.felled]).not.toContain(id);
    }
    expect(tally.sacred).toBe(false);
  });

  it('stromy u cest a jabloně se nekácí; posvátný háj v pásu cesty úpravu nedovolí', () => {
    const s = withRoad(village());
    s.roads!.trees.push({
      id: 2_000_000_000,
      spot: 1,
      x: -110,
      z: 2,
      species: 'oak',
      rootedDay: DAY - 40 * 365,
      diesDay: DAY + 100 * 365,
    });
    expect(roadSwathTally(s, forestRoad(), DAY, layer, LANDSCAPE).cleared).not.toContain(
      2_000_000_000,
    );
    const grove = [...sacredSitesOf(layer).protectedTrees];
    expect(grove.length).toBeGreaterThan(5);
    const throughGrove = forestRoad({
      points: [
        { x: -30, z: 50 },
        { x: -150, z: 50 },
      ],
    });
    const tally = swathTally(throughGrove.points, layer, LANDSCAPE, obstacleChangesAt(s, DAY));
    expect(tally.sacred).toBe(true);
    for (const id of grove) expect([...tally.cleared, ...tally.felled]).not.toContain(id);
    const blocked = withRoad(village(), throughGrove);
    const option = roadUpgradeOptions(blocked, 7, DAY, layer, undefined, LANDSCAPE)[0]!;
    expect(option.blocked).toBe(ROAD_SACRED);
  });

  it('stezka se posvátnému háji vyhne už trasou', () => {
    const grove = [...sacredSitesOf(layer).protectedTrees].map((id) => {
      const i = Array.from(layer.id).indexOf(id);
      return { x: layer.x[i]!, z: layer.z[i]! };
    });
    const routes = trailRoutes(LANDSCAPE, layer, { x: -100, z: 20 }, []);
    let checked = 0;
    for (const route of Object.values(routes)) {
      if (!route) continue;
      for (let k = 1; k < route.length; k++) {
        const a = route[k - 1]!;
        const b = route[k]!;
        for (let t = 0; t <= 10; t++) {
          const x = a.x + ((b.x - a.x) * t) / 10;
          const z = a.z + ((b.z - a.z) * t) / 10;
          for (const p of grove) {
            expect(Math.hypot(p.x - x, p.z - z)).toBeGreaterThan(ROAD_SWATH.roadbedM);
          }
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('průsek je součást vylepšení cesty', () => {
  it('cena úpravy lesem i s kácením; po dokončení vykácený průsek, klády na hromadě', () => {
    const s = withRoad(village());
    const plain = roadUpgradeOptions(s, 7, DAY, layer)[0]!;
    const withForest = roadUpgradeOptions(s, 7, DAY, layer, undefined, LANDSCAPE)[0]!;
    const tally = roadSwathTally(s, forestRoad(), DAY, layer, LANDSCAPE);
    expect(withForest.laborManDays).toBeCloseTo(plain.laborManDays + tally.cost, 6);
    expect(withForest.swathTrees).toBe(tally.trees);
    const started = startRoadUpgrade(s, DAY, 7, 'improved', layer, undefined, LANDSCAPE);
    const logs = started.woodLogs ?? 0;
    const done = advanceVillage(started, DAY + 200, layer, LANDSCAPE);
    expect(done.roads!.roads[0]).toMatchObject({ grade: 'improved', swath: true });
    const changes = obstacleChangesAt(done, done.lastDay);
    for (const id of ROADBED) expect(changes.removed).toContain(id);
    for (const id of SIDE) expect(changes.stumps).toContain(id);
    for (const id of OUTSIDE) {
      expect([...changes.removed, ...changes.stumps]).not.toContain(id);
    }
    expect(done.roads!.swath).toEqual(SIDE);
    // klády za dospělé stromy (hnijí 4 % ročně)
    expect(done.woodLogs ?? 0).toBeGreaterThan(logs + tally.trees * 0.9);
  });

  it('pařezy v průseku nedorostou ani se na ně nesází; jinde les dorůstá', () => {
    const s = withRoad(village());
    const started = startRoadUpgrade(s, DAY, 7, 'improved', layer, undefined, LANDSCAPE);
    const done = advanceVillage(started, DAY + 200, layer, LANDSCAPE);
    // strom mimo průsek pokácený na dřevo
    const felled = fellTrees(done, [OUTSIDE[0]!], done.lastDay);
    const later = done.lastDay + Math.ceil((TREE_REGROWTH_YEARS + 5) * YEAR);
    const changes = obstacleChangesAt(felled, later);
    for (const id of SIDE) expect(changes.stumps).toContain(id);
    expect(changes.stumps).not.toContain(OUTSIDE[0]);
    expect(changes.saplings).not.toContain(OUTSIDE[0]);
    expect(plantOnStump(structuredClone(done), SIDE[0]!, done.lastDay + 400)).toBe(false);
    // kácení jinde záznamy pařezů průseku nezahodí
    const again = fellTrees(felled, [OUTSIDE[1]!], later);
    for (const id of SIDE) expect(again.felledTrees!.some((f) => f.id === id)).toBe(true);
  });

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const started = startRoadUpgrade(
      withRoad(village()),
      DAY,
      7,
      'improved',
      layer,
      undefined,
      LANDSCAPE,
    );
    const whole = advanceVillage(started, DAY + 60, layer, LANDSCAPE);
    const chunked = advanceVillage(
      advanceVillage(started, DAY + 17, layer, LANDSCAPE),
      DAY + 60,
      layer,
      LANDSCAPE,
    );
    expect(chunked).toEqual(whole);
  });
});

describe('starší ves a les vsi', () => {
  it('hotová upravená cesta lesem dostane průsek při načtení jednou – bez klád', () => {
    const s = withRoad(village(), forestRoad({ grade: 'improved' }));
    const migrated = withRoadSwaths(s, layer, LANDSCAPE);
    expect(migrated.roads!.swathChecked).toBe(true);
    expect(migrated.roads!.roads[0]!.swath).toBe(true);
    expect(migrated.woodLogs ?? 0).toBe(s.woodLogs ?? 0);
    const changes = obstacleChangesAt(migrated, DAY);
    for (const id of ROADBED) expect(changes.removed).toContain(id);
    expect(withRoadSwaths(migrated, layer, LANDSCAPE)).toBe(migrated);
    // ves bez cest beze změny
    const bare = village();
    expect(withRoadSwaths(bare, layer, LANDSCAPE)).toBe(bare);
  });

  it('nový les vsi do průseku nevstoupí', () => {
    const s = withRoad(village(), forestRoad({ grade: 'improved', swath: true }));
    const wood = {
      cell: { x: 7, y: 9 },
      x: -37.5,
      z: -7.5,
      areaM2: 225,
      surface: 'meadow' as const,
      day: DAY,
    };
    s.woods = [wood];
    keepSwathsClearOfWoods(s, [wood], DAY);
    const cleared = new Set((s.clearedObstacles ?? []).map((c) => c.id));
    expect(cleared.size).toBeGreaterThan(0);
    const changes = obstacleChangesAt(s, DAY + 40 * 365);
    for (const tree of changes.added ?? []) {
      expect(Math.abs(tree.z)).toBeGreaterThan(ROAD_SWATH.halfM);
    }
  });
});

describe('zemská stezka lesem (trade.md – Zemská stezka)', () => {
  /** Les buků po 6 m (x −136 … −96, z −60 … 60) – stezka na západ jím musí projít. */
  const grid = (() => {
    const placements: ObstaclePlacement[] = [];
    let id = 1;
    for (let x = -136; x <= -96; x += 6) {
      for (let z = -60; z <= 60; z += 6) placements.push(place(id++, x, z));
    }
    return packObstacles(placements, 20, 15);
  })();
  const trailVillage = (): VillageState => {
    const s = withBuiltFirstDwelling(
      foundVillage({
        seed: 11,
        day: DAY,
        dwellingPosition: { x: 0, z: 0, rotation: -Math.PI / 2 },
      }),
    );
    s.lastDay = DAY;
    s.clearedObstacles = [];
    s.felledTrees = [];
    return s;
  };

  it('cena stezky i s průsekem; dostavěné úseky lesem mají vykácený průsek', () => {
    const s = trailVillage();
    const plan = planTrail(s, 'W', DAY, LANDSCAPE, grid);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.swathTrees).toBeGreaterThan(0);
    const option = trailOptions(s, DAY, LANDSCAPE, grid).find((o) => o.direction === 'W')!;
    expect(option.swathTrees).toBe(plan.swathTrees);
    expect(option.laborManDays).toBe(plan.laborManDays);
    let later = startTrail(s, DAY, 'W', LANDSCAPE, grid);
    for (let i = 0; i < 40 && !later.trails![0]!.builtDay; i++) {
      later = advanceVillage(later, later.lastDay + 20, grid, LANDSCAPE);
    }
    expect(later.trails![0]!.builtDay).not.toBeNull();
    const pieces = later.roads!.roads.filter((r) =>
      later.trails![0]!.pieces.some((p) => p.roadId === r.id),
    );
    expect(pieces.every((r) => r.swath === true)).toBe(true);
    const changes = obstacleChangesAt(later, later.lastDay);
    const gone = new Set([...changes.removed, ...changes.stumps]);
    // stromy u osy stezky v lese zmizely, dál od ní stojí
    const axisDistance = (x: number, z: number): number =>
      Math.min(
        ...pieces.flatMap((r) =>
          r.points.slice(1).map((b, k) => {
            const a = r.points[k]!;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const t = Math.max(
              0,
              Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
            );
            return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
          }),
        ),
      );
    let cut = 0;
    for (let i = 0; i < grid.count; i++) {
      const d = axisDistance(grid.x[i]!, grid.z[i]!);
      if (grid.x[i]! < -140 || grid.x[i]! > -100) continue;
      if (d < ROAD_SWATH.halfM - 0.01) {
        expect(gone.has(grid.id[i]!)).toBe(true);
        cut++;
      }
      if (d > ROAD_SWATH.halfM + 0.01) expect(gone.has(grid.id[i]!)).toBe(false);
    }
    expect(cut).toBeGreaterThan(0);
  });
});

describe('zemská stezka a posvátný strom v pásu cesty', () => {
  const route = (z: number): { x: number; z: number }[] =>
    Array.from({ length: 36 }, (_, i) => ({ x: -30 - i * 3, z }));
  const build = (
    road: Road | null,
    z: number,
  ): { state: VillageState; ids: number[]; sacred: (id: number) => boolean } => {
    const state = road ? withRoad(village(), road) : village();
    const sacred = (r: Road): boolean => roadSwathTally(state, r, DAY, layer, LANDSCAPE).sacred;
    const ids = addTrailRoads(
      state,
      route(z),
      DAY,
      LANDSCAPE,
      layer,
      trailTerrain(LANDSCAPE, layer),
      sacred,
    );
    return {
      state,
      ids,
      sacred: (id) => sacred(state.roads!.roads.find((r) => r.id === id)!),
    };
  };

  it('posvátný strom v pásu existující cesty, trasa sama volná: stezka dostane novou cestu vedle', () => {
    const own = forestRoad({
      points: [
        { x: -30, z: 50 },
        { x: -138, z: 50 },
      ],
    });
    const { ids, sacred } = build(own, 53);
    expect(ids).not.toContain(own.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.some(sacred)).toBe(false);
  });

  it('posvátný strom přímo v pásu trasy: nová cesta ho má v pásu (planTrail odmítne TRAIL_SACRED)', () => {
    const { ids, sacred } = build(null, 50);
    expect(ids.some(sacred)).toBe(true);
  });
});
