import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_WORLD,
  TOTAL_GAME_DAYS,
  getWorldState,
  type GameDate,
  type WorldClock,
} from '@bohemia/game';
import {
  DATE_REFRESH_MS,
  clockHandAngle,
  dayPartLabel,
  dateRefreshDelay,
  formatWorldState,
  nextDateChangeMs,
} from '../game-date';

const date = (overrides: Partial<GameDate>): GameDate => ({
  year: 1024,
  month: 10,
  day: 16,
  dayOfYear: 290,
  season: 'autumn',
  ...overrides,
});

describe('formatWorldState', () => {
  it('běžící svět ukáže datum s měsícem v 2. pádě, bez názvu období', () => {
    expect(formatWorldState({ status: 'running', date: date({}) }, OFFICIAL_WORLD)).toBe(
      '16. října 1024',
    );
  });

  it.each([
    [1, 'ledna'],
    [2, 'února'],
    [12, 'prosince'],
  ])('měsíc %i je „%s“', (month, name) => {
    expect(
      formatWorldState({ status: 'running', date: date({ month, day: 1 }) }, OFFICIAL_WORLD),
    ).toBe(`1. ${name} 1024`);
  });

  it.each(['spring', 'summer', 'autumn', 'winter'] as const)(
    'roční období %s se v datu neukáže (Martin 14. 11. 2026)',
    (season) => {
      expect(formatWorldState({ status: 'running', date: date({ season }) }, OFFICIAL_WORLD)).toBe(
        '16. října 1024',
      );
    },
  );

  it('před startem ostrého světa ukáže datum spuštění', () => {
    expect(formatWorldState({ status: 'not-started' }, OFFICIAL_WORLD)).toBe(
      'Svět začne 1. 1. 2027',
    );
  });

  it('před startem testovacího světa, který nezačíná o půlnoci, ukáže i čas (pražský)', () => {
    const world: WorldClock = {
      startMs: Date.parse('2026-10-16T14:30:00+02:00'),
      endMs: Date.parse('2026-10-18T14:30:00+02:00'),
    };
    expect(formatWorldState({ status: 'not-started' }, world)).toBe(
      'Svět začne 16. 10. 2026, 14:30',
    );
  });

  it('po konci světa oznámí konec', () => {
    expect(formatWorldState({ status: 'ended' }, OFFICIAL_WORLD)).toBe('Rok 1500 – svět skončil');
  });
});

describe('obnova data v liště – na začátku dalšího herního dne', () => {
  // ostrý svět: rok = 365 skutečných dní na 1000 herních let – den ≈ 86 s
  const world: WorldClock = OFFICIAL_WORLD;
  const dayMs = (world.endMs - world.startMs) / TOTAL_GAME_DAYS;

  it('běžící svět: další den začne do ≈ 86 s a v tu chvíli je v liště nové datum', () => {
    const now = world.startMs + 1000 * dayMs + 20_000;
    const next = nextDateChangeMs(now, world)!;
    expect(next - now).toBeGreaterThan(0);
    expect(next - now).toBeLessThanOrEqual(Math.ceil(dayMs));
    expect(formatWorldState(getWorldState(next, world), world)).not.toBe(
      formatWorldState(getWorldState(next - 1, world), world),
    );
    expect(dateRefreshDelay(now, world)).toBe(next - now + 1);
  });

  it('zrychlený svět nejvýš jednou za sekundu, svět před startem nejdéle po 5 minutách, po konci nic', () => {
    const fast: WorldClock = { startMs: 0, endMs: TOTAL_GAME_DAYS * 10 };
    expect(dateRefreshDelay(5_000, fast)).toBe(DATE_REFRESH_MS.min);
    expect(nextDateChangeMs(world.startMs - 1e9, world)).toBe(world.startMs);
    expect(dateRefreshDelay(world.startMs - 1e9, world)).toBe(DATE_REFRESH_MS.max);
    expect(nextDateChangeMs(world.endMs, world)).toBeNull();
    expect(dateRefreshDelay(world.endMs, world)).toBeNull();
  });
});

describe('ciferník denní doby', () => {
  it('ručička: poledne nahoře, jedna otáčka za den', () => {
    expect(clockHandAngle(12)).toBe(0);
    expect(clockHandAngle(18)).toBe(90);
    expect(clockHandAngle(0)).toBe(180);
    expect(clockHandAngle(6)).toBe(270);
    expect(clockHandAngle(24)).toBe(180);
  });

  it('denní doba slovy', () => {
    expect(dayPartLabel(0)).toBe('Noc');
    expect(dayPartLabel(6)).toBe('Ráno');
    expect(dayPartLabel(12)).toBe('Poledne');
    expect(dayPartLabel(15)).toBe('Odpoledne');
    expect(dayPartLabel(18)).toBe('Večer');
    expect(dayPartLabel(23)).toBe('Noc');
  });
});
