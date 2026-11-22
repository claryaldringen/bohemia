import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import {
  DAILY_MEAT_KEEP,
  DIET,
  eatDiet,
  grainAheadForOutlookKg,
  grainKeepPerDay,
  meatEnergy,
  type DietInput,
} from '../diet';
import { eat } from '../simulate-food';
import { advanceVillage } from '../simulate';
import { NO_CRAFTS } from '../productivity';
import { SEED_STORES, STARVATION } from '../../rules';
import { HUNGER_PRIORITY } from '../../rules/rules-people';
import {
  groupStarvation,
  hungerSplit,
  rationShares,
  villageRationFor,
} from '../../people/hunger-groups';
import { dayMealInput, emergencySlaughterPlan } from '../../livestock/emergency-slaughter';
import { seedKeepKg } from '../../fields/seed';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';
import type { Person, VillageState } from '../../types';

// Dlouhý hlad (diet.md – Kdo dostane co, Dlouhý hladomor, V hladu do sklizně; Martin 22. 11. 2026
// „ano“ na uskromnění rodu): rod dostane víc jen z jídla, které zbytek vsi k přežití do sklizně
// nepotřebuje, a zásoba z porážky 1. 11. se v hladu sní do sklizně.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;

/**
 * Ves ke dni `day`: dvorec vojvody (vojvoda a žena – rod) a zbytek vsi (12 dospělých, s `child`
 * i dítě); bez polí, stád a jiného jídla. Obilí dá výhled do sklizně právě `ration`.
 */
function village(day: number, ration: number, child: boolean | 'lord' = false): VillageState {
  const born = (age: number): number => day - Math.ceil((age + 0.5) * YEAR);
  const adult = (id: number, dwellingId: number, extra: Partial<Person> = {}): Person => ({
    id,
    bornDay: born(25 + (id % 5)),
    dwellingId,
    ...extra,
  });
  const people: Person[] = [
    adult(10, 1, { sex: 'male', spouseId: 11 }),
    adult(11, 1, { sex: 'female', spouseId: 10 }),
    ...Array.from({ length: 12 }, (_, i) => adult(30 + i, 3)),
    ...(child ? [{ id: 50, bornDay: born(8), dwellingId: child === 'lord' ? 1 : 3 }] : []),
  ];
  const state = withoutSmallGame({
    seed: 5,
    foundedDay: day - 100 * 366,
    lastDay: day - 1,
    nextId: 10_000,
    people,
    manorId: 1,
    dwellings: [1, 3].map((id) => ({
      id,
      type: 'zemnice' as const,
      builtDay: day - 100,
      condition: 1,
      position: { x: id * 10, z: 0, rotation: 0 },
    })),
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    livestock: {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    },
  } as unknown as VillageState);
  const input = dayMealInput(state, day, NO_CRAFTS.pottery, 1);
  state.storesKg = grainAheadForOutlookKg(input, ration) / grainKeepPerDay(input);
  return state;
}

/** Příděl k přežití do žní podle pravidel (nejcitlivější práh `limit`, hlad 0). */
function survival(limit: number, days: number): number {
  return STARVATION.fedFrom * Math.max(0, 1 - (limit - SEED_STORES.marginDays) / days);
}

