import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  addCartDemand,
  cartDayValue,
  cartTargets,
  nextPloughPairs,
  closeCartYear,
  oxenCows,
  oxenOverRoom,
  oxenTrainingTarget,
  oxYearCost,
  wantedOxen,
  wantedPloughPairs,
} from '../draft';
import { breedingCows, oxenCalvesWanted } from '../husbandry';
import { LIVESTOCK } from '../livestock';
import { withFourWheelReach } from '../carts';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import { fourWheelSavings } from '../trade';
import { HAY, HAY_WINTER_DAYS } from '../hay';
import { OXEN } from '../rules';
import type { CartYear, FieldPart, Pen, VillageState } from '../types';
import { withBuiltFirstDwelling, withRoomyPens } from './village-fixtures';

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
  it('krávy na mléko a k nim 3 krávy a půl krávy na každého vola, kterého ves chce (cíl krav podle volů)', () => {
    const s = withOxPen(village());
    expect(OXEN.cowsPerOx).toBe(0.5);
    expect(oxenTrainingTarget(s)).toBe(2);
    expect(oxenCows(s)).toBeCloseTo(OXEN.minCows + 2 * OXEN.cowsPerOx, 9);
    // jedna domácnost – půl krávy na mléko, k ní krávy na voly (Martin 20. 10. 2026: „Dejme
    // možnost 1.“ – dřív víc z obojího)
    expect(breedingCows(s)).toBeCloseTo(0.5 + 4, 9);
    // vozy chtějí 6 volů → 0,5 + 3 + 3 krávy
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
    expect(breedingCows(s)).toBeCloseTo(6.5, 9);
  });

  it('ves, která chce víc volů, si při porážce nechá víc krav (Martin 20. 10. 2026: „Dejme možnost 1.“)', () => {
    const autumn = at(600, 10, 25);
    /** Krávy, které ves po porážce 1. 11. nechá přes zimu (bez kusů na zimní porážku). */
    const kept = (wantsCarts: boolean): { kept: number; target: number } => {
      const s = withRoomyPens(village(autumn));
      s.pens = [...s.pens!, oxPen(autumn, 2)];
      s.ards = 1;
      // výrostci pasou (diet.md – Pasáci); stádo mezi oběma cíli – staré krávy (desetina) jdou na
      // maso, jen dokud stádo neklesne pod cíl krav
      s.people.push(person(7, 10, 1, autumn), person(8, 11, 1, autumn));
      s.livestock!.herds.cow = 5;
      s.livestock!.young.cow = 0;
      s.hay = { kg: 60_000, mowing: null };
      if (wantsCarts) {
        // loňský provoz – vyplatí se 4 dvoukoláky (ves chce 4 voly – voli se sdílí s rádlem)
        s.draft = {
          lastYear: {
            from: autumn - 365,
            'two-wheel': [90, 80, 70, 60],
            'four-wheel': [],
            plough: [],
            oxCost: 10,
          },
        };
      }
      expect(oxenTrainingTarget(s)).toBe(wantsCarts ? 4 : 2);
      const after = advanceVillage(s, at(600, 11, 2), null);
      const herd = after.livestock!;
      return { kept: herd.herds.cow - (herd.culling?.cow ?? 0), target: breedingCows(after) };
    };
    const plough = kept(false);
    const carts = kept(true);
    // půl krávy na mléko + 3 + půl krávy na vola: 4,5 a 5,5 krávy
    expect(plough.target).toBeCloseTo(4.5, 9);
    expect(carts.target).toBeCloseTo(5.5, 9);
    // ves s párem k rádlu porazí staré krávy až k cíli, ves, která chce i voly na vozy, si nechá
    // všech 5 (pod cílem – krávy i na telata do výcviku)
    expect(plough.kept).toBeCloseTo(4.5, 1);
    expect(carts.kept).toBeGreaterThan(4.95);
    expect(carts.kept).toBeGreaterThan(plough.kept + 0.4);
  });

  it('telata na voly: ves si přes zimu nechá krávy navíc na telata, která do výcviku potřebuje', () => {
    const s = withOxPen(village());
    // pár slouží – telata netřeba
    expect(oxenCalvesWanted(s, DAY)).toBe(0);
    // pár je v posledních 2 letech služby – na náhradu 2 telata
    const old = DAY - Math.ceil(8.5 * YEAR);
    s.pens![0]!.oxen = [{ trainedDay: old }, { trainedDay: old }];
    expect(oxenCalvesWanted(s, DAY)).toBe(2);
    s.pens![0]!.oxen.push({ trainedDay: DAY + 300 });
    expect(oxenCalvesWanted(s, DAY)).toBe(1);
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
    // zásoby nad pojistkou
    big.storesKg = 1e6;
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
    // potřeba víc párů – orba nestačí, ves páry zvýší hned (Martin 27. 10. 2026)
    expect(plannedBig.draft!.ploughNeed).toBeGreaterThan(1);
    expect(plannedBig.draft!.ploughPairs).toBe(plannedBig.draft!.ploughNeed);
    // pod pojistkou zásob ves páry zvýší hned (oxen.md – Kolik volů ves chce, Pod pojistkou)
    const hungry = advanceVillage({ ...big, storesKg: 0 }, at(600, 9, 2), null);
    expect(hungry.draft!.ploughPairs).toBe(hungry.draft!.ploughNeed);
    expect(hungry.draft!.ploughPairs).toBeGreaterThan(1);
  });

  it('páry zvýší hned, když orba nestačí; sníží až po dvou plánech níž (Martin 27. 10. 2026)', () => {
    // oxen.md – Kolik volů ves chce: „Nejen že smí, ale dokonce by měla“
    const s = withOxPen(village());
    // bez předchozího plánu: loňská potřeba = dnešní páry (1); orba nestačí – hned na potřebu
    expect(nextPloughPairs(s, 3)).toEqual({ ploughPairs: 3, ploughNeed: 3 });
    // jednoletý výkyv dolů páry nezmění
    s.draft = { ploughPairs: 3, ploughNeed: 3 };
    expect(nextPloughPairs(s, 1)).toEqual({ ploughPairs: 3, ploughNeed: 1 });
    // druhý rok dolů – sníží na větší z obou
    s.draft = { ploughPairs: 3, ploughNeed: 2 };
    expect(nextPloughPairs(s, 1)).toEqual({ ploughPairs: 2, ploughNeed: 1 });
    // potřeba, kterou páry stačí, je drží
    s.draft = { ploughPairs: 2, ploughNeed: 1 };
    expect(nextPloughPairs(s, 2)).toEqual({ ploughPairs: 2, ploughNeed: 2 });
  });
});

