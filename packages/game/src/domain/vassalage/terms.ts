import { CATTLE_GOODS } from '../village/trade/goods';
import { stoneOf, type MacroBundle } from './macro';
import { VASSALAGE } from './rules-vassalage';

/**
 * Podmínky vazalství (vassalage.md – Podmínky dohody): každý řádek je volitelný, bez řádků je
 * dohoda holá přísaha. `tribute` = roční dávka vazala pánovi, `service` = muži rodu a dny ročně,
 * když pán vede válku, `targetVillageId` = cílová ves pána (bez ní jeho vlastní ves), `reward` =
 * roční odměna pána vazalovi.
 */
export interface VassalTerms {
  tribute?: MacroBundle;
  service?: { men: number; days: number };
  targetVillageId?: string;
  reward?: MacroBundle;
}

/** Řádky podmínek kromě přísahy (strany jsou rody – `house.id`). */
export type TermLine =
  | { kind: 'tribute'; goods: MacroBundle }
  | { kind: 'service'; men: number; days: number }
  | { kind: 'target-village'; villageId: string }
  | { kind: 'reward'; goods: MacroBundle };

/** Důvody odmítnutí řádků podmínek. */
export const TERM_REASONS = {
  badAmount: 'Čísla v podmínkách musí být nezáporná a rozumná.',
  duplicate: 'Každý řádek podmínek smí být jen jednou.',
  badVillage: 'Cílová ves musí být vesnice pána.',
  emptyGoods: 'Dávka ani odměna nesmí být prázdná.',
} as const;

const L = VASSALAGE.termLimits;

const inRange = (n: number, max: number): boolean => Number.isFinite(n) && n >= 0 && n <= max;
const isCount = (n: number, max: number): boolean => inRange(n, max) && Number.isInteger(n);

/** Je svazek v mezích (kg nezáporné, kusy a lidé celá čísla) a něco obsahuje? */
export function checkBundle(b: MacroBundle): string | null {
  const heads = [...CATTLE_GOODS.map((g) => b.cattle[g]), b.horses, b.logs, stoneOf(b)];
  const people = [b.people.families, b.people.men, b.people.women];
  const ok =
    inRange(b.grainKg, L.maxKg) &&
    inRange(b.hayKg, L.maxKg) &&
    heads.every((n) => isCount(n, L.maxHeads)) &&
    people.every((n) => isCount(n, L.maxPeople)) &&
    isCount(b.laborDays, L.maxLaborDays);
  if (!ok) return TERM_REASONS.badAmount;
  const empty =
    b.grainKg + b.hayKg + b.laborDays === 0 && [...heads, ...people].every((n) => n === 0);
  return empty ? TERM_REASONS.emptyGoods : null;
}

/** Kontrola čísel jednoho řádku (cílová ves se ověřuje zvlášť – vlastnictví zná až use-case). */
export function checkTermLine(line: TermLine): string | null {
  switch (line.kind) {
    case 'tribute':
    case 'reward':
      return checkBundle(line.goods);
    case 'service':
      return isCount(line.men, L.maxServiceMen) &&
        isCount(line.days, L.maxServiceDays) &&
        line.men > 0 &&
        line.days > 0
        ? null
        : TERM_REASONS.badAmount;
    case 'target-village':
      return line.villageId === '' ? TERM_REASONS.badVillage : null;
  }
}

/** Kontrola všech řádků: každý druh nejvýš jednou a čísla v mezích. */
export function checkTermLines(lines: readonly TermLine[]): string | null {
  const kinds = new Set<string>();
  for (const line of lines) {
    if (kinds.has(line.kind)) return TERM_REASONS.duplicate;
    kinds.add(line.kind);
    const bad = checkTermLine(line);
    if (bad) return bad;
  }
  return null;
}

/** Podmínky z řádků (přísaha do nich nepatří). */
export function termsOfLines(lines: readonly TermLine[]): VassalTerms {
  const terms: VassalTerms = {};
  for (const line of lines) {
    switch (line.kind) {
      case 'tribute':
        terms.tribute = line.goods;
        break;
      case 'service':
        terms.service = { men: line.men, days: line.days };
        break;
      case 'target-village':
        terms.targetVillageId = line.villageId;
        break;
      case 'reward':
        terms.reward = line.goods;
        break;
    }
  }
  return terms;
}

/** Řádky z podmínek (opak `termsOfLines`) – panel z nich skládá ikony. */
export function linesOfTerms(terms: VassalTerms): TermLine[] {
  const lines: TermLine[] = [];
  if (terms.tribute) lines.push({ kind: 'tribute', goods: terms.tribute });
  if (terms.service) lines.push({ kind: 'service', ...terms.service });
  if (terms.targetVillageId !== undefined) {
    lines.push({ kind: 'target-village', villageId: terms.targetVillageId });
  }
  if (terms.reward) lines.push({ kind: 'reward', goods: terms.reward });
  return lines;
}
