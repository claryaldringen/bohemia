import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../core/actions';
import type { Cemetery, Dwelling, Pen, Person, SacredBuilding, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Společné přípravky testů opuštěných staveb a jejich oprav (abandonment.md) – ves čtyř obydlí
// kolem počátku na louce testů pevných cest (paths-fixtures.ts, potok z ∈ (75, 90)).

export const YEAR = 365.25;
export const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });
export const Y1 = NOV1(600);
export const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Ves čtyř obydlí kolem počátku jako v testech pevných cest (louka, potok z ∈ (75, 90)). */
export function village(day = Y1 - 30): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 30 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
  const adult = (id: number, dwellingId: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId,
  });
  s.people = [1, 2, 3, 4].flatMap((d) => [
    adult(d * 10, d, 30),
    adult(d * 10 + 1, d, 28),
    adult(d * 10 + 2, d, 22),
    adult(d * 10 + 3, d, 20),
  ]);
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  // stáda bez krav – ohrada bez spřežení tak stojí prázdná (krávy v ní přes zimu nestojí)
  s.livestock = {
    herds: { sheep: 12, goat: 3, pig: 4, cow: 0 },
    young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
  };
  s.lastDay = day;
  return s;
}

export const idol = (id: number, x: number, z: number, builtDay: number): SacredBuilding => ({
  id,
  kind: 'idol',
  position: { x, z, rotation: 0 },
  builtDay,
});

export const pen = (id: number, extra: Partial<Pen> = {}): Pen => ({
  id,
  cell: { x: 4, y: 4 },
  x: -82.5,
  z: -82.5,
  builtDay: Y1 - 5 * 365,
  team: null,
  training: null,
  ...extra,
});

export const cemetery = (id: number, extra: Partial<Cemetery> = {}): Cemetery => ({
  id,
  squares: [{ cell: { x: 14, y: 8 }, x: 67.5, z: -22.5, waterDistanceM: 100 }],
  squareSizeM: 15,
  graves: 3,
  builtDay: Y1 - 10 * 365,
  ...extra,
});
