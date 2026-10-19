import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { packObstacles } from '../../landscape';
import { foundOrchard, foundVillage, type OrchardSquareInput, type PartInput } from '../actions';
import { daysUntilAppleRot, daysUntilHarvest, eatDay, eatMeal, isAppleRotDay } from '../food';
import {
  firstOrchardSeason,
  nextHarvestSeason,
  orchardAgeYears,
  orchardExpectedYieldKg,
  orchardPlantingCost,
  orchardPlantingNeed,
  orchardSeason,
  orchardSeasonDay,
  orchardYear,
  orchardYieldShare,
  renewalQuota,
  squareDueForRenewal,
  squareExpectedYieldKg,
  villageOrchards,
} from '../orchard';
import { MAX_ORCHARD_CELLS, orchardPartsFromCells, type PlacementVillage } from '../placement';
import { NO_CRAFTS } from '../productivity';
import {
  APPLE_FOOD_VALUE,
  LOGS_PER_CLEARED_TREE,
  OBSTACLE_COST,
  ORCHARD,
  OUTCROP_RADIUS_M,
} from '../rules';
import { cloneState } from '../clone';
import { advanceVillage } from '../simulate';
import { claimedObstacles, woodLogs } from '../wood';
import { summarizeVillage } from '../summary';
import type { ChronicleEvent, Orchard, Position, TileCell, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION: Position = { x: 0, z: 0, rotation: 0 };
const M2_PER_HA = 10_000;

/** Startovní pole ≈ 1,7 ha (75 dílů po 225 m², úrodnost 70) – ves se uživí. */
const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/** Pole o 40 dílech (0,9 ha) – jarní práce v poli nechá výsadbě sadu práci hned v březnu. */
const LIGHT_FIELD = 40;

/** Ves s dostavěnou zemnicí a polem, dopočítaná do dne `day`. */
function village(day: number, fieldParts?: number): VillageState {
  const founded = foundVillage({
    seed: 42,
    day: day - 200,
    dwellingPosition: POSITION,
    firstField: { parts: field(fieldParts) },
  });
  return advanceVillage(withBuiltFirstDwelling(founded), day, null);
}

/** Čtverce sadu v řadě (x = 0…n−1), od obydlí 60 m a dál. */
const squares = (count: number, obstacleIds: number[] = []): OrchardSquareInput[] =>
  Array.from({ length: count }, (_, i) => ({
    cell: { x: i, y: 0 },
    areaM2: 225,
    distanceM: 60 + (i % 100),
    obstacleCost: i === 0 ? obstacleIds.length : 0,
    ...(i === 0 && obstacleIds.length > 0 ? { obstacleIds } : {}),
  }));

/** Ves se sadem, který byl vysazen v den `plantedDay` (výsadba hotová, bez stavby). */
function withOrchard(state: VillageState, count: number, plantedDay: number): VillageState {
  const next = foundOrchard(state, state.lastDay, { squares: squares(count) });
  for (const square of villageOrchards(next)[0]!.squares) {
    square.plantedDay = plantedDay;
    square.plantingDone = square.plantingCost;
  }
  next.constructions = next.constructions.filter((c) => c.kind !== 'orchard');
  return next;
}

const events = <K extends ChronicleEvent['kind']>(
  s: VillageState,
  kind: K,
): Extract<ChronicleEvent, { kind: K }>[] =>
  s.chronicle.filter((e): e is Extract<ChronicleEvent, { kind: K }> => e.kind === kind);

const ha = (count: number): number => (count * 225) / M2_PER_HA;

describe('rok sadu a úroda (orchard.md – oprava podle rešerše)', () => {
  it('první jablka 6. rok, plná úroda od 25. roku do 50., pak k nule v 60. roce', () => {
    expect(orchardYieldShare(0)).toBe(0);
    expect(orchardYieldShare(5)).toBe(0);
    expect(orchardYieldShare(6)).toBeCloseTo(1 / 20);
    expect(orchardYieldShare(15)).toBeCloseTo(0.5);
    expect(orchardYieldShare(24)).toBeCloseTo(19 / 20);
    expect(orchardYieldShare(25)).toBe(1);
    expect(orchardYieldShare(50)).toBe(1);
    expect(orchardYieldShare(51)).toBeCloseTo(0.9);
    expect(orchardYieldShare(59)).toBeCloseTo(0.1);
    expect(orchardYieldShare(60)).toBe(0);
    expect(orchardYieldShare(80)).toBe(0);
  });

  it('plná úroda ≈ 3 t jablek na hektar ≈ 430 kg obilí', () => {
    expect(ORCHARD.fullYieldKgPerHa * APPLE_FOOD_VALUE).toBeCloseTo(430, -1);
  });

  it('hospodářský rok sadu začíná 1. 3.; jarní výsadba je 1. rokem hned, podzimní od jara', () => {
    expect(orchardSeason(at(600, 2, 28))).toBe(599);
    expect(orchardSeason(at(600, 3, 1))).toBe(600);
    expect(firstOrchardSeason(at(600, 4, 10))).toBe(600);
    expect(firstOrchardSeason(at(600, 10, 10))).toBe(601);
    expect(firstOrchardSeason(at(601, 1, 10))).toBe(601);
    expect(orchardYear(at(600, 4, 10), at(600, 9, 15))).toBe(1);
    expect(orchardYear(at(600, 10, 10), at(600, 11, 15))).toBe(0);
    expect(orchardYear(at(600, 10, 10), at(601, 9, 15))).toBe(1);
    // jarní výsadba 600 plodí poprvé v září 605, podzimní 600 až v září 606
    expect(orchardYieldShare(orchardYear(at(600, 4, 10), at(605, 9, 15)))).toBeGreaterThan(0);
    expect(orchardYieldShare(orchardYear(at(600, 10, 10), at(605, 9, 15)))).toBe(0);
    expect(orchardYieldShare(orchardYear(at(600, 10, 10), at(606, 9, 15)))).toBeGreaterThan(0);
  });

  it('odhad úrody pro panel – nejbližší sklizeň (po sklizni příští rok)', () => {
    expect(nextHarvestSeason(at(605, 6, 1))).toBe(605);
    expect(nextHarvestSeason(at(605, 10, 31))).toBe(605);
    expect(nextHarvestSeason(at(605, 11, 1))).toBe(606);
    expect(nextHarvestSeason(at(606, 2, 1))).toBe(606);
    // na posledním podzimu světa bez výjimky
    expect(nextHarvestSeason(at(1499, 12, 1))).toBe(1500);
    const orchard: Orchard = {
      id: 1,
      squares: [
        {
          cell: { x: 0, y: 0 },
          areaM2: 10_000,
          distanceM: 0,
          plantingCost: 80,
          plantingDone: 80,
          plantedDay: at(600, 4, 1),
        },
      ],
    };
    expect(orchardExpectedYieldKg(orchard, at(604, 12, 1))).toBeCloseTo(3000 / 20);
    expect(orchardExpectedYieldKg(orchard, at(604, 9, 1))).toBe(0);
    expect(orchardAgeYears(orchard, at(610, 4, 2))).toBe(10);
    // panel čtverce sadu: odhad jednoho čtverce, mladší (obnovený) čtverec ještě nerodí
    const young = { ...orchard.squares[0]!, cell: { x: 1, y: 0 }, plantedDay: at(603, 4, 1) };
    expect(squareExpectedYieldKg(orchard.squares[0]!, at(604, 12, 1))).toBeCloseTo(3000 / 20);
    expect(squareExpectedYieldKg(young, at(604, 12, 1))).toBe(0);
    expect(squareExpectedYieldKg({ ...young, plantedDay: null }, at(604, 12, 1))).toBe(0);
  });

  it('výsadba 80 člověkodní na hektar + překážky', () => {
    expect(orchardPlantingCost(10_000, 0)).toBe(80);
    expect(orchardPlantingCost(225, 3)).toBeCloseTo(1.8 + 3);
  });
});

describe('jídlo s jablky (orchard.md – Jídlo)', () => {
  it('bez jablek přesně jako eatDay', () => {
    for (const [stores, need, days] of [
      [10_000, 10, 100],
      [100, 2, 100],
      [0, 5, 100],
      [500, 0, 100],
    ] as const) {
      const meal = eatDay(stores, need, days, NO_CRAFTS.pottery);
      expect(eatMeal(stores, 0, need, days, 50, NO_CRAFTS.pottery)).toEqual({
        ...meal,
        applesKg: 0,
        outlook: meal.satiation,
      });
    }
  });

  it('jablka se jí přednostně – obilí ubude jen o ztrátu ze skladování', () => {
    const r = eatMeal(1000, 700, 2, 200, 100, NO_CRAFTS.pottery);
    expect(r.satiation).toBe(1);
    expect(r.applesKg).toBeCloseTo(700 - 2 / APPLE_FOOD_VALUE);
    expect(r.storesKg).toBeCloseTo(eatDay(1000, 0, 200, NO_CRAFTS.pottery).storesKg);
  });

  it('jablka do konce února pokryjí hlad – dělí se rovně, když se stihnou sníst', () => {
    // obilí 100 kg, jablka za 100 kg obilí, potřeba 2 kg/den, 200 dní do sklizně, 150 do zkažení
    const r = eatMeal(100, 100 / APPLE_FOOD_VALUE, 2, 200, 150, NO_CRAFTS.pottery);
    expect(r.satiation).toBeCloseTo(
      (eatDay(100, 0, 200, NO_CRAFTS.pottery).storesKg + 100) / 400,
      6,
    );
    expect(r.storesKg).toBeCloseTo(eatDay(100, 0, 200, NO_CRAFTS.pottery).storesKg, 6);
  });

  it('výhled: dosyta jablky, ale obilí po 1. 3. nestačí – výhled pod 1', () => {
    // obilí 100 kg na 100 dní po zkažení při potřebě 2 kg/den → výhled ≈ 0,5
    const r = eatMeal(100, 1000 / APPLE_FOOD_VALUE, 2, 200, 100, NO_CRAFTS.pottery);
    expect(r.satiation).toBe(1);
    expect(r.outlook).toBeCloseTo(eatDay(100, 0, 200, NO_CRAFTS.pottery).storesKg / (2 * 100), 9);
    expect(eatMeal(1000, 1000 / APPLE_FOOD_VALUE, 2, 200, 100, NO_CRAFTS.pottery).outlook).toBe(1);
  });

  it('jablek víc, než se stihne sníst: do zkažení jen jablka, obilí zůstane na potom', () => {
    // obilí 0, jablka za 300 kg obilí, potřeba 2 kg/den, 200 dní do sklizně, 100 do zkažení
    const r = eatMeal(0, 300 / APPLE_FOOD_VALUE, 2, 200, 100, NO_CRAFTS.pottery);
    expect(r.satiation).toBe(1);
    // hlad bez obilí a s jablky jen na část zimy: jí se rovně do zkažení
    const short = eatMeal(0, 100 / APPLE_FOOD_VALUE, 2, 200, 100, NO_CRAFTS.pottery);
    expect(short.satiation).toBeCloseTo(0.5, 6);
    expect(short.storesKg).toBe(0);
  });

  it('jablka shnijí 1. 3. ráno – do té doby se dají jíst', () => {
    expect(daysUntilAppleRot(at(601, 2, 28))).toBe(1);
    expect(daysUntilAppleRot(at(600, 2, 28))).toBe(2); // přestupný rok
    expect(daysUntilAppleRot(at(600, 9, 1))).toBe(181);
    expect(daysUntilAppleRot(at(599, 9, 1))).toBe(182); // přestupný únor 600
    expect(daysUntilAppleRot(at(1499, 12, 31))).toBe(61); // únor 1500 přestupný, bez výjimky
    expect(isAppleRotDay(at(600, 3, 1))).toBe(true);
    expect(isAppleRotDay(at(600, 2, 29))).toBe(false);
    expect(daysUntilHarvest(at(600, 9, 1))).toBeGreaterThan(daysUntilAppleRot(at(600, 9, 1)));
  });
});

describe('orchardPartsFromCells – staví se jako pole', () => {
  // 32 políček = 480 m, políčko 0 začíná na −240 m; potok ve sloupci 31, les v rohu
  const landscape = makeLandscape({
    size: 32,
    surface: (x, y) => (x === 31 ? 'water' : x < 2 && y < 2 ? 'forest' : 'meadow'),
  });
  const home = [{ x: 0, z: 0, rotation: 0 }];
  const EMPTY: PlacementVillage = { dwellings: [], constructions: [], parts: [] };

  it('čtverce louky – plocha, vzdálenost od obydlí a cena výsadby 80 čd/ha', () => {
    // čtverec 18 má střed 37,5 m od počátku
    const result = orchardPartsFromCells(landscape, null, block(18, 18, 2, 1), home);
    expect(result.check).toEqual({ ok: true, reason: null });
    expect(result.squares).toEqual([
      { cell: { x: 18, y: 18 }, areaM2: 225, distanceM: Math.hypot(37.5, 37.5), obstacleCost: 0 },
      {
        cell: { x: 19, y: 18 },
        areaM2: 225,
        distanceM: Math.hypot(52.5, 37.5),
        obstacleCost: 0,
      },
    ]);
    expect(result.areaM2).toBe(450);
    expect(result.plantingCost).toBeCloseTo(2 * 1.8);
  });

  it('i jediný čtverec je sad (žádná nejmenší výměra)', () => {
    expect(orchardPartsFromCells(landscape, null, [{ x: 18, y: 18 }], home).check.ok).toBe(true);
  });

  it('voda, les, obydlí, hřbitov, jiný sad a vzdálenost blokují; pole ne', () => {
    const village: PlacementVillage = {
      dwellings: [{ type: 'zemnice', position: { x: 0, z: 0, rotation: 0 } }],
      constructions: [],
      parts: block(20, 20, 2, 2).map((cell) => ({ cell })),
      cemeteries: [{ squares: block(10, 20, 2, 1).map((cell) => ({ cell })) }],
      orchards: [{ squares: block(5, 20, 2, 1).map((cell) => ({ cell })) }],
    };
    const check = (cells: TileCell[], positions = home): string | null =>
      orchardPartsFromCells(landscape, village, cells, positions).check.reason;
    expect(check(block(30, 5, 2, 1))).toBe('Sad nesmí zasahovat do vody.');
    expect(check(block(1, 1, 2, 1))).toMatch(/jen na louce/);
    expect(check(block(15, 15, 2, 2))).toBe('Sad se překrývá s obydlím.');
    expect(check(block(11, 20, 2, 1))).toBe('Sad se překrývá s hřbitovem.');
    expect(check(block(6, 20, 2, 1))).toBe('Sad se překrývá s jiným sadem.');
    expect(check(block(18, 18, 1, 1), [{ x: 1000, z: 1000, rotation: 0 }])).toBe(
      'Sad je dál než 800 m od nejbližšího obydlí.',
    );
    expect(check([...block(18, 18, 1, 1), ...block(20, 18, 1, 1)])).toBe(
      'Čtverce sadu musí tvořit jeden celek – sousedit stranou.',
    );
    // na pole smí (fields.md – Pole jako krajina) – čtverec pole z pole zmizí
    const onField = orchardPartsFromCells(landscape, village, block(19, 20, 2, 1), home);
    expect(onField.check).toMatchObject({ ok: true, warning: 'Pole se zmenší' });
    expect(onField.blockedCells).toEqual([]);
    expect(onField.takenLand).toEqual([{ cell: { x: 20, y: 20 }, areaM2: 225, cellAreaM2: 225 }]);
    expect(orchardPartsFromCells(landscape, EMPTY, [{ x: 1.5, y: 2 }], home).check.reason).toBe(
      'Neplatné čtverce sadu.',
    );
    const many = Array.from({ length: MAX_ORCHARD_CELLS + 1 }, (_, i) => ({
      x: i % 32,
      y: Math.floor(i / 32),
    }));
    expect(
      orchardPartsFromCells(makeLandscape({ size: 64 }), EMPTY, many, home).check.reason,
    ).toMatch(/nejvýš/);
  });

  it('sad brání poli a hřbitovu; obydlí do sadu smí – sad se zmenší', async () => {
    const { checkDwellingPlacement, cemeteryPartsFromCells, fieldPartsFromCells } =
      await import('../placement');
    const small = makeLandscape();
    const village: PlacementVillage = {
      ...EMPTY,
      orchards: [{ squares: block(4, 10, 2, 1).map((cell) => ({ cell })) }],
    };
    const dwelling = checkDwellingPlacement(small, village, 'zemnice', {
      x: -45,
      z: 38,
      rotation: 0,
    });
    expect(dwelling).toMatchObject({ ok: true, warning: 'Sad se zmenší' });
    expect(dwelling.takenLand.map((t) => t.cell)).toEqual(block(4, 10, 2, 1));
    expect(fieldPartsFromCells(small, village, block(4, 9, 3, 2), home).check.reason).toBe(
      'Pole se překrývá se sadem.',
    );
    expect(cemeteryPartsFromCells(small, village, block(5, 10, 2, 1), home).check.reason).toBe(
      'Hřbitov se překrývá se sadem.',
    );
  });

  it('překážky zdraží výsadbu po kusech, skalní výchoz se obejde', () => {
    const small = makeLandscape();
    const layer = packObstacles(
      [
        { id: 100, kind: 'tree', look: 'beech-1', x: 3, z: 3, rotation: 0, scale: 1 },
        { id: 101, kind: 'stone', look: 'stone-1', x: 10, z: 10, rotation: 0, scale: 1 },
        { id: 103, kind: 'outcrop', look: 'rock-boulder', x: 5, z: 22, rotation: 0, scale: 1 },
      ],
      16,
      15,
    );
    const result = orchardPartsFromCells(small, null, block(8, 8, 1, 2), [POSITION], layer);
    expect(result.squares[0]).toMatchObject({
      obstacleCost: OBSTACLE_COST.tree + OBSTACLE_COST.stone,
      obstacleIds: [100, 101],
    });
    expect(result.squares[1]!.areaM2).toBeCloseTo(225 - Math.PI * OUTCROP_RADIUS_M ** 2, 6);
    expect(result.obstacleCounts).toEqual({ tree: 1, stone: 1, outcrop: 1 });
    expect(result.plantingCost).toBeCloseTo(
      orchardPlantingCost(result.areaM2, OBSTACLE_COST.tree + OBSTACLE_COST.stone),
    );
    // dospělý strom dá kládu z mýcení – ne, když ho vyhradila stavba obydlí (forest.md)
    expect(result.squares[0]!.trees).toBe(1);
    const reserved: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [],
      reservedTrees: [100],
    };
    const withReserved = orchardPartsFromCells(
      small,
      reserved,
      block(8, 8, 1, 1),
      [POSITION],
      layer,
    );
    expect(withReserved.squares[0]!.trees).toBeUndefined();
  });
});

