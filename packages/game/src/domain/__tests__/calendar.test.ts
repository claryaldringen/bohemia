import { describe, it, expect } from 'vitest';
import { getWorldState, OFFICIAL_WORLD, realTimeOf, type WorldClock } from '../calendar';

// Očekávané hodnoty jsou spočítané nezávisle (juliánské číslo dne, celočíselná aritmetika),
// ne tímto kódem. Okamžiky „uprostřed dne“ jsou daleko od hranic dnů.
const at = (iso: string): number => Date.parse(iso);

describe('getWorldState – ostrý svět', () => {
  it('o půlnoci 1. 1. 2027 pražského času začíná 1. 1. roku 500', () => {
    expect(getWorldState(at('2027-01-01T00:00:00+01:00'), OFFICIAL_WORLD)).toEqual({
      status: 'running',
      date: { year: 500, month: 1, day: 1, dayOfYear: 1, season: 'winter' },
    });
  });

  it('milisekundu před startem svět ještě nezačal', () => {
    expect(getWorldState(at('2026-12-31T22:59:59.999Z'), OFFICIAL_WORLD)).toEqual({
      status: 'not-started',
    });
  });

  it('poslední milisekundu před koncem je 31. 12. 1499', () => {
    expect(getWorldState(at('2027-12-31T22:59:59.999Z'), OFFICIAL_WORLD)).toEqual({
      status: 'running',
      date: { year: 1499, month: 12, day: 31, dayOfYear: 365, season: 'winter' },
    });
  });

  it('o půlnoci 1. 1. 2028 pražského času svět skončil', () => {
    expect(getWorldState(at('2028-01-01T00:00:00+01:00'), OFFICIAL_WORLD)).toEqual({
      status: 'ended',
    });
  });

  it.each([
    // [skutečný okamžik, rok, měsíc, den, den v roce]
    ['2027-01-01T00:25:37.281Z', 500, 2, 29, 60], // rok 500 je přestupný
    ['2027-01-01T00:27:03.622Z', 500, 3, 1, 61],
    ['2027-01-01T09:10:51.696Z', 501, 2, 28, 59], // rok 501 přestupný není
    ['2027-01-01T09:12:18.036Z', 501, 3, 1, 60],
    ['2027-07-11T12:10:59.679Z', 1024, 10, 16, 290],
  ])('%s je %i-%i-%i (%i. den roku)', (iso, year, month, day, dayOfYear) => {
    const state = getWorldState(at(iso), OFFICIAL_WORLD);
    expect(state.status === 'running' && state.date).toMatchObject({
      year,
      month,
      day,
      dayOfYear,
    });
  });

  it.each([
    ['2027-03-27T03:42:27.055Z', '31. 5. 733', 'spring'],
    ['2027-03-27T03:43:53.396Z', '1. 6. 733', 'summer'],
    ['2027-03-27T05:54:50.414Z', '31. 8. 733', 'summer'],
    ['2027-03-27T05:56:16.755Z', '1. 9. 733', 'autumn'],
    ['2027-03-27T08:05:47.433Z', '30. 11. 733', 'autumn'],
    ['2027-03-27T08:07:13.774Z', '1. 12. 733', 'winter'],
    ['2027-01-01T00:25:37.281Z', '29. 2. 500', 'winter'],
    ['2027-01-01T00:27:03.622Z', '1. 3. 500', 'spring'],
  ])('%s (%s) je roční období %s', (iso, _date, season) => {
    const state = getWorldState(at(iso), OFFICIAL_WORLD);
    expect(state.status === 'running' && state.date.season).toBe(season);
  });
});

describe('realTimeOf – kdy herní den začíná', () => {
  it.each([
    // [rok, měsíc, den, okamžik začátku dne v ms] – spočítáno nezávisle
    [500, 1, 1, Date.parse('2027-01-01T00:00:00+01:00')],
    [500, 2, 29, 1798763094111],
    [501, 3, 1, 1798794694867],
    [1024, 10, 16, 1815307816510],
    [1499, 12, 31, 1830293913660],
  ])('%i-%i-%i začíná v %i', (year, month, day, expectedMs) => {
    expect(realTimeOf({ year, month, day }, OFFICIAL_WORLD)).toBe(expectedMs);
  });

  // Svět, kde se délka dne nedělí celými ms – hranice dnů se musí zaokrouhlovat konzistentně.
  const oddWorld: WorldClock = { startMs: 1_000, endMs: 1_000 + 3 * 365_250 + 7 };

  it.each([
    // [herní den, předchozí herní den]
    [
      { year: 500, month: 2, day: 29 },
      { year: 500, month: 2, day: 28 },
    ],
    [
      { year: 500, month: 3, day: 1 },
      { year: 500, month: 2, day: 29 },
    ],
    [
      { year: 501, month: 1, day: 1 },
      { year: 500, month: 12, day: 31 },
    ],
    [
      { year: 501, month: 3, day: 1 },
      { year: 501, month: 2, day: 28 },
    ],
    [
      { year: 1024, month: 10, day: 16 },
      { year: 1024, month: 10, day: 15 },
    ],
    [
      { year: 1499, month: 12, day: 31 },
      { year: 1499, month: 12, day: 30 },
    ],
  ])('v okamžiku začátku je %o, o milisekundu dřív ještě %o', (date, previous) => {
    for (const world of [OFFICIAL_WORLD, oddWorld]) {
      const startOfDay = realTimeOf(date, world);
      expect(getWorldState(startOfDay, world)).toMatchObject({ status: 'running', date });
      expect(getWorldState(startOfDay - 1, world)).toMatchObject({
        status: 'running',
        date: previous,
      });
    }
  });

  it.each([
    [501, 2, 29], // 501 není přestupný
    [700, 4, 31],
    [700, 1, 0],
    [700, 13, 1],
    [499, 12, 31], // před začátkem světa
    [1500, 1, 1], // konec světa už není herní den
    [700, 1, 1.5],
  ])('%s-%s-%s odmítne jako neplatné datum', (year, month, day) => {
    expect(() => realTimeOf({ year, month, day }, OFFICIAL_WORLD)).toThrow(RangeError);
  });
});
