import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { DIET } from '../diet';
import {
  closeFieldFoodYear,
  fieldFoodShare,
  fieldShareOf,
  recordFieldFood,
  sowingTargetKg,
  yearlyFieldNeed,
  yearlyFoodNeed,
} from '../field-food';
import { hasGoodStores } from '../happiness';
import { expectedLegumeKg, legumeEnergy } from '../legumes';
import { expectedNetKg } from '../fields';
import {
  FIELD_FOOD,
  FOOD_NEED_KG_PER_YEAR,
  LEGUMES,
  SOW_RESERVE,
  STORES_HIGH_YEARS,
} from '../rules';
import { advanceVillage } from '../simulate';
import type { DietDay, VillageState } from '../types';
import { planCrops } from '../year-plan';

// Osev podle stravy (fields.md – Kolik ves oseje, Osev podle stravy).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole ≈ 4 ha – víc, než ves oseje, ať osev určuje cíl, ne půda. */
const field = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((150 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

const found = (day: number): VillageState =>
  foundVillage({
    seed: 42,
    day,
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field() },
  });

const diet = (shares: Partial<DietDay['shares']>): DietDay => ({
  energy: 1,
  protein: 1,
  diversity: 1,
  satiation: 1,
  shares: { grain: 0, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, ...shares },
});

/** Ves bez polí s danými lidmi (2 dospělí, 2 děti) a zásobami. */
function village(stores = 0): VillageState {
  const day = at(600, 9, 1);
  const s = found(at(600, 3, 1));
  s.storesKg = stores;
  return { ...s, lastDay: day - 1 };
}

/** Očekávaná energie plánu (kg obilí) – obilí a luštěniny jejich energií. */
function planEnergy(s: VillageState, day: number): number {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  let kg = 0;
  for (const { crop, work } of planCrops(s.plan!)) {
    for (const id of work.partIds) {
      const part = byId.get(id)!;
      kg +=
        crop === 'legume' ? legumeEnergy(expectedLegumeKg(part, day)) : expectedNetKg(part, day);
    }
  }
  return kg;
}

describe('podíl jídla z pole', () => {
  it('pole dá, co nepokryje maso, mléko a sýr, vejce a ovoce – nejméně nic', () => {
    const mixed = diet({ grain: 0.3, meat: 0.4, dairy: 0.2, eggs: 0.05, fruit: 0.05 });
    expect(fieldShareOf(mixed)).toBeCloseTo(0.3, 12);
    // luštěniny a obilí jsou z pole – podíl neubírají
    expect(fieldShareOf(diet({ grain: 0.5, legumes: 0.25 }))).toBe(1);
    expect(fieldShareOf(diet({ meat: 0.4, dairy: 0.3, fruit: 0.25, eggs: 0.1 }))).toBe(0);
  });

  it('plánovaný podíl: bez změřeného roku 1, jinak změřený, nejméně FIELD_FOOD.minShare', () => {
    expect(fieldFoodShare({})).toBe(1);
    expect(fieldFoodShare({ fieldFood: { needKg: 10, fieldKg: 5 } })).toBe(1);
    expect(fieldFoodShare({ fieldFood: { needKg: 0, fieldKg: 0, share: 0.45 } })).toBe(0.45);
    expect(fieldFoodShare({ fieldFood: { needKg: 0, fieldKg: 0, share: 0.1 } })).toBe(
      FIELD_FOOD.minShare,
    );
  });

  it('pojistka = co maso a mléko na svých stropech nepokryjí (diet.md)', () => {
    expect(FIELD_FOOD.minShare).toBeCloseTo(1 - DIET.caps.meat - DIET.caps.dairy, 12);
  });

  it('součty běží od 1. 9. – první 1. 9. je začne, další spočítá podíl celého roku', () => {
    const s = village();
    recordFieldFood(s, 2, diet({ meat: 0.5 }));
    expect(s.fieldFood).toBeUndefined(); // před prvním 1. 9. se nesčítá
    closeFieldFoodYear(s);
    expect(s.fieldFood).toEqual({ needKg: 0, fieldKg: 0 });
    recordFieldFood(s, 2, diet({ meat: 0.5 })); // 1 kg z pole
    recordFieldFood(s, 2, diet({ meat: 0.4, dairy: 0.3 })); // 0,6 kg z pole
    recordFieldFood(s, 0, diet({ meat: 1 })); // nikdo nejí – nic
    expect(s.fieldFood?.needKg).toBe(4);
    expect(s.fieldFood?.fieldKg).toBeCloseTo(1.6, 12);
    closeFieldFoodYear(s);
    expect(s.fieldFood?.needKg).toBe(0);
    expect(s.fieldFood?.fieldKg).toBe(0);
    expect(s.fieldFood?.share).toBeCloseTo(0.4, 12);
  });
});

describe('cíl osevu', () => {
  it('bez změřeného roku jako dřív: roční potřeba + rezerva, při velkých zásobách jen potřeba', () => {
    const s = village(100);
    const day = at(600, 9, 1);
    const need = s.people.reduce((sum, p) => sum + (day - p.bornDay < 14 * 365.25 ? 100 : 180), 0);
    expect(yearlyFoodNeed(s, day)).toBe(need);
    expect(need).toBe(2 * FOOD_NEED_KG_PER_YEAR.adult + 2 * FOOD_NEED_KG_PER_YEAR.child);
    expect(sowingTargetKg(s, day)).toBeCloseTo(need * (1 + SOW_RESERVE), 9);
    expect(sowingTargetKg(s, day, 12)).toBeCloseTo(need * (1 + SOW_RESERVE), 9);
    s.storesKg = STORES_HIGH_YEARS * need + 1;
    expect(sowingTargetKg(s, day)).toBe(need);
  });

  it('se změřeným podílem: potřeba z pole + rezerva obilí + rezerva luštěnin', () => {
    const s = village(0);
    const day = at(600, 9, 1);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.4 };
    const need = 0.4 * yearlyFoodNeed(s, day);
    expect(yearlyFieldNeed(s, day)).toBeCloseTo(need, 9);
    expect(sowingTargetKg(s, day)).toBeCloseTo(need * (1 + SOW_RESERVE), 9);
    // rezerva luštěnin se přičte – luštěniny rezervu obilí neuberou
    expect(sowingTargetKg(s, day, 12)).toBeCloseTo(need * (1 + SOW_RESERVE) + 12, 9);
    // práh zásob: jen obilí (luštěniny mají strop, výpadek masa nedorovnají)
    s.storesKg = STORES_HIGH_YEARS * need * 0.8;
    s.legumesKg = (STORES_HIGH_YEARS * need) / LEGUMES.energy;
    expect(sowingTargetKg(s, day)).toBeCloseTo(need * (1 + SOW_RESERVE), 9);
    s.storesKg = STORES_HIGH_YEARS * need + 1;
    expect(sowingTargetKg(s, day)).toBeCloseTo(need, 9);
    expect(sowingTargetKg(s, day, 12)).toBeCloseTo(need + 12, 9);
    // pod pojistkou se seje na FIELD_FOOD.minShare
    s.fieldFood.share = 0.05;
    expect(yearlyFieldNeed(s, day)).toBeCloseTo(FIELD_FOOD.minShare * yearlyFoodNeed(s, day), 9);
  });

  it('dobré zásoby (štěstí) proti potřebě z pole, ne proti celé energii', () => {
    const s = village(0);
    const day = at(600, 9, 1);
    s.fieldFood = { needKg: 0, fieldKg: 0, share: 0.4 };
    s.storesKg = 0.6 * yearlyFoodNeed(s, day); // víc než rok potřeby z pole, méně než celé energie
    expect(hasGoodStores(s, day)).toBe(true);
    delete s.fieldFood;
    expect(hasGoodStores(s, day)).toBe(false);
  });
});

