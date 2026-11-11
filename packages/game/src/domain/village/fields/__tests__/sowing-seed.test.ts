import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { allocateDay } from '../../core/labor';
import { dayTaskOrder, threshForFoodToday } from '../../core/simulate-work';
import { dayMealInput } from '../../livestock/emergency-slaughter';
import {
  pileSowsKg,
  seedKeepKg,
  seedOutsideFoodKg,
  settleSowingSeed,
  sowingDaysLeft,
  sowingSeedDay,
  uneatenSeedKg,
  windowSeedNeedKg,
  withoutSeedTarget,
} from '../seed';
import type { FarmSeason, VillageState } from '../../types';

// Osivo bez cíle osevu (fields.md – Osivo bez cíle osevu; Martin 9. 11. 2026): hromada osiva okna
// na všechny díly na řadě, ideální denní díl, návrat nezasetého a setí týž den za orbou.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

function village(storesKg: number): VillageState {
  const parts: PartInput[] = Array.from({ length: 8 }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      parts,
    },
  });
  s.constructions = [];
  s.season = null;
  s.storesKg = storesKg;
  delete s.reservedSeedKg;
  delete s.reservedSeedUntilDay;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

describe('hromada osiva okna (fields.md – Osivo bez cíle osevu)', () => {
  it('1. 9. osivo na všechny díly na řadě; za nestihnutý ideální denní díl se vrátí do jídla', () => {
    const s = village(50_000);
    const day = at(600, 9, 1);
    const need = windowSeedNeedKg(s, 'winter');
    // 8 dílů po 0,25 ha × 175 kg/ha
    expect(need).toBeCloseTo(8 * 0.25 * 175, 6);
    sowingSeedDay(s, day);
    expect(s.sowingSeed).toMatchObject({ crop: 'winter', totalKg: need, days: 61, kg: need });
    // ves dnes nezasela nic – osivo ideálního denního dílu se vrátí hned po práci dne
    settleSowingSeed(s, day);
    expect(s.sowingSeed!.kg).toBeCloseTo((need * 60) / 61, 6);
    // příští ráno drží ideální zbytek okna
    sowingSeedDay(s, day + 1);
    expect(s.sowingSeed!.kg).toBeCloseTo((need * 60) / 61, 6);
  });

  it('osivo jen do zásob bez přežívací zásoby; osivo jen na setí se do hromady počítá', () => {
    const poor = village(100);
    sowingSeedDay(poor, at(600, 9, 1));
    expect(poor.sowingSeed!.kg).toBeLessThanOrEqual(100);
    const bought = village(50_000);
    bought.reservedSeedKg = 100;
    sowingSeedDay(bought, at(600, 9, 1));
    expect(bought.sowingSeed!.kg).toBeCloseTo(windowSeedNeedKg(bought, 'winter') - 100, 6);
  });

  it('hromada drží všechno vymlácené zrno – jídlo dne se vymlátí ze snopů napřed, před orbou', () => {
    // Vlkov 1.–3. 10. 871: hromada držela celé zásoby, 4,9 t leželo ve snopech; výmlat na jídlo
    // počítal s hromadou jako s jídlem a orba se setím za sebou vzala práci – příděl 0,115
    const day = at(600, 10, 1);
    const s = village(300);
    s.sheaves = { grainKg: 5_000, legumesKg: 0, work: { spring: 300 } };
    sowingSeedDay(s, day);
    expect(s.sowingSeed!.kg).toBeCloseTo(300, 6);
    expect(threshForFoodToday(s, day)).toBeGreaterThan(0);
    delete s.sowingSeed;
    expect(threshForFoodToday(s, day)).toBe(0);
    // výmlat na dnešní jídlo má v rozdělení práce přednost i před orbou
    const plough = { name: 'plough' as const, remaining: 5, end: 10, tie: 1, rank: 1 };
    const urgent = { name: 'thresh' as const, remaining: 1, end: -1, tie: 0, rank: 30 };
    const thresh = {
      crop: 'spring' as const,
      end: -1,
      remaining: 1,
      floor: 1,
      overdue: false,
      urgent: true as const,
    };
    expect(dayTaskOrder({ ...urgent, thresh }, plough)).toBeLessThan(0);
    expect(dayTaskOrder(urgent, plough)).toBeGreaterThan(0);
  });

  it('dny setí: ozim 61, jař bez dlouhé zimy 61; mimo okno 0', () => {
    const s = village(0);
    expect(sowingDaysLeft(s, 'winter', at(600, 9, 1))).toBe(61);
    expect(sowingDaysLeft(s, 'spring', at(601, 3, 1))).toBe(61);
    expect(sowingDaysLeft(s, 'spring', at(601, 5, 1))).toBe(0);
  });

  it('převod: plán z doby cíle osevu bez osiva čekajících dílů – jednou, idempotentně', () => {
    const s = village(0);
    const legacy = {
      startDay: at(600, 9, 1),
      crops: [],
      seedWaitingKg: { grain: 5, legumes: 0 },
      seedFloorKg: 3,
    };
    s.season = legacy as FarmSeason;
    const once = withoutSeedTarget(s);
    expect(once.season).toEqual({ startDay: at(600, 9, 1), crops: [] });
    expect(withoutSeedTarget(once)).toBe(once);
    expect(s.season).toBe(legacy);
  });
});

