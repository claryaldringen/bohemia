import { describe, expect, it } from 'vitest';
import type { Random } from '../../landscape/random';
import { surrenders } from '../surrender';

// Vzdání muže rodu (war.md – Vzdaní, zajetí a výkupné): 80 % v bezvýchodné situaci, jezdec
// s volnou cestou uteče.

const rolling = (value: number): Random => ({ next: () => value }) as Random;
const FOOT = { mounted: false };
const HOPELESS = { hopeless: true, freeRoute: false };

describe('surrenders', () => {
  it('bez bezvýchodné situace se nevzdá', () => {
    expect(surrenders(FOOT, { hopeless: false, freeRoute: false }, rolling(0))).toBe(false);
  });

  it('v bezvýchodné situaci se vzdá s pravděpodobností 80 %', () => {
    expect(surrenders(FOOT, HOPELESS, rolling(0.79))).toBe(true);
    expect(surrenders(FOOT, HOPELESS, rolling(0.8))).toBe(false);
  });

  it('jezdec s volnou cestou uteče, bez ní se vzdá', () => {
    const rider = { mounted: true };
    expect(surrenders(rider, { hopeless: true, freeRoute: true }, rolling(0))).toBe(false);
    expect(surrenders(rider, HOPELESS, rolling(0))).toBe(true);
  });
});
