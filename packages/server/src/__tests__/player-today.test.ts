import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, dayIndexOf, type TimeOffsetRepository } from '@bohemia/game';
import { playerTodayOf } from '../player-today';
import { worldDayOf } from '../world';

describe('worldDayOf', () => {
  it('v běžícím světě vrátí index dnešního herního dne', () => {
    expect(worldDayOf(OFFICIAL_WORLD.startMs, OFFICIAL_WORLD)).toEqual({ ok: true, day: 0 });
    const last = worldDayOf(OFFICIAL_WORLD.endMs - 1, OFFICIAL_WORLD);
    expect(last).toEqual({ ok: true, day: dayIndexOf({ year: 1499, month: 12, day: 31 }) });
  });

  it('před začátkem a po konci světa vrátí jeho stav', () => {
    expect(worldDayOf(OFFICIAL_WORLD.startMs - 1, OFFICIAL_WORLD)).toEqual({
      ok: false,
      state: { status: 'not-started' },
    });
    expect(worldDayOf(OFFICIAL_WORLD.endMs, OFFICIAL_WORLD)).toEqual({
      ok: false,
      state: { status: 'ended' },
    });
  });
});

describe('playerTodayOf', () => {
  it('bez běžícího světa vrátí jeho stav a posuny nečte', async () => {
    const offsets = {} as TimeOffsetRepository;
    const result = await playerTodayOf(offsets, 'p1', OFFICIAL_WORLD.endMs, OFFICIAL_WORLD);
    expect(result).toEqual({ ok: false, state: { status: 'ended' } });
  });
});
