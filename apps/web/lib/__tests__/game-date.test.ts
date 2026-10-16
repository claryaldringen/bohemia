import { describe, it, expect } from 'vitest';
import { OFFICIAL_WORLD, type GameDate, type WorldClock } from '@bohemia/game';
import { formatWorldState } from '../game-date';

const date = (overrides: Partial<GameDate>): GameDate => ({
  year: 1024,
  month: 10,
  day: 16,
  dayOfYear: 290,
  season: 'autumn',
  ...overrides,
});

describe('formatWorldState', () => {
  it('běžící svět ukáže datum s měsícem v 2. pádě a roční období', () => {
    expect(formatWorldState({ status: 'running', date: date({}) }, OFFICIAL_WORLD)).toBe(
      '16. října 1024 · podzim',
    );
  });

  it.each([
    [1, 'ledna'],
    [2, 'února'],
    [12, 'prosince'],
  ])('měsíc %i je „%s“', (month, name) => {
    expect(
      formatWorldState({ status: 'running', date: date({ month, day: 1 }) }, OFFICIAL_WORLD),
    ).toBe(`1. ${name} 1024 · podzim`);
  });

  it.each([
    ['spring', 'jaro'],
    ['summer', 'léto'],
    ['autumn', 'podzim'],
    ['winter', 'zima'],
  ] as const)('roční období %s je „%s“', (season, name) => {
    expect(formatWorldState({ status: 'running', date: date({ season }) }, OFFICIAL_WORLD)).toBe(
      `16. října 1024 · ${name}`,
    );
  });

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
