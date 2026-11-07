import type { Random } from '../landscape/random';
import { WAR } from './rules-war';

// Vzdání muže rodu (war.md – Vzdaní, zajetí a výkupné; Martin 2. 11. 2026: „muži a chlapci rodu
// mají velkou pravděpodobnost vzdání se, pokud považují svou situaci za bezvýchodnou“). Bezvýchodná
// situace (návrh Clauda): jeho skupina se vzdala, nebo je raněný či pěšky obklíčený a útočník je
// blíž než les. Vzdá se s pravděpodobností `WAR.lineSurrenderChance` (los ze seedu); jezdec
// s volnou cestou uteče.

/** Muž, který se rozhoduje. */
export interface SurrenderMember {
  /** Na koni (uteče, pokud má volnou cestu). */
  mounted: boolean;
}

/** Situace muže v boji. */
export interface SurrenderSituation {
  /** Bezvýchodná: skupina se vzdala, nebo je raněný / obklíčený a útočník je blíž než les. */
  hopeless: boolean;
  /** Má volnou cestu pryč. */
  freeRoute: boolean;
}

/** Vzdá se muž rodu? Los se hází jen v bezvýchodné situaci a jen kdo neuteče. */
export function surrenders(
  member: SurrenderMember,
  situation: SurrenderSituation,
  rng: Random,
): boolean {
  if (!situation.hopeless) return false;
  if (member.mounted && situation.freeRoute) return false;
  return rng.next() < WAR.lineSurrenderChance;
}
