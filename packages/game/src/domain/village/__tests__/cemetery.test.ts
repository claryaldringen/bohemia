import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { CELL_SIZE_M } from '../../landscape';
import { foundCemetery, foundVillage, type CemeteryInput, type PartInput } from '../actions';
import {
  bury,
  burialOrder,
  cemeteryCapacity,
  cemeteryHygiene,
  hygieneDeathFactor,
  hygieneDistanceFactor,
  villageHygiene,
} from '../cemetery';
import { deathChancePerDay, populationDay } from '../population';
import { ADULT_DEATHS_PER_YEAR, CEMETERY, CEMETERY_DISTANCE_M } from '../rules';
import { advanceVillage } from '../simulate';
import { recentDeathsPerYear, summarizeVillage } from '../summary';
import type { Cemetery, CemeterySquare, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

const YEAR = 365.25;
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const FOUNDED = at(600, 3, 15);
const AFTER_LUCK = FOUNDED + Math.ceil(31 * YEAR);

const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
/** Čerstvá ves – zakladatelé teprve staví první zemnici v (0, 0). */
const foundSite = (day = FOUNDED, seed = 42): VillageState =>
  foundVillage({
    seed,
    day,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { parts: field() },
  });
/** Ves se zemnicí zakladatelů v (0, 0) – od ní se měří hygiena a pořadí pohřbívání. */
const found = (day = FOUNDED, seed = 42): VillageState =>
  withBuiltFirstDwelling(foundSite(day, seed));

/** Čtverec se středem (x, z) a vzdáleností od vody. */
const square = (x: number, z: number, waterDistanceM = 500): CemeterySquare => ({
  cell: { x: Math.round(x / 15), y: Math.round(z / 15) },
  x,
  z,
  waterDistanceM,
});
const cemetery = (
  id: number,
  squares: CemeterySquare[],
  extra: Partial<Cemetery> = {},
): Cemetery => ({
  id,
  squares,
  squareSizeM: 15,
  graves: 0,
  builtDay: 0,
  ...extra,
});
const input = (squares: CemeterySquare[], obstacleCost = 0): CemeteryInput => ({
  squares: squares.map((s) => ({ ...s, obstacleCost })),
  squareSizeM: 15,
});
const adult = (id: number, years: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId: 1,
});

describe('pravidla pohřebiště', () => {
  it('hrob 4 m² – na čtverec 15 × 15 m se vejde 56 hrobů; 10 člověkodní na čtverec', () => {
    expect(CEMETERY.gravesPerSquare).toBe(
      Math.floor((CELL_SIZE_M * CELL_SIZE_M) / CEMETERY.graveM2),
    );
    expect(CEMETERY.gravesPerSquare).toBe(56);
    expect(CEMETERY.costPerSquare).toBe(10);
    expect(cemeteryCapacity({ squares: [square(0, 0), square(15, 0)] })).toBe(112);
  });
});