describe('dlouhý hlad – rod se uskrovní, aby zbytek vsi přežil do sklizně', () => {
  it('sklizeň za ≈ 150 dní, jídlo na 80 %: zbytek vsi dostane příděl k přežití, rod jen zbytek', () => {
    const day = at(700, 4, 3);
    const s = village(day, 0.8);
    const days = dayMealInput(s, day, NO_CRAFTS.pottery, 1).daysToHarvest;
    expect(days).toBe(151);
    const { needs } = hungerSplit(s, day);
    const total = needs.reduce((sum, n) => sum + n, 0);
    const result = eat(s, day, NO_CRAFTS);
    expect(result.energy).toBeCloseTo(0.8, 9);
    // samí dospělí – práh 20 dní hladu: příděl k přežití 0,9 × (1 − 19 / 151) ≈ 78,7 %
    const minimum = survival(STARVATION.threshold.adult, days);
    expect(minimum).toBeGreaterThan(HUNGER_PRIORITY.minimumShare);
    const energy = result.groups!.energy;
    expect(energy[3]).toBeCloseTo(minimum, 9);
    // rod jen to, co zbude – hladoví taky (dřív plný příděl)
    expect(energy[0]).toBeCloseTo((0.8 * total - minimum * needs[3]!) / needs[0]!, 9);
    expect(energy[0]).toBeLessThan(1);
    // hráč vidí příděl zbytku vsi
    expect(s.ration).toBeCloseTo(minimum, 9);
  });

  it('když jídlo nestačí ani na přežití zbytku vsi, jedí všichni stejně – i rod', () => {
    const day = at(700, 4, 3);
    // s dítětem práh 12 dní: příděl k přežití 0,9 × (1 − 11 / 151) ≈ 83,4 % – víc, než ves má
    const s = village(day, 0.8, true);
    expect(survival(STARVATION.threshold.child, 151)).toBeGreaterThan(0.8);
    const energy = eat(s, day, NO_CRAFTS).groups!.energy;
    expect(energy[0]).toBeCloseTo(0.8, 9);
    expect(energy[3]).toBeCloseTo(0.8, 9);
  });

  it('dítě v rodu nezvedne minimum zbytku vsi, který jsou samí dospělí', () => {
    const day = at(700, 4, 3);
    const s = village(day, 0.8, 'lord');
    expect(hungerSplit(s, day).groupOf.get(50)).toBe(0);
    const minimum = survival(STARVATION.threshold.adult, 151);
    // práh dospělých dá ≈ 78,7 %, práh dítěte celé vsi by dal 83,4 % a rod by nedostal nic navíc
    expect(minimum).toBeLessThan(0.8);
    const energy = eat(s, day, NO_CRAFTS).groups!.energy;
    expect(energy[3]).toBeCloseTo(minimum, 9);
    expect(energy[0]).toBeGreaterThan(0.8);
  });

  it('den po dni do žní: zbytek vsi nepřekročí práh dospělých, rod jí víc jen nad minimem', () => {
    const start = at(700, 4, 3);
    // dítě v rodu, zbytek vsi samí dospělí; jídlo na 80 % do žní
    let s = village(start, 0.8, 'lord');
    const threshold = STARVATION.threshold.adult;
    let lordHungerSum = 0;
    let restHungerSum = 0;
    for (let day = start; day < start + 148; day++) {
      s = advanceVillage(s, day + 1, null);
      const [g0, , , g3] = groupStarvation(s) as [number, number, number, number];
      expect(g3).toBeLessThan(threshold);
      expect(g0).toBeLessThanOrEqual(g3 + 1e-9);
      lordHungerSum += g0;
      restHungerSum += g3;
    }
    // zbytek vsi hladoví (jídlo je jen na 80 %), rod méně – jí nad minimem
    expect(restHungerSum).toBeGreaterThan(0);
    expect(lordHungerSum).toBeLessThan(restHungerSum);
  });

  it('krátký hlad (sklizeň za 41 dní) beze změny – minimum 75 % a zbytek po vrstvách', () => {
    const day = at(700, 7, 22);
    const s = village(day, 0.8);
    expect(survival(STARVATION.threshold.adult, 41)).toBeLessThan(HUNGER_PRIORITY.minimumShare);
    const { needs } = hungerSplit(s, day);
    const total = needs.reduce((sum, n) => sum + n, 0);
    const energy = eat(s, day, NO_CRAFTS).groups!.energy;
    expect(energy[0]).toBe(1);
    expect(energy[3]).toBeCloseTo((0.8 * total - needs[0]!) / needs[3]!, 9);
  });

  it('přežívací zásoba (seedKeepKg) se nemění – obrácený příděl dá zbytku vsi týž cíl', () => {
    // rozbor: cíl zbytku vsi t je aspoň příděl k přežití s; příděl vsi z `villageRationFor`
    // (minimum 75 %) rozdělený s minimem max(75 %, s) dá zbytku vsi právě t a vyšší vrstvy syté
    const cases = [
      [2, 0, 0, 12],
      [3, 1, 2, 10],
      [1, 0, 0, 1],
      [6, 0, 4, 0],
    ];
    for (const needs of cases) {
      const last = needs[3]! > 0 ? 3 : 2;
      for (const s of [0, 0.6, 0.78, 0.85]) {
        for (const t of [0.5, 0.75, 0.8, 0.85, 0.9]) {
          if (t < s) continue;
          const shares = rationShares(villageRationFor(t, needs), needs, Math.max(0.75, s));
          expect(shares[last]).toBeCloseTo(t, 12);
          if (t > HUNGER_PRIORITY.minimumShare) {
            needs.forEach((need, g) => {
              if (g < last && need > 0) expect(shares[g]).toBeCloseTo(1, 12);
            });
          }
        }
      }
    }
    // přežívací zásoba podle dřívějšího výpočtu (cíl zbytku vsi, obrácený příděl s minimem 75 %)
    for (const [day, child, hunger] of [
      [at(700, 4, 3), false, 0],
      [at(700, 4, 3), true, 3],
      [at(700, 1, 10), false, 6],
      [at(700, 7, 22), false, 0],
    ] as const) {
      const s = village(day, 0.5, child);
      s.starvationDays = hunger;
      const meal = dayMealInput(s, day, NO_CRAFTS.pottery, 1);
      const limit = child ? STARVATION.threshold.child : STARVATION.threshold.adult;
      const slack = Math.max(0, limit - SEED_STORES.marginDays - hunger);
      const ration = STARVATION.fedFrom * Math.max(0, 1 - slack / meal.daysToHarvest);
      const needs = hungerSplit(s, day).needs;
      const kg =
        grainAheadForOutlookKg(meal, villageRationFor(ration, needs)) / grainKeepPerDay(meal);
      expect(kg).toBeGreaterThan(0);
      expect(seedKeepKg(s, day, meal)).toBeCloseTo(kg, 6);
    }
  });
});

