import { isDisused } from './disused';
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
  return (state.pens ?? []).filter((pen) => penSpecies(pen) === 'horse' && !isDisused(pen));
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

/** Hříbě bez vlastního místa (do roku; horses.md), klisna, nebo jezdecký kůň. */
export function horseKind(horse: Pick<Horse, 'bornDay' | 'sex'>, day: number): HorseKind {
  if (horseAgeYears(horse, day) < HORSES.placeFromYears) return 'foal';
  return horse.sex === 'female' ? 'mare' : 'riding';
}

/** Hříbě ve smyslu chovu a výcviku (do 3 let; horses.md) – jiná mez než místo v ohradě. */
export function isFoalByAge(horse: Pick<Horse, 'bornDay'>, day: number): boolean {
  return horseAgeYears(horse, day) < HORSES.foalUntilYears;
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

/**
 * Péče o koně dnes (člověkodny – horses.md, Péče; Martin 23. 10. 2026): hodina denně na koně celý
 * rok z práce vsi, hříbě do roka s klisnou nic navíc.
 */
export function horseCareLabor(horses: readonly Horse[], day: number): number {
  return horsesInPlaces(horses, day) * HORSES.careManDaysPerDay;
}

/** Jezdecký kůň, který dostává obilí – samec od 3 let (horses.md – Krmení). */
export function isGrainHorse(horse: Pick<Horse, 'bornDay' | 'sex'>, day: number): boolean {
  return horse.sex === 'male' && !isFoalByAge(horse, day);
}

/**
 * Id hřebce – nejstaršího jezdeckého koně (samce od 3 let) ve vsi, při shodě stáří nižší id;
 * ostatní jezdečtí koně jsou valaši (horses.md – Chov). Bez jezdeckého koně undefined.
 */
export function stallionId(horses: readonly Horse[], day: number): number | undefined {
  return horses
    .filter((h) => isGrainHorse(h, day))
    .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)[0]?.id;
}

/**
 * Obilí koní na dnešek (kg – horses.md, Krmení; Martin 23. 10. 2026): jezdecký kůň 1,5 kg denně
 * celý rok, klisny a hříbata nic.
 */
export function horseGrainToday(horses: readonly Horse[], day: number): number {
  return horses.filter((h) => isGrainHorse(h, day)).length * HORSES.grainKgPerDay;
}

/**
 * Seno koní za den zimy (kg – horses.md, Krmení): hříbě v první zimě 3, dál do 3 let 5, klisna 6,
 * jezdecký kůň 6 – a 7, když dnes nedostal obilí (`grainFed`).
 */
export function horseHayDailyKg(horses: readonly Horse[], day: number, grainFed = true): number {
  const { hayKg } = HORSES;
  return horses.reduce((sum, h) => {
    if (horseKind(h, day) === 'foal') return sum + hayKg.foalFirstWinter;
    if (isFoalByAge(h, day)) return sum + hayKg.foal;
    if (isGrainHorse(h, day) && !grainFed) return sum + hayKg.horseNoGrain;
    return sum + hayKg.horse;
  }, 0);
}

/** Jezdečtí koně (samci od 3 let), které kovář kuje (horses.md – Kování). */
export function ridingHorses(state: Pick<VillageState, 'pens'>, day: number): Horse[] {
  return villageHorses(state).filter((h) => isGrainHorse(h, day));
}
