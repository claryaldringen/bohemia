import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { grossYieldPerHa } from '../fields';
import { NO_CRAFTS } from '../productivity';
import { SEED_KG_PER_HA, SEED_STORES } from '../rules';
import {
  foodUntilHarvestKg,
  seedAheadKg,
  seedSowCap,
  sowableSeedKg,
  takeSeed,
  workSeedKg,
} from '../seed';
import { advanceVillage } from '../simulate';
import { harvestWinter } from '../simulate-food';
import type { CropWork, FieldPart, SeasonCrop, VillageState } from '../types';
import { villageSheaves } from '../threshing';
import { createCropWork, harvestKg, seasonCrop, seasonCrops, sownShare } from '../year-plan';

// Osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob; Martin 27. 10. 2026: „Osivo ze
// zásob při setí“): setí bere osivo ze zásob v den setí dílu, sklizeň ho neodečítá; práce
// z doby před tím (bez `seedKg`) osivo odečte postaru při sklizni – jednou.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
/** Díl 0,25 ha – osivo 43,75 kg. */
const PART_HA = 0.25;

/** Ves s `count` hotovými díly po 0,25 ha (od domu ven), bez staveb a bez hospodářského roku. */
function village(count: number, storesKg: number, day = at(600, 8, 31)): VillageState {
  const parts: PartInput[] = Array.from({ length: count }, (_, i) => ({
    areaM2: PART_HA * 10_000,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = day;
  s.storesKg = storesKg;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Ves s ozimem na `count` dílech (práce bez hotového setí). */
function withWinter(count: number, storesKg: number): { s: VillageState; work: SeasonCrop } {
  const s = village(count, storesKg);
  const day = at(600, 9, 15);
  const work: SeasonCrop = {
    crop: 'winter',
    ...createCropWork(s.parts, day, NO_CRAFTS.tools, false, undefined, 'winter'),
  };
  s.season = { startDay: at(600, 9, 1), crops: [work] };
  return { s, work };
}

const byId = (s: VillageState): Map<number, FieldPart> => new Map(s.parts.map((p) => [p.id, p]));

describe('osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)', () => {
  it('osivo se odečte v den setí – po zasetém podílu, jednou', () => {
    const { s, work } = withWinter(4, 1000);
    expect(work.seedKg).toBe(0);
    const total = 4 * PART_HA * SEED_KG_PER_HA;
    expect(workSeedKg(work, byId(s), 'winter')).toBeCloseTo(total, 9);
    // polovina zaseta – zásoby přijdou o osivo poloviny
    work.done.sow = work.required.sow / 2;
    expect(takeSeed(s, work, 'winter', byId(s))).toBeCloseTo(total / 2, 9);
    expect(s.storesKg).toBeCloseTo(1000 - total / 2, 9);
    expect(work.seedKg).toBeCloseTo(sownShare(work) * total, 9);
    // stejný zasetý podíl osivo znovu nebere
    expect(takeSeed(s, work, 'winter', byId(s))).toBe(0);
    expect(s.storesKg).toBeCloseTo(1000 - total / 2, 9);
    // dosetí vezme zbytek
    work.done.sow = work.required.sow;
    expect(takeSeed(s, work, 'winter', byId(s))).toBeCloseTo(total / 2, 9);
    expect(s.storesKg).toBeCloseTo(1000 - total, 9);
    expect(seedAheadKg(s)).toEqual({ grain: 0, legumes: 0 });
  });

  it('bez osiva se nezaseje – setí jen na tolik dílů, na kolik osivo stačí', () => {
    const { s, work } = withWinter(4, 0);
    const total = 4 * PART_HA * SEED_KG_PER_HA;
    expect(seedSowCap(work, 'winter', byId(s), { grain: 0, legumes: 0 })).toBe(0);
    expect(seedSowCap(work, 'winter', byId(s), { grain: total / 4, legumes: 0 })).toBeCloseTo(
      work.required.sow / 4,
      9,
    );
    // zásoby pod přídělem do žní – osivo do země nesmí
    const food = foodUntilHarvestKg(s, at(600, 9, 15));
    expect(food).toBeGreaterThan(0);
    s.storesKg = SEED_STORES.floorRation * food;
    expect(sowableSeedKg(s, 'grain', food)).toBe(0);
    // ves bez zásob k 1. 9. ozim nezaseje
    const hungry = advanceVillage(village(20, 0), at(600, 10, 31), null);
    const winter = hungry.season ? seasonCrop(hungry.season, 'winter') : undefined;
    expect(winter?.done.sow ?? 0).toBe(0);
    expect(winter?.seedKg ?? 0).toBe(0);
  });

  it('sklizeň osivo neodečítá znovu – úroda zaseté plochy celá', () => {
    const { s, work } = withWinter(4, 1000);
    for (const task of Object.keys(work.required) as (keyof CropWork['done'])[]) {
      work.done[task] = work.required[task];
    }
    takeSeed(s, work, 'winter', byId(s));
    const gross = grossYieldPerHa(70) * 4 * PART_HA;
    expect(harvestKg(work, s.parts, at(601, 7, 31), 'spring')).toBeCloseTo(gross, 6);
  });

  it('převod: práce bez seedKg zásoby nebere a sklizeň osivo odečte jednou', () => {
    const { s, work } = withWinter(4, 1000);
    delete work.seedKg;
    for (const task of Object.keys(work.required) as (keyof CropWork['done'])[]) {
      work.done[task] = work.required[task];
    }
    expect(takeSeed(s, work, 'winter', byId(s))).toBe(0);
    expect(s.storesKg).toBe(1000);
    expect(seedSowCap(work, 'winter', byId(s), { grain: 0, legumes: 0 })).toBe(Infinity);
    const net = (grossYieldPerHa(70) - SEED_KG_PER_HA) * 4 * PART_HA;
    const day = at(601, 7, 31);
    expect(harvestKg(work, s.parts, day, 'spring')).toBeCloseTo(net, 6);
    // sklizeň do snopů jen jednou – druhé volání nic nepřidá (harvestedKg)
    s.lastDay = day - 1;
    harvestWinter(s, day);
    const sheaves = villageSheaves(s).grainKg + s.storesKg;
    expect(work.harvestedKg).not.toBeNull();
    harvestWinter(s, day);
    expect(villageSheaves(s).grainKg + s.storesKg).toBeCloseTo(sheaves, 9);
  });

  it('po kouscích přes setí ozimu i jaře stejně jako jedním voláním', () => {
    const start = village(30, 600);
    const end = at(601, 4, 30);
    const whole = advanceVillage(start, end, null);
    // ves opravdu sela ze zásob
    const taken = seasonCrops(whole.season!).reduce((sum, c) => sum + (c.work.seedKg ?? 0), 0);
    expect(taken).toBeGreaterThan(0);
    let pieces = start;
    for (const day of [
      at(600, 9, 1),
      at(600, 9, 2),
      at(600, 9, 20),
      at(600, 10, 3),
      at(600, 10, 31),
      at(601, 1, 15),
      at(601, 3, 10),
      at(601, 3, 11),
      at(601, 4, 2),
      end,
    ]) {
      pieces = JSON.parse(JSON.stringify(advanceVillage(pieces, day, null))) as VillageState;
    }
    expect(pieces).toEqual(JSON.parse(JSON.stringify(whole)));
  }, 120_000);
});