describe('foundOrchard', () => {
  it('nový sad se čtverci, které se sázejí, a stavba ze společné práce', () => {
    const s = village(at(600, 6, 10));
    const next = foundOrchard(s, s.lastDay, { squares: squares(4, [7, 8]) });
    expect(s.orchards).toBeUndefined(); // vstup se nemění
    const orchard = villageOrchards(next)[0]!;
    expect(orchard.squares).toHaveLength(4);
    expect(orchard.squares[0]).toMatchObject({ plantedDay: null, obstacles: [7, 8] });
    expect(next.constructions.at(-1)).toMatchObject({ kind: 'orchard', orchardId: orchard.id });
    expect(next.constructions.at(-1)!.cost).toBeCloseTo(4 * 1.8 + 2);
    expect(next.applesKg).toBe(0);
  });

  it('neplatný vstup a čtverec jiného sadu odmítne', () => {
    const s = village(at(600, 6, 10));
    expect(() => foundOrchard(s, s.lastDay, { squares: [] })).toThrow(RangeError);
    const bad = [{ ...squares(1)[0]!, areaM2: Number.NaN }];
    expect(() => foundOrchard(s, s.lastDay, { squares: bad })).toThrow(RangeError);
    const twice = [...squares(1), ...squares(1)];
    expect(() => foundOrchard(s, s.lastDay, { squares: twice })).toThrow(RangeError);
    const far = [{ ...squares(1)[0]!, distanceM: 801 }];
    expect(() => foundOrchard(s, s.lastDay, { squares: far })).toThrow(RangeError);
    const one = foundOrchard(s, s.lastDay, { squares: squares(2) });
    expect(() => foundOrchard(one, one.lastDay, { squares: squares(1) })).toThrow(/sadu/);
    expect(() => foundOrchard(s, s.lastDay - 1, { squares: squares(1) })).toThrow(RangeError);
  });
});

