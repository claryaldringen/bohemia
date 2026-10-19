import { describe, expect, it } from 'vitest';
import { adultDailyMin, afterConstructions, allocateDay, householdElders } from '../labor';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';
import { LABOR_PER_DAY } from '../rules';
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

describe('afterConstructions (population.md – Práce)', () => {
  it('opravy jen z práce, kterou stavby nespotřebovaly; zbytek vrátí', () => {
    expect(afterConstructions(2, 0.5)).toEqual({ repairs: 0.5, left: 1.5 });
    expect(afterConstructions(0.2, 0.5)).toEqual({ repairs: 0.2, left: 0 });
    expect(afterConstructions(0, 0.5)).toEqual({ repairs: 0, left: 0 });
    expect(afterConstructions(-1, 0.5)).toEqual({ repairs: 0, left: 0 });
  });
});
