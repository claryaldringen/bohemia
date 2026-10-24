import { HORSES, PEN_PLACES_PER_SQUARE } from './rules';
import { builtPenSquares, penSpecies } from './pens';
import type { Horse, Pen, VillageState } from './types';

// Koně po kusech (horses.md – Ohrada koní, Koně po kusech): ohrada koní drží koně jako ohrada volů
// voly. Čtverec pojme 4 koně; hříbě do roku stojí u klisny a vlastní místo nemá. Nezávisí na
// práci ani na krmení (úlohy 5–7 staví na těchto funkcích).

const DAYS_PER_YEAR = 365.25;

/** Druh koně: hříbě do roku, klisna (chov), jezdecký kůň (samec – hřebec a valach). */
export type HorseKind = 'foal' | 'mare' | 'riding';

/** Ohrady koní vsi. */
export function horsePens(state: Pick<VillageState, 'pens'>): Pen[] {
  return (state.pens ?? []).filter((pen) => penSpecies(pen) === 'horse');
}

/** Koně ohrady (bez údaje žádní). */
export function penHorses(pen: Pen): readonly Horse[] {
  return pen.horses ?? [];
}

/** Koně vsi ve všech ohradách koní (i hříbata). */
export function villageHorses(state: Pick<VillageState, 'pens'>): Horse[] {
  return horsePens(state).flatMap((pen) => [...penHorses(pen)]);
}

/** Stáří koně v letech ke dni `day`. */
export function horseAgeYears(horse: Pick<Horse, 'bornDay'>, day: number): number {
  return (day - horse.bornDay) / DAYS_PER_YEAR;
}

/** Hříbě (do roku), klisna, nebo jezdecký kůň. */
export function horseKind(horse: Pick<Horse, 'bornDay' | 'sex'>, day: number): HorseKind {
  if (horseAgeYears(horse, day) < HORSES.foalYears) return 'foal';
  return horse.sex === 'female' ? 'mare' : 'riding';
}

/** Místa ohrad koní na noc – hotové čtverce × 4. */
export function horsePlaces(state: Pick<VillageState, 'pens'>): number {
  return horsePens(state).reduce(
    (sum, pen) => sum + builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.horse,
    0,
  );
}

/** Koně, kteří zabírají místo – všichni kromě hříbat do roku. */
export function horsesInPlaces(horses: readonly Horse[], day: number): number {
  return horses.filter((h) => horseKind(h, day) !== 'foal').length;
}

/** Volná místa v ohradách koní (nikdy záporná). */
export function horseRoom(state: Pick<VillageState, 'pens'>, day: number): number {
  return Math.max(0, horsePlaces(state) - horsesInPlaces(villageHorses(state), day));
}