describe('hygiena', () => {
  it('od obydlí: do 50 m 0, od 150 m 1, mezi tím plynule; od vody 30 / 100 m', () => {
    const { dwelling, water } = CEMETERY_DISTANCE_M;
    expect(hygieneDistanceFactor(40, dwelling)).toBe(0);
    expect(hygieneDistanceFactor(50, dwelling)).toBe(0);
    expect(hygieneDistanceFactor(100, dwelling)).toBeCloseTo(0.5, 10);
    expect(hygieneDistanceFactor(150, dwelling)).toBe(1);
    expect(hygieneDistanceFactor(Infinity, dwelling)).toBe(1);
    expect(hygieneDistanceFactor(65, water)).toBeCloseTo(0.5, 10);
  });

  it('pohřebiště: vzdálenost od obydlí k okraji nejbližšího čtverce × vzdálenost od vody', () => {
    // čtverec se středem 107,5 m od obydlí – okraj 100 m → 0,5; voda 65 m → 0,5
    const c = cemetery(1, [square(107.5, 0, 65), square(122.5, 0, 200)]);
    expect(cemeteryHygiene(c, [{ x: 0, z: 0, rotation: 0 }])).toBeCloseTo(0.25, 10);
  });

  it('ves: bez pohřebiště, s nehotovým nebo plným 0; jinak nejlepší pohřebiště s místem', () => {
    const s = found();
    expect(villageHygiene(s)).toBe(0);
    s.cemeteries = [cemetery(100, [square(300, 0)], { builtDay: null })];
    expect(villageHygiene(s)).toBe(0);
    s.cemeteries = [cemetery(100, [square(300, 0)], { graves: 56 })];
    expect(villageHygiene(s)).toBe(0);
    s.cemeteries.push(cemetery(101, [square(107.5, 0)]), cemetery(102, [square(-307.5, 0)]));
    expect(villageHygiene(s)).toBe(1);
    s.cemeteries.pop();
    expect(villageHygiene(s)).toBeCloseTo(0.5, 10);
  });

  it('úmrtnost × 1 + extra × (1 − hygiena): dospělí a starší 0,3, děti 0,5', () => {
    expect(hygieneDeathFactor('adult', 0)).toBeCloseTo(1.3, 10);
    expect(hygieneDeathFactor('elder', 0)).toBeCloseTo(1.3, 10);
    expect(hygieneDeathFactor('child', 0)).toBeCloseTo(1.5, 10);
    expect(hygieneDeathFactor('child', 0.5)).toBeCloseTo(1.25, 10);
    expect(hygieneDeathFactor('adult', 1)).toBe(1);
  });

  it('deathChancePerDay: špatná hygiena zvýší riziko, hájení chrání i před ní', () => {
    const ctx = {
      foundedDay: FOUNDED,
      satiation: 1,
      overcrowded: false,
      dwellingType: 'zemnice' as const,
      protectFromHunger: false,
    };
    const later = { ...ctx, day: AFTER_LUCK };
    const person = adult(1, 30, AFTER_LUCK);
    expect(deathChancePerDay(person, { ...later, hygiene: 0 })).toBeCloseTo(
      1 - (1 - ADULT_DEATHS_PER_YEAR * 1.3) ** (1 / 365),
      12,
    );
    expect(deathChancePerDay(person, { ...later, hygiene: 1 })).toBe(
      deathChancePerDay(person, later),
    );
    const lucky = { ...ctx, day: FOUNDED + 5 * YEAR };
    const child = adult(2, 5, lucky.day);
    expect(deathChancePerDay(child, { ...lucky, hygiene: 0 })).toBe(
      deathChancePerDay(child, { ...lucky, hygiene: 1 }),
    );
  });
});

describe('pohřeb', () => {
  it('do hotového pohřebiště s místem nejblíž k obydlím; když se zaplní, zapíše to kronika', () => {
    const s = found();
    s.cemeteries = [
      cemetery(100, [square(400, 0)]),
      cemetery(101, [square(200, 0)], { graves: 54 }),
      cemetery(102, [square(100, 0)], { builtDay: null }),
    ];
    expect(burialOrder(s.cemeteries, [{ x: 0, z: 0, rotation: 0 }]).map((c) => c.id)).toEqual([
      102, 101, 100,
    ]);
    expect(bury(s, 5)).toBeNull();
    expect(s.cemeteries[1]!.graves).toBe(55);
    expect(bury(s, 6)).toEqual({
      day: 6,
      kind: 'cemetery-full',
      cemeteryId: 101,
      othersFree: true,
      othersBuilding: true,
    });
    expect(s.cemeteries[1]!.graves).toBe(56);
    expect(bury(s, 7)).toBeNull();
    expect(s.cemeteries[0]!.graves).toBe(1);
    expect(s.cemeteries[2]!.graves).toBe(0);
  });

  it('bez pohřebiště s místem se nic nestane; poslední plné → othersFree false', () => {
    const s = found();
    expect(bury(s, 5)).toBeNull();
    expect(s.cemeteries).toBeUndefined();
    s.cemeteries = [cemetery(100, [square(400, 0)], { graves: 55 })];
    expect(bury(s, 6)).toMatchObject({
      kind: 'cemetery-full',
      othersFree: false,
      othersBuilding: false,
    });
    expect(bury(s, 7)).toBeNull();
    expect(s.cemeteries[0]!.graves).toBe(56);
  });

  it('během stavby první zemnice (obydlí ještě nestojí): hygiena jen od vody, pohřeb jde', () => {
    const s = foundSite(FOUNDED, 7);
    expect(s.dwellings).toEqual([]);
    s.cemeteries = [cemetery(100, [square(15, 0, 65)]), cemetery(101, [square(30, 0)])];
    // bez obydlí blízkost obydlí nepřitěžuje – zbude činitel vody nejlepšího hřbitova
    expect(villageHygiene(s)).toBe(1);
    s.cemeteries.pop();
    expect(villageHygiene(s)).toBeCloseTo(0.5, 10);
    s.people.push(...Array.from({ length: 30 }, (_, i) => adult(500 + i, 80, AFTER_LUCK)));
    let deaths = 0;
    for (let day = AFTER_LUCK; day < AFTER_LUCK + 365; day++) {
      deaths += populationDay(s, day, 1).filter((e) => e.kind === 'death').length;
    }
    expect(deaths).toBeGreaterThan(0);
    expect(s.cemeteries[0]!.graves).toBe(deaths);
  });

  it('populationDay pohřbí každého zemřelého', () => {
    const s = found(FOUNDED, 7);
    s.cemeteries = [cemetery(100, [square(400, 0)])];
    s.people.push(...Array.from({ length: 30 }, (_, i) => adult(500 + i, 80, AFTER_LUCK)));
    let deaths = 0;
    for (let day = AFTER_LUCK; day < AFTER_LUCK + 3 * 365; day++) {
      deaths += populationDay(s, day, 1).filter((e) => e.kind === 'death').length;
    }
    expect(deaths).toBeGreaterThan(0);
    expect(s.cemeteries[0]!.graves).toBe(deaths);
  });
});

