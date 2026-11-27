import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { summarizeVillage } from '../../core/summary';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { addJewellery, jewelleryMaterialG, jewelleryOf, useJewellery } from '../jewellery';
import { tripJewelleryG } from '../market-trip';

// Kapacita šperkaře (plán 6, úloha 5; gold.md – Pravidla 4): kov vsi = celé gramy zlata + mince.

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });

const village = (
  gold: number,
  coins: number,
  jewelleryG?: number,
): ReturnType<typeof foundVillage> => {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.gold = gold;
  s.coins = coins;
  if (jewelleryG !== undefined) s.jewelleryG = jewelleryG;
  return s;
};

describe('kapacita šperkaře', () => {
  it('kov = zlato i se zlomkem + mince po 2,4 g; použitelná kapacita nepřeroste kov', () => {
    const s = village(10.6, 5, 20);
    expect(jewelleryMaterialG(s)).toBe(22.6);
    expect(jewelleryOf(s)).toBe(20);
    expect(jewelleryOf(village(10.6, 5, 30))).toBe(22.6);
    expect(jewelleryOf(village(10.6, 5))).toBe(0);
  });

  it('useJewellery ubere a nulu pole smaže', () => {
    const s = village(10.6, 5, 20);
    useJewellery(s, 20);
    expect(s.jewelleryG).toBeUndefined();
    const t = village(10.6, 5, 10);
    useJewellery(t, 4);
    expect(t.jewelleryG).toBe(6);
  });

  it('addJewellery přidá nejvýš do kovu vsi', () => {
    const s = village(10.6, 5, 10);
    addJewellery(s, 8);
    expect(s.jewelleryG).toBe(18);
    addJewellery(s, 8);
    expect(s.jewelleryG).toBe(22.6);
    const t = village(0, 0);
    addJewellery(t, 8);
    expect(t.jewelleryG).toBeUndefined();
  });

  it('kapacita na setiny – šum plovoucí čárky se do jewelleryG nezapíše', () => {
    // 7,2 − 2,4 = 4,800000000000001 a 2,4 + 4,8 = 7,199999999999999
    const used = village(0, 3, 7.2);
    useJewellery(used, 2.4);
    expect(used.jewelleryG).toBe(4.8);
    const added = village(0, 3, 2.4);
    addJewellery(added, 4.8);
    expect(added.jewelleryG).toBe(7.2);
    // výprava se 3 mincemi veze kov 3 × 2,4 g = 7,2 g, ne 7,199999999999999
    expect(tripJewelleryG(village(0, 3, 20), { coins: 3 })).toBe(7.2);
    // zlomek pod setinu z práce šperkaře není šum – zůstane (kapacita ubude nejvýš o kov, který odešel)
    const worked = village(0, 20, 33.60174);
    useJewellery(worked, 33.6);
    expect(worked.jewelleryG).toBeCloseTo(0.00174, 12);
  });

  it('pohled vsi nese jewelleryG jako jewelleryOf v celých gramech', () => {
    const s = village(10, 5, 30);
    expect(summarizeVillage(s, DAY).wares?.jewelleryG).toBe(22);
    expect(summarizeVillage(village(10, 5), DAY).wares?.jewelleryG).toBeUndefined();
  });
});
