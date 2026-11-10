import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed } from '../../landscape/random';
import {
  christianityChance,
  discoveryYear,
  isChristian,
  rodBaptized,
  threeFieldAllowed,
} from '../faith';
import type { Person, VillageState } from '../types';

/** Kumulativní podíl rodů, které znají křesťanství do roku `year` včetně (christianity.md). */
function knownBy(year: number): number {
  let none = 1;
  for (let y = 500; y <= year; y++) none *= 1 - christianityChance(y);
  return 1 - none;
}

describe('christianityChance', () => {
  it('v roce 500 je nulová', () => {
    expect(christianityChance(500)).toBe(0);
    expect(christianityChance(400)).toBe(0);
  });

  it('kumulativně odpovídá tabulce návrhu', () => {
    expect(knownBy(600)).toBeGreaterThan(0.008);
    expect(knownBy(600)).toBeLessThan(0.012);
    expect(knownBy(800)).toBeGreaterThan(0.48);
    expect(knownBy(800)).toBeLessThan(0.54);
    expect(knownBy(900)).toBeGreaterThanOrEqual(0.985);
  });
});

describe('discoveryYear', () => {
  it('je deterministický', () => {
    expect(discoveryYear(123, 500, 900)).toBe(discoveryYear(123, 500, 900));
  });

  it('je první rok, kdy padne los rok po roku', () => {
    for (const seed of [1, 2, 3, 77, 4242, 99999]) {
      let expected: number | null = null;
      for (let y = 500; y <= 900; y++) {
        if (createRandom(deriveSeed(seed, 'faith:' + y)).next() < christianityChance(y)) {
          expected = y;
          break;
        }
      }
      expect(discoveryYear(seed, 500, 900)).toBe(expected);
    }
  });

  it('přehrání po kouscích dá totéž co vcelku', () => {
    for (const seed of [5, 6, 7, 8, 9]) {
      const whole = discoveryYear(seed, 500, 900);
      const first = discoveryYear(seed, 500, 700);
      const chunked = first ?? discoveryYear(seed, 701, 900);
      expect(chunked).toBe(whole);
    }
  });

  it('vrací null, když los nepadl', () => {
    expect(discoveryYear(1, 500, 500)).toBeNull();
  });
});

describe('víra', () => {
  it('isChristian a rodBaptized', () => {
    expect(isChristian({ faith: 'christian' } as Person)).toBe(true);
    expect(isChristian({} as Person)).toBe(false);
    expect(rodBaptized({} as VillageState)).toBe(false);
    expect(rodBaptized({ faith: {} } as VillageState)).toBe(false);
    expect(rodBaptized({ faith: { rodBaptizedDay: 0 } } as VillageState)).toBe(true);
  });

  it('trojpolí vyžaduje rok 1100 a pokřtěný rod', () => {
    expect(threeFieldAllowed(1099, true)).toBe(false);
    expect(threeFieldAllowed(1100, false)).toBe(false);
    expect(threeFieldAllowed(1100, true)).toBe(true);
  });
});
