// Kdo může lovit a kolik psů dvorec chce (wildlife.md – Lov rodu: Kdo; Psi – smečka dvorce).
import { lineMen } from '../people/dynasty';
import type { LordFamily } from '../people/lord';
import { villageManorId } from '../people/manor';
import { ageGroup, ageYears, isInjured } from '../people/people';
import { HUNT, MANOR_DOGS } from '../rules/rules-wildlife';
import type { HuntDay, Person, VillageState } from '../types';

/** Možní lovci rodu: muži rodiny od 14 let (`family.trainees`) a odešlí synové rodu. */
export interface HuntPool {
  /** Muži dvorce od 14 let (na koni, nebo pěšky). */
  manor: Person[];
  /** Synové rodu, kteří po sňatku odešli z dvorce a pracují jako rolníci – jen pěšky. */
  away: Person[];
}

/**
 * Z koho se skládá lov dne (bez zraněných a bez koní – ty řeší `planHuntDay`). Děti na lov nechodí
 * (Martin 27. 10. 2026) – chlapci dvorce do 13 let v den lovu cvičí doma jako jindy.
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

/** Lov dne, je-li pro `day` naplánovaný (po `planHuntDay`); jinak null. */
export function huntToday(state: Pick<VillageState, 'wildlife'>, day: number): HuntDay | null {
  const today = state.wildlife?.hunt?.today;
  return today && today.day === day ? today : null;
}

const NO_IDS: ReadonlySet<number> = new Set();

/** Id pěších lovců dne, kteří dnes chybí v práci vsi (`villagersToday`). */
export function huntFootIds(
  state: Pick<VillageState, 'wildlife'>,
  day: number,
): ReadonlySet<number> {
  const today = huntToday(state, day);
  return today && today.foot.length > 0 ? new Set(today.foot) : NO_IDS;
}

const DOG_EPSILON = 1e-6;

/** Psi smečky, kteří dnes loví (celé kusy). */
export function huntingDogs(state: Pick<VillageState, 'wildlife'>): number {
  return Math.floor((state.wildlife?.dogs?.count ?? 0) + DOG_EPSILON);
}
