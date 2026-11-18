import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { obstaclesOf } from '../../../landscape';
import { foundField, foundVillage, type PartInput } from '../../core/actions';
import { obstacleChangesAt } from '../../core/obstacles';
import {
  roadAppleHarvestWork,
  roadAppleYieldKg,
  roadApplePlantingWork,
} from '../../buildings/orchard';
import { updateRoads } from '../../paths/roads';
import { roadAppleSpots, roadApplesNeed, roadApplesOption, startRoadApples } from '../road-apples';
import { ROAD_TREE_ID_BASE, roadAppleObstacleKind, roadAppleStage } from '../road-trees';
import { ROAD_APPLES, TAKEN_LAND_TREE_M2 } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Dwelling, Person, Road, RoadApple, TileCell, VillageState } from '../../types';
import { block } from '../../__tests__/placement-fixtures';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Jabloně podél pevné cesty (roads.md – Vysazení jabloní). Krajina testu: louka 300 × 300 m,
// potok z ∈ (75, 90), les x < −90; úsek stranou vsi po z = −120.

const YEAR = 365.25;
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 6, 1);
const LAYER = obstaclesOf(LANDSCAPE);

function village(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const home = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 2 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [home(1, 0, 0), home(2, 18, -4), home(3, -18, -4), home(4, 0, -22)];
  s.people = [1, 2, 3, 4].flatMap((d) =>
    [30, 28, 22, 20].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: day - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = day;
  const road: Road = {
    id: 5,
    points: [
      { x: -60, z: -120 },
      { x: 130, z: -120 },
    ],
    bornDay: day - 20 * 365,
    grade: 'improved',
    traffic: [5],
    spots: [],
    ground: { wet: [], fords: [] },
  };
  s.roads = {
    nextId: 50,
    roads: [road],
    trees: [],
    labor: { from: day, days: 0, shares: [] },
  };
  return s;
}

const apple = (extra: Partial<RoadApple> = {}): RoadApple => ({
  id: ROAD_TREE_ID_BASE + 900,
  roadId: 5,
  x: 0,
  z: -117,
  distanceM: 117,
  plantedDay: DAY - 10 * 365,
  ...extra,
});

describe('jabloně podél cesty – místa a výsadba', () => {
  it('po 10 m střídavě po obou stranách, ne u stromu u cesty', () => {
    const s = village();
    const spots = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    // 190 m úseku bez konců – jabloň po ≈ 10 m
    expect(spots.length).toBeGreaterThan(14);
    expect(spots.length).toBeLessThan(20);
    expect(spots.some((p) => p.z > -120) && spots.some((p) => p.z < -120)).toBe(true);
    for (const p of spots) {
      expect(Math.abs(p.z + 120)).toBeGreaterThanOrEqual(ROAD_APPLES.offsetM.from - 1e-9);
      expect(Math.abs(p.z + 120)).toBeLessThanOrEqual(ROAD_APPLES.offsetM.to + 1e-9);
    }
    // kde stojí strom u cesty, jabloň nebude
    const first = spots[0]!;
    s.roads!.trees.push({
      id: ROAD_TREE_ID_BASE + 1,
      spot: 1,
      x: first.x,
      z: first.z,
      species: 'oak',
      rootedDay: DAY - 3000,
      diesDay: DAY + 30000,
    });
    const again = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    for (const p of again) {
      expect(Math.hypot(p.x - first.x, p.z - first.z)).toBeGreaterThanOrEqual(
        ROAD_APPLES.treeClearM,
      );
    }
  });

  it('výsadba je stavba – jen v oknech jara a podzimu, jabloně dostanou den výsadby', () => {
    const s = village();
    const option = roadApplesOption(s, 5, DAY, LANDSCAPE, LAYER)!;
    expect(option.blocked).toBeNull();
    expect(option.laborManDays).toBeCloseTo(option.trees * roadApplePlantingWork(), 1);
    expect(roadApplePlantingWork()).toBeCloseTo(0.45, 1);
    const started = startRoadApples(s, DAY, 5, LANDSCAPE, LAYER);
    const c = started.constructions.at(-1)!;
    expect(c).toMatchObject({ kind: 'road-apples', roadIds: [5] });
    expect(started.roads!.apples!.every((a) => a.plantedDay === null)).toBe(true);
    // v červnu se nesází, v září ano
    expect(roadApplesNeed(c, DAY)).toBe(0);
    expect(roadApplesNeed(c, at(600, 9, 10))).toBeGreaterThan(0);
    expect(roadApplesOption(started, 5, DAY, LANDSCAPE, LAYER)!.blocked).toMatch(/sázejí/);
    const autumn = advanceVillage(started, at(600, 10, 20), LAYER);
    expect(autumn.roads!.apples!.every((a) => a.plantedDay !== null)).toBe(true);
    expect(autumn.constructions.some((x) => x.kind === 'road-apples')).toBe(false);
    expect(autumn.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'construction-finished', constructionKind: 'road-apples' }),
    );
    // znovu: místa jsou zabraná – nic dalšího
    expect(roadApplesOption(autumn, 5, autumn.lastDay, LANDSCAPE, LAYER)!.blocked).toMatch(
      /volné místo/,
    );
  }, 60_000);
});

