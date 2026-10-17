import { describe, expect, it } from 'vitest';
import {
  APPLE_VARIANTS,
  SAPLING_GROWTH,
  STAKE_YEARS,
  TREES_PER_SQUARE,
  TREE_GROWTH_YEARS,
  fruitVisible,
  hasStake,
  orchardTreeSpots,
  plantingPhase,
  plantingProgress,
  treeGrowth,
} from '../orchard-layout';

const square = { cell: { x: 4, y: 7 }, x: 30, z: -15, size: 15 };

describe('jabloně ve čtverci', () => {
  it('2 stromy sponem do pětky (≈ 10,6 m) s drobným rozházením, uvnitř čtverce', () => {
    const spots = orchardTreeSpots(square);
    expect(spots).toHaveLength(TREES_PER_SQUARE);
    for (const spot of spots) {
      expect(Math.abs(spot.x - square.x)).toBeLessThan(square.size / 2);
      expect(Math.abs(spot.z - square.z)).toBeLessThan(square.size / 2);
      expect(spot.variant).toBeGreaterThanOrEqual(0);
      expect(spot.variant).toBeLessThan(APPLE_VARIANTS);
    }
    const gap = Math.hypot(spots[1]!.x - spots[0]!.x, spots[1]!.z - spots[0]!.z);
    expect(Math.abs(gap - 7.5 * Math.SQRT2)).toBeLessThanOrEqual(1.5);
    // šachovnice navazuje: soused vpravo má strom 7,5 m od rohu, ne v řadě vedle
    const right = orchardTreeSpots({ ...square, cell: { x: 5, y: 7 }, x: square.x + 15 });
    expect(Math.abs(right[0]!.x - spots[1]!.x - 7.5)).toBeLessThanOrEqual(1);
    // stejné políčko = stejné stromy
    expect(orchardTreeSpots({ ...square })).toEqual(spots);
    expect(orchardTreeSpots({ ...square, cell: { x: 5, y: 7 } })).not.toEqual(spots);
  });

  it('sazenice roste do plné velikosti; kůl první roky', () => {
    expect(treeGrowth(0)).toBe(SAPLING_GROWTH);
    expect(treeGrowth(TREE_GROWTH_YEARS / 2)).toBeCloseTo((1 + SAPLING_GROWTH) / 2);
    expect(treeGrowth(TREE_GROWTH_YEARS)).toBe(1);
    expect(treeGrowth(40)).toBe(1);
    expect(hasStake(treeGrowth(1))).toBe(true);
    expect(hasStake(treeGrowth(STAKE_YEARS + 0.1))).toBe(false);
  });

  it('výsadba po fázích: nejdřív kůly, pak sazenice', () => {
    expect(plantingProgress(0, 4)).toEqual({ stakes: 0, saplings: 0 });
    expect(plantingProgress(0.25, 4)).toEqual({ stakes: 2, saplings: 0 });
    expect(plantingProgress(0.5, 4)).toEqual({ stakes: 4, saplings: 0 });
    expect(plantingProgress(0.75, 4)).toEqual({ stakes: 4, saplings: 2 });
    expect(plantingProgress(1, 4)).toEqual({ stakes: 4, saplings: 4 });
    expect(plantingProgress(0.25, TREES_PER_SQUARE)).toEqual({ stakes: 1, saplings: 0 });
    expect(plantingPhase(0.2).label).toBe('Kůly');
    expect(plantingPhase(0.8).label).toBe('Sazenice');
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