describe('foundCemetery', () => {
  it('pohřebiště bez hrobů a stavba za 10 člověkodní na čtverec + překážky; vstup nemění', () => {
    const s = found();
    const next = foundCemetery(s, s.lastDay + 1, input([square(300, 0), square(315, 0)], 1.5));
    expect(s.cemeteries).toBeUndefined();
    expect(next.cemeteries).toEqual([
      {
        id: s.nextId,
        squares: [square(300, 0), square(315, 0)],
        squareSizeM: 15,
        graves: 0,
        builtDay: null,
      },
    ]);
    expect(next.constructions.at(-1)).toMatchObject({
      kind: 'cemetery',
      // 2 × 10 čd, z toho plot 30 % jen po 6 vnějších stranách z 8 (sdílená strana bez plotu) + 3 čd překážky
      cost: 21.5,
      done: 0,
      cemeteryId: s.nextId,
      startedDay: s.lastDay + 1,
    });
  });

  it('neplatný vstup → RangeError', () => {
    const s = found();
    const day = s.lastDay + 1;
    expect(() => foundCemetery(s, day, input([]))).toThrow(RangeError);
    expect(() => foundCemetery(s, day, input([square(NaN, 0)]))).toThrow(RangeError);
    expect(() => foundCemetery(s, day, input([square(0, 0, -1)]))).toThrow(RangeError);
    expect(() => foundCemetery(s, day, input([square(0, 0)], -1))).toThrow(RangeError);
    expect(() => foundCemetery(s, day, { ...input([square(0, 0)]), squareSizeM: 0 })).toThrow(
      RangeError,
    );
    expect(() => foundCemetery(s, s.lastDay - 1, input([square(0, 0)]))).toThrow(RangeError);
  });
});

describe('pohřebiště v simulaci', () => {
  it('stavba ze společné práce – po dokončení přijímá mrtvé, kronika to zapíše', () => {
    const start = advanceVillage(found(), FOUNDED, null);
    const placed = foundCemetery(start, start.lastDay, input([square(300, 0)]));
    const later = advanceVillage(placed, FOUNDED + 3 * 365, null);
    const c = later.cemeteries![0]!;
    expect(c.builtDay).not.toBeNull();
    expect(later.constructions.some((x) => x.kind === 'cemetery')).toBe(false);
    expect(later.chronicle).toContainEqual({
      day: c.builtDay,
      kind: 'construction-finished',
      constructionKind: 'cemetery',
      dwellingId: null,
      fieldId: null,
    });
  });

  it('stará ves bez pohřebišť (uložená dřív) se dopočítá a pohřebiště nemá', () => {
    const old = advanceVillage(found(), FOUNDED, null);
    delete old.cemeteries;
    const later = advanceVillage(
      JSON.parse(JSON.stringify(old)) as VillageState,
      AFTER_LUCK + 400,
      null,
    );
    expect(later.cemeteries).toBeUndefined();
    expect(summarizeVillage(later, later.lastDay).cemeteries).toEqual([]);
  });

  it('po kouscích dá stejný stav jako jedním voláním – i s pohřbíváním po hájení', () => {
    const start = advanceVillage(found(), FOUNDED, null);
    const placed = foundCemetery(start, start.lastDay, input([square(300, 0)]));
    placed.people.push(...Array.from({ length: 12 }, (_, i) => adult(900 + i, 40, FOUNDED)));
    const end = AFTER_LUCK + 2 * 365;
    const whole = advanceVillage(placed, end, null);
    let chunked = placed;
    const steps = [1, 400, 13, 777, 2, 365];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
    expect(whole.cemeteries![0]!.graves).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(whole))).toEqual(whole);
  }, 30_000);
});

