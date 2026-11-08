import { describe, expect, it } from 'vitest';
import { choosePremiumType } from '../assign';
import { PREMIUM_TYPES } from '../catalog';
import type { PremiumType } from '../types';

describe('choosePremiumType', () => {
  it('vybere nejméně zastoupený typ', () => {
    const counts: Partial<Record<PremiumType, number>> = {};
    for (const type of PREMIUM_TYPES) counts[type] = 2;
    counts['salt-spring'] = 1;
    for (const seed of [0, 1, 7, 123456])
      expect(choosePremiumType(seed, counts)).toBe('salt-spring');
  });

  it('při shodě rozhodne seed – deterministicky a pokaždé jeden ze shodných', () => {
    const counts: Partial<Record<PremiumType, number>> = { fertile: 0, 'iron-ore': 0 };
    for (const type of PREMIUM_TYPES) counts[type] ??= 1;
    const seen = new Set<PremiumType>();
    for (let seed = 0; seed < 20; seed++) {
      const type = choosePremiumType(seed, counts);
      expect(['fertile', 'iron-ore']).toContain(type);
      expect(choosePremiumType(seed, counts)).toBe(type);
      seen.add(type);
    }
    expect(seen.size).toBe(2);
  });

  it('bez `allowed` (i se všemi typy) stejný výsledek jako dřív pro seedy 0–50', () => {
    // Dřívější verze bez `allowed` – referenční.
    const reference = (seed: number, c: Partial<Record<PremiumType, number>>): PremiumType => {
      let least = Infinity;
      for (const type of PREMIUM_TYPES) least = Math.min(least, c[type] ?? 0);
      const tied = PREMIUM_TYPES.filter((type) => (c[type] ?? 0) === least);
      return tied[(seed >>> 0) % tied.length] as PremiumType;
    };
    const variants: Partial<Record<PremiumType, number>>[] = [
      {},
      { fertile: 0, 'iron-ore': 0, 'deep-gold': 2 },
      { 'salt-spring': 1, confluence: 3 },
    ];
    for (const c of variants)
      for (let seed = 0; seed <= 50; seed++) {
        expect(choosePremiumType(seed, c)).toBe(reference(seed, c));
        expect(choosePremiumType(seed, c, PREMIUM_TYPES)).toBe(reference(seed, c));
      }
  });

  it('s `allowed` jen z povolených – nejméně zastoupený mezi nimi, pořadí nerozhoduje', () => {
    const counts: Partial<Record<PremiumType, number>> = { fertile: 0, 'ford-hill': 2 };
    for (let seed = 0; seed < 20; seed++) {
      expect(choosePremiumType(seed, counts, ['ford-hill', 'confluence'])).toBe('confluence');
      expect(choosePremiumType(seed, counts, ['mountain-pass', 'confluence'])).toBe(
        choosePremiumType(seed, counts, ['confluence', 'mountain-pass']),
      );
    }
    expect(() => choosePremiumType(1, counts, [])).toThrow(RangeError);
  });

  it('19 hráčů po sobě dostane 19 různých typů', () => {
    const counts: Partial<Record<PremiumType, number>> = {};
    for (let player = 0; player < PREMIUM_TYPES.length; player++) {
      const type = choosePremiumType(player * 7919 + 13, counts);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(PREMIUM_TYPES.length);
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
  });
});
