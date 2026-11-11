import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import type { VillageState } from '../types';
import { withThreshingFloor } from './village-fixtures';

// Společné pomocné funkce simulate.test.ts a simulate-slow.test.ts.

export const at = (year: number, month: number, day: number): number =>
  dayIndexOf({ year, month, day });
export const YEAR = 365.25;
export const POSITION = { x: 0, z: 0, rotation: 0 };
export const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];
export const START_PARTS = 75;

/** Startovní pole ≈ 1,7 ha: díly po 225 m², úrodnost 70, louka 50–100 m od obydlí. */
export const field = (count = START_PARTS): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

// ves s humnem – mlátí hned po žni (production-chains.md – Humno); ves bez humna `foundBare`
export const foundBare = (day: number, seed = 42, parts = field()): VillageState =>
  foundVillage({ seed, day, dwellingPosition: POSITION, firstField: { outline: OUTLINE, parts } });
export const found = (day: number, seed = 42, parts = field()): VillageState =>
  withThreshingFloor(foundBare(day, seed, parts));
