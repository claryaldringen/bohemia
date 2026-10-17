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
  orchardSeason,
  orchardYear,
  orchardYieldShare,
  villageOrchards,
} from '../orchard';
import { MAX_ORCHARD_CELLS, orchardPartsFromCells, type PlacementVillage } from '../placement';
import { APPLE_FOOD_VALUE, OBSTACLE_COST, ORCHARD, OUTCROP_RADIUS_M } from '../rules';
import { advanceVillage } from '../simulate';
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

/** Ves s dostavěnou zemnicí a polem, dopočítaná do dne `day`. */
function village(day: number): VillageState {
  const founded = foundVillage({
    seed: 42,
    day: day - 200,
    dwellingPosition: POSITION,
    firstField: { parts: field() },
  });
  return advanceVillage(withBuiltFirstDwelling(founded), day);
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
      expect(eatMeal(stores, 0, need, days, 50)).toEqual({
        ...eatDay(stores, need, days),
        applesKg: 0,
      });
    }
  });

  it('jablka se jí přednostně – obilí ubude jen o ztrátu ze skladování', () => {
    const r = eatMeal(1000, 700, 2, 200, 100);
    expect(r.satiation).toBe(1);
    expect(r.applesKg).toBeCloseTo(700 - 2 / APPLE_FOOD_VALUE);
    expect(r.storesKg).toBeCloseTo(eatDay(1000, 0, 200).storesKg);
  });

  it('jablka do konce února pokryjí hlad – dělí se rovně, když se stihnou sníst', () => {
    // obilí 100 kg, jablka za 100 kg obilí, potřeba 2 kg/den, 200 dní do sklizně, 150 do zkažení
    const r = eatMeal(100, 100 / APPLE_FOOD_VALUE, 2, 200, 150);
    expect(r.satiation).toBeCloseTo((eatDay(100, 0, 200).storesKg + 100) / 400, 6);
    expect(r.storesKg).toBeCloseTo(eatDay(100, 0, 200).storesKg, 6);
  });

  it('jablek víc, než se stihne sníst: do zkažení jen jablka, obilí zůstane na potom', () => {
    // obilí 0, jablka za 300 kg obilí, potřeba 2 kg/den, 200 dní do sklizně, 100 do zkažení
    const r = eatMeal(0, 300 / APPLE_FOOD_VALUE, 2, 200, 100);
    expect(r.satiation).toBe(1);
    // hlad bez obilí a s jablky jen na část zimy: jí se rovně do zkažení
    const short = eatMeal(0, 100 / APPLE_FOOD_VALUE, 2, 200, 100);
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

  it('voda, les, obydlí, pole, hřbitov, jiný sad a vzdálenost blokují', () => {
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
    expect(check(block(19, 20, 2, 1))).toBe('Sad se překrývá s polem.');
    expect(check(block(11, 20, 2, 1))).toBe('Sad se překrývá s hřbitovem.');
    expect(check(block(6, 20, 2, 1))).toBe('Sad se překrývá s jiným sadem.');
    expect(check(block(18, 18, 1, 1), [{ x: 1000, z: 1000, rotation: 0 }])).toBe(
      'Sad je dál než 800 m od nejbližšího obydlí.',
    );
    expect(check([...block(18, 18, 1, 1), ...block(20, 18, 1, 1)])).toBe(
      'Čtverce sadu musí tvořit jeden celek – sousedit stranou.',
    );
    expect(
      orchardPartsFromCells(landscape, village, block(19, 20, 2, 1), home).blockedCells,
    ).toEqual([{ x: 20, y: 20 }]);
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

  it('sad brání poli, hřbitovu i obydlí', async () => {
    const { checkDwellingPlacement, cemeteryPartsFromCells, fieldPartsFromCells } =
      await import('../placement');
    const small = makeLandscape();
    const village: PlacementVillage = {
      ...EMPTY,
      orchards: [{ squares: block(4, 10, 2, 1).map((cell) => ({ cell })) }],
    };
    expect(
      checkDwellingPlacement(small, village, 'zemnice', { x: -45, z: 38, rotation: 0 }).reason,
    ).toBe('Překrývá se se sadem.');
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
        { id: 100, kind: 'tree', look: 'oak-1', x: 3, z: 3, rotation: 0, scale: 1 },
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
    const s = foundOrchard(village(at(602, 1, 5)), at(602, 1, 5), { squares: squares(4) });
    const winter = advanceVillage(s, at(602, 2, 28));
    // v zimě společná práce zbývala – výsadba ji přesto nebrala
    expect(winter.commonLaborHistory.every((labor) => labor > 0.5)).toBe(true);
    expect(villageOrchards(winter)[0]!.squares.every((q) => q.plantingDone === 0)).toBe(true);
    const spring = advanceVillage(winter, at(602, 4, 30));
    const planted = villageOrchards(spring)[0]!.squares;
    expect(planted.every((q) => q.plantedDay !== null)).toBe(true);
    expect(planted.every((q) => dateOfDayIndex(q.plantedDay!).month === 3)).toBe(true);
  });

  it('výsadba od nejbližšího čtverce; překážky zmizí s výsadbou čtverce; kronika', () => {
    const s = foundOrchard(village(at(600, 6, 10)), at(600, 6, 10), {
      squares: squares(4, [7, 8]),
    });
    const summer = advanceVillage(s, at(600, 8, 31));
    expect(villageOrchards(summer)[0]!.squares.every((q) => q.plantingDone === 0)).toBe(true);
    expect(summer.clearedObstacles?.some((c) => c.id === 7)).toBe(false);

    // mladá ves má na podzim všechnu práci v poli – sad vysadí na jaře
    const spring = advanceVillage(summer, at(601, 4, 30));
    const planted = villageOrchards(spring)[0]!.squares;
    expect(planted.every((q) => q.plantedDay !== null)).toBe(true);
    const months = planted.map((q) => dateOfDayIndex(q.plantedDay!).month);
    expect(months.every((m) => [3, 4, 9, 10, 11].includes(m))).toBe(true);
    // nejbližší čtverec první (x = 0, 60 m od obydlí)
    const days = planted.map((q) => q.plantedDay!);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(spring.clearedObstacles?.filter((c) => c.id === 7 || c.id === 8)).toEqual([
      { id: 7, day: days[0] },
      { id: 8, day: days[0] },
    ]);
    expect(spring.constructions.some((c) => c.kind === 'orchard')).toBe(false);
    const finished = spring.chronicle.filter(
      (e) => e.kind === 'construction-finished' && e.constructionKind === 'orchard',
    );
    expect(finished).toHaveLength(1);
  });

  it('jarní výsadba 600: první jablka v září 605 (6. rok), sklizeň do zásob a kronika', () => {
    const s = foundOrchard(village(at(600, 2, 10)), at(600, 2, 10), { squares: squares(8) });
    const result = advanceVillage(s, at(605, 11, 1));
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
    const harvest = advanceVillage(s, at(601, 9, 1));
    expect(harvest.orchardWork).toMatchObject({ task: 'harvest', yieldKg: 2700 });
    expect(harvest.orchardWork!.required).toBeCloseTo(8 * ha(40) * 1, 6);

    const end = advanceVillage(s, at(601, 11, 1));
    expect(events(end, 'apple-harvest').at(-1)?.kg).toBe(2700);
    expect(end.orchardWork ?? null).toBeNull();
    // jablka se jedla první – obilí ubylo míň než ve vsi bez sadu
    const without = advanceVillage(base, at(601, 11, 1));
    expect(end.storesKg).toBeGreaterThan(without.storesKg);
    expect(end.applesKg).toBeGreaterThan(0);

    const winter = advanceVillage(end, at(601, 12, 1));
    expect(winter.orchardWork).toMatchObject({ task: 'care' });
    expect(winter.orchardWork!.required).toBeCloseTo(10 * ha(40), 6);
    const lastFeb = advanceVillage(winter, at(602, 2, 28));
    expect(lastFeb.applesKg).toBeGreaterThan(0);
    expect(lastFeb.orchardWork!.done).toBeCloseTo(lastFeb.orchardWork!.required, 6);
    const march = advanceVillage(lastFeb, at(602, 3, 1));
    expect(march.applesKg).toBe(0);
    expect(march.orchardWork ?? null).toBeNull();
  });

  it('sklizeň jablek má přednost před podzimním kopáním (dřívější konec okna)', () => {
    const base = village(at(601, 8, 31));
    const s = withOrchard(base, 400, at(570, 4, 1)); // 9 ha – sklizeň ≈ 72 člověkodní
    const day = advanceVillage(s, at(601, 9, 2));
    expect(day.orchardWork!.done).toBeGreaterThan(1);
    expect(day.plan?.done.dig ?? 0).toBe(0);
    expect(day.plan?.done.reclaim ?? 0).toBe(0);
  });

  it('nesklizená jablka shnijí – málo práce, velký sad', () => {
    const base = village(at(601, 8, 31));
    const s = withOrchard(base, 1200, at(570, 4, 1)); // 27 ha – sklizeň 216 čd, ves stihne část
    const end = advanceVillage(s, at(601, 11, 1));
    const kg = events(end, 'apple-harvest').at(-1)!.kg;
    expect(kg).toBeGreaterThan(0);
    expect(kg).toBeLessThan(ORCHARD.fullYieldKgPerHa * ha(1200) * 0.8);
  });

  it('v 60. roce sad dosloužil – 1. 3. zaroste loukou a kronika to zapíše', () => {
    const base = village(at(599, 8, 1));
    const s = withOrchard(base, 4, at(541, 4, 1)); // 59. rok sadu v září 599
    const autumn = advanceVillage(s, at(599, 11, 1));
    expect(events(autumn, 'apple-harvest').at(-1)?.kg).toBe(
      Math.round(ORCHARD.fullYieldKgPerHa * ha(4) * 0.1),
    );
    const before = advanceVillage(autumn, at(600, 2, 29));
    expect(villageOrchards(before)).toHaveLength(1);
    const after = advanceVillage(before, at(600, 3, 1));
    expect(villageOrchards(after)).toHaveLength(0);
    expect(events(after, 'orchard-gone')).toEqual([
      { day: at(600, 3, 1), kind: 'orchard-gone', orchardId: s.orchards![0]!.id },
    ]);
  });

  it('ves bez sadů (i uložená před sady) zůstane beze změny tvaru stavu', () => {
    const s = advanceVillage(village(at(600, 6, 10)), at(603, 6, 10));
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
    const whole = advanceVillage(act(advanceVillage(start, actionDay)), end);

    const viaJson = (s: VillageState): VillageState =>
      JSON.parse(JSON.stringify(s)) as VillageState;
    const steps = [1, 29, 400, 7, 1000, 13, 365, 2, 777, 61];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      const target = chunked.lastDay < actionDay ? actionDay : end;
      chunked = viaJson(
        advanceVillage(chunked, Math.min(target, chunked.lastDay + steps[i % steps.length]!)),
      );
      if (chunked.lastDay === actionDay) chunked = viaJson(act(chunked));
    }
    expect(chunked).toEqual(whole);

    let daily = act(advanceVillage(start, actionDay));
    while (daily.lastDay < end) daily = advanceVillage(daily, Math.min(end, daily.lastDay + 1));
    expect(daily).toEqual(whole);
    // sad opravdu plodil – jinak by shoda nic neznamenala
    expect(events(whole, 'apple-harvest').length).toBeGreaterThanOrEqual(5);
  });
});

describe('summarizeVillage – sad', () => {
  it('jablka v zásobách, sady s plochou, stářím a odhadem úrody', () => {
    const base = village(at(601, 8, 20));
    const s = advanceVillage(withOrchard(base, 40, at(590, 4, 1)), at(601, 9, 30));
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
    const feb = advanceVillage(base, at(602, 2, 28));
    feb.storesKg = 50;
    const febApples = { ...structuredClone(feb), applesKg: 2000 };
    expect(summarizeVillage(febApples, feb.lastDay).satiation).toBeCloseTo(
      summarizeVillage(feb, feb.lastDay).satiation,
      9,
    );
  });
});
