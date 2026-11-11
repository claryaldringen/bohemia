import { describe, expect, it } from 'vitest';
import { SegmentMemo } from '../segment-memo';

describe('paměť úseček (SegmentMemo)', () => {
  it('vrátí zapsanou hodnotu jen pro tytéž krajní body', () => {
    const memo = new SegmentMemo();
    memo.set(1.5, -2, 3, 4.25, 7);
    expect(memo.get(1.5, -2, 3, 4.25)).toBe(7);
    expect(memo.get(3, 4.25, 1.5, -2)).toBeUndefined();
    expect(memo.get(1.5, -2, 3, 4.250000001)).toBeUndefined();
    memo.set(0, 0, 1, 1, Infinity);
    expect(memo.get(0, 0, 1, 1)).toBe(Infinity);
  });

  it('po zvětšení tabulky drží všechny hodnoty, plná nejmenší se vyprázdní a plní dál', () => {
    const memo = new SegmentMemo();
    for (let k = 0; k < 10_000; k++) memo.set(k, k / 3, -k, 1, k * 2);
    for (let k = 0; k < 10_000; k++) expect(memo.get(k, k / 3, -k, 1)).toBe(k * 2);
    const small = new SegmentMemo(1 << 12);
    for (let k = 0; k < 5_000; k++) small.set(k, 0, 0, 0, k);
    // po vyprázdnění zůstanou jen poslední zápisy – žádná hodnota není cizí
    for (let k = 0; k < 5_000; k++) {
      const v = small.get(k, 0, 0, 0);
      if (v !== undefined) expect(v).toBe(k);
    }
    expect(small.get(4_999, 0, 0, 0)).toBe(4_999);
  });
});
