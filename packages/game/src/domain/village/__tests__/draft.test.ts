import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  addCartDemand,
  cartTargets,
  closeCartYear,
  oxenCows,
  oxenOverRoom,
  oxenTrainingTarget,
  oxYearCost,
  wantedOxen,
  wantedPloughPairs,
} from '../draft';
import { breedingCows } from '../husbandry';
import { LIVESTOCK } from '../livestock';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import { fourWheelSavings } from '../trade';
import { HAY, HAY_WINTER_DAYS } from '../hay';
import { OXEN } from '../rules';
import type { FieldPart, Pen, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Kolik volů a vozů ves chce (oxen.md – Kolik volů ves chce, wagons.md – Kolik vozů ves chce).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const DAY = at(600, 8, 20);

function person(id: number, years: number, dwellingId: number, day: number) {
  return { id, bornDay: day - Math.ceil(years * YEAR), dwellingId };
}

function village(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 25, 1, day),
    person(3, 25, 1, day),
    person(4, 20, 1, day),
    person(5, 19, 1, day),
    person(6, 5, 1, day),
  ];
  s.constructions = [];
  s.storesKg = 50_000;
  s.woodLogs = 10;
  s.lastDay = day;
  s.nextId = 100;
  return s;
}

/** Hotová ohrada volů o `squares` čtvercích s párem vycvičených volů. */
function oxPen(day: number, squares = 1): Pen {
  return {
    id: 900,
    species: 'team',
    cell: { x: 3, y: 4 },
    ...(squares > 1
      ? {
          extraSquares: Array.from({ length: squares - 1 }, (_, k) => ({
            cell: { x: 4 + k, y: 4 },
            x: 65 + 15 * k,
            z: 60,
          })),
        }
      : {}),
    x: 50,
    z: 60,
    builtDay: day - 800,
    oxen: [{ trainedDay: day - 10 }, { trainedDay: day - 10 }],
  };
}

function withOxPen(s: VillageState, squares = 1): VillageState {
  s.pens = [oxPen(s.lastDay, squares)];
  s.ards = 1;
  return s;
}

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

describe('ves bez ohrady volů (beze změny)', () => {
  it('nechce voly ani vozy, krávy jen na mléko, rok vozů nevede', () => {
    const s = village();
    expect(wantedPloughPairs(s)).toBe(0);
    expect(wantedOxen(s)).toBe(0);
    expect(oxenTrainingTarget(s)).toBe(0);
    expect(cartTargets(s)).toEqual({ 'two-wheel': 0, 'four-wheel': 0 });
    expect(oxenOverRoom(s)).toBe(false);
    expect(oxenCows(s)).toBe(0);
    expect(breedingCows(s)).toBe(LIVESTOCK.breedingMin);
    const next = advanceVillage(s, at(601, 1, 10), null);
    expect(next.draft).toBeUndefined();
    expect(next.ards).toBeUndefined();
    expect(summarizeVillage(next, next.lastDay).oxen).toBeNull();
  });
});

describe('krávy na obměnu volů (diet.md)', () => {
  it('3 krávy a kráva navíc na 4 voly, které ves cvičí a krmí', () => {
    const s = withOxPen(village());
    expect(oxenTrainingTarget(s)).toBe(2);
    expect(oxenCows(s)).toBeCloseTo(OXEN.minCows + 2 * OXEN.cowsPerOx, 9);
    expect(breedingCows(s)).toBeCloseTo(3.5, 9);
    // vozy chtějí 6 volů → 4,5 krávy
    s.draft = {
      lastYear: {
        from: DAY - 365,
        'two-wheel': [90, 80, 70, 60, 50, 40],
        'four-wheel': [],
        plough: [],
        oxCost: 10,
      },
    };
    expect(oxenTrainingTarget(s)).toBe(6);
    expect(breedingCows(s)).toBeCloseTo(4.5, 9);
  });
});

describe('páry k rádlům podle plánu osevu (1. 9.)', () => {
  it('malá ves chce jeden pár; ves, která osévá víc, než pár zorá, víc párů', () => {
    const small = withOxPen(village());
    small.fields = [{ id: 1 }];
    small.parts = Array.from({ length: 4 }, (_, i) => part(i + 1, { cell: { x: i, y: 0 } }));
    const planned = advanceVillage(small, at(600, 9, 2), null);
    expect(planned.draft?.ploughPairs).toBe(1);

    const big = withOxPen(village());
    big.people = Array.from({ length: 80 }, (_, i) => person(10 + i, 20 + (i % 20), 1, DAY));
    big.storesKg = 0;
    big.fields = [{ id: 1 }];
    // přílohy ve fázi louky s drnem – orba 2,5× déle
    big.parts = Array.from({ length: 60 }, (_, i) =>
      part(i + 1, {
        cell: { x: i % 10, y: Math.floor(i / 10) },
        state: 'fallow',
        sownYears: 0,
        fallowSinceDay: at(594, 9, 1),
      }),
    );
    const plannedBig = advanceVillage(big, at(600, 9, 2), null);
    expect(plannedBig.draft!.ploughPairs).toBeGreaterThan(1);
    expect(wantedOxen(plannedBig)).toBe(2 * plannedBig.draft!.ploughPairs!);
  });
});

