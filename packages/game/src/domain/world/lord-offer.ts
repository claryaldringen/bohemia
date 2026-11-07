import { deriveSeed } from '../landscape/random';
import type { LanguageGroup } from './languages';

/** Rod jako kandidát nabídky pánů (newcomers.md – Nabídka pánů). */
export interface OfferCandidate {
  houseId: string;
  kind: 'player' | 'npc';
  alive: boolean;
  /** Počet živých vsí rodu. */
  villages: number;
  language: LanguageGroup;
}

/** Nejmenší počet vsí, který smí rod v nabídce mít (spec: „ty, které už mají dvě vesnice“). */
const MIN_VILLAGES = 2;

/**
 * Id rodů v pořadí nabídky: jen živé rody hráčů s nejmenším počtem vsí ≥ 2, který některý má;
 * nahoře stejný jazyk, uvnitř skupiny pevné pořadí ze seedu účtu nováčka.
 */
export function lordOffer(
  candidates: readonly OfferCandidate[],
  newcomer: { language: LanguageGroup; seed: number },
): string[] {
  const eligible = candidates.filter(
    (c) => c.kind === 'player' && c.alive && c.villages >= MIN_VILLAGES,
  );
  if (eligible.length === 0) return [];
  const smallest = eligible.reduce((m, c) => Math.min(m, c.villages), Infinity);
  return eligible
    .filter((c) => c.villages === smallest)
    .map((c) => ({
      id: c.houseId,
      sameLanguage: c.language === newcomer.language ? 0 : 1,
      order: deriveSeed(newcomer.seed, c.houseId),
    }))
    .sort((a, b) => a.sameLanguage - b.sameLanguage || a.order - b.order || (a.id < b.id ? -1 : 1))
    .map((c) => c.id);
}
