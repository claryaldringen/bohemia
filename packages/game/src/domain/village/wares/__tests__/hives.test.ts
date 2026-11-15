import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import type { VillageState } from '../../types';
import { hivesDay } from '../hives';
import { beesFlying } from '../wares';

const village = (n: number): VillageState =>
  ({ dwellings: Array.from({ length: n }, () => ({})) }) as unknown as VillageState;
const at = (month: number, day: number): number => dayIndexOf({ year: 500, month, day });

describe('klát', () => {
  it('3 obydlí 15. 6. dají 3 × roční ÷ 153', () => {
    const s = village(3);
    hivesDay(s, at(6, 15));
    expect(s.wares?.honeyKg).toBeCloseTo((3 * 6) / 153, 9);
    expect(s.wares?.waxKg).toBeCloseTo((3 * 0.4) / 153, 9);
  });
  it('přibývá 1. 5. a 30. 9., 30. 4. a 1. 10. ne', () => {
    for (const [m, d, yes] of [
      [5, 1, true],
      [9, 30, true],
      [4, 30, false],
      [10, 1, false],
    ] as const) {
      const s = village(1);
      hivesDay(s, at(m, d));
      expect(s.wares !== undefined).toBe(yes);
    }
  });
  it('bez obydlí wares nevznikne', () => {
    const s = village(0);
    hivesDay(s, at(6, 15));
    expect(s.wares).toBeUndefined();
  });
  it('beesFlying jen květen až září', () => {
    expect(beesFlying(at(5, 1))).toBe(true);
    expect(beesFlying(at(9, 30))).toBe(true);
    expect(beesFlying(at(4, 30))).toBe(false);
    expect(beesFlying(at(10, 1))).toBe(false);
  });
  it('celá sezóna dá roční množství', () => {
    const s = village(1);
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) hivesDay(s, at(m, d));
    // 28denní měsíce – jen kontrola, že mimo sezónu nic nepřibývá (5 × 28 dní)
    expect(s.wares?.honeyKg).toBeCloseTo((140 * 6) / 153, 9);
  });
});
