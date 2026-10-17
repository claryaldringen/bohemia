import { describe, it, expect } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  DWELLINGS,
  HARVEST_DAY,
  PLANNING_DAY,
  THRESH_END_DAY,
  WINDOWS,
  childDeathsPerYear,
} from '../rules';

describe('pravidla obyvatelstva', () => {
  it('zemnice pojme 6 lidí', () => {
    expect(DWELLINGS.zemnice.capacity).toBe(6);
  });

  it('roční úmrtnost dětí odpovídá 40 % do dospělosti', () => {
    // 1 − 0,6^(1/14) ≈ 0,03583
    expect(childDeathsPerYear()).toBeCloseTo(0.03583, 4);
  });
});

describe('data polního roku souhlasí s okny prací', () => {
  const inWindow = (task: keyof typeof WINDOWS, month: number): boolean =>
    WINDOWS[task].some(([from, to]) => month >= from && month <= to);

  it('sklizeň je poslední den okna sklizně a plán osevu den po ní', () => {
    const harvest = dayIndexOf({ year: 601, ...HARVEST_DAY });
    expect(inWindow('harvest', HARVEST_DAY.month)).toBe(true);
    const next = dateOfDayIndex(harvest + 1);
    expect(inWindow('harvest', next.month)).toBe(false);
    expect({ month: next.month, day: next.day }).toEqual(PLANNING_DAY);
  });

  it('konec výmlatu je den po konci okna výmlatu', () => {
    const before = dateOfDayIndex(dayIndexOf({ year: 601, ...THRESH_END_DAY }) - 1);
    expect(inWindow('thresh', before.month)).toBe(true);
    expect(inWindow('thresh', THRESH_END_DAY.month)).toBe(false);
    expect(THRESH_END_DAY.day).toBe(1);
  });
});
