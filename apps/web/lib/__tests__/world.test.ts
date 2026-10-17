import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, dayIndexOf } from '@bohemia/game';
import { gameDayIndex } from '../world';

describe('gameDayIndex', () => {
  it('v běžícím světě vrátí index dnešního herního dne', () => {
    expect(gameDayIndex(OFFICIAL_WORLD.startMs, OFFICIAL_WORLD)).toEqual({ ok: true, day: 0 });
    const result = gameDayIndex(OFFICIAL_WORLD.endMs - 1, OFFICIAL_WORLD);
    expect(result).toEqual({ ok: true, day: dayIndexOf({ year: 1499, month: 12, day: 31 }) });
  });

  it('před začátkem a po konci světa vrátí chybu pro hráče', () => {
    expect(gameDayIndex(OFFICIAL_WORLD.startMs - 1, OFFICIAL_WORLD)).toEqual({
      ok: false,
      error: 'Svět začne 1. 1. 2027.',
    });
    expect(gameDayIndex(OFFICIAL_WORLD.endMs, OFFICIAL_WORLD)).toEqual({
      ok: false,
      error: 'Rok 1500 – svět skončil.',
    });
  });
});
