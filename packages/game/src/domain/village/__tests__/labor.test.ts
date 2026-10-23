import { describe, expect, it } from 'vitest';
import {
  adultDailyMin,
  afterConstructions,
  allocateDay,
  householdElders,
  householdWaterLabor,
  waterFetchingLabor,
} from '../labor';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';
import { LABOR_PER_DAY, WATER_FETCHING } from '../rules';
import type { Person } from '../types';

const base = {
  capacity: 2.6,
  householdElders: [0],
  tasks: [],
  potteryCoverage: NO_CRAFTS.pottery,
};
const DAILY_MIN = dailyMinPerHousehold(NO_CRAFTS.pottery);

function sum(r: ReturnType<typeof allocateDay>): number {
  return r.dailyMin + r.away + Object.values(r.tasks).reduce((a, b) => a + b, 0) + r.common;
}

describe('allocateDay', () => {
  it('bez úloh: minimum, zbytek společná práce (domácí výroba jde bokem)', () => {
    const r = allocateDay(base);
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.eldersDailyMin).toBe(0);
    expect(r.common).toBeCloseTo(2.6 - DAILY_MIN);
    expect(sum(r)).toBeCloseTo(2.6);
    expect(r.tasks.dig).toBe(0);
  });
  it('denní minimum podle pokrytí nádobami: bez hrnčíře 0,5, s plným pokrytím 0,45', () => {
    expect(allocateDay(base).dailyMin).toBeCloseTo(0.5, 9);
    expect(
      allocateDay({ ...base, householdElders: [0, 0], potteryCoverage: 1 }).dailyMin,
    ).toBeCloseTo(0.9, 9);
  });
  it('úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 1);
    expect(r.common).toBe(0);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('stejná úloha dvou plodin: práce po úlohách vstupu v jejich pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'dig', remaining: 1.5 },
        { name: 'orchard-harvest', remaining: 0.2 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.taskAmounts.map((a) => Number(a.toFixed(6)))).toEqual([1.5, 0.2, 0.4]);
    expect(r.tasks.dig).toBeCloseTo(1.9);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('práce v sadu jde mezi polní úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'orchard-harvest', remaining: 1.5 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks['orchard-harvest']).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(0.6);
    expect(r.tasks['orchard-care']).toBe(0);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('lidé na výpravách: po denním minimu, před úlohami dne (trade.md – Doprava)', () => {
    const r = allocateDay({ ...base, away: 1.5, tasks: [{ name: 'dig', remaining: 5 }] });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.away).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 1.5);
    expect(sum(r)).toBeCloseTo(2.6);
    // bez práce navíc dostane výprava jen to, co zbude po denním minimu
    const short = allocateDay({ ...base, capacity: 1, away: 3 });
    expect(short.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(short.away).toBeCloseTo(1 - DAILY_MIN);
    expect(short.common).toBe(0);
    expect(allocateDay(base).away).toBe(0);
  });
  it('malá kapacita: vše ostatní nula, nic záporné', () => {
    const r = allocateDay({ ...base, capacity: 0.3, tasks: [{ name: 'dig', remaining: 3 }] });
    expect(r.dailyMin).toBeCloseTo(0.3);
    expect(r.tasks.dig).toBe(0);
    expect(r.common).toBe(0);
  });
  it('produktivita násobí práci vsi, minimum zůstává', () => {
    const r = allocateDay({ ...base, productivity: 0.8 });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.common).toBeCloseTo(2.6 * 0.8 - DAILY_MIN);
  });
});

