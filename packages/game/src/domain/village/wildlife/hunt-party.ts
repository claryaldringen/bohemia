// Lovci rodu a kolik psů dvorec chce (wildlife.md – Lov rodu: Kdo; Psi – smečka dvorce).
import { lineMen } from '../people/dynasty';
import type { LordFamily } from '../people/lord';
import { villageManorId } from '../people/manor';
import { ageGroup, ageYears, isInjured } from '../people/people';
import { HUNT, MANOR_DOGS } from '../rules/rules-wildlife';
import type { Person, VillageState } from '../types';

/** Možní lovci rodu: muži rodiny od 14 let (`family.trainees`) a odešlí synové rodu. */
export interface HuntPool {
  /** Muži dvorce od 14 let. */
  manor: Person[];
  /** Synové rodu, kteří po sňatku odešli z dvorce a pracují jako rolníci. */
  away: Person[];
}

/**
 * Lovci rodu (bez zraněných), podle kterých dvorec chová psy (`dogsWanted`). Děti na lov nechodí
 * (Martin 27. 10. 2026) – chlapci dvorce do 13 let se nepočítají.
 */
export function huntPool(
  state: Pick<VillageState, 'people' | 'manorId' | 'dwellings' | 'constructions' | 'dynasty'>,
  day: number,
  family: Pick<LordFamily, 'trainees'>,
): HuntPool {
  const manorMen = new Set(family.trainees.map((p) => p.id));
  const fit = family.trainees.filter((p) => !isInjured(p, day));
  const manor = fit.filter((p) => ageYears(p.bornDay, day) >= HUNT.riderFromAge);
  const manorId = villageManorId(state);
  const away = lineMen(state).filter(
    (p) =>
      !manorMen.has(p.id) &&
      p.dwellingId !== manorId &&
      ageGroup(p, day) === 'adult' &&
      p.arms !== undefined &&
      !isInjured(p, day),
  );
  return { manor, away };
}

/** Kolik psů dvorec chce: 1 na lovce rodu + 1, nejvýš 8; bez lovců žádné. */
export function dogsWanted(pool: HuntPool): number {
  const hunters = pool.manor.length + pool.away.length;
  if (hunters === 0) return 0;
  return Math.min(MANOR_DOGS.max, hunters * MANOR_DOGS.perHunter + MANOR_DOGS.extra);
}

const DOG_EPSILON = 1e-6;

/** Psi smečky dvorce v celých kusech (jezdecká hlídka polí – `riderPatrol`). */
export function huntingDogs(state: Pick<VillageState, 'wildlife'>): number {
  return Math.floor((state.wildlife?.dogs?.count ?? 0) + DOG_EPSILON);
}
