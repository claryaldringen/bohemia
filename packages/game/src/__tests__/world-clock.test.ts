import { describe, it, expect } from 'vitest';
import { OFFICIAL_WORLD, resolveWorldClock } from '../calendar';

describe('resolveWorldClock', () => {
  it('bez proměnných vrátí ostrý svět', () => {
    expect(resolveWorldClock({})).toEqual(OFFICIAL_WORLD);
  });

  it('prázdné hodnoty z .env bere jako nenastavené', () => {
    expect(resolveWorldClock({ WORLD_START: '', WORLD_END: '' })).toEqual(OFFICIAL_WORLD);
  });

  it('s oběma proměnnými vrátí testovací svět', () => {
    expect(
      resolveWorldClock({
        WORLD_START: '2026-10-16T12:00:00+02:00',
        WORLD_END: '2026-10-18T12:00:00+02:00',
      }),
    ).toEqual({ startMs: 1792144800000, endMs: 1792317600000 });
  });

  it('přijme nejkratší povolený svět (365 250 ms)', () => {
    expect(
      resolveWorldClock({
        WORLD_START: '2026-10-16T10:00:00.000Z',
        WORLD_END: '2026-10-16T10:06:05.250Z',
      }),
    ).toEqual({ startMs: 1792144800000, endMs: 1792145165250 });
  });

  it.each([
    ['jen začátek', { WORLD_START: '2026-10-16T12:00:00Z' }, /WORLD_START i WORLD_END/],
    ['jen konec', { WORLD_END: '2026-10-18T12:00:00Z' }, /WORLD_START i WORLD_END/],
    [
      'nečitelný začátek',
      { WORLD_START: 'zítra', WORLD_END: '2026-10-18T12:00:00Z' },
      /WORLD_START/,
    ],
    ['nečitelný konec', { WORLD_START: '2026-10-16T12:00:00Z', WORLD_END: 'nikdy' }, /WORLD_END/],
    [
      'konec před začátkem',
      { WORLD_START: '2026-10-18T12:00:00Z', WORLD_END: '2026-10-16T12:00:00Z' },
      /po začátku/,
    ],
    [
      'konec rovný začátku',
      { WORLD_START: '2026-10-16T12:00:00Z', WORLD_END: '2026-10-16T12:00:00Z' },
      /po začátku/,
    ],
    [
      'svět kratší než 365 250 ms',
      { WORLD_START: '2026-10-16T10:00:00.000Z', WORLD_END: '2026-10-16T10:06:05.249Z' },
      /aspoň 365250 ms/,
    ],
  ])('odmítne: %s', (_popis, env, message) => {
    expect(() => resolveWorldClock(env)).toThrow(message);
  });
});
