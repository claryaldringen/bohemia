import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { yearlyFoodNeed } from '../field-food';
import { expectedYearlyFoodNeed } from '../food-outlook';
import { ADULT_DEATHS_PER_YEAR, FOOD_NEED_KG_PER_YEAR } from '../../rules';
import type { Person } from '../../types';

// Výhled potřeby jídla podle růstu vsi (fields.md – Osev podle růstu vsi): děti dorostou, lidé
// ubývají běžnou úmrtností, manželské páry mají děti.

const day = dayIndexOf({ year: 600, month: 9, day: 1 });
const YEAR = 365;
const person = (id: number, age: number, over: Partial<Person> = {}): Person => ({
  id,
  bornDay: day - Math.round(age * 365.25) - 10,
  dwellingId: 1,
  sex: 'male',
  ...over,
});

describe('výhled potřeby jídla', () => {
  it('dnešek dá dnešní potřebu', () => {
    const state = { people: [person(1, 30), person(2, 5), person(3, 50)] };
    expect(expectedYearlyFoodNeed(state, day, day, day)).toBeCloseTo(yearlyFoodNeed(state, day), 9);
    expect(expectedYearlyFoodNeed({ people: [] }, day, day, day + YEAR)).toBe(0);
  });

  it('dítě, které dorůstá, za rok jí jako dospělý', () => {
    // 13 let – za rok dospělý
    const state = { people: [person(1, 13)] };
    const next = expectedYearlyFoodNeed(state, day, day + YEAR, day + 2 * YEAR - 1);
    expect(next).toBeGreaterThan(0.9 * FOOD_NEED_KG_PER_YEAR.adult);
    expect(next).toBeLessThan(FOOD_NEED_KG_PER_YEAR.adult);
  });

  it('svobodný dospělý jen ubývá běžnou úmrtností', () => {
    const state = { people: [person(1, 25)] };
    const next = expectedYearlyFoodNeed(state, day, day + YEAR, day + 2 * YEAR - 1);
    const survival = (1 - ADULT_DEATHS_PER_YEAR) ** 1.5;
    expect(next).toBeCloseTo(FOOD_NEED_KG_PER_YEAR.adult * survival, 0);
  });

  it('manželský pár ve věku plodnosti má děti – potřeba roste', () => {
    const single = { people: [person(1, 25), person(2, 24, { sex: 'female' })] };
    const married = {
      people: [person(1, 25, { spouseId: 2 }), person(2, 24, { sex: 'female', spouseId: 1 })],
    };
    const range = [day, day + YEAR, day + 2 * YEAR - 1] as const;
    const withChildren = expectedYearlyFoodNeed(married, ...range);
    const without = expectedYearlyFoodNeed(single, ...range);
    // ≈ 0,39 porodu ročně – do půlky roku po roce ≈ 0,6 dítěte
    expect(withChildren - without).toBeGreaterThan(0.4 * FOOD_NEED_KG_PER_YEAR.child);
    expect(withChildren - without).toBeLessThan(0.7 * FOOD_NEED_KG_PER_YEAR.child);
    // vdova (manžel už nežije) nerodí
    const widow = { people: [person(2, 24, { sex: 'female', spouseId: 1 })] };
    expect(expectedYearlyFoodNeed(widow, ...range)).toBeLessThan(FOOD_NEED_KG_PER_YEAR.adult);
  });
});