describe('zimní osivo (fields.md – Zimní osivo; Martin 9. 11. 2026)', () => {
  it('od 1. 11. do konce února drží osivo na jarní díly; 1. 3. ho převezme hromada okna', () => {
    const s = village(50_000);
    const need = windowSeedNeedKg(s, 'spring');
    expect(need).toBeCloseTo(8 * 0.25 * 175, 6);
    // 31. 10. se nezaseté osivo ozimu vrátí, 1. 11. přijde zimní osivo jaře
    sowingSeedDay(s, at(600, 10, 31));
    expect(s.sowingSeed).toMatchObject({ crop: 'winter' });
    sowingSeedDay(s, at(600, 11, 1));
    expect(s.sowingSeed).toEqual({
      crop: 'spring',
      totalKg: need,
      days: 0,
      kg: need,
      beforeWindow: true,
    });
    // v zimě se nic neseje – zimní osivo se nevrací
    settleSowingSeed(s, at(600, 11, 1));
    expect(s.sowingSeed!.kg).toBeCloseTo(need, 6);
    sowingSeedDay(s, at(601, 2, 28));
    expect(s.sowingSeed!.beforeWindow).toBe(true);
    // 1. 3. hromada jarního okna – ideální denní díl
    sowingSeedDay(s, at(601, 3, 1));
    expect(s.sowingSeed).toEqual({ crop: 'spring', totalKg: need, days: 61, kg: need });
    // po jarním okně do září nic
    sowingSeedDay(s, at(601, 6, 1));
    expect(s.sowingSeed).toBeUndefined();
  });

  it('chudá ves drží osivo jen nad přežívací zásobu – jí jen zbytek, šetří už v zimě', () => {
    const day = at(600, 12, 1);
    const keep = seedKeepKg(village(0), day);
    const s = village(keep + 200);
    sowingSeedDay(s, day);
    expect(s.sowingSeed!.kg).toBeCloseTo(200, 6);
    expect(uneatenSeedKg(s)).toBeCloseTo(200, 6);
    // jídlo dne zimní osivo nevidí
    const without = dayMealInput({ ...s, sowingSeed: undefined }, day, 0, 0);
    expect(dayMealInput(s, day, 0, 0).grainKg).toBeCloseTo(without.grainKg - 200, 6);
  });

  it('výhled zásob: jídlem není jen osivo, které ves v jarním okně zaseje', () => {
    const day = at(600, 12, 1);
    const s = village(50_000);
    sowingSeedDay(s, day);
    // ves bez spřežení motykou za jarní okno všechny 2 ha nezkope – zbytek je pro výhled jídlem
    const sows = pileSowsKg(s, day, 0);
    expect(sows).toBeGreaterThan(0);
    expect(sows).toBeLessThan(s.sowingSeed!.kg);
    expect(seedOutsideFoodKg(s, day, 0)).toBeCloseTo(sows, 6);
    // s nástroji zkope víc
    expect(pileSowsKg(s, day, 1)).toBeGreaterThan(sows);
    // bez lidí nic nezaseje – celá hromada je pro výhled jídlem
    const empty = { ...s, people: [] };
    expect(pileSowsKg(empty, day, 0)).toBe(0);
    // bez hromady nic
    expect(seedOutsideFoodKg({ ...s, sowingSeed: undefined }, day, 0)).toBe(0);
  });
});

describe('setí týž den hned za orbou a motykou (fields.md – Práce)', () => {
  it('kopání nese setí za sebou – i když práce nestačí, ubude obojího stejně', () => {
    const tasks = [
      { name: 'sow' as const, remaining: 0 },
      { name: 'dig' as const, remaining: 10, follow: { index: 0, ratio: 0.5 } },
    ];
    const base = { householdElders: [], potteryCoverage: 0, tasks };
    const short = allocateDay({ ...base, capacity: 6 });
    expect(short.taskAmounts[1]).toBeCloseTo(4, 9);
    expect(short.taskAmounts[0]).toBeCloseTo(2, 9);
    const plenty = allocateDay({ ...base, capacity: 100 });
    expect(plenty.taskAmounts[1]).toBeCloseTo(10, 9);
    expect(plenty.taskAmounts[0]).toBeCloseTo(5, 9);
  });
});