describe('rok vozů (wagons.md – Kolik vozů ves chce)', () => {
  it('den zapíše nošení podél cest a jinam, jízdy a den orby', () => {
    const s = withOxPen(village());
    addCartDemand(s, DAY, { road: 12, other: 3.333, jobs: [2, 0] }, false);
    addCartDemand(s, DAY + 1, { road: 0, other: 0, jobs: [] }, true);
    addCartDemand(s, DAY + 2, { road: 0, other: 5, jobs: [] }, true);
    expect(s.draft!.demand).toEqual({
      from: DAY,
      days: [
        { r: 12, o: 3.33, j: [2] },
        { o: 5, p: 1 },
      ],
      'four-wheel': [],
    });
  });

  it('úspora dne: čtyřkolák podél cest odveze dvakrát víc, dvoukolák i jinam a jízdy', () => {
    // dvoukolák 8 čd nošení s posádkou 2 (ušetří 6), čtyřkolák 16 čd s posádkou 2 (ušetří 14)
    const rec = { r: 20, o: 4, j: [3] };
    expect(cartDayValue(rec, 0, 1)).toBeCloseTo(14, 9);
    expect(cartDayValue(rec, 1, 0)).toBeCloseTo(6, 9);
    // zbytek 4 čd podél cest + 4 jinam = plný dvoukolák (6), pak jízda (3)
    expect(cartDayValue(rec, 2, 1)).toBeCloseTo(14 + 6 + 3, 9);
    // dvoukoláky odvezou i nošení podél cest
    expect(cartDayValue(rec, 3, 0)).toBeCloseTo(6 + 6 + 6, 9);
    // čtyřkolák mimo cesty nejede
    expect(cartDayValue({ o: 20 }, 0, 2)).toBe(0);
  });

  it('1. 11. se uzavře rok dlouhý aspoň 300 dní – tabulka úspor za rok; kratší běží dál', () => {
    const s = withOxPen(village());
    addCartDemand(s, DAY, { road: 0, other: 8, jobs: [] }, false);
    addCartDemand(s, DAY + 1, { road: 16, other: 0, jobs: [] }, true);
    closeCartYear(s, DAY + 200, 15);
    expect(s.draft!.lastYear).toBeUndefined();
    closeCartYear(s, DAY + 730, 15);
    const year = s.draft!.lastYear as CartYear;
    const scale = YEAR / 730;
    expect(year.oxCost).toBe(15);
    expect(year.base[1]![0]).toBeCloseTo(6 * scale, 2);
    expect(year.base[0]![1]).toBeCloseTo(0, 9);
    // den orby: čtyřkolák jen se dvěma voly, kteří neorají
    expect(year.plough[0]![1]![1]).toBeCloseTo(0, 9);
    expect(year.plough[0]![1]![2]).toBeCloseTo(14 * scale, 2);
    expect(year.plough[2]![1]![2]).toBeCloseTo(14 * scale, 2);
    expect(year.plough[2]![0]![2]).toBeCloseTo(12 * scale, 2);
    expect(s.draft!.demand).toEqual({ from: DAY + 730, days: [], 'four-wheel': [] });
  });

  it('ves chce čtyřkolák, když hodně nošení vede podél cest', () => {
    const s = withOxPen(village(), 2);
    const year = (rec: { r?: number; o?: number }): void => {
      s.draft = { demand: { from: DAY - 400, days: [], 'four-wheel': [] } };
      for (let d = 0; d < 60; d++)
        addCartDemand(s, DAY - 400 + d, { road: rec.r ?? 0, other: rec.o ?? 0, jobs: [] }, false);
      closeCartYear(s, DAY - 400 + 365, 20);
    };
    // 60 dní po 16 čd podél cest – čtyřkolák ušetří 14 čd denně, dva dvoukoláky 12
    year({ r: 16 });
    expect(cartTargets(s)).toEqual({ 'two-wheel': 0, 'four-wheel': 1 });
    // totéž mimo cesty – dvoukoláky
    year({ o: 16 });
    expect(cartTargets(s)).toEqual({ 'two-wheel': 2, 'four-wheel': 0 });
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
    expect(demand.days!.some((d) => (d.o ?? 0) + (d.r ?? 0) > 0)).toBe(true);
    // na kouscích nezávisí
    const pieces = advanceVillage(advanceVillage(s, day + 4, null), day + 10, null);
    expect(pieces).toEqual(next);
  });

  it('výprava zapíše, co by ušetřily čtyřkoláky – nosiči krát dny cesty', () => {
    // 1 600 kg obilí = 64 nosičů; čtyřkolák jede dvakrát (2 lidé × 2 jízdy), druhý nic neušetří
    expect(fourWheelSavings({ grain: 1600 }, {}, 4)).toEqual([(64 - 4) * 4]);
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

describe('čtyřkolák po louce a strništi – převod uložených dosahů (wagons.md – Co se vozí a na čem)', () => {
  it('dosahy čtyřkoláku z doby „jen po pevných cestách“ se jednou zahodí, nové zůstanou', () => {
    const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    const reach = { share: 0.04, points: [] };
    const old = {
      ...s,
      draft: { ploughPairs: 1 },
      waterCart4: { key: 'k', drive: null },
      hay: { kg: 0, mowing: null },
      constructions: [
        { ...s.constructions[0]!, wood: { fell: [], cartReach4: { trees: [], points: [] } } },
      ],
      plan: { cartReach: reach, cartReach4: reach },
    } as unknown as VillageState;
    withFourWheelReach(old);
    expect('waterCart4' in old).toBe(false);
    expect(JSON.stringify(old)).not.toContain('cartReach4');
    expect(JSON.stringify(old)).toContain('cartReach');
    expect(old.draft!.fourWheelOffRoad).toBe(true);
    // podruhé nic – dosahy spočítané po převodu zůstanou
    (old as unknown as { waterCart4: unknown }).waterCart4 = { key: 'k', drive: null };
    withFourWheelReach(old);
    expect('waterCart4' in old).toBe(true);
  });
});