describe('advanceVillage – sad', () => {
  it('výsadba čeká na okno (jaro, podzim) – v zimě společnou práci nebere', () => {
    // menší pole – jarní kopání (100 čd/ha) nechá na výsadbu práci už v březnu
    const s = foundOrchard(village(at(602, 1, 5), LIGHT_FIELD), at(602, 1, 5), {
      squares: squares(4),
    });
    const winter = advanceVillage(s, at(602, 2, 28), null);
    // v zimě společná práce zbývala – výsadba ji přesto nebrala
    expect(winter.commonLaborHistory.every((labor) => labor > 0.5)).toBe(true);
    expect(villageOrchards(winter)[0]!.squares.every((q) => q.plantingDone === 0)).toBe(true);
    const spring = advanceVillage(winter, at(602, 4, 30), null);
    const planted = villageOrchards(spring)[0]!.squares;
    expect(planted.every((q) => q.plantedDay !== null)).toBe(true);
    expect(planted.every((q) => dateOfDayIndex(q.plantedDay!).month === 3)).toBe(true);
  });

  it('překážky zmizí s první prací na čtverci – sazenice nestojí mezi kameny', () => {
    // velká cena čtverce (překážky 400 čd) – za jeden den se nevysadí; menší pole – jaro nechá
    // práci na výsadbu (s pojistkou zásob seje ves víc – fields.md, Osev podle zásob)
    const input = [{ ...squares(1)[0]!, obstacleCost: 400, obstacleIds: [7] }];
    const s = foundOrchard(village(at(602, 1, 5), LIGHT_FIELD), at(602, 1, 5), { squares: input });
    const spring = advanceVillage(s, at(602, 4, 30), null);
    const square = villageOrchards(spring)[0]!.squares[0]!;
    expect(square.plantingDone).toBeGreaterThan(0);
    expect(square.plantedDay).toBeNull();
    expect(square.obstacles).toBeUndefined();
    const cleared = spring.clearedObstacles?.find((c) => c.id === 7);
    expect(dateOfDayIndex(cleared!.day).month).toBeGreaterThanOrEqual(3);
  });

  it('dospělé stromy z vyklizeného čtverce dají klády jako u pole; do té doby je nekácí stavba', () => {
    const input = [{ ...squares(1)[0]!, obstacleCost: 6, obstacleIds: [7, 8], trees: 2 }];
    const s = foundOrchard(village(at(602, 1, 5), LIGHT_FIELD), at(602, 1, 5), { squares: input });
    expect(villageOrchards(s)[0]!.squares[0]!.trees).toBe(2);
    // stromy čtverce, který se ještě nezačal sázet, patří sadu – obydlí je pro dřevo nekácí
    expect([...claimedObstacles(s)]).toEqual(expect.arrayContaining([7, 8]));
    const before = woodLogs(s);
    const spring = advanceVillage(s, at(602, 4, 30), null);
    const square = villageOrchards(spring)[0]!.squares[0]!;
    expect(square.trees).toBeUndefined();
    expect(woodLogs(spring)).toBeGreaterThan(before + 2 * LOGS_PER_CLEARED_TREE * 0.9);
    expect(claimedObstacles(spring).has(7)).toBe(false);
  });

  it('výsadba od nejbližšího čtverce; překážky zmizí s výsadbou čtverce; kronika', () => {
    const s = foundOrchard(village(at(600, 6, 10)), at(600, 6, 10), {
      squares: squares(4, [7, 8]),
    });
    const summer = advanceVillage(s, at(600, 8, 31), null);
    expect(villageOrchards(summer)[0]!.squares.every((q) => q.plantingDone === 0)).toBe(true);
    expect(summer.clearedObstacles?.some((c) => c.id === 7)).toBe(false);

    // mladá ves má na podzim všechnu práci v poli – sad vysadí na jaře
    const spring = advanceVillage(summer, at(601, 4, 30), null);
    const planted = villageOrchards(spring)[0]!.squares;
    expect(planted.every((q) => q.plantedDay !== null)).toBe(true);
    const months = planted.map((q) => dateOfDayIndex(q.plantedDay!).month);
    expect(months.every((m) => [3, 4, 9, 10, 11].includes(m))).toBe(true);
    // nejbližší čtverec první (x = 0, 60 m od obydlí)
    const days = planted.map((q) => q.plantedDay!);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    // překážky zmizí, jakmile se čtverec začne sázet (nejdřív se vyklidí) – nejpozději s výsadbou
    const cleared = spring.clearedObstacles?.filter((c) => c.id === 7 || c.id === 8) ?? [];
    expect(cleared.map((c) => c.id)).toEqual([7, 8]);
    expect(cleared[0]!.day).toBe(cleared[1]!.day);
    expect(cleared[0]!.day).toBeLessThanOrEqual(days[0]!);
    expect([3, 4, 9, 10, 11]).toContain(dateOfDayIndex(cleared[0]!.day).month);
    expect(spring.constructions.some((c) => c.kind === 'orchard')).toBe(false);
    const finished = spring.chronicle.filter(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'orchard',
    );
    expect(finished).toHaveLength(1);
  });

  it('jarní výsadba 600: první jablka v září 605 (6. rok), sklizeň do zásob a kronika', () => {
    const s = foundOrchard(village(at(600, 2, 10), LIGHT_FIELD), at(600, 2, 10), {
      squares: squares(8),
    });
    const result = advanceVillage(s, at(605, 11, 1), null);
    const orchard = villageOrchards(result)[0]!;
    expect(orchard.squares.every((q) => dateOfDayIndex(q.plantedDay!).year === 600)).toBe(true);
    expect(orchard.squares.every((q) => dateOfDayIndex(q.plantedDay!).month <= 4)).toBe(true);
    const harvests = events(result, 'apple-harvest');
    expect(harvests.map((e) => dateOfDayIndex(e.day).year)).toEqual([605]);
    expect(harvests[0]!.kg).toBe(Math.round((ORCHARD.fullYieldKgPerHa * ha(8)) / 20));
  });

  it('plodící sad: sklizeň září–říjen, jablka se jí první a k 1. 3. shnijí', () => {
    const base = village(at(601, 8, 20));
    const s = withOrchard(base, 40, at(570, 4, 1)); // 32. rok sadu – plná úroda
    expect(s.orchardWork ?? null).toBeNull();
    const harvest = advanceVillage(s, at(601, 9, 1), null);
    expect(harvest.orchardWork).toMatchObject({ task: 'harvest', yieldKg: 2700 });
    expect(harvest.orchardWork!.required).toBeCloseTo(8 * ha(40) * 1, 6);

    const end = advanceVillage(s, at(601, 11, 1), null);
    expect(events(end, 'apple-harvest').at(-1)?.kg).toBe(2700);
    expect(end.orchardWork ?? null).toBeNull();
    // jablka se jedla první – obilí ubylo míň než ve vsi bez sadu
    const without = advanceVillage(base, at(601, 11, 1), null);
    expect(end.storesKg).toBeGreaterThan(without.storesKg);
    expect(end.applesKg).toBeGreaterThan(0);

    const winter = advanceVillage(end, at(601, 12, 1), null);
    expect(winter.orchardWork).toMatchObject({ task: 'care' });
    expect(winter.orchardWork!.required).toBeCloseTo(10 * ha(40), 6);
    const lastFeb = advanceVillage(winter, at(602, 2, 28), null);
    expect(lastFeb.applesKg).toBeGreaterThan(0);
    expect(lastFeb.orchardWork!.done).toBeCloseTo(lastFeb.orchardWork!.required, 6);
    const march = advanceVillage(lastFeb, at(602, 3, 1), null);
    expect(march.applesKg).toBe(0);
    expect(march.orchardWork ?? null).toBeNull();
  });

  it('sklizeň jablek má přednost před podzimními pracemi v poli (i ozimem)', () => {
    const base = village(at(601, 8, 31));
    const s = withOrchard(base, 400, at(570, 4, 1)); // 9 ha – sklizeň ≈ 72 člověkodní
    // zásoby přes rok spotřeby – ves podle zásob oseje menší plán (fields.md – Osev podle zásob),
    // první úsek od domu se tak vejde do podzimu a v plánu je i ozim
    s.storesKg = 1200;
    const day = advanceVillage(s, at(601, 9, 2), null);
    expect(day.orchardWork!.done).toBeGreaterThan(1);
    // i před ozimem – jablka se sklízejí první, ozim dostane zbytek podzimu
    expect(day.plan?.winter).toBeDefined();
    for (const work of [day.plan, day.plan?.winter]) {
      expect(work?.done.dig ?? 0).toBe(0);
      expect(work?.done.reclaim ?? 0).toBe(0);
    }
  });

  it('hlad hlásí hned, když obilí po zkažení jablek (1. 3.) nevystačí – ne až 1. 3.', () => {
    const s = village(at(601, 10, 1));
    s.storesKg = 30; // obilí na pár týdnů
    s.applesKg = 4000 / APPLE_FOOD_VALUE; // jablek víc, než se do konce února sní
    s.hungry = false;
    const next = advanceVillage(s, at(601, 10, 2), null);
    const summary = summarizeVillage(next, next.lastDay);
    // ovoce smí pokrýt nejvýš čtvrtinu energie (diet.md) – samo nenasytí; obilí se šetří na
    // dobu po zkažení jablek
    expect(next.diet!.shares.fruit).toBeCloseTo(0.25, 9);
    expect(summary.diet.energy).toBeLessThan(1);
    expect(next.hungry).toBe(true);
    expect(summary.hungry).toBe(true);
    expect(events(next, 'hunger-began').at(-1)?.day).toBe(at(601, 10, 2));
  });

  it('nesklizená jablka shnijí – málo práce, velký sad', () => {
    const base = village(at(601, 8, 31));
    const s = withOrchard(base, 1200, at(570, 4, 1)); // 27 ha – sklizeň 216 čd, ves stihne část
    const end = advanceVillage(s, at(601, 11, 1), null);
    const kg = events(end, 'apple-harvest').at(-1)!.kg;
    expect(kg).toBeGreaterThan(0);
    expect(kg).toBeLessThan(ORCHARD.fullYieldKgPerHa * ha(1200) * 0.8);
  });

  it('bez práce na obnovu sad v 60. roce dosloužil – 1. 3. zaroste loukou, kronika to zapíše', () => {
    // mladá ves zakládá pole – na podzim jde všechna práce do pole, na obnovu nezbude
    const base = village(at(599, 8, 1));
    const s = withOrchard(base, 4, at(541, 4, 1)); // 59. rok sadu v září 599
    const autumn = advanceVillage(s, at(599, 11, 1), null);
    expect(events(autumn, 'apple-harvest').at(-1)?.kg).toBe(
      Math.round(ORCHARD.fullYieldKgPerHa * ha(4) * 0.1),
    );
    const before = advanceVillage(autumn, at(600, 2, 29), null);
    // vesničané čtverec do obnovy zařadili, ale práce na něj nedošla – stojí staré stromy
    expect(events(before, 'orchard-renewal-started')).toHaveLength(1);
    const waiting = villageOrchards(before)[0]!.squares.filter((q) => q.renewal !== undefined);
    expect(waiting.map((q) => q.plantedDay)).toEqual([at(541, 4, 1)]);
    const after = advanceVillage(before, at(600, 3, 1), null);
    expect(villageOrchards(after)).toHaveLength(0);
    expect(after.constructions.some((c) => c.kind === 'orchard')).toBe(false);
    expect(events(after, 'orchard-gone')).toEqual([
      { day: at(600, 3, 1), kind: 'orchard-gone', orchardId: s.orchards![0]!.id },
    ]);
  });

  it('ves bez sadů (i uložená před sady) zůstane beze změny tvaru stavu', () => {
    const s = advanceVillage(village(at(600, 6, 10)), at(603, 6, 10), null);
    expect(s.orchards).toBeUndefined();
    expect(s.applesKg).toBeUndefined();
    expect(s.orchardWork).toBeUndefined();
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (12 let se sadem)', () => {
    const start = village(at(600, 3, 15));
    const actionDay = at(600, 7, 20);
    const end = at(612, 3, 15);
    const act = (s: VillageState): VillageState =>
      foundOrchard(s, actionDay, { squares: squares(60, [3]) });
    const whole = advanceVillage(act(advanceVillage(start, actionDay, null)), end, null);

    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    const steps = [1, 29, 400, 7, 1000, 13, 365, 2, 777, 61];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      const target = chunked.lastDay < actionDay ? actionDay : end;
      chunked = viaJson(
        advanceVillage(chunked, Math.min(target, chunked.lastDay + steps[i % steps.length]!), null),
      );
      if (chunked.lastDay === actionDay) chunked = viaJson(act(chunked));
    }
    expect(chunked).toEqual(whole);

    let daily = act(advanceVillage(start, actionDay, null));
    while (daily.lastDay < end)
      daily = advanceVillage(daily, Math.min(end, daily.lastDay + 1), null);
    expect(daily).toEqual(whole);
    // sad opravdu plodil – jinak by shoda nic neznamenala
    expect(events(whole, 'apple-harvest').length).toBeGreaterThanOrEqual(5);
  });
});

