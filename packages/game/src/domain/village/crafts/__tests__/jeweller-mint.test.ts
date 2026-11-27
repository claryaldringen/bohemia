import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { NO_CRAFTS } from '../../core/productivity';
import { GOLD } from '../../rules/rules-gold';
import { CRAFT_BASE } from '../../rules/rules-crafts';
import { jewelleryMaterialG } from '../../trade/jewellery';
import type { Craft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { newWorkshop, restingCrafters } from '../crafts';
import { workJeweller, workMinter } from '../gold-crafts';

// Šperkař a mincovna (plán 6, úloha 5; gold.md – Pravidla 3 a 4).

const DAY = dayIndexOf({ year: 950, month: 1, day: 1 });
const WORKSHOP_ID = 50;
const LABOR = { craft: 1, skill: 1 };

const person = (id: number, years: number, dwellingId: number): Person => ({
  id,
  bornDay: DAY - Math.ceil(years * 365.25),
  dwellingId,
});

function village(craft: Craft, gold?: number, coins?: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.dwellings.push({
    id: WORKSHOP_ID,
    type: CRAFT_BASE[craft],
    builtDay: DAY,
    condition: 1,
    position: { x: 40, z: 0, rotation: 0 },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(60, 24, WORKSHOP_ID));
  if (gold !== undefined) s.gold = gold;
  if (coins !== undefined) s.coins = coins;
  return s;
}

const activity = (s: VillageState, day = DAY): string | undefined =>
  restingCrafters(s, day, NO_CRAFTS).get(WORKSHOP_ID);

describe('šperkař', () => {
  it('zpracuje 1,5 g denně do kovu vsi (3 g zlata + 5 mincí po 2,4 g), pak odpočívá', () => {
    const s = village('jeweller', 3, 5);
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'producing', wroughtG: 1.5 });
    expect(s.jewelleryG).toBe(1.5);
    for (let d = 2; d <= 10; d++) workJeweller(s, LABOR);
    expect(s.jewelleryG).toBe(15);
    expect(activity(s)).toBe('resting');
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'resting', wroughtG: 0 });
    expect(s.jewelleryG).toBe(15);
  });

  it('nepřekročí kov vsi ani poslední částí dne', () => {
    const s = village('jeweller', 3, 5);
    s.jewelleryG = 14;
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'producing', wroughtG: 1 });
    expect(s.jewelleryG).toBe(15);
  });

  it('ves bez zlata a mincí: no-gold', () => {
    expect(activity(village('jeweller'))).toBe('no-gold');
    expect(workJeweller(village('jeweller'), LABOR).activity).toBe('no-gold');
  });

  it('s kovem a bez zpracovaného zlata pracuje', () => {
    expect(activity(village('jeweller', 3, 5))).toBeUndefined();
  });

  it('kov vsi: mince po 2,4 g a zlato i se zlomkem pod minci', () => {
    expect(jewelleryMaterialG({ coins: 5 })).toBe(12);
    expect(jewelleryMaterialG({ gold: 0.8, coins: 5 })).toBe(12.8);
  });
});

describe('mincovna', () => {
  it('razí celé mince: 200 g za člověkoden = 83 mincí, 0,8 g zbude', () => {
    const s = village('minter', 200);
    expect(workMinter(s, LABOR, DAY)).toMatchObject({ activity: 'producing', mintedCoins: 83 });
    expect(s.coins).toBe(83);
    expect(s.gold).toBe(0.8);
    expect((s.gold ?? 0) + (s.coins ?? 0) * GOLD.coinGrams).toBeCloseTo(200, 2);
    expect(activity(s, DAY + 1)).toBe('no-gold');
  });

  it('po dnech: zbytek zlata počká, kov vsi se nemění', () => {
    const s = village('minter', 450.6);
    const total = (): number => (s.gold ?? 0) + (s.coins ?? 0) * GOLD.coinGrams;
    expect(workMinter(s, LABOR, DAY).mintedCoins).toBe(83);
    expect(s.gold).toBe(251.4);
    expect(workMinter(s, LABOR, DAY + 1).mintedCoins).toBe(83);
    expect(s.gold).toBe(52.2);
    expect(workMinter(s, LABOR, DAY + 2).mintedCoins).toBe(21);
    expect(s.coins).toBe(187);
    expect(s.gold).toBe(1.8);
    expect(total()).toBeCloseTo(450.6, 2);
    expect(jewelleryMaterialG(s)).toBeCloseTo(450.6, 2);
    expect(activity(s, DAY + 3)).toBe('no-gold');
    expect(workMinter(s, LABOR, DAY + 3)).toMatchObject({ activity: 'no-gold', mintedCoins: 0 });
  });

  it('zlato těsně pod 2,4 g se vyrazí a pole zmizí, nikdy záporné', () => {
    const s = village('minter', 2.3999999999);
    expect(workMinter(s, LABOR, DAY).mintedCoins).toBe(1);
    expect(s.coins).toBe(1);
    expect('gold' in s).toBe(false);
  });

  it('s 2,4 g i 2,5 g pracuje, méně než na minci (2,3 g): no-gold', () => {
    expect(activity(village('minter', 2.4))).toBeUndefined();
    expect(activity(village('minter', 2.5))).toBeUndefined();
    expect(activity(village('minter', 2.3))).toBe('no-gold');
  });
});
