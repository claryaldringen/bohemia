import { dateOfDayIndex, realTimeOf, type WorldClock } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import {
  BUSY_SKIP_MS,
  FAILED_SKIP_MAX_MS,
  FAILED_SKIP_MIN_MS,
  SkipTable,
  nextWakeMs,
} from '../wake';

const world: WorldClock = { startMs: 0, endMs: 365 * 24 * 3600 * 1000 };

describe('nextWakeMs', () => {
  it('spí do 1 s po začátku dalšího dne, nejvýš idleMs', () => {
    const next = realTimeOf(dateOfDayIndex(11), world);
    expect(nextWakeMs(next - 2000, 10, world, 5000)).toBe(3000);
    expect(nextWakeMs(next - 60_000, 10, world, 5000)).toBe(5000);
    expect(nextWakeMs(next + 5000, 10, world, 5000)).toBe(0);
  });

  it('když svět neběží, spí idleMs', () => {
    expect(nextWakeMs(0, null, world, 5000)).toBe(5000);
  });
});

describe('SkipTable', () => {
  it('obsazeno odloží na 2 s', () => {
    const skips = new SkipTable();
    skips.busy('a', 1000);
    expect([...skips.active(1000 + BUSY_SKIP_MS - 1)]).toEqual(['a']);
    expect(skips.active(1000 + BUSY_SKIP_MS).size).toBe(0);
  });

  it('chyba zdvojuje odklad do 15 min, úspěch ho zruší', () => {
    const skips = new SkipTable();
    skips.failed('a', 0);
    expect(skips.active(FAILED_SKIP_MIN_MS - 1).has('a')).toBe(true);
    expect(skips.active(FAILED_SKIP_MIN_MS).has('a')).toBe(false);
    skips.failed('a', 0);
    expect(skips.active(2 * FAILED_SKIP_MIN_MS - 1).has('a')).toBe(true);
    for (let i = 0; i < 10; i++) skips.failed('a', 0);
    expect(skips.active(FAILED_SKIP_MAX_MS - 1).has('a')).toBe(true);
    expect(skips.active(FAILED_SKIP_MAX_MS).has('a')).toBe(false);
    skips.done('a');
    skips.failed('a', 0);
    expect(skips.active(FAILED_SKIP_MIN_MS).has('a')).toBe(false);
  });
});
