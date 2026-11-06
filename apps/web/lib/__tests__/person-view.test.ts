import { describe, expect, it } from 'vitest';
import type { Dwelling, Person } from '@bohemia/game';
import { scenePersons } from '../person-view';

// Lidé vsi pro scénu (villagers.md – Výběr postavy): úsporně id, věk, pohlaví, domácnost a role.

const YEAR = 365.25;
const DAY = 100_000;
const born = (age: number): number => Math.round(DAY - age * YEAR - 10);

const dwelling = (id: number, craft?: 'smith'): Dwelling =>
  ({
    id,
    type: 'zemnice',
    builtDay: 0,
    condition: 1,
    position: { x: 0, z: 0, rotation: 0 },
    ...(craft ? { workshop: { craft } } : {}),
  }) as Dwelling;

describe('scenePersons', () => {
  it('věk ke dni, role z domácnosti – dvorec, kovárna, rolník', () => {
    const people: Person[] = [
      { id: 1, bornDay: born(40), dwellingId: 10, sex: 'male', spouseId: 2 },
      { id: 2, bornDay: born(38), dwellingId: 10, sex: 'female', spouseId: 1 },
      { id: 3, bornDay: born(30), dwellingId: 11, sex: 'male', practice: { smith: 3 } },
      { id: 4, bornDay: born(9), dwellingId: 11, sex: 'female', fatherId: 3 },
      { id: 5, bornDay: born(25), dwellingId: 12, sex: 'male', origin: 'N' },
    ];
    const list = scenePersons(
      {
        people,
        dwellings: [dwelling(10), dwelling(11, 'smith'), dwelling(12)],
        manorId: 10,
        constructions: [],
      },
      DAY,
    );
    expect(list).toEqual([
      { id: 1, age: 40, sex: 'male', home: 10, role: 'voivode', ennobleable: true },
      { id: 2, age: 38, sex: 'female', home: 10, role: 'voivode-wife' },
      { id: 3, age: 30, sex: 'male', home: 11, role: 'smith', ennobleable: true },
      { id: 4, age: 9, sex: 'female', home: 11, role: 'smith-daughter' },
      { id: 5, age: 25, sex: 'male', home: 12, role: 'farmer', ennobleable: true },
    ]);
  });

  it('dvorec: vnuk vojvody, snacha vojvody a dovednosti cvičeného', () => {
    const people: Person[] = [
      { id: 1, bornDay: born(60), dwellingId: 10, sex: 'male', spouseId: 2 },
      { id: 2, bornDay: born(55), dwellingId: 10, sex: 'female', spouseId: 1 },
      { id: 3, bornDay: born(30), dwellingId: 10, sex: 'male', fatherId: 1, spouseId: 4 },
      { id: 4, bornDay: born(28), dwellingId: 10, sex: 'female', spouseId: 3 },
      {
        id: 5,
        bornDay: born(9),
        dwellingId: 10,
        sex: 'male',
        fatherId: 3,
        arms: { bow: 12.4, combat: 0, riding: 0 },
      },
    ];
    const list = scenePersons(
      { people, dwellings: [dwelling(10)], manorId: 10, constructions: [] },
      DAY,
    );
    const role = (id: number): string | undefined => list.find((p) => p.id === id)?.role;
    expect(role(3)).toBe('voivode-son');
    expect(role(4)).toBe('voivode-daughter-in-law');
    expect(role(5)).toBe('voivode-grandson');
    expect(list.find((p) => p.id === 5)?.arms).toEqual({ bow: 12, combat: 0, riding: 0 });
    expect(list.find((p) => p.id === 3)?.arms).toBeUndefined();
  });
});