describe('jabloně podél cesty – místo mezi stojícími jabloněmi (D8)', () => {
  it('řada vysázená jinak než rastr 10 m nezablokuje nabídku, když mezi jabloněmi místo je', () => {
    const s = village();
    // stojící jabloně každých 20 m, posunuté o 5 m proti a na ose rastru – každé místo rastru je od některé
    // blíž než 8 m, mezi jabloněmi (10 m od obou) ale místo zůstává
    const grid = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    s.roads!.apples = grid
      .filter((_, k) => k % 2 === 0)
      .map((p, k) =>
        apple({ id: ROAD_TREE_ID_BASE + 900 + k, x: p.x + 5, z: -120, distanceM: p.x + 60 }),
      );
    const spots = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    expect(spots.length).toBeGreaterThan(0);
    const option = roadApplesOption(s, 5, DAY, LANDSCAPE, LAYER)!;
    expect(option.blocked).toBeNull();
    for (const p of spots) {
      for (const a of s.roads!.apples!) {
        expect(Math.hypot(p.x - a.x, p.z - a.z)).toBeGreaterThanOrEqual(ROAD_APPLES.gapM);
      }
    }
  });
});

describe('jabloně podél cesty – úroda, život, překážka', () => {
  it('plody od 6. roku, ≈ 17 kg na strom při plné úrodě, sklizeň jako sad', () => {
    expect(roadAppleYieldKg(apple({ plantedDay: at(600, 4, 1) }), at(603, 9, 1))).toBe(0);
    const full = roadAppleYieldKg(apple({ plantedDay: at(570, 4, 1) }), at(600, 9, 1));
    expect(full).toBeCloseTo(3000 / ROAD_APPLES.treesPerHa, 6);
    expect(full).toBeGreaterThan(16);
    expect(full).toBeLessThan(17.5);
    expect(
      roadAppleHarvestWork(apple({ plantedDay: at(570, 4, 1) }), at(600, 9, 1)),
    ).toBeGreaterThan(0);
  });

  it('sklizeň v září–říjnu přidá jablka do zásob, práce u úseku cesty', () => {
    const s = village(at(600, 8, 25));
    s.roads!.apples = Array.from({ length: 20 }, (_, k) =>
      apple({ id: ROAD_TREE_ID_BASE + 900 + k, x: -50 + k * 9, plantedDay: at(570, 4, 1) }),
    );
    s.applesKg = 0;
    // první den sklizně – 20 stromů ves otrhá za den
    const first = advanceVillage(s, at(600, 9, 1), LAYER);
    expect(first.orchardWork?.task).toBe('harvest');
    const shares = first.labor?.shares ?? [];
    expect(shares.some((x) => x.target.kind === 'road' && x.activity === 'orchard-harvest')).toBe(
      true,
    );
    // 20 × ≈ 16,7 kg, něco už ves snědla – jablka se jedí hned, bez stropu před obilím (diet.md –
    // Strava po vrstvách a porážka celý rok)
    expect(first.applesKg ?? 0).toBeGreaterThan(200);
    const later = advanceVillage(first, at(600, 9, 3), LAYER);
    expect(later.diet!.shares.fruit).toBeGreaterThan(0);
    expect(later.applesKg ?? 0).toBeLessThan(first.applesKg ?? 0);
  }, 60_000);

  it('strom do 60 let, pak souš 10 let a místo je volné; stavba přes jabloň ji odstraní', () => {
    const planted = at(500, 4, 1);
    expect(roadAppleStage(apple({ plantedDay: null }), DAY)).toBe('planting');
    expect(roadAppleStage(apple({ plantedDay: planted }), planted + 59 * 365)).toBe('tree');
    expect(roadAppleStage(apple({ plantedDay: planted }), planted + 65 * 365)).toBe('snag');
    expect(roadAppleStage(apple({ plantedDay: planted }), planted + 71 * 365)).toBeNull();
    expect(roadAppleObstacleKind(apple({ plantedDay: DAY - 5 * 365 }), DAY)).toBe('youngTree');
    expect(roadAppleObstacleKind(apple({ plantedDay: DAY - 30 * 365 }), DAY)).toBe('tree');
    const s = village();
    s.roads!.apples = [apple(), apple({ id: ROAD_TREE_ID_BASE + 901, plantedDay: DAY - 80 * 365 })];
    expect(obstacleChangesAt(s, DAY).added).toEqual([
      { id: ROAD_TREE_ID_BASE + 900, x: 0, z: -117, kind: 'youngTree' },
    ]);
    // roční kontrola: zmizelá souš pryč, odstraněná stavbou pryč
    s.clearedObstacles = [{ id: ROAD_TREE_ID_BASE + 900, day: DAY }];
    updateRoads(s, at(600, 11, 1), LANDSCAPE, null);
    expect(s.roads!.apples).toEqual([]);
  });

  it('u jabloně se strom u cesty neuchytí', () => {
    const s = village();
    s.roads!.roads[0]!.spots = [{ id: 7, x: 0, z: -116.5 }];
    s.roads!.apples = [apple({ x: 0, z: -117 })];
    for (let year = 600; year < 640; year++) updateRoads(s, at(year, 11, 1), LANDSCAPE, null);
    expect(s.roads!.trees.filter((t) => t.spot === 7)).toEqual([]);
  });
});

