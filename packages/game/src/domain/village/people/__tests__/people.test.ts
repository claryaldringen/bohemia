import { describe, expect, it } from 'vitest';
import {
  ageGroup,
  ageYears,
  foodNeedPerDay,
  isAdult,
  isFertile,
  laborPerDay,
  occupants,
} from '../people';
import type { Person, VillageState } from '../../types';

const YEAR = 365.25;
const person = (id: number, dwellingId = 1, bornDay = 0): Person => ({ id, bornDay, dwellingId });
const atAge = (years: number): number => YEAR * years;

describe('věk', () => {
  it('počítá celé roky', () => {
    expect(ageYears(0, atAge(6))).toBe(6);
    expect(ageYears(0, atAge(6) + 364)).toBe(6);
    expect(ageYears(100, 100 + atAge(14))).toBe(14);
  });

  it('rozlišuje skupiny dítě, dospělý, starší', () => {
    expect(ageGroup(person(1), atAge(13))).toBe('child');
    expect(ageGroup(person(1), atAge(14))).toBe('adult');
    expect(ageGroup(person(1), atAge(44))).toBe('adult');
    expect(ageGroup(person(1), atAge(45))).toBe('elder');
  });
});

describe('práce', () => {
  it('na polích a stavbách jen dospělí – děti (i výrostci u stád) a starší 0', () => {
    expect(laborPerDay(person(1), atAge(6))).toBe(0);
    // výrostci 7–13 let pasou (diet.md – Pasáci), do práce vsi nejdou
    expect(laborPerDay(person(1), atAge(7))).toBe(0);
    expect(laborPerDay(person(1), atAge(13))).toBe(0);
    expect(laborPerDay(person(1), atAge(14))).toBe(1);
    // starší kryjí jen denní minimum své domácnosti (labor.ts – adultDailyMin)
    expect(laborPerDay(person(1), atAge(45))).toBe(0);
  });
});

describe('potřeba jídla', () => {
  it('dospělý 180, dítě 100, starší 140 kg ročně', () => {
    expect(foodNeedPerDay(person(1), atAge(20))).toBeCloseTo(180 / 365);
    expect(foodNeedPerDay(person(1), atAge(3))).toBeCloseTo(100 / 365);
    expect(foodNeedPerDay(person(1), atAge(50))).toBeCloseTo(140 / 365);
  });
});

describe('dospělost a plodnost', () => {
  it('dospělý (práce, odemčení, domácnost) je 14–44', () => {
    expect(isAdult(person(1), atAge(13))).toBe(false);
    expect(isAdult(person(1), atAge(14))).toBe(true);
    expect(isAdult(person(1), atAge(44))).toBe(true);
    expect(isAdult(person(1), atAge(45))).toBe(false);
  });

  it('děti může mít až od 16 let, do 44', () => {
    expect(isFertile(person(1), atAge(14))).toBe(false);
    expect(isFertile(person(1), atAge(16) - 1)).toBe(false);
    expect(isFertile(person(1), atAge(16))).toBe(true);
    expect(isFertile(person(1), atAge(44))).toBe(true);
    expect(isFertile(person(1), atAge(45))).toBe(false);
  });
});

describe('obyvatelé obydlí', () => {
  it('vrací obyvatele daného obydlí seřazené podle id', () => {
    const state = { people: [person(5, 2), person(3, 1), person(1, 1), person(2, 2)] };
    expect(occupants(state as VillageState, 1).map((p) => p.id)).toEqual([1, 3]);
    expect(occupants(state as VillageState, 9)).toEqual([]);
  });
});
