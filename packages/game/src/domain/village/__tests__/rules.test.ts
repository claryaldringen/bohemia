import { describe, it, expect } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  APPLE_ROT_DAY,
  DWELLINGS,
  HARVEST_DAY,
  ORCHARD_PLANTING_WINDOWS,
  ORCHARD_SEASON,
  ORCHARD_WINDOWS,
  PLANNING_DAY,
  THRESH_END_DAY,
  WINDOWS,
  childDeathsPerYear,
} from '../rules';
import { seasonBounds } from '../orchard';

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

describe('data roku sadu souhlasí s okny prací (orchard.md)', () => {
  it('sklizeň jablek začíná po sklizni obilí, péče končí, když jablka shnijí a začíná rok sadu', () => {
    const harvest = seasonBounds(ORCHARD_WINDOWS.harvest);
    expect(harvest).toEqual({ start: PLANNING_DAY, end: { month: 11, day: 1 } });
    const care = seasonBounds(ORCHARD_WINDOWS.care);
    expect(care).toEqual({ start: { month: 12, day: 1 }, end: APPLE_ROT_DAY });
    expect(APPLE_ROT_DAY).toEqual({ month: ORCHARD_SEASON.startMonth, day: 1 });
  });

  it('podzimní výsadba (roste až od jara) začíná podzimním oknem výsadby', () => {
    expect(ORCHARD_PLANTING_WINDOWS.map(([from]) => from)).toContain(
      ORCHARD_SEASON.autumnPlantingFromMonth,
    );
    expect(ORCHARD_PLANTING_WINDOWS.map(([from]) => from)).toContain(ORCHARD_SEASON.startMonth);
  });
});
