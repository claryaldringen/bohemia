import { dateOfDayIndex } from '../calendar';
import type { VillageState } from './types';

// Vymření vsi a konec hry (population.md – Hlad a vymření): ves bez lidí vymře natrvalo; hráč,
// kterému vymřou všechny vsi, končí a začíná znovu (Martin, 18. 10. 2026).

const DAYS_PER_YEAR = 365.25;

/** Ves vymřela – zemřel poslední člověk a simulace se zastavila. */
export function isVillageExtinct(state: Pick<VillageState, 'extinctDay'>): boolean {
  return state.extinctDay !== undefined;
}

/**
 * Konec hry: hráč má aspoň jednu ves a žádná z nich nežije – všechny vymřely, nebo je lidé
 * opustili (migration.md). Ves na cestě žije. Bez vsí (ještě nezaložil) hra nekončí – zakládá.
 */
export function isGameOver(
  villages: readonly Pick<VillageState, 'extinctDay' | 'abandonedDay'>[],
): boolean {
  return (
    villages.length > 0 &&
    villages.every((v) => isVillageExtinct(v) || v.abandonedDay !== undefined)
  );
}

/** Jak dlouho vymřelá ves žila – herní rok založení a vymření a celé roky mezi nimi. */
export interface VillageLifespan {
  foundedYear: number;
  extinctYear: number;
  years: number;
}

/** Délka života vymřelé vsi; žijící ves null. */
export function villageLifespan(
  state: Pick<VillageState, 'foundedDay' | 'extinctDay'>,
): VillageLifespan | null {
  if (state.extinctDay === undefined) return null;
  return {
    foundedYear: dateOfDayIndex(state.foundedDay).year,
    extinctYear: dateOfDayIndex(state.extinctDay).year,
    years: Math.floor((state.extinctDay - state.foundedDay) / DAYS_PER_YEAR),
  };
}