describe('souhrn pohřebišť', () => {
  it('místo a odhad v letech podle úmrtí posledních let, v pořadí pohřbívání', () => {
    const s = found();
    const day = FOUNDED + 20 * 365;
    s.lastDay = day;
    s.chronicle = Array.from({ length: 20 }, (_, i) => ({
      day: day - 365 * 5 + i * 50,
      kind: 'death' as const,
      group: 'elder' as const,
    }));
    expect(recentDeathsPerYear(s, day)).toBeCloseTo(2, 2);
    s.cemeteries = [
      cemetery(100, [square(400, 0)], { graves: 6 }),
      cemetery(101, [square(200, 0)], { graves: 46 }),
      cemetery(102, [square(-300, 0), square(-315, 0)], { builtDay: null }),
    ];
    const summary = summarizeVillage(s, day);
    expect(summary.cemeteries.map((c) => [c.id, c.freePlaces, c.built])).toEqual([
      [101, 10, true],
      [102, 112, false],
      [100, 50, true],
    ]);
    const years = summary.cemeteries.map((c) => c.yearsLeft ?? NaN);
    expect(years[0]).toBeCloseTo(10 / summary.deathsPerYear, 6);
    expect(years[1]).toBeCloseTo(122 / summary.deathsPerYear, 6);
    expect(years[2]).toBeCloseTo(172 / summary.deathsPerYear, 6);
  });

  it('plné pohřebiště má 0 let; bez úmrtí odhad není', () => {
    const s = found();
    s.cemeteries = [
      cemetery(100, [square(400, 0)], { graves: 56 }),
      cemetery(101, [square(500, 0)]),
    ];
    const summary = summarizeVillage(s, s.lastDay + 1);
    expect(summary.deathsPerYear).toBe(0);
    expect(summary.cemeteries.map((c) => c.yearsLeft)).toEqual([0, null]);
  });
});

describe('rozšíření hřbitova', () => {
  const built = (): VillageState => {
    const s = advanceVillage(found(), FOUNDED, null);
    s.cemeteries = [cemetery(100, [square(300, 0), square(315, 0)], { graves: 112 })];
    return s;
  };

  it('čtverce navazující stranou rozšíří hřbitov – do dokončení se nepočítají', () => {
    const s = built();
    const next = foundCemetery(s, s.lastDay, input([square(330, 0)]));
    expect(next.cemeteries).toHaveLength(1);
    const c = next.cemeteries![0]!;
    const construction = next.constructions.at(-1)!;
    expect(construction).toMatchObject({ kind: 'cemetery', cemeteryId: 100, cost: 9.25 });
    expect(c.squares[2]).toEqual({ ...square(330, 0), constructionId: construction.id });
    // plný hřbitov: rozšíření ve stavbě místo nepřidá
    expect(cemeteryCapacity(c)).toBe(112);
    expect(bury(next, s.lastDay)).toBeNull();
    const later = advanceVillage(next, s.lastDay + 365, null);
    const done = later.cemeteries![0]!;
    expect(done.squares[2]?.constructionId).toBeUndefined();
    expect(cemeteryCapacity(done)).toBe(168);
    expect(done.builtDay).toBe(0);
  });

  it('zaplnění, když se staví rozšíření: othersBuilding (kronika neříká, že není kam)', () => {
    const s = built();
    s.cemeteries![0]!.graves = 111;
    const next = foundCemetery(s, s.lastDay, input([square(330, 0)]));
    expect(bury(next, s.lastDay)).toMatchObject({ othersFree: false, othersBuilding: true });
  });

  it('nenavazující čtverce = nový hřbitov; na dva navázat ani překrýt nejde', () => {
    const s = built();
    // políčka: hřbitov 100 = (20, 0) a (21, 0), hřbitov 101 = (23, 0)
    s.cemeteries!.push(cemetery(101, [square(345, 0)]));
    const apart = foundCemetery(s, s.lastDay, input([square(300, 60)]));
    expect(apart.cemeteries).toHaveLength(3);
    expect(() => foundCemetery(s, s.lastDay, input([square(330, 0)]))).toThrow(
      'Hřbitov smí navazovat jen na jeden hřbitov.',
    );
    expect(() => foundCemetery(s, s.lastDay, input([square(300, 0)]))).toThrow(RangeError);
    expect(() => foundCemetery(s, s.lastDay, input([square(300, 15), square(300, 15)]))).toThrow(
      RangeError,
    );
  });

  it('hygiena a pořadí pohřbívání počítají jen hotové čtverce', () => {
    const c = cemetery(100, [square(300, 0), { ...square(15, 0), constructionId: 7 }]);
    expect(cemeteryHygiene(c, [{ x: 0, z: 0, rotation: 0 }])).toBe(1);
  });
});
