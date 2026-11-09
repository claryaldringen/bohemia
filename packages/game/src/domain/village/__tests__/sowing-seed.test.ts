import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { allocateDay } from '../labor';
import {
  settleSowingSeed,
  sowingDaysLeft,
  sowingSeedDay,
  windowSeedNeedKg,
  withoutSeedTarget,
} from '../seed';
import type { FarmSeason, VillageState } from '../types';

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
