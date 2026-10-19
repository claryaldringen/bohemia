import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { DIET, PROTEIN } from '../diet';
import { foodCosts, type FoodCosts } from '../economy';
import { yearlyFoodNeed } from '../field-food';
import {
  BALANCE,
  LIVESTOCK,
  TYPICAL_FOOD_COSTS,
  headEconomy,
  proteinBudget,
  sizeHerdsToNeed,
} from '../livestock';
import { LEGUMES } from '../rules';
import type { FieldPart, HerdSpecies, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Rovnovážné hospodaření (diet.md – Rovnovážné hospodaření): cena jídla v práci a skladba stád
// a luštěnin podle ní.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day = at(600, 11, 1)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

const COSTS: FoodCosts = { grainPerKg: 0.6, legumePerKg: 0.8, hayPerKg: 0.0125 };

describe('cena jídla v práci', () => {
  it('bez dílů v osevu typický díl; řemeslníci cenu snižují', () => {
    const worst = foodCosts({ parts: [] }, at(600, 9, 1), 0);
    const best = foodCosts({ parts: [] }, at(600, 9, 1), 1);
    expect(worst.grainPerKg).toBeGreaterThan(0.4);
    expect(worst.grainPerKg).toBeLessThan(0.8);
    // luštěniny dají míň a dají víc práce na kg než obilí
    expect(worst.legumePerKg).toBeGreaterThan(worst.grainPerKg);
    expect(best.grainPerKg).toBeLessThan(worst.grainPerKg);
    expect(best.hayPerKg).toBeLessThan(worst.hayPerKg);
    // výchozí cena plánu chovu bez údajů vsi
    expect(TYPICAL_FOOD_COSTS.grainPerKg).toBeCloseTo(worst.grainPerKg, 2);
    expect(TYPICAL_FOOD_COSTS.legumePerKg).toBeCloseTo(worst.legumePerKg, 2);
    expect(TYPICAL_FOOD_COSTS.hayPerKg).toBeCloseTo(worst.hayPerKg, 4);
  });

  it('obilí ze vzdálenějšího a vyčerpanějšího dílu je dražší', () => {
    const day = at(600, 9, 1);
    const near = foodCosts({ parts: [part(1)] }, day, 0);
    const far = foodCosts({ parts: [part(1, { distanceM: 900 })] }, day, 0);
    const poor = foodCosts({ parts: [part(1, { fertilityShare: 0.6 })] }, day, 0);
    expect(far.grainPerKg).toBeGreaterThan(near.grainPerKg);
    expect(poor.grainPerKg).toBeGreaterThan(near.grainPerKg);
    // příloh ani pole bez osevu cenu neurčují
    const withFallow = foodCosts(
      { parts: [part(1), part(2, { state: 'fallow', distanceM: 5000 })] },
      day,
      0,
    );
    expect(withFallow).toEqual(near);
  });

  it('seno z luk dál od vsi je dražší – podle letošního plánu seče', () => {
    const day = at(600, 7, 1);
    const typical = foodCosts({ parts: [] }, day, 0);
    const mowing = (required: number): Pick<VillageState, 'parts' | 'hay'> => ({
      parts: [],
      hay: { kg: 0, mowing: { required, done: 0, yieldKg: 1500, partIds: [] } },
    });
    const close = foodCosts(mowing(10), day, 0);
    const far = foodCosts(mowing(20), day, 0);
    expect(far.hayPerKg).toBeCloseTo(close.hayPerKg * 2, 9);
    expect(close.hayPerKg).not.toBe(typical.hayPerKg);
  });

  it('je deterministická a stav nemění', () => {
    const s = { parts: [part(1), part(2, { distanceM: 300 })] };
    const copy = structuredClone(s);
    expect(foodCosts(s, at(600, 9, 1), 0.5)).toEqual(foodCosts(s, at(600, 9, 1), 0.5));
    expect(s).toEqual(copy);
  });
});

describe('chovný kus za rok', () => {
  it('prase práci šetří – maso nahradí obilí, které by dalo víc práce', () => {
    const pig = headEconomy('pig', COSTS);
    expect(pig.dairyEnergy).toBe(0);
    expect(pig.labor - pig.meatEnergy * COSTS.grainPerKg).toBeLessThan(0);
  });

  it('kráva dá nejvíc mléka i práce, ovce a koza málo; seno zdraží přežvýkavce', () => {
    const cow = headEconomy('cow', COSTS);
    const sheep = headEconomy('sheep', COSTS);
    const goat = headEconomy('goat', COSTS);
    expect(cow.dairyEnergy).toBeGreaterThan(goat.dairyEnergy);
    expect(goat.dairyEnergy).toBeGreaterThan(sheep.dairyEnergy);
    expect(cow.labor).toBeGreaterThan(goat.labor);
    const dearHay = headEconomy('cow', { ...COSTS, hayPerKg: COSTS.hayPerKg * 2 });
    expect(dearHay.labor).toBeGreaterThan(cow.labor);
  });
});

describe('rovnovážná skladba stád', () => {
  const day = at(600, 11, 1);

  it('co práci šetří, i nad potřebu – v pořadí chovu (ovce napřed), do stropu masa', () => {
    const s = village(day);
    const keep = herds({ sheep: 6, goat: 4, pig: 60, cow: 5 });
    const sized = sizeHerdsToNeed(s, day, keep, { costs: COSTS });
    const energy = yearlyFoodNeed(s, day);
    // ovce, kozy a krávy práci šetří (obilí za 0,6 čd/kg) – všechny; prasata pak do stropu masa
    expect(sized.keep.sheep).toBeCloseTo(6, 9);
    expect(sized.keep.goat).toBeCloseTo(4, 9);
    expect(sized.keep.cow).toBeCloseTo(5, 9);
    expect(sized.keep.pig).toBeGreaterThan(LIVESTOCK.breedingMin);
    expect(sized.keep.pig).toBeLessThan(60);
    const meat = (['sheep', 'goat', 'pig', 'cow'] as const).reduce(
      (sum, sp) => sum + sized.keep[sp] * headEconomy(sp, COSTS).meatEnergy,
      0,
    );
    expect(meat).toBeLessThanOrEqual(
      DIET.caps.meat * energy + headEconomy('pig', COSTS).meatEnergy + 1e-6,
    );
    expect(sized.sufficient).toBe(true);
    expect(sized.coverage).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('pastva dražší než obilí: ovce jen do potřeby, prasata v lese dál práci šetří', () => {
    const s = village(day);
    const keep = herds({ sheep: 60, goat: 10, pig: 60, cow: 5 });
    const dearHay = { ...COSTS, hayPerKg: 0.05 };
    expect(headEconomy('sheep', dearHay).labor).toBeGreaterThan(
      6 * COSTS.grainPerKg, // ovce dá ≈ 6 kg obilí energie za rok
    );
    const sized = sizeHerdsToNeed(s, day, keep, { costs: dearHay });
    expect(sized.keep.pig).toBeGreaterThan(LIVESTOCK.breedingMin);
    // prasata pokryjí skoro celou potřebu – ovcí jen málo
    expect(sized.keep.sheep).toBeLessThan(60);
    expect(sized.coverage).toBeGreaterThanOrEqual(BALANCE.minProteinCoverage - 1e-9);
  });

  it('krávy na mléko a voly a chovné páry zůstanou vždy; nad nosnost nic', () => {
    const s = village(day);
    const sized = sizeHerdsToNeed(s, day, herds({ sheep: 500, goat: 9, pig: 9, cow: 6 }), {
      minCows: 4,
    });
    expect(sized.keep.cow).toBeGreaterThanOrEqual(4 - 1e-9);
    expect(sized.keep.goat).toBeGreaterThanOrEqual(LIVESTOCK.breedingMin - 1e-9);
    expect(sized.keep.sheep).toBeLessThan(500);
    const small = sizeHerdsToNeed(s, day, herds({ sheep: 3, pig: 1 }));
    expect(small.sufficient).toBe(false);
    expect(small.keep).toEqual(herds({ sheep: 3, pig: 1 }));
  });

  it('bílkoviny s rezervou 10 %; nad 88 % potřeby jen bílkoviny levnější než z obilí', () => {
    const s = village(day);
    const required = proteinBudget(s, day, herds({})).need * (1 + BALANCE.proteinReserve);
    expect(required).toBeGreaterThan(0);
    // prasata práci šetří – s nimi ves pokryje potřebu s rezervou celou
    const cheap = sizeHerdsToNeed(s, day, herds({ sheep: 40, goat: 20, pig: 60, cow: 10 }), {
      costs: COSTS,
    });
    expect(cheap.coverage).toBeGreaterThanOrEqual(1 - 1e-9);
    // bez prasat a s drahým senem: mléko narazí na strop podílu energie a bílkoviny z masa ovcí
    // a koz stojí víc práce než bílkoviny z obilí (dojení a péče jdou bokem – práce vsi je jen
    // seno a porážka) – ves skončí mezi 88 % a potřebou
    const keep = herds({ sheep: 40, goat: 20, pig: 2, cow: 10 });
    const dearHay = { ...COSTS, hayPerKg: 0.2 };
    const dear = sizeHerdsToNeed(s, day, keep, { costs: dearHay });
    expect(dear.coverage).toBeGreaterThanOrEqual(BALANCE.minProteinCoverage - 1e-9);
    expect(dear.coverage).toBeLessThan(1);
    expect(dear.keep.goat).toBeLessThan(20);
    // s levnějším obilím je hranice „levnější než z obilí“ níž – ves přidá míň
    const grainCheap = sizeHerdsToNeed(s, day, keep, { costs: { ...dearHay, grainPerKg: 0.2 } });
    expect(grainCheap.coverage).toBeGreaterThanOrEqual(BALANCE.minProteinCoverage - 1e-9);
    expect(grainCheap.coverage).toBeLessThanOrEqual(dear.coverage + 1e-9);
  });

  it('luštěniny jen při plánu osevu a jen kde jsou levnější než stádo', () => {
    const s = village(at(600, 9, 1));
    const d = at(600, 9, 1);
    // bez stáda nad chovné páry chybí bílkoviny – doplní je luštěniny
    const none = sizeHerdsToNeed(s, d, herds({ sheep: 2, goat: 2, pig: 2, cow: 2 }), {
      costs: COSTS,
      planLegumes: true,
    });
    // malá ves bez stáda: luštěniny až po strop podílu energie, víc nejde
    const cap = DIET.caps.legumes * yearlyFoodNeed(s, d);
    expect(none.legumeKg * LEGUMES.energy).toBeLessThanOrEqual(cap + 1e-6);
    expect(none.legumeKg * LEGUMES.energy).toBeGreaterThan(cap - 1e-6);
    expect(none.sufficient).toBe(false);
    // mimo plán osevu luštěniny ne
    const noPlan = sizeHerdsToNeed(s, d, herds({ sheep: 2, goat: 2, pig: 2, cow: 2 }), {
      costs: COSTS,
    });
    expect(noPlan.legumeKg).toBe(0);
    // s prasaty a ovcemi luštěniny jen dorovnají, co po stropech masa a mléka chybí
    const herd = sizeHerdsToNeed(s, d, herds({ sheep: 30, goat: 2, pig: 60, cow: 2 }), {
      costs: COSTS,
      planLegumes: true,
    });
    expect(herd.legumeKg).toBeLessThan(none.legumeKg / 4);
    expect(herd.coverage).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('pasáci plán stáda nestojí ani neomezují – omezí ho nosnost (winterTargets)', () => {
    const s = village(day);
    const keep = herds({ sheep: 60, goat: 2, pig: 2, cow: 2 });
    const plan = sizeHerdsToNeed(s, day, keep, { costs: COSTS });
    // ovce práci šetří (seno a porážka) – plán si je nechá, žádný strop pasáků
    expect(plan.keep.sheep).toBeGreaterThan(LIVESTOCK.breedingMin);
  });

  it('je deterministická a stav nemění', () => {
    const s = village(day);
    const copy = structuredClone(s);
    const keep = herds({ sheep: 30, goat: 6, pig: 20, cow: 4 });
    const a = sizeHerdsToNeed(s, day, keep, { costs: COSTS, planLegumes: true, minCows: 3 });
    const b = sizeHerdsToNeed(s, day, keep, { costs: COSTS, planLegumes: true, minCows: 3 });
    expect(a).toEqual(b);
    expect(s).toEqual(copy);
    expect(PROTEIN.gPerKgBody).toBe(1.6);
  });
});
