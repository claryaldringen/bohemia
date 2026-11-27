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
  it('zpracuje 1,5 g denně do kovu vsi, pak odpočívá', () => {
    const s = village('jeweller', 10, 5);
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'producing', wroughtG: 1.5 });
    expect(s.jewelleryG).toBe(1.5);
    for (let d = 2; d <= 10; d++) workJeweller(s, LABOR);
    expect(s.jewelleryG).toBe(15);
    expect(activity(s)).toBe('resting');
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'resting', wroughtG: 0 });
    expect(s.jewelleryG).toBe(15);
  });

  it('nepřekročí kov vsi ani poslední částí dne', () => {
    const s = village('jeweller', 10, 5);
    s.jewelleryG = 14;
    expect(workJeweller(s, LABOR)).toMatchObject({ activity: 'producing', wroughtG: 1 });
    expect(s.jewelleryG).toBe(15);
  });

  it('ves bez zlata a mincí: no-gold', () => {
    expect(activity(village('jeweller'))).toBe('no-gold');
    expect(workJeweller(village('jeweller'), LABOR).activity).toBe('no-gold');
  });

  it('s kovem a bez zpracovaného zlata pracuje', () => {
    expect(activity(village('jeweller', 10, 5))).toBeUndefined();
  });
});

describe('mincovna', () => {
  it('razí po celých gramech, kov vsi se nemění', () => {
    const s = village('minter', 450.6);
    const total = (): number => (s.gold ?? 0) + (s.coins ?? 0) * GOLD.coinGrams;
    const sum = total();
    expect(workMinter(s, LABOR, DAY)).toMatchObject({ activity: 'producing', mintedCoins: 200 });
    expect(s.coins).toBe(200);
    expect(s.gold).toBeCloseTo(250.6, 9);
    expect(jewelleryMaterialG(s)).toBe(450);
    expect(workMinter(s, LABOR, DAY + 1).mintedCoins).toBe(200);
    expect(s.gold).toBeCloseTo(50.6, 9);
    expect(workMinter(s, LABOR, DAY + 2).mintedCoins).toBe(50);
    expect(s.coins).toBe(450);
    expect(s.gold).toBeCloseTo(0.6, 9);
    expect(total()).toBeCloseTo(sum, 9);
    expect(jewelleryMaterialG(s)).toBe(450);
    expect(activity(s, DAY + 3)).toBe('no-gold');
    expect(workMinter(s, LABOR, DAY + 3)).toMatchObject({ activity: 'no-gold', mintedCoins: 0 });
  });

  it('zlato těsně pod gramem se vyrazí a pole zmizí, nikdy záporné', () => {
    const s = village('minter', 0.9999999999);
    expect(workMinter(s, LABOR, DAY).mintedCoins).toBe(1);
    expect(s.coins).toBe(1);
    expect('gold' in s).toBe(false);
  });

  it('méně než gram zlata: no-gold', () => {
    expect(activity(village('minter', 0.5))).toBe('no-gold');
  });
});
