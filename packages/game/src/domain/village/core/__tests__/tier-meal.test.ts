import { describe, expect, it } from 'vitest';
import { DIET, dietOf, fruitEnergy, meatEnergy, type Eaten } from '../diet';
import { dietHappiness, tierMeal, type TierMeal } from '../tier-meal';
import { APPLE_FOOD_VALUE, LEGUMES } from '../../rules';
import { HONEY } from '../../rules/rules-wares';
import { DAIRY } from '../../livestock/dairy';

// Jídlo po vrstvách (diet.md – Strava po vrstvách a porážka celý rok – Kdo dostane co, Spokojenost
// ze stravy): příděl energie nad životním minimem 75 % po vrstvách, pak čím se příděl naplní.

const NONE: Eaten = {
  grainKg: 0,
  meatKg: 0,
  fruitKg: 0,
  milkL: 0,
  milkProteinKg: 0,
  milkEnergy: 0,
  cheeseKg: 0,
  eggsKg: 0,
  legumesKg: 0,
  honeyKg: 0,
};
/** Rod vojvody (potřeba 2) a zbytek vsi (8), mistři a řemeslníci žádní. */
const NEEDS = [2, 0, 0, 8];
const split = (
  needs: readonly number[],
  proteinNeeds: readonly number[] = needs.map(() => 0),
): { needs: readonly number[]; proteinNeeds: readonly number[] } => ({ needs, proteinNeeds });
/** Kg masa s energií `energy` (kg obilí). */
const meatKg = (energy: number): number => energy / DIET.meatEnergy;
/** Kg jablek s energií `energy` (kg obilí). */
const fruitKg = (energy: number): number => energy / APPLE_FOOD_VALUE;
const FIELDS: readonly (keyof Eaten)[] = [...(Object.keys(NONE) as (keyof Eaten)[]), 'freshMeatKg'];

describe('jídlo po vrstvách – příděl energie', () => {
  it('nad životním minimem dostane každý 75 % a zbytek jde po vrstvách', () => {
    // 9 z 10: rod 0,75 × 2 + 0,5 = 2 (sytý), zbytek vsi 0,75 × 8 + 1 = 7
    const meal = tierMeal(split(NEEDS), { ...NONE, grainKg: 9 });
    expect(meal.eaten[0]!.grainKg).toBeCloseTo(2, 12);
    expect(meal.eaten[3]!.grainKg).toBeCloseTo(7, 12);
    expect(meal.energy[0]).toBe(1);
    expect(meal.energy[1]).toBe(1);
    expect(meal.energy[2]).toBe(1);
    expect(meal.energy[3]).toBeCloseTo(0.875, 12);
  });

  it('pod životním minimem dostanou všichni stejný podíl své potřeby', () => {
    const meal = tierMeal(split(NEEDS), { ...NONE, grainKg: 5 });
    expect(meal.energy[0]).toBeCloseTo(0.5, 12);
    expect(meal.energy[3]).toBeCloseTo(0.5, 12);
    expect(meal.eaten[0]!.grainKg).toBeCloseTo(1, 12);
    expect(meal.eaten[3]!.grainKg).toBeCloseTo(4, 12);
  });

  it('prázdná vrstva má plno a nic nesní – nad minimem i pod ním', () => {
    for (const grainKg of [4.5, 2]) {
      const meal = tierMeal(split([0, 0, 0, 5]), { ...NONE, grainKg, honeyKg: 0.01 });
      for (const t of [0, 1, 2]) {
        expect(meal.energy[t]).toBe(1);
        for (const field of FIELDS) expect(meal.eaten[t]![field] ?? 0).toBe(0);
      }
      expect(meal.energy[3]).toBeCloseTo((grainKg + 0.01 * HONEY.energyPerKg) / 5, 12);
    }
  });

  it('energie vrstvy je to, co vrstva snědla (strava vrstvy s její potřebou)', () => {
    const meal = tierMeal(split([1.5, 0.5, 2, 6], [0.1, 0.03, 0.1, 0.4]), {
      ...NONE,
      grainKg: 6,
      meatKg: meatKg(1),
      fruitKg: fruitKg(1),
    });
    meal.diets.forEach((diet, t) => expect(diet.energy).toBeCloseTo(meal.energy[t]!, 12));
    // 8 z 10: minimum 7,5, zbytek 0,5 – rod (0,375) a mistři (0,125) do plna, řemeslníkům nic navíc
    expect(meal.energy[0]).toBeCloseTo(1, 12);
    expect(meal.energy[1]).toBeCloseTo(1, 12);
    expect(meal.energy[2]).toBeCloseTo(0.75, 12);
    expect(meal.energy[3]).toBeCloseTo(0.75, 12);
  });
});

