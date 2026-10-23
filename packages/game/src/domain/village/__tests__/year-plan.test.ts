import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { FieldPart, TaskName, YearPlan } from '../types';
import { NO_CRAFTS } from '../productivity';
import { activeTasks, createPlan as createPlanWith, harvestKg, taskRemaining } from '../year-plan';

/** Plán bez řemesel (pokrytí nástroji 0 – horní mez práce). */
const createPlan = (parts: FieldPart[], day: number): YearPlan =>
  createPlanWith(parts, day, NO_CRAFTS.tools);

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

function part(over: Partial<FieldPart> = {}): FieldPart {
  return {
    id: 1,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

function withDone(plan: YearPlan, done: Partial<Record<TaskName, number>>): YearPlan {
  return { ...plan, done: { ...plan.done, ...done } };
}

function finished(plan: YearPlan): YearPlan {
  return { ...plan, done: { ...plan.required } };
}

describe('createPlan', () => {
  const day = at(506, 9, 1);
  it('1 ha ve 100 m: sazby bez příplatku (bez řemesel horní mez, celkem 205)', () => {
    const plan = createPlan([part()], day);
    expect(plan.required.dig).toBeCloseTo(100);
    expect(plan.required.sow).toBeCloseTo(10);
    expect(plan.required.weed).toBeCloseTo(30);
    expect(plan.required.harvest).toBeCloseTo(50);
    expect(plan.required.thresh).toBeCloseTo(15);
    expect(plan.required.reclaim).toBe(0);
    expect(plan.partIds).toEqual([1]);
    expect(plan.plannedDay).toBe(day);
    expect(plan.done.dig).toBe(0);
    expect(plan.harvestedKg).toBeNull();
  });
  it('s plným pokrytím nástroji dolní mez – celkem 120 na hektar', () => {
    const { required } = createPlanWith([part()], day, 1);
    expect(required).toMatchObject({ dig: 50, sow: 10, weed: 15, harvest: 35, thresh: 10 });
    const total = required.dig + required.sow + required.weed + required.harvest + required.thresh;
    expect(total).toBeCloseTo(120, 9);
  });
  it('ve 500 m je kopání o 40 % dražší', () => {
    expect(createPlan([part({ distanceM: 500 })], day).required.dig).toBeCloseTo(140);
  });
  it('reclaim jen u přílohů', () => {
    const fallow = part({ id: 2, state: 'fallow', fallowSinceDay: at(500, 9, 1) });
    const plan = createPlan([part(), fallow], day);
    expect(plan.required.reclaim).toBeCloseTo(100);
    expect(plan.partIds).toEqual([1, 2]);
  });
  it('první sezónu po vymýcení lesa se neplete; starý příloh je pastvina – drn, plete se', () => {
    const cleared = part({ id: 2, bonusUntilDay: day + 1000 });
    const oldFallow = part({ id: 3, state: 'fallow', fallowSinceDay: at(500, 9, 1) });
    expect(createPlan([part(), cleared], day).required.weed).toBeCloseTo(30);
    expect(createPlan([cleared], day).required).toMatchObject({ weed: 0, dig: 100, harvest: 50 });
    const pasture = createPlan([oldFallow], at(516, 9, 1));
    expect(pasture.required.weed).toBeCloseTo(30);
    expect(pasture.required.reclaim).toBeCloseTo(100);
    expect(pasture.reclaimIds).toEqual([3]);
    // druhá sezóna po vymýcení se už plete
    expect(createPlan([{ ...cleared, sownYears: 1 }], day).required.weed).toBeCloseTo(30);
  });
});

describe('taskRemaining a activeTasks', () => {
  const plan = createPlan([part()], at(500, 9, 1));
  it('sow nepřeroste hotové kopání', () => {
    const p = withDone(plan, { dig: 50 });
    expect(taskRemaining(p, 'sow')).toBeCloseTo(5);
    expect(taskRemaining(withDone(p, { sow: 5 }), 'sow')).toBeCloseTo(0);
    expect(taskRemaining(plan, 'sow')).toBe(0);
    expect(taskRemaining(plan, 'dig')).toBeCloseTo(100);
  });
  it('podzim: kopání', () => {
    expect(activeTasks(plan, at(500, 10, 10))).toEqual(['dig']);
  });
  it('podzim: reclaim a kopání končí ve stejný den, řazení podle typu', () => {
    const p = createPlan([part({ state: 'fallow', fallowSinceDay: at(500, 9, 1) })], at(506, 9, 1));
    expect(activeTasks(p, at(506, 10, 10))).toEqual(['reclaim', 'dig']);
  });
  it('duben: nejdřív setí zkopané části, pak další kopání (Ruling 14)', () => {
    const p = withDone(plan, { dig: 40 });
    expect(activeTasks(p, at(501, 4, 10))).toEqual(['sow', 'dig']);
    expect(activeTasks(withDone(plan, { dig: 100 }), at(501, 4, 10))).toEqual(['sow']);
    expect(activeTasks(plan, at(501, 4, 10))).toEqual(['dig']);
  });
  it('červen: pletí', () => {
    const sown = withDone(plan, { dig: 100, sow: 10 });
    expect(activeTasks(finished(plan), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(sown, at(501, 6, 10))).toEqual(['weed']);
  });
  it('nezasetá půda se neplete ani nesklízí (Ruling 17)', () => {
    const halfSown = withDone(plan, { dig: 50, sow: 5 });
    expect(taskRemaining(halfSown, 'weed')).toBeCloseTo(15);
    expect(taskRemaining(halfSown, 'harvest')).toBeCloseTo(25);
    expect(taskRemaining(withDone(halfSown, { weed: 15 }), 'weed')).toBeCloseTo(0);
    expect(activeTasks(withDone(halfSown, { weed: 15 }), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(withDone(halfSown, { harvest: 25 }), at(501, 8, 10))).toEqual([]);
    // nic nezaseto – v létě není co dělat
    expect(activeTasks(plan, at(501, 6, 10))).toEqual([]);
    expect(activeTasks(plan, at(501, 8, 10))).toEqual([]);
  });
  it('výmlat jen sklizené části (Ruling 17)', () => {
    const halfHarvested = withDone(plan, { dig: 50, sow: 5, weed: 15, harvest: 25 });
    expect(taskRemaining(halfHarvested, 'thresh')).toBeCloseTo(7.5);
    expect(taskRemaining(withDone(halfHarvested, { thresh: 7.5 }), 'thresh')).toBeCloseTo(0);
    expect(taskRemaining(plan, 'thresh')).toBe(0);
  });
  it('mlácení jaře běží v září hned po žni (production-chains.md – Výmlat hned po žni)', () => {
    const p = withDone(plan, { harvest: 50 });
    expect(activeTasks(p, at(500, 9, 10))).toContain('thresh');
    expect(activeTasks(p, at(500, 8, 10))).not.toContain('thresh');
    expect(activeTasks(p, at(500, 12, 10))).not.toContain('thresh');
    expect(activeTasks(p, at(501, 2, 10))).not.toContain('thresh');
  });
  it('v září mlácení (konec 30. 9.) předchází kopání (konec 30. 11.)', () => {
    expect(activeTasks(withDone(plan, { harvest: 50 }), at(500, 9, 10))).toEqual(['thresh', 'dig']);
  });
});

describe('harvestKg', () => {
  const day = at(500, 9, 1);
  const plan = createPlan([part()], day);
  it('vše hotové', () => {
    expect(harvestKg(finished(plan), [part()], day)).toBeCloseTo(448.2, 1);
  });
  it('bez pletí dá 60 %', () => {
    const p = { ...finished(plan), done: { ...finished(plan).done, weed: 0 } };
    expect(harvestKg(p, [part()], day)).toBeCloseTo(623.2 * 0.6 - 175, 1);
  });
  it('pošlapaná plocha (vůz přes zaseté pole) úrodu nedá', () => {
    const trampled = part({ trampledM2: 1000 });
    expect(harvestKg(finished(plan), [trampled], day)).toBeCloseTo(623.2 * 0.9 - 175, 1);
  });
  it('nic neosetého = 0, nikdy záporné', () => {
    expect(harvestKg(plan, [part()], day)).toBe(0);
  });
  it('polovina zasetá a celá opletá i sklizená: úroda poloviny bez další srážky (Ruling 17)', () => {
    // 0,5 ha × 623,2 kg − osivo 0,5 ha × 175 kg; dřív pletí a sklizeň měřené vůči celému
    // hektaru srazily úrodu podruhé (≈ 68 kg)
    const halfSown = withDone(plan, { dig: 50, sow: 5, weed: 15, harvest: 25 });
    expect(harvestKg(halfSown, [part()], day)).toBeCloseTo(623.2 * 0.5 - 175 * 0.5, 1);
    expect(harvestKg(finished(plan), [part()], day)).toBeCloseTo(
      2 * harvestKg(halfSown, [part()], day),
      6,
    );
  });
  it('na polovině zaseté půdy neopletá polovina dá úrodu jako napůl opletý hektar', () => {
    const halfSown = withDone(plan, { dig: 50, sow: 5, weed: 7.5, harvest: 25 });
    expect(harvestKg(halfSown, [part()], day)).toBeCloseTo(623.2 * 0.5 * 0.8 - 175 * 0.5, 1);
  });
  it('díl v první sezóně po vymýcení lesa: bonus +40 a plná úroda bez pletí', () => {
    const meadow = part();
    const cleared = part({ id: 2, naturalFertility: 50, bonusUntilDay: day + 1000 });
    const p = createPlan([meadow, cleared], day);
    const unweeded = { ...finished(p), done: { ...finished(p).done, weed: 0 } };
    // louka bez pletí 60 %; vymýcený díl úrodnost 50 + 40, pletí nepotřebuje
    const expected = 623.2 * 0.6 - 175 + (760 * (0.4 + 0.6 * 0.9) - 175);
    expect(harvestKg(unweeded, [meadow, cleared], day)).toBeCloseTo(expected, 6);
  });
});
