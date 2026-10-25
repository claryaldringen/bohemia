import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { FieldPart, TaskName, FarmSeason, VillageState } from '../types';
import { NO_CRAFTS } from '../productivity';
import {
  activeTasks,
  createPlan as createPlanWith,
  createSeason,
  harvestKg,
  taskRemaining,
  springCrop,
  withSeason,
} from '../year-plan';

/** Plán bez řemesel (pokrytí nástroji 0 – horní mez práce). */
const createPlan = (parts: FieldPart[], day: number): FarmSeason =>
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

function withDone(plan: FarmSeason, done: Partial<Record<TaskName, number>>): FarmSeason {
  return {
    ...plan,
    crops: plan.crops.map((c) => ({ ...c, done: { ...c.done, ...done } })),
  };
}

function finished(plan: FarmSeason): FarmSeason {
  return {
    ...plan,
    crops: plan.crops.map((c) => ({ ...c, done: { ...c.required } })),
  };
}

describe('createPlan', () => {
  const day = at(506, 9, 1);
  it('1 ha ve 100 m: sazby bez příplatku (bez řemesel horní mez, celkem 185)', () => {
    const plan = createPlan([part()], day);
    expect(springCrop(plan).required.dig).toBeCloseTo(100);
    expect(springCrop(plan).required.sow).toBeCloseTo(10);
    expect(springCrop(plan).required.weed).toBeCloseTo(30);
    expect(springCrop(plan).required.harvest).toBeCloseTo(30);
    expect(springCrop(plan).required.thresh).toBeCloseTo(15);
    expect(springCrop(plan).required.reclaim).toBe(0);
    expect(springCrop(plan).partIds).toEqual([1]);
    expect(plan.startDay).toBe(day);
    expect(springCrop(plan).done.dig).toBe(0);
    expect(springCrop(plan).harvestedKg).toBeNull();
  });
  it('s plným pokrytím nástroji dolní mez – celkem 110 na hektar', () => {
    const { required } = springCrop(createPlanWith([part()], day, 1));
    expect(required).toMatchObject({ dig: 50, sow: 10, weed: 15, harvest: 25, thresh: 10 });
    const total = required.dig + required.sow + required.weed + required.harvest + required.thresh;
    expect(total).toBeCloseTo(110, 9);
  });
  it('ve 500 m je kopání o 40 % dražší', () => {
    expect(springCrop(createPlan([part({ distanceM: 500 })], day)).required.dig).toBeCloseTo(140);
  });
  it('reclaim jen u přílohů', () => {
    const fallow = part({ id: 2, state: 'fallow', fallowSinceDay: at(500, 9, 1) });
    const plan = createPlan([part(), fallow], day);
    expect(springCrop(plan).required.reclaim).toBeCloseTo(100);
    expect(springCrop(plan).partIds).toEqual([1, 2]);
  });
  it('první sezónu po vymýcení lesa se neplete; starý příloh je pastvina – drn, plete se', () => {
    const cleared = part({ id: 2, bonusUntilDay: day + 1000 });
    const oldFallow = part({ id: 3, state: 'fallow', fallowSinceDay: at(500, 9, 1) });
    expect(springCrop(createPlan([part(), cleared], day)).required.weed).toBeCloseTo(30);
    expect(springCrop(createPlan([cleared], day)).required).toMatchObject({
      weed: 0,
      dig: 100,
      harvest: 30,
    });
    const pasture = createPlan([oldFallow], at(516, 9, 1));
    expect(springCrop(pasture).required.weed).toBeCloseTo(30);
    expect(springCrop(pasture).required.reclaim).toBeCloseTo(100);
    expect(springCrop(pasture).reclaimIds).toEqual([3]);
    // druhá sezóna po vymýcení se už plete
    expect(springCrop(createPlan([{ ...cleared, sownYears: 1 }], day)).required.weed).toBeCloseTo(
      30,
    );
  });
});

