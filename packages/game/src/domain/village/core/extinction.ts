import { dateOfDayIndex } from '../../calendar';
import { isDynastyTracked, isLineMan } from '../people/dynasty';
import type { VillageState } from '../types';

// Vymření vsi a konec hry (population.md – Hlad a vymření): ves bez lidí vymře natrvalo; hráč,
// kterému vymřou všechny vsi, končí a začíná znovu (Martin, 18. 10. 2026). Dřív končí, vymře-li
// rod po meči (lord.md – Konec rodu; Martin 24. 10. 2026: „Pokud rod po meči zcela vymře, hra
// končí.“).

/** Ves pro konec rodu – lidé a rod (starší volající je nemusí znát). */
type LineVillage = Partial<
  Pick<VillageState, 'people' | 'dynasty' | 'extinctDay' | 'abandonedDay'>
>;

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
  return isLineExtinctOf(villages.map(lineFacts));
}

/**
 * Co o vsi potřebuje konec hry bez celého stavu (souhrn vsi – `VillageDigest`): rod ves sleduje,
 * kolik v ní žije mužů rodu a den vymření / opuštění.
 */
export interface LineFacts {
  /** Ves sleduje rod (`isDynastyTracked`). */
  tracked: boolean;
  /** Žijící muži rodu po meči, i chlapci (`isLineMan`). */
  lineMen: number;
  extinctDay?: number;
  abandonedDay?: number;
}

/** Fakta konce rodu ze stavu vsi. */
export function lineFacts(state: LineVillage): LineFacts {
  return {
    tracked: isDynastyTracked(state),
    lineMen: (state.people ?? []).filter(isLineMan).length,
    ...(state.extinctDay !== undefined ? { extinctDay: state.extinctDay } : {}),
    ...(state.abandonedDay !== undefined ? { abandonedDay: state.abandonedDay } : {}),
  };
}

/** `isLineExtinct` nad fakty vsí (ze stavů i souhrnů – jedno pravidlo). */
export function isLineExtinctOf(villages: readonly LineFacts[]): boolean {
  return villages.some((v) => v.tracked) && !villages.some((v) => v.lineMen > 0);
}

/** `isGameOver` nad fakty vsí (ze stavů i souhrnů – jedno pravidlo). */
export function isGameOverOf(villages: readonly LineFacts[]): boolean {
  if (villages.length === 0) return false;
  return (
    villages.every((v) => v.extinctDay !== undefined || v.abandonedDay !== undefined) ||
    isLineExtinctOf(villages)
  );
}

/**
 * Ves a den konce rodu – nejpozdější `dynasty.endedDay`. Stará vymřelá ves, která `endedDay` nenese
 * (uložená před konce rodu), dá den z `extinctDay` / `abandonedDay` (nejpozdější). Rod žije, nebo
 * žádná ves žádný den nenese – undefined.
 */
export function lineEndWhere(
  villages: readonly LineVillage[],
): { index: number; day: number } | undefined {
  let last: { index: number; day: number } | undefined;
  const pick = (day: number | undefined, index: number): void => {
    if (day !== undefined && (last === undefined || day > last.day)) last = { index, day };
  };
  villages.forEach((v, i) => pick(v.dynasty?.endedDay, i));
  if (last === undefined) {
    villages.forEach((v, i) => pick(v.extinctDay ?? v.abandonedDay, i));
  }
  return last;
}

/** Den konce rodu (`lineEndWhere`); rod žije – undefined. */
export function lineEndDay(villages: readonly LineVillage[]): number | undefined {
  return lineEndWhere(villages)?.day;
}

/**
 * Konec hry: hráč má aspoň jednu ves a žádná z nich nežije – všechny vymřely, nebo je lidé
 * opustili (migration.md) –, nebo vymřel rod po meči (`isLineExtinct`). Ves na cestě žije. Bez vsí
 * (ještě nezaložil) hra nekončí – zakládá.
 */
export function isGameOver(
  villages: readonly (Pick<VillageState, 'extinctDay' | 'abandonedDay'> & LineVillage)[],
): boolean {
  return isGameOverOf(villages.map(lineFacts));
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