describe('dlouhý hlad – zásoba z porážky 1. 11. se v hladu sní do sklizně', () => {
  const NEED = 10;
  const DAYS = 100;
  const MEAT_END = 200;
  /** Zásoba z 1. 11. (kg) – celá ≈ 60 % potřeby za 100 dní do sklizně. */
  const STORE = (0.6 * NEED * DAYS) / DIET.meatEnergy;
  const input = (over: Partial<DietInput>): DietInput => ({
    grainKg: 1e6,
    meatKg: STORE,
    slaughterMeatKg: STORE,
    fruitKg: 0,
    needPerDay: NEED,
    daysToHarvest: DAYS,
    daysToRot: 0,
    daysToMeatEnd: MEAT_END,
    potteryCoverage: NO_CRAFTS.pottery,
    ...over,
  });

  it('v hladu díl do sklizně, mimo hlad do konce masa (31. 8.)', () => {
    const fed = eatDiet(input({}));
    expect(fed.outlook).toBe(1);
    expect(meatEnergy(fed.eaten.meatKg)).toBeCloseTo(
      meatEnergy(STORE * DAILY_MEAT_KEEP) / MEAT_END,
      9,
    );
    const hungry = eatDiet(input({ grainKg: 0.3 * NEED * DAYS }));
    expect(hungry.outlook).toBeLessThan(1);
    expect(meatEnergy(hungry.eaten.meatKg)).toBeCloseTo(
      meatEnergy(STORE * DAILY_MEAT_KEEP) / DAYS,
      9,
    );
  });

  it('výhled počítá tentýž díl jako jídlo – příděl rovný do žní, zásoba z 1. 11. vyjde na den žní', () => {
    let grainKg = 0.3 * NEED * DAYS;
    let meatKg = STORE;
    let slaughterMeatKg = STORE;
    const outlooks: number[] = [];
    const energy: number[] = [];
    for (let day = 0; day < DAYS; day++) {
      const meal = eatDiet(
        input({
          grainKg,
          meatKg,
          slaughterMeatKg,
          daysToHarvest: DAYS - day,
          daysToMeatEnd: MEAT_END - day,
        }),
      );
      outlooks.push(meal.outlook);
      energy.push(meal.diet.energy);
      grainKg = meal.grainKg;
      meatKg = meal.meatKg;
      slaughterMeatKg = meal.slaughterMeatKg;
    }
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    expect(outlooks[0]).toBeLessThan(1);
    // jí se, co výhled slíbil; nepatrný sklon (≈ 1e-4) je ze ztráty obilí skladováním – výhled bere
    // obilí rovným dílem, díl masa ale ubývá s uzením a obilí se tak jí víc ke konci (i dřív)
    expect(spread(outlooks)).toBeLessThan(1e-3);
    energy.forEach((e, day) => expect(e).toBeCloseTo(outlooks[day]!, 9));
    // nic nečeká na dobu po sklizni – obilí i zásoba z 1. 11. došly právě na den žní
    expect(slaughterMeatKg).toBeCloseTo(0, 6);
    expect(grainKg).toBeCloseTo(0, 6);
  });

  it('obrácený výhled zná díl do sklizně – zásoba obilí na cíl dá právě ten příděl', () => {
    for (const x of [0.6, 0.8, 0.95]) {
      const base = input({ grainKg: 0 });
      const grainKg = grainAheadForOutlookKg(base, x) / grainKeepPerDay(base);
      expect(eatDiet({ ...base, grainKg }).outlook).toBeCloseTo(x, 9);
    }
  });

  it('nouzová porážka: v hladu se zásoba z 1. 11. sní do sklizně ozimu – zvířata navíc netřeba', () => {
    const day = at(600, 4, 1);
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: day - 1, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.lastDay = day - 1;
    s.applesKg = 0;
    s.cheeseKg = 0;
    s.legumesKg = 0;
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 60, cow: 0 };
    s.livestock!.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    s.livestock!.land = { meadowHa: 60, forestHa: 10 };
    const first = dayMealInput(s, day, 0, 1);
    // sklizeň ozimu 31. 7. – měsíc před koncem masa (31. 8.)
    const days = first.daysToMeatEnd - 31;
    s.storesKg = 0.2 * first.needPerDay * days;
    s.meatKg = (0.9 * first.needPerDay * days) / DIET.meatEnergy;
    s.slaughterMeatKg = s.meatKg;
    // bez letní porážky rodu – ves jsou jen osadníci (rod), maso z ní by výhled zvedlo samo
    const today = { ...dayMealInput(s, day, 0, 1), daysToHarvest: days, freshAheadEnergy: 0 };
    // dílem do konce masa by se do sklizně snědlo jen ≈ 80 % zásoby – výhled by nevyšel
    expect(eatDiet(today).outlook).toBe(1);
    expect(emergencySlaughterPlan(s, day, 0, 1, today)).toBeNull();
  });
});
