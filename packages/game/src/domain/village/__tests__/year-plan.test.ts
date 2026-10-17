import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { FieldPart, TaskName, YearPlan } from '../types';
import { activeTasks, createPlan, harvestKg, taskRemaining, threshLossKg } from '../year-plan';

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
  it('1 ha ve 100 m: sazby bez příplatku', () => {
    const plan = createPlan([part()], day);
    expect(plan.required.dig).toBeCloseTo(80);
    expect(plan.required.harvest).toBeCloseTo(50);
    expect(plan.required.thresh).toBeCloseTo(30);
    expect(plan.required.reclaim).toBe(0);
    expect(plan.partIds).toEqual([1]);
    expect(plan.plannedDay).toBe(day);
    expect(plan.done.dig).toBe(0);
    expect(plan.harvestedKg).toBeNull();
  });
  it('ve 500 m je kopání o 40 % dražší', () => {
    expect(createPlan([part({ distanceM: 500 })], day).required.dig).toBeCloseTo(112);
  });
  it('reclaim jen u přílohů', () => {
    const fallow = part({ id: 2, state: 'fallow', fallowSinceDay: at(500, 9, 1) });
    const plan = createPlan([part(), fallow], day);
    expect(plan.required.reclaim).toBeCloseTo(60);
    expect(plan.partIds).toEqual([1, 2]);
  });
});

describe('taskRemaining a activeTasks', () => {
  const plan = createPlan([part()], at(500, 9, 1));
  it('sow nepřeroste hotové kopání', () => {
    const p = withDone(plan, { dig: 40 });
    expect(taskRemaining(p, 'sow')).toBeCloseTo(5);
    expect(taskRemaining(withDone(p, { sow: 5 }), 'sow')).toBeCloseTo(0);
    expect(taskRemaining(plan, 'sow')).toBe(0);
    expect(taskRemaining(plan, 'dig')).toBeCloseTo(80);
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
    expect(activeTasks(withDone(plan, { dig: 80 }), at(501, 4, 10))).toEqual(['sow']);
    expect(activeTasks(plan, at(501, 4, 10))).toEqual(['dig']);
  });
  it('červen: pletí', () => {
    expect(activeTasks(finished({ ...plan, done: { ...plan.done } }), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(plan, at(501, 6, 10))).toEqual(['weed']);
  });
  it('mlácení běží od listopadu do února jako jedno okno', () => {
    const p = withDone(plan, { harvest: 50 });
    expect(activeTasks(p, at(500, 12, 10))).toEqual(['thresh']);
    expect(activeTasks(p, at(501, 2, 10))).toEqual(['thresh']);
    expect(activeTasks(p, at(501, 3, 10))).not.toContain('thresh');
  });
  it('v listopadu kopání (konec 30. 11.) předchází mlácení (konec února)', () => {
    expect(activeTasks(plan, at(500, 11, 10))).toEqual(['dig', 'thresh']);
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
  it('nic neosetého = 0, nikdy záporné', () => {
    expect(harvestKg(plan, [part()], day)).toBe(0);
  });
  it('mlátící ztráta', () => {
    expect(threshLossKg(withDone(plan, { thresh: 15 }), 1000)).toBeCloseTo(500);
    expect(threshLossKg(finished(plan), 1000)).toBeCloseTo(0);
  });
});