describe('taskRemaining a activeTasks', () => {
  const plan = createPlan([part()], at(500, 9, 1));
  it('sow nepřeroste hotové kopání', () => {
    const p = withDone(plan, { dig: 50 });
    expect(taskRemaining(springCrop(p), 'sow')).toBeCloseTo(5);
    expect(taskRemaining(springCrop(withDone(p, { sow: 5 })), 'sow')).toBeCloseTo(0);
    expect(taskRemaining(springCrop(plan), 'sow')).toBe(0);
    expect(taskRemaining(springCrop(plan), 'dig')).toBeCloseTo(100);
  });
  it('podzim: kopání', () => {
    expect(activeTasks(springCrop(plan), at(500, 10, 10))).toEqual(['dig']);
  });
  it('podzim: reclaim a kopání končí ve stejný den, řazení podle typu', () => {
    const p = createPlan([part({ state: 'fallow', fallowSinceDay: at(500, 9, 1) })], at(506, 9, 1));
    expect(activeTasks(springCrop(p), at(506, 10, 10))).toEqual(['reclaim', 'dig']);
  });
  it('duben: nejdřív setí zkopané části, pak další kopání (Ruling 14)', () => {
    const p = withDone(plan, { dig: 40 });
    expect(activeTasks(springCrop(p), at(501, 4, 10))).toEqual(['sow', 'dig']);
    expect(activeTasks(springCrop(withDone(plan, { dig: 100 })), at(501, 4, 10))).toEqual(['sow']);
    expect(activeTasks(springCrop(plan), at(501, 4, 10))).toEqual(['dig']);
  });
  it('červen: pletí', () => {
    const sown = withDone(plan, { dig: 100, sow: 10 });
    expect(activeTasks(springCrop(finished(plan)), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(springCrop(sown), at(501, 6, 10))).toEqual(['weed']);
  });
  it('nezasetá půda se neplete ani nesklízí (Ruling 17)', () => {
    const halfSown = withDone(plan, { dig: 50, sow: 5 });
    expect(taskRemaining(springCrop(halfSown), 'weed')).toBeCloseTo(15);
    expect(taskRemaining(springCrop(halfSown), 'harvest')).toBeCloseTo(15);
    expect(taskRemaining(springCrop(withDone(halfSown, { weed: 15 })), 'weed')).toBeCloseTo(0);
    expect(activeTasks(springCrop(withDone(halfSown, { weed: 15 })), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(springCrop(withDone(halfSown, { harvest: 15 })), at(501, 8, 10))).toEqual(
      [],
    );
    // nic nezaseto – v létě není co dělat
    expect(activeTasks(springCrop(plan), at(501, 6, 10))).toEqual([]);
    expect(activeTasks(springCrop(plan), at(501, 8, 10))).toEqual([]);
  });
  it('výmlat jen sklizené části (Ruling 17)', () => {
    const halfHarvested = withDone(plan, { dig: 50, sow: 5, weed: 15, harvest: 15 });
    expect(taskRemaining(springCrop(halfHarvested), 'thresh')).toBeCloseTo(7.5);
    expect(
      taskRemaining(springCrop(withDone(halfHarvested, { thresh: 7.5 })), 'thresh'),
    ).toBeCloseTo(0);
    expect(taskRemaining(springCrop(plan), 'thresh')).toBe(0);
  });
  it('mlácení jaře běží v září hned po žni (production-chains.md – Výmlat hned po žni)', () => {
    const p = withDone(plan, { harvest: 50 });
    expect(activeTasks(springCrop(p), at(500, 9, 10))).toContain('thresh');
    expect(activeTasks(springCrop(p), at(500, 8, 10))).not.toContain('thresh');
    expect(activeTasks(springCrop(p), at(500, 12, 10))).not.toContain('thresh');
    expect(activeTasks(springCrop(p), at(501, 2, 10))).not.toContain('thresh');
  });
  it('v září mlácení (konec 30. 9.) předchází kopání (konec 30. 11.)', () => {
    expect(activeTasks(springCrop(withDone(plan, { harvest: 50 })), at(500, 9, 10))).toEqual([
      'thresh',
      'dig',
    ]);
  });
});

describe('harvestKg', () => {
  const day = at(500, 9, 1);
  const plan = createPlan([part()], day);
  it('vše hotové', () => {
    expect(harvestKg(springCrop(finished(plan)), [part()], day)).toBeCloseTo(448.2, 1);
  });
  it('bez pletí dá 60 %', () => {
    const p = {
      ...springCrop(finished(plan)),
      done: { ...springCrop(finished(plan)).done, weed: 0 },
    };
    expect(harvestKg(p, [part()], day)).toBeCloseTo(623.2 * 0.6 - 175, 1);
  });
  it('pošlapaná plocha (vůz přes zaseté pole) úrodu nedá', () => {
    const trampled = part({ trampledM2: 1000 });
    expect(harvestKg(springCrop(finished(plan)), [trampled], day)).toBeCloseTo(
      623.2 * 0.9 - 175,
      1,
    );
  });
  it('nic neosetého = 0, nikdy záporné', () => {
    expect(harvestKg(springCrop(plan), [part()], day)).toBe(0);
  });
  it('polovina zasetá a celá opletá i sklizená: úroda poloviny bez další srážky (Ruling 17)', () => {
    // 0,5 ha × 623,2 kg − osivo 0,5 ha × 175 kg; dřív pletí a sklizeň měřené vůči celému
    // hektaru srazily úrodu podruhé (≈ 68 kg)
    const halfSown = withDone(plan, { dig: 50, sow: 5, weed: 15, harvest: 25 });
    expect(harvestKg(springCrop(halfSown), [part()], day)).toBeCloseTo(623.2 * 0.5 - 175 * 0.5, 1);
    expect(harvestKg(springCrop(finished(plan)), [part()], day)).toBeCloseTo(
      2 * harvestKg(springCrop(halfSown), [part()], day),
      6,
    );
  });
  it('na polovině zaseté půdy neopletá polovina dá úrodu jako napůl opletý hektar', () => {
    const halfSown = withDone(plan, { dig: 50, sow: 5, weed: 7.5, harvest: 25 });
    expect(harvestKg(springCrop(halfSown), [part()], day)).toBeCloseTo(
      623.2 * 0.5 * 0.8 - 175 * 0.5,
      1,
    );
  });
  it('díl v první sezóně po vymýcení lesa: bonus +40 a plná úroda bez pletí', () => {
    const meadow = part();
    const cleared = part({ id: 2, naturalFertility: 50, bonusUntilDay: day + 1000 });
    const p = createPlan([meadow, cleared], day);
    const unweeded = {
      ...springCrop(finished(p)),
      done: { ...springCrop(finished(p)).done, weed: 0 },
    };
    // louka bez pletí 60 %; vymýcený díl úrodnost 50 + 40, pletí nepotřebuje
    const expected = 623.2 * 0.6 - 175 + (760 * (0.4 + 0.6 * 0.9) - 175);
    expect(harvestKg(unweeded, [meadow, cleared], day)).toBeCloseTo(expected, 6);
  });
});

describe('withSeason – převod uloženého ročního plánu', () => {
  it('plán ze tří plodin (jař nahoře) dá hospodářský rok a dvojí převod je jeden', () => {
    const season = createSeason(
      { winter: [part()], spring: [part()], legume: [part()] },
      at(600, 9, 1),
      0,
    );
    const [winter, legume, spring] = season.crops;
    const { crops: _crops, startDay, ...rest } = season;
    void _crops;
    const { crop: _s, ...springWork } = spring!;
    void _s;
    const { crop: _w, ...winterWork } = winter!;
    void _w;
    const { crop: _l, ...legumeWork } = legume!;
    void _l;
    const old = {
      lastDay: 0,
      plan: {
        ...rest,
        plannedDay: startDay,
        ...springWork,
        winter: winterWork,
        legume: legumeWork,
      },
      threshingFromPlan: null,
      season: undefined,
    } as unknown as VillageState;
    const converted = withSeason(old);
    expect(converted.season).toEqual(season);
    expect(converted.threshingSeason).toBeNull();
    expect('plan' in converted).toBe(false);
    expect(withSeason(converted)).toBe(converted);
  });
});