describe('lehká práce žen řemeslníků (crafts.md – Kdo dělá řemeslo)', () => {
  const heavy = [
    { name: 'plough' as const, remaining: 5 },
    { name: 'reclaim' as const, remaining: 5 },
  ];
  it('nepokryje orbu, kácení ani stavby: bez kapacity zůstanou těžké úlohy i společná práce prázdné', () => {
    const r = allocateDay({ ...base, capacity: 0, light: 3, tasks: heavy });
    expect(r.tasks.plough).toBe(0);
    expect(r.tasks.reclaim).toBe(0);
    expect(r.common).toBe(0);
  });
  it('pokryje setí, okopávání, žně a výmlat; co nevyužije, propadne', () => {
    const r = allocateDay({
      ...base,
      capacity: 0,
      light: 4,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'weed', remaining: 1 },
        { name: 'harvest', remaining: 1 },
        { name: 'thresh', remaining: 0.5 },
      ],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.tasks.weed).toBeCloseTo(1);
    expect(r.tasks.harvest).toBeCloseTo(1);
    expect(r.tasks.thresh).toBeCloseTo(0.5);
    expect(r.common).toBe(0);
  });
  it('lehká úloha bere napřed z lehké práce, zbytek z obecné kapacity', () => {
    const r = allocateDay({
      ...base,
      capacity: 2,
      light: 0.5,
      tasks: [{ name: 'sow', remaining: 1 }],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.common).toBeCloseTo(2 - DAILY_MIN - 0.5);
  });
});

describe('denní minimum a starší (population.md – Práce)', () => {
  it('starší kryje denní minimum své domácnosti – z práce vsi nic nebo méně', () => {
    // jeden starší (0,5) pokryje minimum bez hrnčíře (0,5) celé
    const one = allocateDay({ ...base, householdElders: [1] });
    expect(one.dailyMin).toBeCloseTo(0, 9);
    expect(one.eldersDailyMin).toBeCloseTo(DAILY_MIN, 9);
    expect(one.common).toBeCloseTo(2.6, 9);
    // se štěstím pod 1 starší minimum nepokryje celé – dospělí dají zbytek
    const tired = allocateDay({ ...base, householdElders: [1], productivity: 0.8 });
    expect(tired.dailyMin).toBeCloseTo(DAILY_MIN - LABOR_PER_DAY.elder * 0.8, 9);
    expect(tired.dailyMin).toBeLessThan(DAILY_MIN);
  });
  it('co starším nad minimum zbude, do práce vsi nejde', () => {
    const two = allocateDay({ ...base, householdElders: [2] });
    expect(two.dailyMin).toBe(0);
    expect(two.eldersDailyMin).toBeCloseTo(DAILY_MIN, 9);
    // dva starší dají práci vsi stejně jako jeden – přebytek propadne
    expect(two.common).toBeCloseTo(allocateDay({ ...base, householdElders: [1] }).common, 9);
    expect(adultDailyMin(DAILY_MIN, 3)).toBe(0);
  });
  it('domácnost bez staršího beze změny, po domácnostech zvlášť', () => {
    const r = allocateDay({ ...base, capacity: 5, householdElders: [0, 2, 0] });
    expect(r.dailyMin).toBeCloseTo(2 * DAILY_MIN, 9);
    expect(r.common).toBeCloseTo(5 - 2 * DAILY_MIN, 9);
    expect(adultDailyMin(DAILY_MIN, 0)).toBe(DAILY_MIN);
  });
  it('householdElders: starší po domácnostech, dílny vynechá', () => {
    const DAY = 365.25 * 100;
    const person = (id: number, dwellingId: number, age: number): Person =>
      ({ id, dwellingId, bornDay: DAY - age * 365.25 - 10 }) as Person;
    const people = [person(1, 7, 30), person(2, 7, 50), person(3, 8, 60), person(4, 8, 70)];
    people.push(person(5, 9, 10), person(6, 7, 46));
    expect(householdElders(people, DAY)).toEqual([2, 2, 0]);
    expect(householdElders(people, DAY, new Set([8]))).toEqual([2, 0]);
  });
});

