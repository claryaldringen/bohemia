import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_WORLD,
  TOTAL_GAME_DAYS,
  dateOfDayIndex,
  realTimeOf,
  shiftWorldClock,
} from '@bohemia/game';
import { DAY_CHECK_GRACE_MS, nextDayCheckMs } from '../village-day-check';

// Den bez workeru (server-events.md – Den bez workeru; plán 2026-11-15 – Rozhodnutí 8): když do
// 10 s po začátku dalšího herního dne nepřijde pohled nového dne, prohlížeč se jednou zeptá.

describe('nextDayCheckMs', () => {
  const day11 = realTimeOf(dateOfDayIndex(11), OFFICIAL_WORLD);

  it('den 10 → začátek dne 11 + 10 s', () => {
    const now = realTimeOf(dateOfDayIndex(10), OFFICIAL_WORLD) + 5_000;
    expect(DAY_CHECK_GRACE_MS).toBe(10_000);
    expect(nextDayCheckMs(10, OFFICIAL_WORLD, now)).toBe(day11 + 10_000 - now);
  });

  it('čas po začátku dne + 10 s → 0', () => {
    expect(nextDayCheckMs(10, OFFICIAL_WORLD, day11 + 10_000)).toBe(0);
    expect(nextDayCheckMs(10, OFFICIAL_WORLD, day11 + 60_000)).toBe(0);
  });

  it('posun času hráče: den pohledu je o posun dál, okamžik začátku dne stejný', () => {
    const shifted = shiftWorldClock(OFFICIAL_WORLD, 30);
    const now = day11 - 20_000;
    expect(nextDayCheckMs(40, shifted, now)).toBe(nextDayCheckMs(10, OFFICIAL_WORLD, now));
  });

  it('bez pohledu a poslední den světa null', () => {
    expect(nextDayCheckMs(null, OFFICIAL_WORLD, day11)).toBeNull();
    expect(
      nextDayCheckMs(TOTAL_GAME_DAYS - 1, OFFICIAL_WORLD, OFFICIAL_WORLD.endMs - 10),
    ).toBeNull();
  });
});
