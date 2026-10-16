import { describe, it, expect } from 'vitest';
import { createRandom, deriveSeed } from '../random';

const take = (seed: number, n: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: n }, () => random.next());
};

describe('createRandom', () => {
  it('stejný seed dává stejnou posloupnost', () => {
    expect(take(123, 5)).toEqual(take(123, 5));
  });

  it('jiný seed dává jinou posloupnost', () => {
    expect(take(123, 5)).not.toEqual(take(124, 5));
  });

  it('hodnoty leží v [0, 1)', () => {
    for (const value of take(7, 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('průměr 10 000 vzorků je mezi 0,48 a 0,52', () => {
    const values = take(99, 10_000);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('deriveSeed', () => {
  it('je deterministický a pro různé štítky dává různé seedy', () => {
    expect(deriveSeed(42, 'terrain')).toBe(deriveSeed(42, 'terrain'));
    expect(deriveSeed(42, 'terrain')).not.toBe(deriveSeed(42, 'vegetation'));
    expect(deriveSeed(42, 'terrain')).not.toBe(deriveSeed(43, 'terrain'));
  });

  it('vrací celé číslo 0 … 2^32 − 1', () => {
    for (const label of ['terrain', 'vegetation', 'fertility', '']) {
      const seed = deriveSeed(4_000_000_000, label);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
