import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { daysUntilHarvest, daysUntilWinterHarvest } from '../food';
import { NO_CRAFTS } from '../productivity';
import { CROP_WINDOWS } from '../rules';
import { windowDaysLeft } from '../sowing';
import type { FieldPart } from '../types';
import {
  activeTasks,
  createCropWork,
  createSeason,
  daysUntilFoodHarvest,
  expectedWinterKg,
  seasonCrops,
  seasonPartIds,
  seasonCrop,
  springCrop,
} from '../year-plan';

// Ozim a jař (fields.md – Ozim a jař): kolik ozimu a jaře ves oseje a jak s ozimem počítá příděl.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 9, 1);

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
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
const parts = (count: number): FieldPart[] => Array.from({ length: count }, (_, i) => part(i + 1));

describe('windowDaysLeft', () => {
  it('od 1. 9. celá okna hospodářského roku', () => {
    expect(windowDaysLeft(DAY, [[9, 10]])).toBe(61);
    expect(windowDaysLeft(DAY, [[9, 11]])).toBe(91);
    expect(windowDaysLeft(DAY, [[3, 4]])).toBe(61);
    expect(windowDaysLeft(DAY, [[7, 7]])).toBe(31);
    expect(windowDaysLeft(DAY, [[8, 8]])).toBe(31);
    // únor 604 je přestupný
    expect(windowDaysLeft(at(603, 9, 1), [[1, 2]])).toBe(60);
  });

  it('později jen zbytek – co už uběhlo, se nepočítá', () => {
    expect(windowDaysLeft(at(601, 10, 15), [[9, 10]])).toBe(17);
    expect(windowDaysLeft(at(601, 10, 15), [[3, 4]])).toBe(61);
    expect(windowDaysLeft(at(602, 3, 1), [[9, 11]])).toBe(0);
    expect(windowDaysLeft(at(602, 4, 30), [[3, 4]])).toBe(1);
    expect(windowDaysLeft(at(602, 8, 31), [[8, 8]])).toBe(1);
  });

  it('na podzim 1499 nesahá mimo svět', () => {
    expect(windowDaysLeft(at(1499, 9, 1), [[3, 4]])).toBe(61);
  });
});

describe('kopání pod jař i na jaře (fields.md – Ozim a jař; Martin 21. 10. 2026)', () => {
  it('okna jaře: kopání i vrácení přílohu na podzim i v březnu–dubnu, ozim jen na podzim', () => {
    expect(CROP_WINDOWS.spring.dig).toEqual([
      [9, 11],
      [3, 4],
    ]);
    expect(CROP_WINDOWS.spring.reclaim).toEqual([
      [9, 11],
      [3, 4],
    ]);
    expect(CROP_WINDOWS.winter.dig).toEqual([[9, 10]]);
  });
});

describe('roční plán s ozimem', () => {
  it('ozim má vlastní práci a okna; plán bez ozimu je jen jař', () => {
    const plan = createSeason({ winter: parts(2), spring: [part(3)] }, DAY, NO_CRAFTS.tools);
    expect(seasonCrop(plan, 'winter')?.partIds).toEqual([1, 2]);
    expect(springCrop(plan).partIds).toEqual([3]);
    expect(seasonPartIds(plan)).toEqual([1, 2, 3]);
    expect(seasonCrops(plan).map((c) => c.crop)).toEqual(['winter', 'spring']);
    expect('winter' in createSeason({ winter: [], spring: parts(2) }, DAY, 0)).toBe(false);

    const winter = seasonCrop(plan, 'winter')!;
    // září: ozim kope a seje (zkopané), jař jen kope; listopad: ozim nic, jař ještě kope
    expect(activeTasks(winter, at(601, 9, 10), 'winter')).toEqual(['dig']);
    const dug = { ...winter, done: { ...winter.done, dig: winter.required.dig / 2 } };
    expect(activeTasks(dug, at(601, 9, 10), 'winter')).toEqual(['sow', 'dig']);
    expect(activeTasks(springCrop(plan), at(601, 9, 10), 'spring')).toEqual(['dig']);
    expect(activeTasks(winter, at(601, 11, 10), 'winter')).toEqual([]);
    expect(activeTasks(springCrop(plan), at(601, 11, 10), 'spring')).toEqual(['dig']);
    // sklizeň: ozim v červenci, jař v srpnu
    const sown = { ...winter, done: { ...winter.required, harvest: 0, thresh: 0 } };
    expect(activeTasks(sown, at(602, 7, 10), 'winter')).toEqual(['harvest']);
    expect(activeTasks(sown, at(602, 8, 10), 'winter')).toEqual([]);
    const spring = {
      ...springCrop(plan),
      done: { ...springCrop(plan).required, harvest: 0, thresh: 0 },
    };
    expect(activeTasks(spring, at(602, 7, 10), 'spring')).toEqual([]);
    expect(activeTasks(spring, at(602, 8, 10), 'spring')).toEqual(['harvest']);
  });
});

describe('příděl počítá se sklizní ozimu (daysUntilFoodHarvest)', () => {
  const list = parts(40);
  const plan = createSeason({ winter: list, spring: [] }, DAY, NO_CRAFTS.tools);
  const day = at(602, 2, 1);

  it('ozim, který uživí ves v srpnu, posune výhled na 31. 7.', () => {
    const sown = {
      ...plan,
      crops: plan.crops.map((c) =>
        c.crop === 'winter' ? { ...c, done: { ...c.required, weed: 0, harvest: 0 } } : c,
      ),
    };
    expect(expectedWinterKg(seasonCrop(sown, 'winter')!, list, day)).toBeGreaterThan(0);
    expect(daysUntilFoodHarvest(sown, list, day, 1)).toBe(daysUntilWinterHarvest(day));
    // malý ozim na srpen nestačí – výhled zůstává do sklizně jaře
    expect(daysUntilFoodHarvest(sown, list, day, 1000)).toBe(daysUntilHarvest(day));
  });

  it('bez ozimu, nezasetý ozim po konci setí a po sklizni ozimu do 31. 8.', () => {
    expect(daysUntilFoodHarvest(null, list, day, 1)).toBe(daysUntilHarvest(day));
    expect(
      daysUntilFoodHarvest(createSeason({ winter: [], spring: list }, DAY, 0), list, day, 1),
    ).toBe(daysUntilHarvest(day));
    // nic nezaseto a okno setí skončilo – žádná úroda
    expect(daysUntilFoodHarvest(plan, list, day, 1)).toBe(daysUntilHarvest(day));
    // v září se počítá se zasetím celého ozimu
    expect(daysUntilFoodHarvest(plan, list, at(601, 9, 10), 1)).toBe(
      daysUntilWinterHarvest(at(601, 9, 10)),
    );
    const harvested = { ...plan, winter: { ...createCropWork(list, DAY, 0), harvestedKg: 500 } };
    expect(daysUntilFoodHarvest(harvested, list, at(602, 8, 5), 1)).toBe(
      daysUntilHarvest(at(602, 8, 5)),
    );
  });
});