/** Usazená ves – první pole je dávno založené a v jarním i podzimním okně zbývá společná práce. */
function settledVillage(day: number): VillageState {
  return advanceVillage(village(day - 3 * 365, LIGHT_FIELD), day, null);
}

const PLANTING_MONTHS = [3, 4, 9, 10, 11];

describe('obnova sadu (orchard.md – Obnova sadu)', () => {
  it('za rok sadu nejvýš desetina čtverců, nahoru, aspoň jeden; od 50. roku sadu', () => {
    expect([1, 4, 10, 11, 20, 30, 40, 41].map(renewalQuota)).toEqual([1, 1, 1, 2, 2, 3, 4, 5]);
    const square = (plantedDay: number | null): Orchard['squares'][number] => ({
      cell: { x: 0, y: 0 },
      areaM2: 225,
      distanceM: 60,
      plantingCost: 1.8,
      plantingDone: plantedDay === null ? 0 : 1.8,
      plantedDay,
    });
    // jarní výsadba 541: 49. rok sadu v sezóně 589, 50. (poslední s plnou úrodou) od 1. 3. 590
    expect(squareDueForRenewal(square(at(541, 4, 1)), at(590, 2, 28))).toBe(false);
    expect(squareDueForRenewal(square(at(541, 4, 1)), at(590, 3, 1))).toBe(true);
    expect(squareDueForRenewal(square(null), at(700, 3, 1))).toBe(false);
    // do 60. roku zbývá na obnovu celého sadu dost let
    expect((ORCHARD.endYear - ORCHARD.declineAfterYear) * ORCHARD.renewalShareYear).toBe(1);
  });

  it('starý sad se za 10 let obnoví po desetinách, nejstarší první, a nikdy nezmizí', () => {
    const base = settledVillage(at(589, 6, 1));
    const s = withOrchard(base, 20, at(541, 4, 1));
    const orchardId = s.orchards![0]!.id;
    // druhá polovina vysazená na podzim 542 – roste od jara 543, do obnovy patří až od 592
    for (const square of s.orchards![0]!.squares.slice(10)) square.plantedDay = at(542, 10, 15);
    let current = s;
    for (let year = 590; year <= 604; year++) {
      current = advanceVillage(current, at(year, 3, 2), null);
      // sad žije celý – žádný čtverec nezarostl loukou
      expect(villageOrchards(current)).toHaveLength(1);
      expect(villageOrchards(current)[0]!.squares).toHaveLength(20);
    }
    const end = advanceVillage(current, at(604, 11, 15), null);
    expect(events(end, 'orchard-gone')).toEqual([]);
    const squaresAtEnd = villageOrchards(end)[0]!.squares;
    // všechny čtverce jsou znovu vysazené mladé stromy, sázelo se jen v oknech výsadby
    expect(squaresAtEnd.every((q) => q.plantedDay !== null && q.plantedDay >= at(590, 3, 1))).toBe(
      true,
    );
    expect(squaresAtEnd.every((q) => q.renewal === undefined)).toBe(true);
    const days = squaresAtEnd.map((q) => q.plantedDay!);
    expect(days.every((d) => PLANTING_MONTHS.includes(dateOfDayIndex(d).month))).toBe(true);
    // za rok sadu nejvýš 2 čtverce (desetina z 20)
    const perSeason = new Map<number, number>();
    for (const d of days)
      perSeason.set(orchardSeason(d), (perSeason.get(orchardSeason(d)) ?? 0) + 1);
    expect([...perSeason.values()].every((n) => n <= 2)).toBe(true);
    expect(perSeason.size).toBe(10);
    // nejstarší první: jarní výsadba 541 se obnovila celá dřív než podzimní 542
    const older = days.slice(0, 10);
    const younger = days.slice(10);
    expect(Math.max(...older)).toBeLessThanOrEqual(Math.min(...younger));
    // kronika: zahájení obnovy jednou za rok sadu – po dvou čtvercích, první hned 1. 3. 590
    const renewals = events(end, 'orchard-renewal-started');
    expect(renewals).toHaveLength(10);
    expect(renewals[0]).toEqual({
      day: at(590, 3, 1),
      kind: 'orchard-renewal-started',
      orchardId,
      squares: 2,
    });
    expect(renewals.every((e) => e.squares === 2 && e.orchardId === orchardId)).toBe(true);
    expect(renewals.every((e) => PLANTING_MONTHS.includes(dateOfDayIndex(e.day).month))).toBe(true);
    // dokončená obnova se do kroniky jako vysazený sad nepíše
    expect(
      end.chronicle.some(
        (e) => e.kind === 'construction-finished' && e.constructionKind === 'orchard',
      ),
    ).toBe(false);
    // úroda nespadla na nulu – každý podzim se něco sklidilo
    const harvestYears = events(end, 'apple-harvest').map((e) => dateOfDayIndex(e.day).year);
    expect(harvestYears).toEqual(Array.from({ length: 16 }, (_, i) => 589 + i));
  });

  it('obnova jen v oknech výsadby – starý sad (i uložený dřív) se zařadí sám v nejbližším okně', () => {
    const base = settledVillage(at(598, 6, 1));
    const s = withOrchard(base, 10, at(543, 4, 1)); // 56. rok sadu, bez údaje o obnově
    expect(s.orchards![0]!.renewedSeason).toBeUndefined();
    const summer = advanceVillage(s, at(598, 8, 31), null);
    expect(events(summer, 'orchard-renewal-started')).toEqual([]);
    expect(summer.constructions.some((c) => c.kind === 'orchard')).toBe(false);
    const autumn = advanceVillage(summer, at(598, 11, 30), null);
    const renewal = events(autumn, 'orchard-renewal-started');
    expect(renewal.map((e) => e.day)).toEqual([at(598, 9, 1)]);
    const renewed = villageOrchards(autumn)[0]!.squares.filter(
      (q) => q.plantedDay! > at(598, 3, 1),
    );
    expect(renewed).toHaveLength(1);
    expect(PLANTING_MONTHS).toContain(dateOfDayIndex(renewed[0]!.plantedDay!).month);
    // v zimě se znovu nerozhoduje – další obnova až v roce sadu 599 (od jara)
    const winter = advanceVillage(autumn, at(599, 2, 28), null);
    expect(events(winter, 'orchard-renewal-started')).toHaveLength(1);
    const spring = advanceVillage(winter, at(599, 3, 1), null);
    expect(events(spring, 'orchard-renewal-started').at(-1)?.day).toBe(at(599, 3, 1));
  });

  it('staré stromy se kácejí až po sklizni jablek; obnova stojí stejnou práci jako výsadba', () => {
    const base = settledVillage(at(598, 8, 1));
    const s = withOrchard(base, 10, at(543, 4, 1));
    const day = at(598, 9, 1);
    const started = advanceVillage(s, day - 1, null);
    // ráno 1. 9.: sklizeň se rozběhne a vesničané zařadí čtverec do obnovy
    const morning = structuredClone(started);
    orchardSeasonDay(morning, day);
    const renewal = morning.constructions.find((c) => c.kind === 'orchard')!;
    expect(renewal).toMatchObject({ renewal: true, startedDay: day, done: 0 });
    expect(renewal.cost).toBeCloseTo(orchardPlantingCost(225, 0), 9);
    expect(morning.orchardWork?.task).toBe('harvest');
    expect(orchardPlantingNeed(morning, renewal, day)).toBe(0);
    // po sklizni (hotová práce) jde obnova na řadu
    morning.orchardWork!.done = morning.orchardWork!.required;
    expect(orchardPlantingNeed(morning, renewal, day)).toBeCloseTo(orchardPlantingCost(225, 0), 9);
    // mimo okno výsadby obnova práci nebere
    expect(orchardPlantingNeed(morning, renewal, at(598, 12, 1))).toBe(0);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (obnova 590–592)', () => {
    const start = withOrchard(settledVillage(at(589, 6, 1)), 12, at(541, 4, 1));
    const end = at(592, 12, 1);
    const whole = advanceVillage(start, end, null);
    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    const steps = [1, 29, 400, 7, 1000, 13, 365, 2, 777, 61];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!), null),
      );
    }
    expect(chunked).toEqual(whole);
    let daily = start;
    while (daily.lastDay < end) daily = advanceVillage(daily, daily.lastDay + 1, null);
    expect(daily).toEqual(whole);
    // obnova opravdu běžela – jinak by shoda nic neznamenala
    expect(events(whole, 'orchard-renewal-started')).toHaveLength(3);
    expect(
      villageOrchards(whole)[0]!.squares.filter((q) => q.plantedDay! >= at(590, 3, 1)),
    ).toHaveLength(6);
  });

  it('kopie stavu (cloneState) s rozběhnutou obnovou je stejná jako structuredClone', () => {
    const base = settledVillage(at(598, 8, 1));
    const day = at(598, 9, 1);
    const morning = advanceVillage(withOrchard(base, 10, at(543, 4, 1)), day - 1, null);
    orchardSeasonDay(morning, day);
    // nová pole stavu: značka obnovy na čtverci, rok poslední obnovy sadu a stavba obnovy
    const orchard = villageOrchards(morning)[0]!;
    expect(orchard.renewedSeason).toBe(598);
    expect(orchard.squares.filter((q) => q.renewal !== undefined)).toHaveLength(1);
    expect(morning.constructions.some((c) => c.renewal === true)).toBe(true);
    const copy = cloneState(morning);
    expect(copy).toEqual(structuredClone(morning));
    copy.orchards![0]!.renewedSeason = 0;
    expect(orchard.renewedSeason).toBe(598);
  });

  it('panel: stáří sadu je průměr čtverců – obnovou sad mládne', () => {
    const s = withOrchard(settledVillage(at(589, 6, 1)), 10, at(541, 4, 1));
    const result = advanceVillage(s, at(590, 6, 1), null);
    // 9 čtverců ≈ 49 let, 1 mladý – průměr vážený plochou ≈ 44 let
    expect(summarizeVillage(result, at(590, 6, 1)).orchards[0]!.ageYears).toBe(44);
  });
});

