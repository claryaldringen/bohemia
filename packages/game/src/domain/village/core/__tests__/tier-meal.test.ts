import { describe, expect, it } from 'vitest';
import { DIET, dietOf, fruitEnergy, honeyEnergy, meatEnergy, type Eaten } from '../diet';
import { dietHappiness, tierMeal, type TierMeal } from '../tier-meal';
import { APPLE_FOOD_VALUE, LEGUMES } from '../../rules';
import { HONEY } from '../../rules/rules-wares';
import { DAIRY } from '../../livestock/dairy';

// Jídlo po vrstvách (diet.md – Strava po vrstvách a porážka celý rok – Kdo dostane co, Spokojenost
// ze stravy): příděl energie nad životním minimem 75 % po vrstvách, pak čím se příděl naplní –
// ovoce a pevný příděl medu všem stejně, ostatní jídlo po vrstvách.

/** Nic nesnědeno – všechna pole `Eaten` (nové pole vynutí úpravu testů i úrovní `tierMeal`). */
const NONE: Record<keyof Required<Eaten>, number> = {
  grainKg: 0,
  meatKg: 0,
  freshMeatKg: 0,
  fruitKg: 0,
  milkL: 0,
  milkProteinKg: 0,
  milkEnergy: 0,
  cheeseKg: 0,
  eggsKg: 0,
  legumesKg: 0,
  honeyKg: 0,
  honeyRationKg: 0,
};
const FIELDS = Object.keys(NONE) as (keyof Eaten)[];
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
/** Kg medu s energií `energy` (kg obilí). */
const honeyKg = (energy: number): number => energy / HONEY.energyPerKg;
/** Pevný příděl medu s energií `energy` – celý med je pevný příděl. */
const ration = (energy: number): Pick<Eaten, 'honeyKg' | 'honeyRationKg'> => ({
  honeyKg: honeyKg(energy),
  honeyRationKg: honeyKg(energy),
});

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

  it('pod životním minimem beze změny i s ovocem a medem – všichni stejný podíl', () => {
    // 4 z 10: ovoce a pevný příděl medu po potřebě 1 : 4, obilí dorovná každému 40 %
    const meal = tierMeal(split(NEEDS), {
      ...NONE,
      fruitKg: fruitKg(1),
      ...ration(0.05),
      grainKg: 2.95,
    });
    for (const t of [0, 3]) {
      expect(meal.energy[t]).toBeCloseTo(0.4, 12);
      expect(meal.diets[t]!.energy).toBeCloseTo(0.4, 12);
    }
    expect(fruitEnergy(meal.eaten[0]!.fruitKg)).toBeCloseTo(0.2, 12);
    expect(fruitEnergy(meal.eaten[3]!.fruitKg)).toBeCloseTo(0.8, 12);
    expect(meal.eaten[0]!.grainKg).toBeCloseTo(0.8 - 0.2 - 0.01, 12);
    expect(meal.eaten[3]!.grainKg).toBeCloseTo(3.2 - 0.8 - 0.04, 12);
  });

  it('prázdná vrstva má plno a nic nesní – nad minimem i pod ním, i s pevným přídělem medu', () => {
    for (const grainKg of [4.5, 2]) {
      for (const honey of [{ honeyKg: 0.01 }, { honeyKg: 0.01, honeyRationKg: 0.01 }]) {
        const meal = tierMeal(split([0, 0, 0, 5]), { ...NONE, grainKg, ...honey });
        for (const t of [0, 1, 2]) {
          expect(meal.energy[t]).toBe(1);
          for (const field of FIELDS) expect(meal.eaten[t]![field] ?? 0).toBe(0);
        }
        expect(meal.energy[3]).toBeCloseTo((grainKg + honeyEnergy(0.01)) / 5, 12);
      }
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

  it('pořadí po vrstvách: mléko, vejce, čerstvé maso, uzené, sýr, luštěniny, obilí, med navíc', () => {
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
        5 - 0.4 * 3 - 0.5 - 0.5 * DAIRY.cheeseEnergy - 0.5 * LEGUMES.energy - honeyEnergy(0.01),
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
    // zbytek vsi: zbytek čerstvého masa, uzené, sýr, luštěniny, obilí a med navíc (bez přídělu)
    expect(rest.freshMeatKg).toBeCloseTo(meatKg(0.2), 12);
    expect(rest.meatKg).toBeCloseTo(meatKg(0.7), 12);
    expect(rest.cheeseKg).toBeCloseTo(0.5, 12);
    expect(rest.legumesKg).toBeCloseTo(0.5, 12);
    expect(rest.honeyKg).toBeCloseTo(0.01, 12);
    for (const e of meal.energy) expect(e).toBeCloseTo(1, 12);
  });

  it('uzené před sýrem, sýr před luštěninami a obilím, med navíc až za obilím', () => {
    const meal = tierMeal(split([1, 0, 0, 1]), {
      ...NONE,
      meatKg: meatKg(0.5),
      cheeseKg: 0.3 / DAIRY.cheeseEnergy,
      legumesKg: 0.4 / LEGUMES.energy,
      grainKg: 0.7,
      honeyKg: honeyKg(0.1),
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
    expect(honeyEnergy(rest.honeyKg)).toBeCloseTo(0.1, 12);
  });

  it('ovoce a pevný příděl medu všem stejně podle potřeby – i sytá elita, elitě o to méně masa', () => {
    // maso 3 by rod nasytilo samo (dřív bez ovoce); teď rod sní 2/10 ovoce i medu a masa o to míň
    const meal = tierMeal(split(NEEDS), {
      ...NONE,
      meatKg: meatKg(3),
      fruitKg: fruitKg(1),
      ...ration(0.1),
      grainKg: 5.9,
    });
    const [elite, , , rest] = meal.eaten as [Eaten, Eaten, Eaten, Eaten];
    expect(fruitEnergy(elite.fruitKg)).toBeCloseTo(0.2, 12);
    expect(fruitEnergy(rest.fruitKg)).toBeCloseTo(0.8, 12);
    expect(elite.honeyKg).toBeCloseTo(honeyKg(0.02), 12);
    expect(elite.honeyRationKg).toBeCloseTo(honeyKg(0.02), 12);
    expect(rest.honeyKg).toBeCloseTo(honeyKg(0.08), 12);
    // maso, které rod kvůli ovoci a medu nesní, sní zbytek vsi
    expect(meatEnergy(elite.meatKg)).toBeCloseTo(2 - 0.22, 12);
    expect(meatEnergy(rest.meatKg)).toBeCloseTo(3 - (2 - 0.22), 12);
    expect(elite.grainKg).toBe(0);
    expect(rest.grainKg).toBeCloseTo(5.9, 12);
    for (const e of meal.energy) expect(e).toBeCloseTo(1, 12);
  });

  it('ovoce, které se do přídělu vrstvy nevejde, se přerozdělí ostatním', () => {
    // 9 z 10 jen z ovoce: rovným dílem 0,9 potřeby – zbytku vsi by to dalo 7,2, příděl má 7;
    // 0,2 navíc dostane rod (do plna)
    const meal = tierMeal(split(NEEDS), { ...NONE, fruitKg: fruitKg(9) });
    expect(fruitEnergy(meal.eaten[0]!.fruitKg)).toBeCloseTo(2, 12);
    expect(fruitEnergy(meal.eaten[3]!.fruitKg)).toBeCloseTo(7, 12);
    expect(meal.energy[0]).toBe(1);
    expect(meal.energy[3]).toBeCloseTo(0.875, 12);
  });

  it('v hladu: pevný příděl medu všem stejně, med navíc po vrstvách za obilím', () => {
    // 9 z 10: med 0,3 kg, z toho pevný příděl 0,1 kg – rod 0,02 kg, zbytek vsi 0,08 kg a med navíc
    const honey = { honeyKg: 0.3, honeyRationKg: 0.1 };
    const meal = tierMeal(split(NEEDS), { ...NONE, ...honey, grainKg: 9 - honeyEnergy(0.3) });
    const [elite, , , rest] = meal.eaten as [Eaten, Eaten, Eaten, Eaten];
    expect(elite.honeyRationKg).toBeCloseTo(0.02, 12);
    expect(elite.honeyKg).toBeCloseTo(0.02, 12);
    expect(rest.honeyRationKg).toBeCloseTo(0.08, 12);
    expect(rest.honeyKg).toBeCloseTo(0.08 + 0.2, 12);
    expect(elite.grainKg).toBeCloseTo(2 - honeyEnergy(0.02), 12);
    expect(meal.energy[0]).toBe(1);
    expect(meal.energy[3]).toBeCloseTo(0.875, 12);
  });

  it('součet vrstev = snědené vsi, i když by snědené přesáhlo potřebu', () => {
    const eaten: Record<keyof Required<Eaten>, number> = {
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
      honeyRationKg: 0.03,
    };
    const needs = [1.3, 0.7, 2.1, 9.4];
    // pod minimem, těsně nad ním, nad ním a přes potřebu (nemá nastat – přebytek sní zbytek vsi)
    for (const scale of [0.3, 0.8, 1, 1.2, 1.4]) {
      const input = Object.fromEntries(
        Object.entries(eaten).map(([key, kg]) => [key, kg * scale]),
      ) as Record<keyof Required<Eaten>, number>;
      const meal = tierMeal(split(needs, [0.2, 0.1, 0.3, 1.2]), input);
      for (const field of FIELDS) {
        const sum = meal.eaten.reduce((a, tier) => a + (tier[field] ?? 0), 0);
        expect(sum).toBeCloseTo(input[field], 9);
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

  it('maso, ovoce a med průměrem přes jedlíky podle toho, co kdo snědl', () => {
    // rod (2 lidé) jí 30 % energie z masa a med, zbytek vsi (8 lidí) jen obilí
    const meal = handMade([
      {
        need: 2,
        eaten: { ...NONE, meatKg: meatKg(0.6), honeyKg: honeyKg(0.1), grainKg: 1.3 },
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

  it('ves bez jedlíků nemá štěstí ze stravy', () => {
    const meal = tierMeal(split([0, 0, 0, 0]), NONE);
    expect(dietHappiness(meal, [0, 0, 0, 0])).toEqual({ fruit: 0, meat: 0, honey: 0 });
  });

  it('z jídla po vrstvách: maso elitě dá štěstí jen elitě', () => {
    // maso 1 z 10 – celé ho sní rod (2 lidé, potřeba 2): podíl masa 50 % → plné +3 jen rodu
    const meal = tierMeal(split(NEEDS), { ...NONE, meatKg: meatKg(1), grainKg: 9 });
    const h = dietHappiness(meal, [2, 0, 0, 8]);
    expect(h.meat).toBeCloseTo((DIET.meatHappiness.max * 2) / 10, 12);
  });

  it('z jídla po vrstvách: sytá elita z masa má z ovoce +5 a z medu +2 jako ostatní', () => {
    const meal = tierMeal(split(NEEDS), {
      ...NONE,
      meatKg: meatKg(3),
      fruitKg: fruitKg(1),
      ...ration(0.1),
      grainKg: 5.9,
    });
    const h = dietHappiness(meal, [2, 0, 0, 8]);
    expect(h.fruit).toBeCloseTo(DIET.fruitHappiness, 12);
    expect(h.honey).toBeCloseTo(HONEY.happiness, 12);
    // rod 89 % energie z masa (+3), zbytek vsi 1,22 z 8 = 15,25 % (poměrně)
    const restMeat = (DIET.meatHappiness.max * (1.22 / 8)) / DIET.meatHappiness.fullShare;
    expect(h.meat).toBeCloseTo((2 * DIET.meatHappiness.max + 8 * restMeat) / 10, 12);
  });
});