describe('rok vozů (wagons.md – Kolik vozů ves chce)', () => {
  it('úspory dne od největší k k-tým vozům, ve dny orby zvlášť', () => {
    const s = withOxPen(village());
    addCartDemand(s, DAY, [2, 6, 4], false);
    addCartDemand(s, DAY + 1, [5], false);
    addCartDemand(s, DAY + 2, [3], true);
    expect(s.draft!.demand).toEqual({
      from: DAY,
      'two-wheel': [11, 4, 2],
      'four-wheel': [],
      plough: [3],
    });
  });

  it('1. 11. se uzavře rok dlouhý aspoň 300 dní – úspory na rok; kratší běží dál', () => {
    const s = withOxPen(village());
    addCartDemand(s, DAY, [10], false);
    closeCartYear(s, DAY + 200, 15);
    expect(s.draft!.lastYear).toBeUndefined();
    closeCartYear(s, DAY + 730, 15);
    expect(s.draft!.lastYear!['two-wheel'][0]).toBeCloseTo((10 * YEAR) / 730, 9);
    expect(s.draft!.lastYear!.oxCost).toBe(15);
    expect(s.draft!.demand).toEqual({
      from: DAY + 730,
      'two-wheel': [],
      'four-wheel': [],
      plough: [],
    });
  });

  it('vůl stojí seno přes zimu a výcvik na 10 let služby', () => {
    expect(oxYearCost(0.01)).toBeCloseTo(
      HAY.dailyKg.ox * HAY_WINTER_DAYS * 0.01 * (1 + OXEN.trainingYears / OXEN.serviceYears),
      9,
    );
  });

  it('ves s ohradou volů měří i bez vozů, co by vozy ušetřily při seči', () => {
    const day = at(600, 6, 10);
    const s = withOxPen(village(day));
    s.hay = { kg: 0, mowing: { partIds: [9, 10], required: 300, done: 0, yieldKg: 30_000 } };
    const next = advanceVillage(s, day + 10, null);
    expect(next.carts ?? []).toEqual([]);
    const demand = next.draft!.demand!;
    expect(demand.from).toBe(day + 1);
    expect(demand['two-wheel'][0]).toBeGreaterThan(0);
    // na kouscích nezávisí
    const pieces = advanceVillage(advanceVillage(s, day + 4, null), day + 10, null);
    expect(pieces).toEqual(next);
  });

  it('výprava zapíše, co by ušetřily čtyřkoláky – nosiči krát dny cesty', () => {
    // 1 600 kg obilí = 64 nosičů; čtyřkolák vezme 800 kg a jdou s ním 2 lidé
    expect(fourWheelSavings({ grain: 1600 }, {}, 4)).toEqual([(64 - 34) * 4, (34 - 4) * 4]);
    expect(fourWheelSavings({ grain: 20 }, {}, 4)).toEqual([]);
  });
});

describe('voli se nevejdou do ohrady', () => {
  it('ves chce víc volů, než pojme ohrada – upozornění, vozy a výcvik do míst', () => {
    const s = withOxPen(village());
    s.draft = {
      lastYear: {
        from: DAY - 365,
        'two-wheel': [90, 80, 70, 60, 50, 40, 30, 20],
        'four-wheel': [],
        plough: [],
        oxCost: 10,
      },
    };
    expect(wantedOxen(s)).toBe(8);
    expect(oxenOverRoom(s)).toBe(true);
    expect(cartTargets(s)).toEqual({ 'two-wheel': 6, 'four-wheel': 0 });
    expect(oxenTrainingTarget(s)).toBe(6);
    expect(summarizeVillage(s, DAY).oxen).toMatchObject({
      trained: 2,
      training: 0,
      places: 6,
      wanted: 8,
      overRoom: true,
      ploughPairs: 1,
      teams: 1,
      ards: 1,
    });
    // druhý čtverec – vejdou se
    const roomy = withOxPen(village(), 2);
    roomy.draft = s.draft;
    expect(oxenOverRoom(roomy)).toBe(false);
    expect(cartTargets(roomy)).toEqual({ 'two-wheel': 8, 'four-wheel': 0 });
  });
});