describe('summarizeVillage – sad', () => {
  it('jablka v zásobách, sady s plochou, stářím a odhadem úrody', () => {
    const base = village(at(601, 8, 20));
    const s = advanceVillage(withOrchard(base, 40, at(590, 4, 1)), at(601, 9, 30), null);
    const summary = summarizeVillage(s, s.lastDay);
    expect(summary.applesKg).toBeGreaterThan(0);
    expect(summary.orchards).toHaveLength(1);
    const { expectedYieldKg, ...rest } = summary.orchards[0]!;
    expect(rest).toEqual({
      id: s.orchards![0]!.id,
      areaM2: 9000,
      squares: 40,
      plantedSquares: 40,
      ageYears: 11,
    });
    // sklizeň 601 je 12. rok sadu – 7/20 plné úrody
    expect(expectedYieldKg).toBeCloseTo(ORCHARD.fullYieldKgPerHa * ha(40) * (7 / 20), 6);
  });

  it('nasycení příštího dne počítá s jablky (hladová ves s jablky je sytější)', () => {
    const base = village(at(601, 10, 1));
    base.storesKg = 50;
    const hungry = summarizeVillage(base, base.lastDay).satiation;
    const withApples = { ...structuredClone(base), applesKg: 2000 };
    expect(summarizeVillage(withApples, base.lastDay).satiation).toBeGreaterThan(hungry);
    // 28. 2.: příští den jablka shnijí ráno – nepočítají se
    const feb = advanceVillage(base, at(602, 2, 28), null);
    feb.storesKg = 50;
    const febApples = { ...structuredClone(feb), applesKg: 2000 };
    expect(summarizeVillage(febApples, feb.lastDay).satiation).toBeCloseTo(
      summarizeVillage(feb, feb.lastDay).satiation,
      9,
    );
  });
});
