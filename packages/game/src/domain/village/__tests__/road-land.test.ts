import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { foundField, foundVillage, type PartInput } from '../actions';
import { giveWayToRoads } from '../land-taken';
import {
  fieldFrame,
  roadCutAt,
  roadLand,
  roadLandWidthM,
  type FieldFrame,
  type RoadLandRoad,
} from '../paths/road-land';
import { roadFieldsDay, roadLandKey, villageRoadLand } from '../road-fields';
import { ROAD_LAND } from '../rules';
import { advanceVillage } from '../simulate';
import type { Dwelling, Person, Road, TileCell, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { block } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Cesta ubírá poli plochu (roads.md a fields.md – Cesta přes pole; Martin, 19. 10. 2026: „Ano má.
// Ono to stejně ve výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude
// pak moci vzniknout takový růžek…“).

/** Rám bez natočení – čtverec (0, 0) leží na [0, 15] × [0, 15]. */
const FRAME: FieldFrame = { x: 7.5, z: 7.5, c: 1, s: 0, size: 15 };
const CELL_M2 = (15 / ROAD_LAND.cells) * (15 / ROAD_LAND.cells);

const field = (
  cells: TileCell[],
  frame = FRAME,
): { frame: FieldFrame; squares: { id: number; cell: TileCell }[] } => ({
  frame,
  squares: cells.map((cell, k) => ({ id: k + 1, cell })),
});
const line = (
  points: [number, number][],
  grade: Road['grade'] = 'trodden',
  cart = false,
): RoadLandRoad => ({
  points: points.map(([x, z]) => ({ x, z })),
  grade,
  ...(cart ? { cart } : {}),
});

describe('co pevná cesta vezme poli (roadLand)', () => {
  it('pás cesty v šířce obtisku – vyšlapaná, vozová, upravená', () => {
    expect(roadLandWidthM({ grade: 'trodden' })).toBe(1.9);
    expect(roadLandWidthM({ grade: 'trodden', cart: true })).toBe(2.6);
    expect(roadLandWidthM({ grade: 'improved' })).toBe(3);
    // cesta středem pole 3 × 1 – každému čtverci pás 15 m (4 řady buněk po 0,5 m = 2 m)
    const land = roadLand(
      [field(block(0, 0, 3, 1))],
      [
        line([
          [-10, 7.5],
          [55, 7.5],
        ]),
      ],
    );
    expect([...land.keys()]).toEqual([1, 2, 3]);
    for (const v of land.values()) {
      expect(v.roadM2).toBe(4 * 30 * CELL_M2);
      // obě půlky jsou velké a široké – obdělávají se
      expect(v.cutM2).toBe(0);
      expect(v.cut).toBeNull();
    }
    const wide = roadLand(
      [field(block(0, 0, 3, 1))],
      [
        line(
          [
            [-10, 7.5],
            [55, 7.5],
          ],
          'improved',
        ),
      ],
    );
    expect(wide.get(2)!.roadM2).toBe(6 * 30 * CELL_M2);
  });

  it('bez cest nebo mimo pole nic', () => {
    expect(roadLand([field(block(0, 0, 2, 2))], []).size).toBe(0);
    expect(
      roadLand(
        [field(block(0, 0, 2, 2))],
        [
          line([
            [0, 60],
            [30, 60],
          ]),
        ],
      ).size,
    ).toBe(0);
  });

  it('růžek za cestou, kam se nevejde obrat spřežení, zůstane loukou', () => {
    // pole 2 × 2 (0–30 m), cesta šikmo přes roh: x + z = 52 – trojúhelník za ní s odvěsnami 8 m
    const land = roadLand(
      [field(block(0, 0, 2, 2))],
      [
        line([
          [10, 42],
          [42, 10],
        ]),
      ],
    );
    const corner = land.get(4)!;
    expect(corner.cutM2).toBeGreaterThan(5);
    expect(corner.cutM2).toBeLessThan(32);
    // oddělená buňka leží za cestou (v rohu), před cestou ne
    expect(roadCutAt(corner.cut, 29, 29)).toBe(true);
    expect(roadCutAt(corner.cut, 0, 0)).toBe(false);
    for (const id of [1, 2, 3]) expect(land.get(id)?.cutM2 ?? 0).toBe(0);
    // větší kus za cestou (x + z = 40 – odvěsny 20 m) se obdělává dál
    const big = roadLand(
      [field(block(0, 0, 2, 2))],
      [
        line([
          [0, 40],
          [40, 0],
        ]),
      ],
    );
    for (const v of big.values()) expect(v.cutM2).toBe(0);
  });

  it('proužek užší než 3 m mezi cestou a okrajem pole zůstane loukou, i když je dlouhý', () => {
    // pole 8 × 1 (0–120 m), cesta 2,5 m od okraje: proužek 1,55 m × 120 m
    const land = roadLand(
      [field(block(0, 0, 8, 1))],
      [
        line([
          [-10, 12.5],
          [130, 12.5],
        ]),
      ],
    );
    let cut = 0;
    for (const v of land.values()) cut += v.cutM2;
    expect(cut).toBe(3 * 240 * CELL_M2);
    expect(cut).toBeGreaterThan(ROAD_LAND.cornerMinM2);
    // bez cesty přes okraj (končí uvnitř pole) proužek navazuje na pole – obdělává se
    const open = roadLand(
      [field(block(0, 0, 8, 1))],
      [
        line([
          [-10, 12.5],
          [100, 12.5],
        ]),
      ],
    );
    for (const v of open.values()) expect(v.cutM2).toBe(0);
  });

  it('kus oddělený cestou, který navazuje na další čtverce pole, se obdělává', () => {
    // cesta přes roh čtverce 2 pole 2 × 2 – kousek za ní navazuje na čtverec 4
    const land = roadLand(
      [field(block(0, 0, 2, 2))],
      [
        line([
          [25, -5],
          [35, 5],
        ]),
      ],
    );
    for (const v of land.values()) expect(v.cutM2).toBe(0);
  });

  it('plácek rozcestí vezme víc než samotné pásy', () => {
    const arms: RoadLandRoad[] = [
      line([
        [7.5, 7.5],
        [7.5, 40],
      ]),
      line([
        [7.5, 7.5],
        [40, 7.5],
      ]),
      line([
        [7.5, 7.5],
        [-20, -20],
      ]),
    ];
    const one = roadLand([field(block(0, 0, 1, 1))], arms).get(1)!.roadM2;
    const two = roadLand([field(block(0, 0, 1, 1))], arms.slice(0, 2)).get(1)!.roadM2;
    expect(one - two).toBeGreaterThan(10);
  });

  it('natočené pole – pás stejně široký v mřížce pole', () => {
    const grid = { x: 0, z: 0, rotation: Math.PI / 6 };
    const frame = fieldFrame(LANDSCAPE, grid);
    // cesta podél osy u mřížky pole přes čtverce (0, 0) a (1, 0) – směr (cos, −sin)
    const [c, s] = [frame.c, frame.s];
    const at = (u: number): [number, number] => [u * c, -u * s];
    const land = roadLand([field(block(0, 0, 2, 1), frame)], [line([at(-20), at(40)])]);
    expect(land.get(1)!.roadM2).toBe(4 * 30 * CELL_M2);
    expect(land.get(2)!.roadM2).toBe(4 * 30 * CELL_M2);
  });
});

const YEAR = 365.25;
const DAY = dayIndexOf({ year: 600, month: 6, day: 2 });
const LAYER = obstaclesOf(LANDSCAPE);

/** Ves čtyř obydlí kolem počátku s polem x −60 … 0, z −135 … −105 (čtverce 6–9, řádky 1–2). */
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
  const parts = block(6, 1, 4, 2).map((cell): PartInput => ({
    areaM2: 225,
    distanceM: 120,
    naturalFertility: 60,
    surface: 'meadow',
    obstacleCost: 0,
    cell,
  }));
  const withField = foundField(s, DAY, { parts });
  for (const p of withField.parts) {
    p.state = 'ready';
    p.foundingDone = p.foundingCost;
  }
  withField.constructions = [];
  // pevná cesta středem řádku 2 (z = −112,5) přes celé pole
  const road: Road = {
    id: 5,
    points: [
      { x: -75, z: -112.5 },
      { x: 15, z: -112.5 },
    ],
    bornDay: DAY - 20 * 365,
    grade: 'trodden',
    traffic: [5],
    spots: [],
    ground: { wet: [], fords: [] },
  };
  withField.roads = {
    nextId: 50,
    roads: [road],
    trees: [],
    candidates: [],
    labor: { from: DAY, days: 0, shares: [] },
  };
  return withField;
}

const area = (s: VillageState): number => s.parts.reduce((sum, p) => sum + p.areaM2, 0);

describe('pole ustoupí pevné cestě ve vsi', () => {
  it('díly pod cestou se zmenší o pás; zarostlá cesta půdu vrátí', () => {
    const s = village();
    const land = villageRoadLand(s, LANDSCAPE);
    expect([...land.values()].every((v) => v.roadM2 === 30 && v.cutM2 === 0)).toBe(true);
    const next = advanceVillage(s, DAY + 1, LAYER, LANDSCAPE);
    const row2 = next.parts.filter((p) => p.cell!.y === 2);
    expect(row2.map((p) => [p.areaM2, p.roadM2])).toEqual(row2.map(() => [195, 30]));
    expect(next.parts.filter((p) => p.cell!.y === 1).every((p) => p.areaM2 === 225)).toBe(true);
    expect(next.parts.every((p) => p.roadCut === undefined)).toBe(true);
    expect(next.roadLandKey).toBe(roadLandKey(next));
    expect(next.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'land-taken', by: 'road', areaM2: 120, gone: false }),
    );
    // cesta zmizela – půda se vrátí
    next.roads!.roads = [];
    roadFieldsDay(next, DAY + 2, LANDSCAPE);
    expect(area(next)).toBe(8 * 225);
    expect(next.parts.every((p) => p.roadM2 === undefined)).toBe(true);
  });

  it('upravená cesta vezme víc; oddělený růžek se zapíše do dílu (scéna ho nekreslí)', () => {
    const s = village();
    s.roads!.roads[0]!.grade = 'improved';
    // druhá cesta přes roh pole (x −60 … −45, z −135 … −120) – růžek za ní
    s.roads!.roads.push({
      ...s.roads!.roads[0]!,
      id: 6,
      grade: 'trodden',
      points: [
        { x: -70, z: -117 },
        { x: -47, z: -140 },
      ],
    });
    roadFieldsDay(s, DAY, LANDSCAPE);
    const row2 = s.parts.filter((p) => p.cell!.y === 2);
    expect(row2.every((p) => p.roadM2 === 45)).toBe(true);
    const corner = s.parts.find((p) => p.cell!.x === 6 && p.cell!.y === 1)!;
    expect(corner.roadCut).toBeDefined();
    expect(roadCutAt(corner.roadCut, 0, 0)).toBe(true);
    expect(corner.areaM2 + corner.roadM2!).toBe(225);
  });

  it('díl, kterému cesty vezmou víc než 80 % políčka, zmizí jako pod stavbou', () => {
    const s = village();
    const id = s.parts[0]!.id;
    giveWayToRoads(s, DAY, new Map([[id, { roadM2: 200, cutM2: 0, cut: null }]]), 225);
    expect(s.parts.some((p) => p.id === id)).toBe(false);
    expect(s.chronicle.at(-1)).toMatchObject({ kind: 'land-taken', by: 'road', gone: false });
  });

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const whole = advanceVillage(village(), DAY + 40, LAYER, LANDSCAPE);
    const first = advanceVillage(village(), DAY + 13, LAYER, LANDSCAPE);
    const chunked = advanceVillage(first, DAY + 40, LAYER, LANDSCAPE);
    expect(chunked).toEqual(whole);
  });

  it('ves bez cest se nemění (ani otisk se neukládá)', () => {
    const s = village();
    delete s.roads;
    roadFieldsDay(s, DAY, LANDSCAPE);
    expect(s.roadLandKey).toBeUndefined();
    expect(area(s)).toBe(8 * 225);
  });
});
