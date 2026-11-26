import { describe, expect, it } from 'vitest';
import type { Dwelling, Person, VillageState } from '@bohemia/game';
import {
  horse,
  horseVillage,
  LORD_ID,
  SON_ID,
  START,
  YOUTH_ID,
} from '../../../../packages/game/src/domain/village/__tests__/horse-fixtures';
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

describe('scenePersons – výprava (expeditions.md – Kdo smí jít)', () => {
  /** Dvorec: vojvoda 10, žena 11, syn 12 (17, jezdecký kůň 1), snacha 13, syn 14 (11); vesničané 20–23. */
  const village = (): VillageState => {
    const s = horseVillage([{ ...horse(1, 6), riderId: SON_ID }, horse(2, 1)], 1, 4);
    for (const p of s.people)
      if (p.id === LORD_ID || p.id === SON_ID || p.id === YOUTH_ID) p.line = true;
    s.dynasty = { lordId: LORD_ID, lords: [] };
    return s;
  };
  const expeditionOf = (s: VillageState, id: number) =>
    scenePersons(s, START, false, null, s).find((p) => p.id === id)?.expedition;

  it('dítě 11 let nejde (young) a má sílu 0', () => {
    expect(expeditionOf(village(), YOUTH_ID)).toEqual({ refusal: 'young', strength: 0 });
  });

  it('syn s jezdeckým koněm je jezdec se silou na koni', () => {
    const s = village();
    const son = expeditionOf(s, SON_ID)!;
    expect(son.rider).toBe(true);
    expect(son.refusal).toBeUndefined();
    expect(son.strength).toBeGreaterThan(0);
  });

  it('člen výpravy je inParty bez důvodu; žena má sílu 0', () => {
    const s = village();
    s.people.find((p) => p.id === 21)!.away = { kind: 'journey', refId: 'j1' };
    expect(expeditionOf(s, 21)).toEqual({ inParty: true, strength: 0 });
    expect(expeditionOf(s, 11)?.strength).toBe(0);
    expect(expeditionOf(s, 20)?.strength).toBeGreaterThan(0);
  });

  it('raněný a muž na tažení mají důvod', () => {
    const s = village();
    s.people.find((p) => p.id === 20)!.away = { kind: 'campaign', untilDay: START + 30 };
    expect(expeditionOf(s, 20)?.refusal).toBe('campaign');
  });

  it('zraněný (lov, válka) nese injured, zdravý ne; po uplynutí zranění zmizí (D79)', () => {
    const s = village();
    s.people.find((p) => p.id === 20)!.injuredUntilDay = START + 10;
    s.people.find((p) => p.id === 21)!.woundedUntil = START + 5;
    const at = (day: number): number[] =>
      scenePersons(s, day)
        .filter((p) => p.injured === true)
        .map((p) => p.id);
    expect(at(START)).toEqual([20, 21]);
    expect(at(START + 5)).toEqual([20]);
    expect(at(START + 10)).toEqual([]);
  });

  it('bez plného stavu vsi lidé výpravu nenesou', () => {
    const s = village();
    expect(scenePersons(s, START).every((p) => p.expedition === undefined)).toBe(true);
  });
});

describe('scenePersons – otroci (markets.md – Pravidla 7)', () => {
  it('otrok-pohan má slave bez christian, pokřtěný otrok obojí, svobodný nic', () => {
    const people: Person[] = [
      { id: 1, bornDay: born(30), dwellingId: 10, sex: 'male', slave: true },
      { id: 2, bornDay: born(30), dwellingId: 10, sex: 'male', slave: true, faith: 'christian' },
      { id: 3, bornDay: born(30), dwellingId: 10, sex: 'male' },
    ];
    const list = scenePersons(
      { people, dwellings: [dwelling(10)], manorId: 10, constructions: [] },
      DAY,
    );
    const of = (id: number): (typeof list)[number] => list.find((p) => p.id === id)!;
    expect(of(1).slave).toBe(true);
    expect(of(1).christian).toBeUndefined();
    expect(of(2).slave).toBe(true);
    expect(of(2).christian).toBe(true);
    expect(of(3).slave).toBeUndefined();
  });
});
