import { checkAidBundle } from '../vassalage/loan';
import { checkBundle } from '../vassalage/terms';
import { checkTermLines, linesOfTerms } from '../vassalage/terms';
import type { PeaceLine, TermItem } from './types';

// Mírové jednání (war.md – Konec války – mírové jednání). Čistá kontrola řádku `peace`; že válka
// běží, strany jsou strany jednání a ves patří tomu, kdo ji postupuje, hlídá use-case.

export const PEACE_REASONS = {
  alone: 'Mírové jednání je samostatný řádek.',
  noWar: 'Mezi rody neběží válka.',
  badFee: 'Poplatek smí být jen obilí, seno, dobytek, koně, klády a lidé.',
  badTribute: 'Tribut smí být jen obilí, seno, dobytek, koně a klády.',
  noPayer: 'Platící strana musí být jednou ze stran jednání.',
  badVassalage: 'Vazalem a pánem musí být strany jednání.',
  oneCedent: 'Postoupit smí jen jedna strana a jen své vsi.',
  lastVillage: 'Poslední ves rodu postoupit nejde – jen vazalství.',
  badCede: 'Ves k postoupení neexistuje nebo nepatří postupující straně.',
  noCede: 'Postoupení vsí teď nejde sjednat.',
  cedeExpedition: 'Někdo z postupovaných vsí je na výpravě.',
  isYourLord: 'Mír s vazalstvím by vytvořil kruh (pán by byl vazalem svého vazala).',
} as const;

/** Je řádek řádkem míru? */
export function isPeaceLine(item: { kind: string }): item is PeaceLine {
  return item.kind === 'peace';
}

/** Kontrola čísel a tvaru: jediný řádek, svazky v mezích, strany nerovné, vsi bez duplicit. */
export function checkPeaceItems(
  items: readonly TermItem[],
  parties: readonly string[],
): string | null {
  const lines = items.filter(isPeaceLine);
  const line = lines[0];
  if (!line) return null;
  if (lines.length > 1 || items.length > 1) return PEACE_REASONS.alone;
  if (line.fee !== undefined) {
    // poplatek smí být i lidé (war.md – Konec války: zboží, dobytek, lidé), jen ne robota
    if (line.fee.laborDays !== 0 || checkBundle(line.fee)) return PEACE_REASONS.badFee;
    if (line.payer === undefined || !parties.includes(line.payer)) return PEACE_REASONS.noPayer;
  }
  if (line.tribute !== undefined) {
    if (checkAidBundle(line.tribute.goods)) return PEACE_REASONS.badTribute;
    if (!parties.includes(line.tribute.payer)) return PEACE_REASONS.noPayer;
  }
  if (line.vassalage !== undefined) {
    const { lord, vassal, terms } = line.vassalage;
    if (lord === vassal || !parties.includes(lord) || !parties.includes(vassal)) {
      return PEACE_REASONS.badVassalage;
    }
    const bad = checkTermLines(linesOfTerms(terms));
    if (bad) return bad;
  }
  if (line.cede !== undefined) {
    if (line.cede.length === 0 || new Set(line.cede).size !== line.cede.length) {
      return PEACE_REASONS.badCede;
    }
  }
  return null;
}