describe('jabloně a stromy u cesty na poli (fields.md – Pole jako krajina)', () => {
  // pole podél úseku: čtverce x 6–9 (svět −60 … 0), řádky 1–2 (z −135 … −105) – cesta po z = −120
  const fieldParts = (cells: TileCell[]): PartInput[] =>
    cells.map((cell) => ({
      areaM2: 225,
      distanceM: 120,
      naturalFertility: 60,
      surface: 'meadow',
      obstacleCost: 0,
      cell,
    }));
  const withField = (): VillageState => {
    const s = village();
    return foundField(s, s.lastDay, { parts: fieldParts(block(6, 1, 4, 2)) });
  };
  const onField = (p: { x: number; z: number }): boolean => p.x >= -60 && p.x < 0;
  const partArea = (s: VillageState, x: number, z: number): number | undefined =>
    s.parts.find(
      (q) => q.cell?.x === Math.floor((x + 150) / 15) && q.cell.y === Math.floor((z + 150) / 15),
    )?.areaM2;

  it('jabloně smí na pole – každá vezme dílu 20 m², nabídka varuje „Pole se zmenší“', () => {
    const s = withField();
    const spots = roadAppleSpots(s, 5, DAY, LANDSCAPE, LAYER);
    const fieldSpots = spots.filter(onField);
    expect(fieldSpots.length).toBeGreaterThan(3);
    expect(roadApplesOption(s, 5, DAY, LANDSCAPE, LAYER)!.warning).toBe('Pole se zmenší');
    const started = startRoadApples(s, DAY, 5, LANDSCAPE, LAYER);
    const lost =
      s.parts.reduce((sum, p) => sum + p.areaM2, 0) -
      started.parts.reduce((sum, p) => sum + p.areaM2, 0);
    expect(lost).toBeCloseTo(fieldSpots.length * TAKEN_LAND_TREE_M2, 9);
    expect(started.chronicle.at(-1)).toMatchObject({
      kind: 'land-taken',
      land: 'field',
      by: 'road-apples',
      gone: false,
    });
    // jabloně mimo pole poli nic neberou
    expect(roadApplesOption(village(), 5, DAY, LANDSCAPE, LAYER)!.warning).toBeNull();
  });

  it('strom u cesty se uchytí i na mezi u pole – vezme dílu 20 m²', () => {
    const s = withField();
    s.roads!.roads[0]!.spots = [{ id: 7, x: -30, z: -117 }];
    const before = partArea(s, -30, -117)!;
    let year = 600;
    while (!s.roads!.trees.some((t) => t.spot === 7) && year < 700) {
      updateRoads(s, at(year++, 11, 1), LANDSCAPE, null);
    }
    expect(s.roads!.trees.some((t) => t.spot === 7)).toBe(true);
    expect(partArea(s, -30, -117)).toBeCloseTo(before - TAKEN_LAND_TREE_M2, 9);
    expect(s.chronicle.at(-1)).toMatchObject({ kind: 'land-taken', by: 'road-trees' });
  });
});
