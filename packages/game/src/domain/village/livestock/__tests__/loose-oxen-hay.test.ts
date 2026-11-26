import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { advanceVillage } from '../../core/simulate';
import { HAY } from '../hay';
import { winterInput } from '../husbandry';
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

  it('plán zimních stád počítá seno i na voly bez ohrady', () => {
    const day = at(600, 10, 20);
    const none = winterInput(village(day, 0), day, 0);
    const loose = winterInput(village(day, 3), day, 0);
    expect(loose.oxen - none.oxen).toBe(3);
  });

  it('úhyn volů bez ohrady 1. 3. je v kronice (vycvičení a telata zvlášť)', () => {
    const day = at(601, 3, 1);
    const s = village(day - 1, 4);
    s.looseOxen = [
      { trainedDay: at(598, 4, 1) },
      { trainedDay: at(598, 4, 1) },
      { trainedDay: at(600, 6, 1) },
      { trainedDay: at(600, 6, 1) },
    ];
    s.hay = { kg: 0, mowing: null, winter: { oxenNeedKg: 4_000, oxenEatenKg: 0 } };
    const next = advanceVillage(s, day, null);
    const died = next.chronicle.filter((e) => e.kind === 'ox-died');
    expect(died.length).toBeGreaterThan(0);
    const total = died.reduce((n, e) => n + (e.kind === 'ox-died' ? (e.oxen ?? 1) : 0), 0);
    expect(total).toBe(4 - (next.looseOxen?.length ?? 0));
  });
});
