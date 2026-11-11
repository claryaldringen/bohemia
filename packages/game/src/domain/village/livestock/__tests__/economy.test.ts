import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { PROTEIN } from '../../core/diet';
import { foodCosts, type FoodCosts } from '../economy';
import {
  BALANCE,
  TYPICAL_FOOD_COSTS,
  headEconomy,
  proteinBudget,
  sizeHerdsToNeed,
} from '../livestock';
import type { FieldPart, HerdSpecies, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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

const COSTS: FoodCosts = { grainPerKg: 0.6, hayPerKg: 0.0125 };

describe('cena jídla v práci', () => {
  it('bez dílů v osevu typický díl; řemeslníci cenu snižují', () => {
    const worst = foodCosts({ parts: [] }, at(600, 9, 1), 0);
    const best = foodCosts({ parts: [] }, at(600, 9, 1), 1);
    expect(worst.grainPerKg).toBeGreaterThan(0.4);
    expect(worst.grainPerKg).toBeLessThan(0.8);
    expect(best.grainPerKg).toBeLessThan(worst.grainPerKg);
    expect(best.hayPerKg).toBeLessThan(worst.hayPerKg);
    // výchozí cena plánu chovu bez údajů vsi
    expect(TYPICAL_FOOD_COSTS.grainPerKg).toBeCloseTo(worst.grainPerKg, 2);
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

  it('celé stádo v nosnosti zůstane, i nad strop masa a s drahým senem (24. 10. 2026)', () => {
    const s = village(day);
    // dřív by ves ovce s drahým senem a prasata nad strop masa zmenšila (Rovnovážné hospodaření)
    const keep = herds({ sheep: 60, goat: 10, pig: 60, cow: 5 });
    const dearHay = { ...COSTS, hayPerKg: 0.2 };
    expect(headEconomy('sheep', dearHay).labor).toBeGreaterThan(6 * COSTS.grainPerKg);
    for (const costs of [COSTS, dearHay]) {
      const sized = sizeHerdsToNeed(s, day, keep, { costs });
      expect(sized.keep).toEqual(keep);
    }
    // stádo dá bílkoviny s rezervou – i bez luštěnin
    const required = proteinBudget(s, day, herds({})).need * (1 + BALANCE.proteinReserve);
    expect(required).toBeGreaterThan(0);
    expect(sizeHerdsToNeed(s, day, keep, { costs: COSTS }).coverage).toBeGreaterThanOrEqual(
      1 - 1e-9,
    );
  });

  it('luštěniny ves neplánuje – bílkoviny jen ze stáda a ze zásoby luštěnin (9. 11. 2026)', () => {
    const s = village(at(600, 9, 1));
    const d = at(600, 9, 1);
    // bez stáda nad chovné páry chybí bílkoviny – luštěniny z pole je už nedoplní
    const none = sizeHerdsToNeed(s, d, herds({ sheep: 2, goat: 2, pig: 2, cow: 2 }), {
      costs: COSTS,
    });
    expect(none.sufficient).toBe(false);
    // zásoba luštěnin (zboží) bílkoviny přidá
    const stocked = sizeHerdsToNeed(
      { ...s, legumesKg: 2_000 },
      d,
      herds({ sheep: 2, goat: 2, pig: 2, cow: 2 }),
      { costs: COSTS },
    );
    expect(stocked.coverage).toBeGreaterThan(none.coverage);
    // s prasaty a ovcemi stádo pokryje potřebu samo
    const herd = sizeHerdsToNeed(s, d, herds({ sheep: 30, goat: 2, pig: 60, cow: 2 }), {
      costs: COSTS,
    });
    expect(herd.coverage).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('je deterministická a stav nemění', () => {
    const s = village(day);
    const copy = structuredClone(s);
    const keep = herds({ sheep: 30, goat: 6, pig: 20, cow: 4 });
    const a = sizeHerdsToNeed(s, day, keep, { costs: COSTS });
    const b = sizeHerdsToNeed(s, day, keep, { costs: COSTS });
    expect(a).toEqual(b);
    expect(s).toEqual(copy);
    expect(PROTEIN.gPerKgBody).toBe(1.6);
  });
});
