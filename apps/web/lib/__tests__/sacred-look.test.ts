import { describe, expect, it } from 'vitest';
import { SACRED_OAK_GROWTH, sacredOakGrowth } from '../sacred-look';

describe('sacredOakGrowth – posvátné duby se postupně zvětší', () => {
  const YEAR = 365.25;

  it('hned po ušetření beze změny, za 30 let o 15 %, od 60 let o 30 %', () => {
    expect(sacredOakGrowth(1000, 1000)).toBe(1);
    expect(sacredOakGrowth(1000, 1000 + 30 * YEAR)).toBeCloseTo(1.15, 12);
    expect(sacredOakGrowth(1000, 1000 + 60 * YEAR)).toBeCloseTo(1 + SACRED_OAK_GROWTH.extra, 12);
    expect(sacredOakGrowth(1000, 1000 + 200 * YEAR)).toBeCloseTo(1.3, 12);
  });

  it('mění se jen po celých herních letech a nikdy neklesne', () => {
    expect(sacredOakGrowth(0, Math.floor(YEAR) - 1)).toBe(1);
    expect(sacredOakGrowth(0, Math.ceil(YEAR))).toBeCloseTo(1.005, 12);
    expect(sacredOakGrowth(500, 100)).toBe(1);
    let previous = 0;
    for (let day = 0; day < 70 * YEAR; day += 97) {
      const growth = sacredOakGrowth(0, day);
      expect(growth).toBeGreaterThanOrEqual(previous);
      previous = growth;
    }
  });
});
