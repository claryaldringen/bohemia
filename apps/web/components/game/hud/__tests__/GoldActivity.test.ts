import { describe, expect, it } from 'vitest';
import { activityLook } from '../selection/crafts';
import type { SelectionWorkshop } from '@/lib/selection-details';

// Činnost dílen zlata v panelu (gold.md, plán 6): bez „kg/den“ a bez obecného „Vyrábí – zlato“.
const shop = (
  craft: SelectionWorkshop['craft'],
  activity: SelectionWorkshop['activity'],
  gold?: SelectionWorkshop['gold'],
): SelectionWorkshop =>
  ({
    craft,
    activity,
    outputPerDayKg: 0,
    kilns: [],
    kiln: null,
    carpenter: null,
    toPlant: 0,
    ...(gold ? { gold } : {}),
  }) as unknown as SelectionWorkshop;

describe('activityLook – dílny zlata', () => {
  it('při práci ukáže činnost řemeslníka, ne kg/den', () => {
    expect(activityLook(shop('panner', 'producing')).name).toBe('Rýžuje zlato');
    expect(activityLook(shop('jeweller', 'producing')).name).toBe('Dělá šperky');
    expect(activityLook(shop('minter', 'producing')).name).toBe('Razí mince');
    for (const craft of ['panner', 'jeweller', 'minter'] as const) {
      expect(activityLook(shop(craft, 'producing')).value).not.toContain('kg');
    }
  });

  it('rýžovník mimo sezónu: měsíce ze sezóny jádra', () => {
    const gold = {
      craft: 'panner',
      placersLeft: 2,
      leftG: 900,
      walkM: 0,
      season: { from: 4, to: 10 },
    } as const;
    expect(activityLook(shop('panner', 'resting', gold)).name).toBe(
      'Rýžuje se od dubna do října – zatím pomáhá vsi na poli a se stavbami',
    );
    const other = { ...gold, season: { from: 5, to: 9 } };
    expect(activityLook(shop('panner', 'resting', other)).name).toContain('od května do září');
  });

  it('šperkař a mincíř v klidu dál říkají „je dost na rok“', () => {
    expect(activityLook(shop('jeweller', 'resting')).name).toContain('Šperků je dost na rok');
  });
});
