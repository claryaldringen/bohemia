import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { beeTreeSpots } from '../../../landscape';
import { generateAcceptedLandscape } from '../../../landscape/generate';
import { CURRENT_LAYER_VERSIONS } from '../../../landscape/types';
import type { VillageState } from '../../types';
import { beeTreesDay, beeTreeWalksM, collectBeeTrees } from '../bee-trees';
import { waresDay } from '../wares';
import { waresWorkDay } from '../wares-work';

const at = (month: number, day: number): number => dayIndexOf({ year: 500, month, day });
const village = (): VillageState => ({ dwellings: [] }) as unknown as VillageState;

describe('brtě', () => {
  it('walks [300, 600]: 15. 6. přibyde 2 × roční ÷ 153', () => {
    const s = village();
    beeTreesDay(s, at(6, 15), [300, 600]);
    expect(s.wares?.beeTrees?.honeyKg).toBeCloseTo((2 * 6) / 153, 9);
    expect(s.wares?.beeTrees?.waxKg).toBeCloseTo((2 * 0.4) / 153, 9);
  });

  it('1. 10. s prací 1 čd vybere vše a vrátí práci obchůzky', () => {
    const s = village();
    for (let d = at(5, 1); d <= at(9, 30); d++) beeTreesDay(s, d, [300, 600]);
    const stock = s.wares!.beeTrees!.honeyKg;
    expect(stock).toBeCloseTo(12, 6);
    const used = collectBeeTrees(s, at(10, 1), 1, [300, 600]);
    expect(used).toBeCloseTo((600 + 1200) / 1 / 3600 / 10, 9);
    expect(s.wares!.honeyKg).toBeCloseTo(stock, 9);
    expect(s.wares!.beeTrees!.honeyKg).toBe(0);
  });

  it('práce 0,01 čd nestačí – vrací 0 a med zůstane v brtích', () => {
    const s = village();
    beeTreesDay(s, at(6, 1), [300, 600]);
    expect(collectBeeTrees(s, at(10, 1), 0.01, [300, 600])).toBe(0);
    expect(s.wares!.honeyKg).toBe(0);
    expect(s.wares!.beeTrees!.honeyKg).toBeGreaterThan(0);
  });

  it('před 1. 10. se nevybírá', () => {
    const s = village();
    beeTreesDay(s, at(6, 1), [300]);
    expect(collectBeeTrees(s, at(9, 30), 5, [300])).toBe(0);
  });

  it('beeTreeWalksM na krajině wild-bees', () => {
    const landscape = generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, 'wild-bees').landscape;
    const walks = beeTreeWalksM(landscape);
    expect(walks.length).toBe(beeTreeSpots(landscape).length);
    expect(walks.length).toBeGreaterThan(0);
    for (const w of walks) expect(w).toBeLessThanOrEqual(900 + 2 * 4 * Math.SQRT2);
    expect([...walks].sort((a, b) => a - b)).toEqual([...walks]);
    expect(beeTreeWalksM(landscape)).toBe(walks);
  }, 120_000);

  it('bez krajiny se beeTrees nezaloží', () => {
    const s = village();
    waresDay(s, at(6, 15), null);
    expect(s.wares?.beeTrees).toBeUndefined();
    expect(waresWorkDay(s, at(10, 1), 5, null)).toBe(0);
    expect(s.wares?.beeTrees).toBeUndefined();
  });
});
