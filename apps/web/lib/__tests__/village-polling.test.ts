import { describe, expect, it } from 'vitest';
import {
  TOTAL_GAME_DAYS,
  dayIndexOf,
  realTimeOf,
  shiftWorldClock,
  OFFICIAL_WORLD,
} from '@bohemia/game';
import { POLL_MAX_MS, POLL_MIN_MS, nextPollDelayMs } from '../village-polling';

describe('nextPollDelayMs', () => {
  const day = dayIndexOf({ year: 700, month: 5, day: 12 });
  const start = realTimeOf({ year: 700, month: 5, day: 12 }, OFFICIAL_WORLD);
  const next = realTimeOf({ year: 700, month: 5, day: 13 }, OFFICIAL_WORLD);

  it('ostrý svět: na začátku dalšího herního dne + 1 s', () => {
    expect(nextPollDelayMs(day, OFFICIAL_WORLD, start + 10_000)).toBe(next + 1000 - start - 10_000);
    // herní den trvá ≈ 86,3 s – hned po začátku dne je další dotaz za ≈ 85 s
    const delay = nextPollDelayMs(day, OFFICIAL_WORLD, start + 1500);
    expect(delay).toBeGreaterThan(84_000);
    expect(delay).toBeLessThanOrEqual(POLL_MAX_MS);
  });

  it('nejdřív za 5 s (den už začal – hodiny prohlížeče napřed), nejpozději za 86 s', () => {
    expect(nextPollDelayMs(day, OFFICIAL_WORLD, next + 30_000)).toBe(POLL_MIN_MS);
    expect(nextPollDelayMs(day, OFFICIAL_WORLD, next - 2000)).toBe(POLL_MIN_MS);
    const slow = { startMs: Date.parse('2000-01-01'), endMs: Date.parse('2200-01-01') };
    expect(nextPollDelayMs(day, slow, realTimeOf({ year: 700, month: 5, day: 12 }, slow))).toBe(
      POLL_MAX_MS,
    );
  });

  it('posun času hráče: den pohledu je o posun dál, okamžik začátku dne stejný', () => {
    const shifted = shiftWorldClock(OFFICIAL_WORLD, 30);
    expect(nextPollDelayMs(day + 30, shifted, start + 10_000)).toBe(
      nextPollDelayMs(day, OFFICIAL_WORLD, start + 10_000),
    );
  });

  it('bez pohledu za 5 s, poslední den světa nejpozději', () => {
    expect(nextPollDelayMs(null, OFFICIAL_WORLD, start)).toBe(POLL_MIN_MS);
    expect(nextPollDelayMs(TOTAL_GAME_DAYS - 1, OFFICIAL_WORLD, OFFICIAL_WORLD.endMs - 10)).toBe(
      POLL_MAX_MS,
    );
  });
});
