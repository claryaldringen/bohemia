import { oxPens, oxPlaces, villageOxen } from './oxen';
import { DRAFT_OXEN, OXEN } from './rules';
import type { VillageState } from './types';

// Kolik volů a vozů ves chce (oxen.md – Kolik volů ves chce; Martin 20. 10. 2026: „Ať to funguje
// jako se stády – ohrada pro voly udrží určitý počet spřežení a když bude vesnice potřebovat víc
// vozů, ohrada se musí zvětšit.“). Voli se sdílí – orba (podzim a jaro) a svoz (léto) se
// nepřekrývají, takže ves chce nejvyšší současnou potřebu: páry k rádlům, nebo voly všech vozů
// naráz, ne součet. Strop je místo v ohradách volů.

/**
 * Páry k rádlům, které ves chce (plán osevu k 1. 9. – `DraftState.ploughPairs`): tolik, aby voli
 * zorali celý osev v oknech orby. Bez plánu (ves uložená dřív, nová ohrada) aspoň pár na každou
 * ohradu volů – jako dřív spřežení na ohradu. Bez ohrady volů 0.
 */
export function wantedPloughPairs(state: Pick<VillageState, 'pens' | 'draft'>): number {
  const pens = oxPens(state).length;
  if (pens === 0) return 0;
  return state.draft?.ploughPairs ?? pens;
}

/**
 * Kolik volů ves chce bez ohledu na místo v ohradách (oxen.md – Kolik volů ves chce): páry
 * k rádlům, nebo voli vozů naráz – víc z toho. Bez ohrady volů 0.
 */
export function wantedOxen(state: Pick<VillageState, 'pens' | 'draft'>): number {
  return DRAFT_OXEN.ard * wantedPloughPairs(state);
}

/** Kolik volů ves cvičí a krmí – kolik jich chce, nejvýš místa v ohradách volů. */
export function oxenTrainingTarget(state: Pick<VillageState, 'pens' | 'draft'>): number {
  return Math.min(wantedOxen(state), oxPlaces(state));
}

/**
 * Chce ves víc volů, než se vejde do ohrad volů (upozornění „Voli se nevejdou do ohrady“ – jako
 * stáda)? Jen ves s hotovou ohradou volů (rozestavěná ohrada místa ještě nemá).
 */
export function oxenOverRoom(state: Pick<VillageState, 'pens' | 'draft'>): boolean {
  if (!oxPens(state).some((p) => p.builtDay !== null)) return false;
  return Math.max(wantedOxen(state), villageOxen(state)) > oxPlaces(state);
}

/**
 * Krávy na voly (diet.md – Krávy na obměnu volů; Martin 20. 10. 2026 – návrh Clauda): ves
 * s ohradou volů drží OXEN.minCows krav (pár telat do výcviku a chovná kráva) a na obměnu volů
 * OXEN.cowsPerOx krávy na každého vola, kterého cvičí a krmí (býčci ≈ 0,4 na krávu a rok, obměna
 * desetiny volů ročně). Bez ohrady volů 0.
 */
export function oxenCows(state: Pick<VillageState, 'pens' | 'draft'>): number {
  if (oxPens(state).length === 0) return 0;
  return OXEN.minCows + OXEN.cowsPerOx * oxenTrainingTarget(state);
}
