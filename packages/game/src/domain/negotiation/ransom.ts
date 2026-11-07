import { checkAidBundle } from '../vassalage/loan';
import { checkTermLines, linesOfTerms } from '../vassalage/terms';
import type { RansomLine, TermItem } from './types';

// Výkupné zajatců (war.md – Vzdaní, zajetí a výkupné). Čistá kontrola řádku `ransom`; že zajatci
// jsou ve vsi věznitele a patří rodu protistrany, hlídá use-case.

export const RANSOM_REASONS = {
  alone: 'Výkupné je samostatný řádek.',
  noPrisoners: 'Vyber aspoň jednoho zajatce.',
  badPrice: 'Výkupné smí být jen obilí, seno, dobytek, koně a klády.',
  badVassalage: 'Vazalem a pánem musí být strany jednání.',
  noHost: 'Výkupné teď nejde sjednat.',
  notHeld: 'Tohle zajetí už neplatí nebo ho nedržíš ty ani druhá strana.',
  noTarget: 'Věznitel nemá ves, kam by se dalo poslat.',
  isYourLord: 'Výkupné s vazalstvím by vytvořilo kruh (pán by byl vazalem svého vazala).',
} as const;

/** Je řádek výkupným? */
export function isRansomLine(item: { kind: string }): item is RansomLine {
  return item.kind === 'ransom';
}

/** Kontrola tvaru a čísel: jediný řádek, zajatci bez duplicit, cena v mezích, strany vazalství. */
export function checkRansomItems(
  items: readonly TermItem[],
  parties: readonly string[],
): string | null {
  const lines = items.filter(isRansomLine);
  const line = lines[0];
  if (!line) return null;
  if (lines.length > 1 || items.length > 1) return RANSOM_REASONS.alone;
  if (line.prisonerIds.length === 0 || new Set(line.prisonerIds).size !== line.prisonerIds.length) {
    return RANSOM_REASONS.noPrisoners;
  }
  if (checkAidBundle(line.price)) return RANSOM_REASONS.badPrice;
  if (line.vassalage !== undefined) {
    const { lord, vassal, terms } = line.vassalage;
    if (lord === vassal || !parties.includes(lord) || !parties.includes(vassal)) {
      return RANSOM_REASONS.badVassalage;
    }
    return checkTermLines(linesOfTerms(terms));
  }
  return null;
}
