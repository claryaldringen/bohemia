import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { HAY } from '../hay';
import type { VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Voli bez ohrady (migration.md – Co si vezmou) žerou seno jako voli v ohradě (oprava 26. 11. 2026,
// dřív je `feedHay` nepočítal a nová ves je krmila zadarmo) – a když seno dojde, chovají se stejně.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

function village(day: number, looseOxen: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.looseOxen = Array.from({ length: looseOxen }, () => ({ trainedDay: at(598, 4, 1) }));
  return s;
}

describe('voli bez ohrady a seno', () => {
  it('za den zimy sní dávku volů jako voli v ohradě', () => {
    const day = at(600, 12, 10);
    const s = village(day - 1, 2);
    s.hay = { kg: 2_000, mowing: null };
    const next = advanceVillage(s, day, null);
    const winter = next.hay!.winter!;
    expect(winter.oxenNeedKg).toBeCloseTo(2 * HAY.dailyKg.ox, 9);
    expect(winter.oxenEatenKg).toBeCloseTo(2 * HAY.dailyKg.ox, 9);
    expect(next.looseOxen).toHaveLength(2);
  });

  it('1. 3. bez sena pod polovinou přídělu část volů bez ohrady uhyne, ostatní zeslábnou', () => {
    const day = at(601, 3, 1);
    const s = village(day - 1, 4);
    s.hay = { kg: 0, mowing: null, winter: { oxenNeedKg: 4_000, oxenEatenKg: 1_000 } };
    const next = advanceVillage(s, day, null);
    const left = next.looseOxen ?? [];
    expect(left).toHaveLength(1);
    for (const ox of left) expect(ox.weak).toBeLessThan(1);
  });
});
