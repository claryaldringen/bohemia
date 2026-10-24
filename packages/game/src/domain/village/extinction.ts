import { dateOfDayIndex } from '../calendar';
import { isDynastyTracked, isLineMan } from './dynasty';
import type { VillageState } from './types';

// Vymření vsi a konec hry (population.md – Hlad a vymření): ves bez lidí vymře natrvalo; hráč,
// kterému vymřou všechny vsi, končí a začíná znovu (Martin, 18. 10. 2026). Dřív končí, vymře-li
// rod po meči (lord.md – Konec rodu; Martin 24. 10. 2026: „Pokud rod po meči zcela vymře, hra
// končí.“).

/** Ves pro konec rodu – lidé a rod (starší volající je nemusí znát). */
type LineVillage = Partial<Pick<VillageState, 'people' | 'dynasty'>>;

const DAYS_PER_YEAR = 365.25;

/** Ves vymřela – zemřel poslední člověk a simulace se zastavila. */
export function isVillageExtinct(state: Pick<VillageState, 'extinctDay'>): boolean {
  return state.extinctDay !== undefined;
}

/**
 * Rod po meči vymřel (lord.md – Konec rodu): některá ves hráče rod sleduje a v žádné nežije muž
 * rodu – ani chlapec. Ženy rodu rod nedrží. Vsi bez rodu (i před převodem) ho nemají – samy hru
 * neukončí.
 */
export function isLineExtinct(villages: readonly LineVillage[]): boolean {
  return (
    villages.some((v) => isDynastyTracked(v)) &&
    !villages.some((v) => (v.people ?? []).some(isLineMan))
  );
}

/** Den konce rodu – nejpozdější den, kdy ve vsi hráče nezbyl muž rodu; rod žije – undefined. */
export function lineEndDay(villages: readonly LineVillage[]): number | undefined {
  let last: number | undefined;
  for (const v of villages) {
    const day = v.dynasty?.endedDay;
    if (day !== undefined && (last === undefined || day > last)) last = day;
  }
  return last;
}

/**
 * Konec hry: hráč má aspoň jednu ves a žádná z nich nežije – všechny vymřely, nebo je lidé
 * opustili (migration.md) –, nebo vymřel rod po meči (`isLineExtinct`). Ves na cestě žije. Bez vsí
 * (ještě nezaložil) hra nekončí – zakládá.
 */
export function isGameOver(
  villages: readonly (Pick<VillageState, 'extinctDay' | 'abandonedDay'> & LineVillage)[],
): boolean {
  if (villages.length === 0) return false;
  return (
    villages.every((v) => isVillageExtinct(v) || v.abandonedDay !== undefined) ||
    isLineExtinct(villages)
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
