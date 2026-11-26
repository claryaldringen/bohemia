import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { summarizeVillage } from '../../core/summary';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { addJewellery, jewelleryMaterialG, jewelleryOf, useJewellery } from '../jewellery';

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
  it('kov = celé gramy zlata + mince; použitelná kapacita nepřeroste kov', () => {
    const s = village(10.6, 5, 20);
    expect(jewelleryMaterialG(s)).toBe(15);
    expect(jewelleryOf(s)).toBe(15);
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
    expect(s.jewelleryG).toBe(15);
    const t = village(0, 0);
    addJewellery(t, 8);
    expect(t.jewelleryG).toBeUndefined();
  });

  it('pohled vsi nese jewelleryG jako jewelleryOf v celých gramech', () => {
    const s = village(10, 5, 30);
    expect(summarizeVillage(s, DAY).wares?.jewelleryG).toBe(15);
    expect(summarizeVillage(village(10, 5), DAY).wares?.jewelleryG).toBeUndefined();
  });
});