describe('jídlo po vrstvách – čím se příděl naplní', () => {
  it('maso napřed elitě – do jejího přídělu, zbytek ostatním', () => {
    const meal = tierMeal(split(NEEDS), { ...NONE, meatKg: meatKg(3), grainKg: 7 });
    expect(meatEnergy(meal.eaten[0]!.meatKg)).toBeCloseTo(2, 12);
    expect(meatEnergy(meal.eaten[3]!.meatKg)).toBeCloseTo(1, 12);
    expect(meal.eaten[0]!.grainKg).toBe(0);
    expect(meal.eaten[3]!.grainKg).toBeCloseTo(7, 12);
  });

  it('pořadí: mléko, vejce, čerstvé maso, uzené, sýr, luštěniny, obilí, med', () => {
    // rod (potřeba 1) se nají mlékem, vejci a půlkou čerstvého masa; zbytek vsi dojí ostatní
    const milk = { milkL: 2, milkProteinKg: 0.06, milkEnergy: 0.4 };
    const eggsKg = 0.4 / DIET.energy.eggs;
    const fresh = meatKg(0.4);
    const meal = tierMeal(split([1, 0, 0, 4]), {
      ...NONE,
      ...milk,
      eggsKg,
      meatKg: fresh + meatKg(0.5),
      freshMeatKg: fresh,
      cheeseKg: 0.5,
      legumesKg: 0.5,
      grainKg:
        5 -
        0.4 * 3 -
        0.5 -
        0.5 * DAIRY.cheeseEnergy -
        0.5 * LEGUMES.energy -
        0.01 * HONEY.energyPerKg,
      honeyKg: 0.01,
    });
    const [elite, , , rest] = meal.eaten as [Eaten, Eaten, Eaten, Eaten];
    expect(elite.milkEnergy).toBeCloseTo(0.4, 12);
    // bílkoviny a litry mléka podle podílu energie
    expect(elite.milkL).toBeCloseTo(2, 12);
    expect(elite.milkProteinKg).toBeCloseTo(0.06, 12);
    expect(elite.eggsKg).toBeCloseTo(eggsKg, 12);
    expect(elite.freshMeatKg).toBeCloseTo(meatKg(0.2), 12);
    expect(elite.meatKg).toBeCloseTo(meatKg(0.2), 12);
    expect(elite.cheeseKg).toBe(0);
    expect(elite.grainKg).toBe(0);
    expect(elite.honeyKg).toBe(0);
    // zbytek vsi: zbytek čerstvého masa, uzené, sýr, luštěniny, obilí a med
    expect(rest.freshMeatKg).toBeCloseTo(meatKg(0.2), 12);
    expect(rest.meatKg).toBeCloseTo(meatKg(0.7), 12);
    expect(rest.cheeseKg).toBeCloseTo(0.5, 12);
    expect(rest.legumesKg).toBeCloseTo(0.5, 12);
    expect(rest.honeyKg).toBeCloseTo(0.01, 12);
    for (const e of meal.energy) expect(e).toBeCloseTo(1, 12);
  });

  it('uzené před sýrem, sýr před luštěninami a obilím, med až za obilím', () => {
    const meal = tierMeal(split([1, 0, 0, 1]), {
      ...NONE,
      meatKg: meatKg(0.5),
      cheeseKg: 0.3 / DAIRY.cheeseEnergy,
      legumesKg: 0.4 / LEGUMES.energy,
      grainKg: 0.7,
      honeyKg: 0.1 / HONEY.energyPerKg,
    });
    const [elite, , , rest] = meal.eaten as [Eaten, Eaten, Eaten, Eaten];
    expect(meatEnergy(elite.meatKg)).toBeCloseTo(0.5, 12);
    expect(elite.cheeseKg * DAIRY.cheeseEnergy).toBeCloseTo(0.3, 12);
    expect(elite.legumesKg * LEGUMES.energy).toBeCloseTo(0.2, 12);
    expect(elite.grainKg).toBe(0);
    expect(elite.honeyKg).toBe(0);
    expect(rest.cheeseKg).toBe(0);
    expect(rest.legumesKg * LEGUMES.energy).toBeCloseTo(0.2, 12);
    expect(rest.grainKg).toBeCloseTo(0.7, 12);
    expect(rest.honeyKg * HONEY.energyPerKg).toBeCloseTo(0.1, 12);
  });

  it('ovoce rovným dílem mezi nesyté podle zbytku přídělu – sytý z masa nedostane nic', () => {
    const sated = tierMeal(split(NEEDS), {
      ...NONE,
      meatKg: meatKg(2),
      fruitKg: fruitKg(4),
      grainKg: 4,
    });
    expect(meatEnergy(sated.eaten[0]!.meatKg)).toBeCloseTo(2, 12);
    expect(sated.eaten[0]!.fruitKg).toBe(0);
    expect(sated.eaten[3]!.fruitKg).toBeCloseTo(fruitKg(4), 12);
    expect(sated.eaten[3]!.grainKg).toBeCloseTo(4, 12);
    // rod má po mase zbytek 1, zbytek vsi 8 – ovoce 3 se rozdělí 1 : 8
    const shared = tierMeal(split(NEEDS), {
      ...NONE,
      meatKg: meatKg(1),
      fruitKg: fruitKg(3),
      grainKg: 6,
    });
    expect(fruitEnergy(shared.eaten[0]!.fruitKg)).toBeCloseTo(3 / 9, 12);
    expect(fruitEnergy(shared.eaten[3]!.fruitKg)).toBeCloseTo(24 / 9, 12);
    expect(shared.eaten[0]!.grainKg).toBeCloseTo(1 - 3 / 9, 12);
    expect(shared.eaten[3]!.grainKg).toBeCloseTo(8 - 24 / 9, 12);
  });

  it('součet vrstev = snědené vsi, i když by snědené přesáhlo potřebu', () => {
    const eaten: Eaten = {
      grainKg: 6.1,
      meatKg: 2.4,
      freshMeatKg: 0.9,
      fruitKg: 1.7,
      milkL: 3.2,
      milkProteinKg: 0.1,
      milkEnergy: 1.1,
      cheeseKg: 0.4,
      eggsKg: 0.3,
      legumesKg: 0.8,
      honeyKg: 0.05,
    };
    const needs = [1.3, 0.7, 2.1, 9.4];
    // pod minimem, těsně nad ním, nad ním a přes potřebu (nemá nastat – přebytek sní zbytek vsi)
    for (const scale of [0.3, 0.8, 1, 1.2, 1.4]) {
      const input = Object.fromEntries(
        Object.entries(eaten).map(([key, kg]) => [key, kg * scale]),
      ) as unknown as Eaten;
      const meal = tierMeal(split(needs, [0.2, 0.1, 0.3, 1.2]), input);
      for (const field of FIELDS) {
        const sum = meal.eaten.reduce((a, tier) => a + (tier[field] ?? 0), 0);
        expect(sum).toBeCloseTo(input[field] ?? 0, 9);
      }
      for (const e of meal.energy) {
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('spokojenost ze stravy po lidech', () => {
  /** Ručně složené jídlo vrstev – strava `dietOf` s potřebou vrstvy. */
  const handMade = (tiers: readonly { need: number; eaten: Eaten }[]): TierMeal => ({
    eaten: tiers.map((t) => t.eaten),
    diets: tiers.map((t) => dietOf(t.need, 0, t.eaten)),
    energy: tiers.map(() => 1),
  });

  it('maso, ovoce a med průměrem přes lidi podle toho, co kdo snědl', () => {
    // rod (2 lidé) jí 30 % energie z masa a med, zbytek vsi (8 lidí) jen obilí
    const meal = handMade([
      {
        need: 2,
        eaten: {
          ...NONE,
          meatKg: meatKg(0.6),
          honeyKg: 0.1 / HONEY.energyPerKg,
          grainKg: 1.3,
        },
      },
      { need: 0, eaten: NONE },
      { need: 0, eaten: NONE },
      { need: 8, eaten: { ...NONE, grainKg: 8 } },
    ]);
    const h = dietHappiness(meal, [2, 0, 0, 8]);
    expect(h.meat).toBeCloseTo((3 * 2) / 10, 12);
    expect(h.honey).toBeCloseTo((HONEY.happiness * 2) / 10, 12);
    expect(h.fruit).toBe(0);
  });

  it('ovoce každému, kdo ho jedl; maso poměrně do 20 % energie', () => {
    const meal = handMade([
      { need: 1, eaten: { ...NONE, meatKg: meatKg(0.1), grainKg: 0.9 } },
      { need: 0, eaten: NONE },
      { need: 0, eaten: NONE },
      { need: 3, eaten: { ...NONE, fruitKg: fruitKg(0.3), grainKg: 2.7 } },
    ]);
    const h = dietHappiness(meal, [1, 0, 0, 3]);
    // rod 10 % energie z masa = půl plného štěstí z masa
    expect(h.meat).toBeCloseTo((DIET.meatHappiness.max / 2) * (1 / 4), 12);
    expect(h.fruit).toBeCloseTo(DIET.fruitHappiness * (3 / 4), 12);
    expect(h.honey).toBe(0);
  });

  it('ves bez lidí nemá štěstí ze stravy', () => {
    const meal = tierMeal(split([0, 0, 0, 0]), NONE);
    expect(dietHappiness(meal, [0, 0, 0, 0])).toEqual({ fruit: 0, meat: 0, honey: 0 });
  });

  it('z jídla po vrstvách: maso elitě dá štěstí jen elitě', () => {
    // maso 1 z 10 – celé ho sní rod (2 lidé, potřeba 2): podíl masa 50 % → plné +3 jen rodu
    const meal = tierMeal(split(NEEDS), { ...NONE, meatKg: meatKg(1), grainKg: 9 });
    const h = dietHappiness(meal, [2, 0, 0, 8]);
    expect(h.meat).toBeCloseTo((DIET.meatHappiness.max * 2) / 10, 12);
  });
});
