import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { obstaclesOf } from '../../landscape';
import { STEWARD } from '../rules-steward';
import { stewardDeparture } from '../steward-son';
import { importsDomainFood, newSteward, setStewardOn } from '../steward-state';
import { averageRotationShare } from '../field-capacity';
import type { Dwelling, FieldPart, VillageState } from '../types';
import { DAY, trackedVillage, type KinSpec } from './kin-fixtures';
import { makeLandscape } from './placement-fixtures';

// Převzaté hradiště (hillfort.md – Hradiště staví hráč, 8. 11. 2026): fixtura přelidněné vsi
// z `steward-son.test.ts`.

const pond = (x: number, y: number): boolean => Math.abs(x - 64) <= 1 && Math.abs(y - 70) <= 1;
/** Krajina `fertility` s tůní; s `small` je mimo malý kus louky všude voda. */
const land = (fertility: number, small = false): ReturnType<typeof makeLandscape> =>
  makeLandscape({
    size: 128,
    surface: (x, y) =>
      pond(x, y) || (small && (Math.abs(x - 64) > 4 || Math.abs(y - 64) > 4)) ? 'water' : 'meadow',
    height: (x, y) => (pond(x, y) ? 0 : 5),
    fertility: () => fertility,
  });
/** Malá mapa (kapacita ≪ ves o 17 lidech) – ves ji přelidňuje; zbytek je voda. */
const barren = land(0, true);
const barrenObstacles = obstaclesOf(barren);

/** 31. 8. roku po `DAY` a den předem jako začátek vsi. */
const year = dateOfDayIndex(DAY).year + 1;
const AUG31 = dayIndexOf({ year, month: 8, day: 31 });

const at = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

const household = (first: number, size: number, home: number): KinSpec[] =>
  Array.from({ length: size }, (_, i) => ({
    id: first + i,
    age: 30 - i,
    sex: i % 2 === 0 ? 'male' : 'female',
    home,
  }));

/** Díl pole `areaM2` v oběhu (příloh) s úrodností `fertility`. */
const fallowPart = (id: number, areaM2: number, fertility = 60): FieldPart => ({
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
function lordVillage(day = AUG31 - 2, on = true, fieldM2 = 150_000): VillageState {
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

function stripSteward(s: VillageState): void {
  delete (s as { steward?: unknown }).steward;
}

describe('převzaté hradiště', () => {
  it('importsDomainFood: jídlo domény za posledních 365 dní', () => {
    expect(importsDomainFood({}, DAY)).toBe(false);
    expect(importsDomainFood({ domainFoodDay: DAY - 364 }, DAY)).toBe(true);
    expect(importsDomainFood({ domainFoodDay: DAY - STEWARD.hillfortImportDays }, DAY)).toBe(false);
  });

  it('zapnutí správce posoudí hradiště, vypnutí ho smaže', () => {
    const s = trackedVillage([], [], { storesKg: 0 });
    s.domainFoodDay = DAY - 100;
    stripSteward(s);
    setStewardOn(s, DAY, true);
    expect(s.steward?.hillfort).toBe(true);
    setStewardOn(s, DAY + 1, false);
    expect(s.steward?.hillfort).toBeUndefined();
    s.domainFoodDay = DAY - 400;
    setStewardOn(s, DAY + 2, true);
    expect(s.steward?.hillfort).toBeUndefined();
    s.domainFoodDay = DAY;
    setStewardOn(s, DAY + 3, false);
    setStewardOn(s, DAY + 4, true);
    expect(s.steward?.hillfort).toBe(true);
  });

  it('starý dovoz (400 dní) hradiště nedělá, ves bez dovozu také ne', () => {
    const old = trackedVillage([], [], { storesKg: 0 });
    old.domainFoodDay = DAY - 400;
    stripSteward(old);
    setStewardOn(old, DAY, true);
    expect(old.steward?.hillfort).toBeUndefined();
    const none = trackedVillage([], [], { storesKg: 0 });
    stripSteward(none);
    setStewardOn(none, DAY, true);
    expect(none.steward?.hillfort).toBeUndefined();
  });

  it('v hradišti správce syna neposílá ani při hladu, bez hradiště ano', () => {
    const plain = lordVillage();
    plain.steward!.hungerPeak = STEWARD.departureHungerDays;
    expect(stewardDeparture(plain, AUG31, barren, barrenObstacles)).toBe(true);
    const fort = lordVillage();
    fort.steward!.hungerPeak = STEWARD.departureHungerDays;
    fort.steward!.hillfort = true;
    expect(stewardDeparture(fort, AUG31, barren, barrenObstacles)).toBe(false);
    expect(fort.steward?.departures ?? []).toHaveLength(0);
  });
});