describe('osev podle stravy v simulaci', () => {
  it('druhý rok ves oseje podle toho, co z pole opravdu jedla – méně než ves bez podílu', () => {
    const start = found(at(600, 3, 15));
    // první 1. 9. po založení: součty začnou, plán ještě jako dřív (jen obilí)
    const first = advanceVillage(start, at(600, 9, 1), null);
    expect(first.fieldFood).toEqual(expect.objectContaining({ needKg: expect.any(Number) }));
    expect(first.fieldFood?.share).toBeUndefined();
    // rok se stády – mléko, vejce a od listopadu maso pokryjí část energie
    const before = advanceVillage(first, at(601, 8, 31), null);
    const day = at(601, 9, 1);
    const measured = advanceVillage(before, day, null);
    const share = measured.fieldFood!.share!;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.9);
    expect(share).toBeCloseTo(before.fieldFood!.fieldKg / before.fieldFood!.needKg, 12);
    // stejná ves, která podíl nezná (starší ves), oseje víc
    const grainOnly = advanceVillage({ ...before, fieldFood: undefined }, day, null);
    expect(grainOnly.fieldFood?.share).toBeUndefined();
    const target = sowingTargetKg(measured, day);
    expect(target).toBeLessThan(sowingTargetKg(grainOnly, day));
    expect(planEnergy(measured, day)).toBeLessThan(planEnergy(grainOnly, day));
    // plán pokryje aspoň roční potřebu z pole (luštěniny smějí jít jen na rezervu)
    expect(planEnergy(measured, day)).toBeGreaterThanOrEqual(yearlyFieldNeed(measured, day) - 1e-6);
  });

  it('podíl jídla z pole nezávisí na kouscích dopočtu', () => {
    const start = found(at(600, 3, 15));
    const end = at(603, 10, 1);
    const whole = advanceVillage(start, end, null);
    let pieces = start;
    const steps = [1, 29, 365, 3, 200, 61];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces.fieldFood).toEqual(whole.fieldFood);
    expect(pieces).toEqual(whole);
    expect(whole.fieldFood?.share).toBeLessThan(1);
  });
});
