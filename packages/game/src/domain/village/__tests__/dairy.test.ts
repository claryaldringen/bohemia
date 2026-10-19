import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  ANIMAL_CARE,
  DAIRY,
  animalCareNeed,
  dailyMilk,
  milkEnergyBetween,
  yearlyMilk,
} from '../dairy';
import { advanceVillage } from '../simulate';
import type { HerdSpecies } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Mléko a sýr, práce se zvířaty (diet.md – Mléko a sýr, Práce se zvířaty).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

describe('mléko stád', () => {
  it('dojí se v době dojení – krávy květen–září naplno a do listopadu napůl, ovce a kozy v létě', () => {
    const h = herds({ cow: 10, goat: 10, sheep: 10 });
    expect(dailyMilk(h, at(600, 4, 15)).liters).toBe(0);
    // krávy: 153 dní naplno (květen–září) + 61 dní napůl (říjen–listopad)
    const cowFull = (10 * DAIRY.milkedShare.cow * DAIRY.litersPerYear.cow) / (153 + 61 / 2);
    expect(dailyMilk(h, at(600, 10, 15)).liters).toBeCloseTo(cowFull / 2, 9);
    // 10. 5. dojí krávy a kozy, ovce až od 15. 5. (po odstavu jehňat)
    const may10 = dailyMilk(h, at(600, 5, 10)).liters;
    expect(dailyMilk(h, at(600, 5, 20)).liters).toBeGreaterThan(may10);
    expect(dailyMilk(h, at(600, 12, 1)).liters).toBe(0);
    // celý rok dá roční dojivost
    let year = 0;
    for (let d = at(601, 1, 1); d < at(602, 1, 1); d++) year += dailyMilk(h, d).liters;
    expect(year).toBeCloseTo(yearlyMilk(h).liters, 6);
  });

  it('mléko mezi dny (výhled do sklizně) = součet dnů, za den nejvýš strop v měsících dojení', () => {
    const h = herds({ cow: 6, goat: 4, sheep: 9 });
    const sum = (from: number, to: number, cap = Infinity): number => {
      let energy = 0;
      for (let d = from; d <= to; d++) energy += dailyMilk(h, d).energy;
      return Math.min(energy, cap);
    };
    // přes konec roku i přestupný únor (604)
    for (const [from, to] of [
      [at(603, 9, 1), at(604, 8, 31)],
      [at(603, 11, 20), at(604, 3, 1)],
      [at(604, 5, 10), at(604, 7, 30)],
      [at(604, 2, 28), at(604, 2, 29)],
    ] as const) {
      expect(milkEnergyBetween(h, from, to, Infinity)).toBeCloseTo(sum(from, to), 9);
    }
    expect(milkEnergyBetween(h, at(604, 5, 2), at(604, 5, 1), Infinity)).toBe(0);
    // strop: dny v měsících dojení (květen–listopad) × strop za den
    const cap = 0.1;
    const days = at(604, 12, 1) - at(604, 5, 1);
    expect(milkEnergyBetween(h, at(604, 1, 1), at(604, 12, 31), cap)).toBeCloseTo(cap * days, 9);
  });

  it('za rok dojná část stáda × dojivost, bílkoviny podle druhu (ovce víc)', () => {
    const year = yearlyMilk(herds({ cow: 1, sheep: 10 }));
    const cow = DAIRY.milkedShare.cow * DAIRY.litersPerYear.cow;
    const sheep = 10 * DAIRY.milkedShare.sheep * DAIRY.litersPerYear.sheep;
    expect(year.liters).toBeCloseTo(cow + sheep, 9);
    expect(year.proteinKg).toBeCloseTo(
      cow * DAIRY.proteinPerL.cow + sheep * DAIRY.proteinPerL.sheep,
      9,
    );
  });
});

describe('práce se zvířaty', () => {
  it('dojení v době dojení, zimní péče o krávy, voly, ovce a kozy, prasata a slepice celý rok', () => {
    const h = herds({ cow: 2, goat: 2, sheep: 4, pig: 3 });
    const summer = animalCareNeed(h, 2, 5, at(600, 6, 15));
    expect(summer.milking).toBeCloseTo(
      2 * DAIRY.milkedShare.cow * ANIMAL_CARE.milkingPerHead.cow +
        2 * DAIRY.milkedShare.goat * ANIMAL_CARE.milkingPerHead.goat +
        4 * DAIRY.milkedShare.sheep * ANIMAL_CARE.milkingPerHead.sheep,
      9,
    );
    expect(summer.care).toBeCloseTo(3 * ANIMAL_CARE.pigPerHead + 5 * ANIMAL_CARE.henPerHead, 9);
    const winter = animalCareNeed(h, 2, 5, at(600, 12, 15));
    expect(winter.milking).toBe(0);
    // v zimě se krmí krávy a voli, ovce a kozy (Martin 19. 10. 2026 – seno i pro ně)
    expect(winter.care).toBeCloseTo(
      (2 + 2) * ANIMAL_CARE.winterPerHead +
        (2 + 4) * ANIMAL_CARE.smallWinterPerHead +
        3 * ANIMAL_CARE.pigPerHead +
        5 * ANIMAL_CARE.henPerHead,
      9,
    );
  });

  it('simulace: v létě se dojí (práce dne), přebytek mléka jde na sýr a v zimě se jí', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 4, day: at(600, 3, 1), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 50_000;
    s.livestock!.herds = herds({ cow: 4, goat: 4, sheep: 12 });
    const summer = advanceVillage(s, at(600, 7, 1), null);
    expect(summer.labor!.shares.some((share) => share.activity === 'milking')).toBe(true);
    expect(summer.cheeseKg).toBeGreaterThan(0);
    expect(summer.diet!.shares.dairy).toBeGreaterThan(0);
    const winter = advanceVillage(summer, at(601, 1, 15), null);
    expect(winter.diet!.shares.dairy).toBeGreaterThan(0);
    expect(winter.labor!.shares.some((share) => share.activity === 'animal-care')).toBe(true);
  });
});