// Martin, 19. 10. 2026: „Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to zabírat
// čas.“ – chůze pro vodu nad 100 m je přirážka denního minima domácnosti (population.md – Práce)
describe('chůze pro vodu v denním minimu (population.md – Práce)', () => {
  it('do 100 m nulová, dál roste se vzdáleností i s lidmi domácnosti', () => {
    expect(waterFetchingLabor(6, 0)).toBe(0);
    expect(waterFetchingLabor(6, WATER_FETCHING.includedM)).toBe(0);
    const near = waterFetchingLabor(6, 300);
    const far = waterFetchingLabor(6, 600);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    // cesty × 2 × (chůze − 100 m) ÷ rychlost ÷ délka dne: 6 lidí × 0,4 = 2,4 cesty, 500 m navíc
    const day = WATER_FETCHING.dayHours * 3600;
    expect(far).toBeCloseTo(
      (6 * WATER_FETCHING.tripsPerPerson * 2 * 500) / WATER_FETCHING.speedMps / day,
      12,
    );
    expect(waterFetchingLabor(3, 600)).toBeCloseTo(far / 2, 12);
  });
  it('bez změřené chůze (bez krajiny) nulová', () => {
    expect(waterFetchingLabor(6, undefined)).toBe(0);
    expect(waterFetchingLabor(0, 600)).toBe(0);
  });
  it('přirážka jde do denního minima před úlohami a kryjí ji napřed starší', () => {
    const water = waterFetchingLabor(6, 600);
    const r = allocateDay({
      ...base,
      householdWater: [water],
      tasks: [{ name: 'dig', remaining: 5 }],
    });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN + water, 12);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - water, 12);
    // starší kryje 0,5 čd – na dospělé zbude jen přirážka nad jeho práci
    const elder = allocateDay({ ...base, householdElders: [1], householdWater: [water] });
    expect(elder.dailyMin).toBeCloseTo(Math.max(0, DAILY_MIN + water - LABOR_PER_DAY.elder), 12);
    expect(elder.eldersDailyMin).toBeCloseTo(DAILY_MIN + water - elder.dailyMin, 12);
    const two = allocateDay({ ...base, householdElders: [2], householdWater: [water] });
    expect(two.dailyMin).toBe(0);
    expect(two.eldersDailyMin).toBeCloseTo(DAILY_MIN + water, 12);
    // bez přirážky beze změny
    expect(allocateDay({ ...base, householdWater: [0] })).toEqual(allocateDay(base));
  });
  it('householdWaterLabor: po domácnostech ve stejném pořadí jako householdElders', () => {
    const DAY = 365.25 * 100;
    const person = (id: number, dwellingId: number, age: number): Person =>
      ({ id, dwellingId, bornDay: DAY - age * 365.25 - 10 }) as Person;
    const people = [person(1, 7, 30), person(2, 8, 50), person(3, 7, 6), person(4, 9, 40)];
    // obydlí 9 nemá chůzi změřenou, 10 (prázdné) se nepočítá
    const dwellings = [
      { id: 7, waterWalkM: 400 },
      { id: 8, waterWalkM: 80 },
      { id: 9 },
      { id: 10, waterWalkM: 900 },
    ];
    expect(householdWaterLabor(people, dwellings)).toEqual([waterFetchingLabor(2, 400), 0, 0]);
    expect(householdWaterLabor(people, dwellings, new Set([8]))).toEqual([
      waterFetchingLabor(2, 400),
      0,
    ]);
  });
});

describe('afterConstructions (population.md – Práce)', () => {
  it('opravy jen z práce, kterou stavby nespotřebovaly; zbytek vrátí', () => {
    expect(afterConstructions(2, 0.5)).toEqual({ repairs: 0.5, left: 1.5 });
    expect(afterConstructions(0.2, 0.5)).toEqual({ repairs: 0.2, left: 0 });
    expect(afterConstructions(0, 0.5)).toEqual({ repairs: 0, left: 0 });
    expect(afterConstructions(-1, 0.5)).toEqual({ repairs: 0, left: 0 });
  });
});
