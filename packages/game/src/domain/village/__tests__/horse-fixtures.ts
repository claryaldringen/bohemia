import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../core/actions';
import type { Horse, Pen, Person, VillageState } from '../types';
import { dwelling } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Ves s vojvodovou rodinou a ohradou koní pro testy chovu a jezdců (horses.md – Chov, Výcvik koně
// a jezdec).

export const YEAR = 365.25;
export const at = (year: number, month: number, day: number): number =>
  dayIndexOf({ year, month, day });
export const START = at(601, 1, 10);
const OUTSIDE = 500;

/** Id lidí dvorce: vojvoda 40, žena 38, syn 17 se snachou, syn 11. */
export const LORD_ID = 10;
export const SON_ID = 12;
export const YOUTH_ID = 14;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({ id, bornDay: START - Math.ceil(years * YEAR) - 10, dwellingId, sex, ...extra });

/** Kůň ve věku `ageYears` ke dni `day`. */
export function horse(
  id: number,
  ageYears: number,
  sex: Horse['sex'] = 'male',
  training = 0,
  day = START,
): Horse {
  return { id, bornDay: Math.round(day - ageYears * YEAR), sex, training };
}

/** Hotová ohrada koní o `squares` čtvercích (4 místa na čtverec). */
export function horsePen(id: number, horses: Horse[], squares = 1): Pen {
  return {
    id,
    species: 'horse',
    cell: { x: 4, y: 4 },
    x: 0,
    z: 0,
    builtDay: START - 400,
    team: null,
    training: null,
    horses,
    extraSquares: Array.from({ length: squares - 1 }, (_, i) => ({
      cell: { x: 5 + i, y: 4 },
      x: 16 * (i + 1),
      z: 0,
    })),
  };
}

/**
 * Dvorec (vojvoda 40, žena 38, syn 17 se snachou 16, syn 11) a `outside` dospělých jinde – rodina
 * cvičí (lord.md). S `horses` má ves ohradu koní o `squares` čtvercích.
 */
export function horseVillage(
  horses: Horse[] | null = null,
  squares = 2,
  outside = 4,
): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: START, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const manor = s.dwellings[0]!.id;
  s.dwellings.push({ ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } });
  s.people = [
    person(LORD_ID, 40, manor, 'male', { spouseId: 11 }),
    person(11, 38, manor, 'female', { spouseId: LORD_ID }),
    person(SON_ID, 17, manor, 'male', { fatherId: LORD_ID, motherId: 11, spouseId: 13 }),
    person(13, 16, manor, 'female', { spouseId: SON_ID }),
    person(YOUTH_ID, 11, manor, 'male', { fatherId: LORD_ID, motherId: 11 }),
    ...Array.from({ length: outside }, (_, i) =>
      person(20 + i, 26 + i, OUTSIDE, i % 2 === 0 ? 'male' : 'female'),
    ),
  ];
  s.manorId = manor;
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = START;
  s.nextId = 1000;
  if (horses) s.pens = [...(s.pens ?? []), horsePen(90, horses, squares)];
  return s;
}
