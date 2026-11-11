import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { averageRotationShare } from '../field-capacity';
import { newSteward } from '../steward-state';
import type { Dwelling, FieldPart, VillageState } from '../types';
import { DAY, trackedVillage, type KinSpec } from './kin-fixtures';
import { makeLandscape } from './placement-fixtures';

// Přelidněná ves vojvody s nástupcem a dvěma domácnostmi pro testy správcových synů a převzatého
// hradiště (steward-son a steward-hillfort).

export const pond = (x: number, y: number): boolean =>
  Math.abs(x - 64) <= 1 && Math.abs(y - 70) <= 1;
/** Krajina `fertility` s tůní; s `small` je mimo malý kus louky všude voda. */
export const land = (fertility: number, small = false): ReturnType<typeof makeLandscape> =>
  makeLandscape({
    size: 128,
    surface: (x, y) =>
      pond(x, y) || (small && (Math.abs(x - 64) > 4 || Math.abs(y - 64) > 4)) ? 'water' : 'meadow',
    height: (x, y) => (pond(x, y) ? 0 : 5),
    fertility: () => fertility,
  });
/** Malá mapa (kapacita ≪ ves o 17 lidech) – ves ji přelidňuje; zbytek je voda. */
export const barren = land(0, true);
export const barrenObstacles = obstaclesOf(barren);

/** 31. 8. roku po `DAY` a den předem jako začátek vsi. */
export const year = dateOfDayIndex(DAY).year + 1;
export const AUG31 = dayIndexOf({ year, month: 8, day: 31 });

export const at = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

export const household = (first: number, size: number, home: number): KinSpec[] =>
  Array.from({ length: size }, (_, i) => ({
    id: first + i,
    age: 30 - i,
    sex: i % 2 === 0 ? 'male' : 'female',
    home,
  }));

/** Díl pole `areaM2` v oběhu (příloh) s úrodností `fertility`. */
export const fallowPart = (id: number, areaM2: number, fertility = 60): FieldPart => ({
  id,
  fieldId: id + 1,
  areaM2,
  distanceM: 50,
  naturalFertility: fertility,
  fertilityShare: averageRotationShare(),
  bonusUntilDay: null,
  state: 'fallow',
  sownYears: 0,
  fallowSinceDay: null,
  foundingCost: 0,
  foundingDone: 0,
  surface: 'meadow',
});

/**
 * Vojvoda 10 s ženou 11 a dcerou 12 v dvorci 1, nástupce 20 (dům 2), ženatý Bořivoj 30 (dům 3),
 * svobodný Dobromil 40 (dům 3) a dvě domácnosti (4 a 5 dospělých) – 17 lidí, pole 15 ha
 * (`fieldM2` – přelidněná). Díl Bořivoje (17 ÷ 4 dílníci) je on, žena a domácnost domu 4 –
 * 6 dospělých s párem. Den vsi = `day`.
 */
export function lordVillage(day = AUG31 - 2, on = true, fieldM2 = 150_000): VillageState {
  const s = trackedVillage(
    [
      { id: 10, age: 60, sex: 'male', spouse: 11 },
      { id: 11, age: 55, sex: 'female', spouse: 10 },
      { id: 12, age: 10, sex: 'female', father: 10, mother: 11 },
      { id: 20, age: 30, sex: 'male', spouse: 21, father: 10, mother: 11, home: 2 },
      { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
      { id: 30, age: 24, sex: 'male', spouse: 31, father: 10, mother: 11, home: 3 },
      { id: 31, age: 22, sex: 'female', spouse: 30, home: 3 },
      { id: 40, age: 26, sex: 'male', father: 10, mother: 11, home: 3 },
      ...household(50, 4, 4),
      ...household(60, 5, 5),
    ],
    [at(1, 0, 0), at(2, 40, 0), at(3, 0, 40), at(4, -40, 0), at(5, 0, -40)],
    { storesKg: 4000, steward: newSteward(day, on) },
  );
  if (fieldM2 > 0) s.parts.push(fallowPart(800, fieldM2));
  const names: Record<number, string> = { 20: 'Bořek', 30: 'Bořivoj', 40: 'Dobromil' };
  for (const p of s.people) {
    if (p.id === 20) p.mainWifeSon = true;
    if (names[p.id] !== undefined) p.name = names[p.id];
  }
  s.lastDay = day;
  return s;
}
