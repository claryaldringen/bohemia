import { describe, expect, it } from 'vitest';
import {
  DAILY_MIN_PER_HOUSEHOLD,
  FERTILITY,
  FIELD_WORK_PER_HA,
  FOOD_NEED_KG_PER_YEAR,
  NO_CRAFTS,
  SEED_KG_PER_HA,
  STORAGE_LOSS_PER_YEAR,
  YIELD_BASE_KG_PER_HA,
  steadyHarvestKg,
} from '../../src/domain/village';
import {
  ROTATION,
  ROTATION_FACTOR,
  averageSownShare,
  equilibriumStores,
  foodNeedKg,
  harvestForStores,
  maxSownHa,
  netYieldPerHa,
  sownHa,
  steadyState,
  type SteadyInput,
} from '../lib/steady-state';

const START: SteadyInput = {
  household: { adults: 2, elders: 0, olderChildren: 2, smallChildren: 0 },
  households: 1,
  fertility: 70,
  distanceM: 100,
  forestDistanceM: 50,
  dwelling: 'zemnice',
  orchardHa: 0,
  reserve: true,
};

describe('ustálený oběh z pravidel', () => {
  it('oběh odpočatého dílu: osev rok po roku do 70 % (95 → 83 → 71 → 59 %) a příloh do 95 %', () => {
    expect(ROTATION.sown).toBe(3);
    // příloh 7–8 let podle toho, odkud oběh začne (95–99 %), průměr 7,2
    expect(ROTATION.fallow).toBeCloseTo(7.2, 9);
    // poslední osev začne ještě od 70 %, po něm je díl pod 70 %
    const last: number = FERTILITY.fallowReady - FERTILITY.sowDepletion * (ROTATION.sown - 1);
    expect(last).toBeGreaterThanOrEqual(FERTILITY.sowableMin - 1e-9);
    const share = last - FERTILITY.sowDepletion;
    expect(share).toBeLessThan(FERTILITY.sowableMin);
    expect(share + FERTILITY.fallowRecovery * Math.ceil(ROTATION.fallow)).toBeGreaterThanOrEqual(
      FERTILITY.fallowReady - 1e-9,
    );
    expect(ROTATION_FACTOR).toBeCloseTo((ROTATION.sown + ROTATION.fallow) / ROTATION.sown);
  });

  it('osev pokryje potřebu s pojistkou čistou úrodou průměru let osevu', () => {
    const need = foodNeedKg(START.household);
    expect(need).toBe(2 * FOOD_NEED_KG_PER_YEAR.adult + 2 * FOOD_NEED_KG_PER_YEAR.child);
    const net =
      YIELD_BASE_KG_PER_HA * (0.4 + (0.6 * 70 * averageSownShare()) / 100) - SEED_KG_PER_HA;
    expect(netYieldPerHa(70)).toBeCloseTo(net);
    expect(sownHa(need, 70, 100)).toBeCloseTo(steadyHarvestKg(need, 100, NO_CRAFTS.pottery) / net);
    expect(sownHa(need, 70, 100)).toBeGreaterThan(need / net);
    expect(sownHa(need, 70)).toBeCloseTo(need / net);
  });

  it('zásoby po sklizni v rovnováze a sklizeň pro ně jsou inverzní', () => {
    for (const stores of [0.5, 1, 1.5, 2]) {
      expect(equilibriumStores(harvestForStores(stores))).toBeCloseTo(stores, 9);
    }
    // sklizeň právě na potřebu při ztrátách drží méně než roční potřebu
    expect(equilibriumStores(1)).toBeLessThan(1);
    // bez ztrát by sklizeň na potřebu držela zásoby stále stejné – kontrola znaménka ztrát
    expect(STORAGE_LOSS_PER_YEAR.worst).toBeGreaterThan(0);
  });

  it('práce po měsících sedí s ročními součty a denním minimem', () => {
    const r = steadyState(START);
    // jen dospělí – výrostci 7–13 let pasou (population.md – Práce)
    expect(r.capacityPerYear).toBeCloseTo(2 * 365);
    expect(r.dailyMinPerYear).toBeCloseTo(DAILY_MIN_PER_HOUSEHOLD.worst * 365);
    const monthField = r.months.reduce(
      (sum, m) => sum + Object.values(m.field).reduce((a, b) => a + b, 0),
      0,
    );
    const yearField = Object.values(r.fieldWork).reduce((a, b) => a + b, 0);
    expect(monthField + r.unfinished).toBeCloseTo(yearField);
    // sazby na osetý hektar – kopání celé plochy osevu
    expect(r.fieldWork.dig).toBeCloseTo(r.sownHa * FIELD_WORK_PER_HA.dig.worst);
    for (const m of r.months) {
      const used =
        m.dailyMin +
        Object.values(m.field).reduce((a, b) => a + b, 0) +
        m.orchard +
        m.repairs +
        m.common;
      expect(used).toBeCloseTo(m.capacity);
    }
    expect(r.subsistence).toBeGreaterThan(0);
    expect(r.subsistence).toBeLessThan(1);
  });

  it('nejvyšší osev, který práce stihne, je hranice nedodělku', () => {
    const limit = maxSownHa(START);
    expect(steadyState({ ...START, sownHaOverride: limit }).unfinished).toBeLessThan(1e-6);
    expect(steadyState({ ...START, sownHaOverride: limit * 1.05 }).unfinished).toBeGreaterThan(0);
  });
});
