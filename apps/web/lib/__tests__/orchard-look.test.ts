import { describe, expect, it } from 'vitest';
import {
  SAPLING_GROWTH,
  STAKE_YEARS,
  TREE_GROWTH_YEARS,
  fruitVisible,
  hasStake,
  treeGrowth,
} from '../orchard-look';

describe('vzhled sadu', () => {
  it('sazenice roste do plné velikosti; kůl první roky', () => {
    expect(treeGrowth(0)).toBe(SAPLING_GROWTH);
    expect(treeGrowth(TREE_GROWTH_YEARS / 2)).toBeCloseTo((1 + SAPLING_GROWTH) / 2);
    expect(treeGrowth(TREE_GROWTH_YEARS)).toBe(1);
    expect(treeGrowth(40)).toBe(1);
    expect(hasStake(treeGrowth(1))).toBe(true);
    expect(hasStake(treeGrowth(STAKE_YEARS + 0.1))).toBe(false);
  });

  it('jablka visí v srpnu a během sklizně, než se sklidí – jen na plodícím sadu', () => {
    const base = { bearing: true, month: 8, harvestWindow: false, harvested: false };
    expect(fruitVisible(base)).toBe(true);
    expect(fruitVisible({ ...base, bearing: false })).toBe(false);
    expect(fruitVisible({ ...base, month: 9, harvestWindow: true })).toBe(true);
    expect(fruitVisible({ ...base, month: 9, harvestWindow: true, harvested: true })).toBe(false);
    expect(fruitVisible({ ...base, month: 6 })).toBe(false);
  });
});
