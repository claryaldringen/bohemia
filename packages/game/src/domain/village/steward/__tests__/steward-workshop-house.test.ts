import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { craftCoverage } from '../../crafts/crafts';
import { STEWARD } from '../../rules/rules-steward';
import { planSettlement } from '../steward-plan';
import { newSteward } from '../steward-state';
import { startBestWorkshop, type StewardContext } from '../steward';
import { dateOfDayIndex } from '../../../calendar';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import type { Craft, VillageState } from '../../types';

// workshops.md – Správce staví nejlepší dílnu, kterou už jde (od 800 roubenou, od 750 vypletenou,
// dřív dnešní) – na slotu dílny plánu, cena předem rozhoduje o typu.

const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const onStewardDay = (day: number): number =>
  Math.ceil(day / STEWARD.everyDays) * STEWARD.everyDays;
const Y700 = onStewardDay(dayIndexOf({ year: 700, month: 3, day: 1 }));
const Y760 = onStewardDay(dayIndexOf({ year: 760, month: 3, day: 1 }));
const Y810 = onStewardDay(dayIndexOf({ year: 810, month: 3, day: 1 }));

/** Ves s hotovou zemnicí, hotovým plánem a 60 kládami na hromadě. */
function village(day: number): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const founded = foundVillage({
    seed: 4242,
    day,
    dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
  });
  let s = withBuiltFirstDwelling({ ...founded, steward: newSteward(day, true) });
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  s.woodLogs = 60;
  return s;
}

function context(s: VillageState, day: number): StewardContext {
  const coverage = craftCoverage(s, day);
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage,
    mode: 'growth',
    // výhled dne správce dílna nepoužívá
    outlook: undefined as never,
  };
}

const workshops = (s: VillageState): (string | null)[] =>
  s.constructions.filter((c) => c.craft === 'smith').map((c) => c.dwellingType);

function start(day: number, craft: Craft = 'smith', logs = 60): VillageState {
  const s = village(day);
  s.woodLogs = logs;
  expect(startBestWorkshop(s, context(s, day), craft)).toBe(true);
  return s;
}

describe('správce – nadzemní dílna', () => {
  it('v roce 700 postaví dnešní dílnu na polozemnici', () => {
    expect(workshops(start(Y700))).toEqual(['polozemnice']);
  });

  it('v roce 760 postaví vypletenou dílnu', () => {
    const s = start(Y760);
    expect(workshops(s)).toEqual(['vypleteny']);
    expect(s.constructions.find((c) => c.craft === 'smith')?.wood?.trees).toBe(19);
  });

  it('v roce 810 postaví roubenou dílnu', () => {
    const s = start(Y810);
    expect(workshops(s)).toEqual(['srub']);
    expect(s.constructions.find((c) => c.craft === 'smith')?.wood?.trees).toBe(33);
  });

  it('v roce 810 s dřevem na 20 stromů postaví vypletenou (roubená chce 33)', () => {
    const s = village(Y810);
    s.woodLogs = 20;
    // krajina bez dalších stromů ke kácení
    const ctx = { ...context(s, Y810), obstacles: { ...obstacles, count: 0 } };
    expect(startBestWorkshop(s, ctx, 'smith')).toBe(true);
    expect(workshops(s)).toEqual(['vypleteny']);
  });
});
