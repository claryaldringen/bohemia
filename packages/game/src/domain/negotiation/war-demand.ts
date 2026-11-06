import { checkTermLines } from '../vassalage/terms';
import { termLinesOf } from './negotiate';
import type { TermItem, WarDemandLine } from './types';

// Požadavek při opovědi války (war.md – Začátek války). Čistá kontrola řádku; že válka běží
// a přísaha je možná, hlídá use-case při přijetí.

export const WAR_DEMAND_REASONS = {
  alone: 'Požadavek při opovědi je samostatný řádek.',
  badItem: 'Požadavek smí nést jen přísahu, dávku, vojenskou službu a odměnu.',
  noOath: 'Dávka, služba a odměna platí jen s přísahou vazalství.',
  oneOath: 'Požadavek smí nést nejvýš jednu přísahu.',
  noCounter: 'Na opověď se odpovídá mírovým jednáním.',
  noWar: 'Válka už neběží.',
} as const;

/** Druhy řádků, které smí nést požadavek. */
const ALLOWED = new Set<TermItem['kind']>(['oath', 'tribute', 'service', 'reward']);

/** Je řádek požadavkem při opovědi? */
export function isWarDemandLine(item: { kind: string }): item is WarDemandLine {
  return item.kind === 'war-demand';
}

/** Kontrola kola: požadavek je jediný řádek, nese jen povolené druhy a podmínky bez přísahy nic neurčí. */
export function checkWarDemandItems(items: readonly TermItem[]): string | null {
  const lines = items.filter(isWarDemandLine);
  const line = lines[0];
  if (!line) return null;
  if (lines.length > 1 || items.length > 1) return WAR_DEMAND_REASONS.alone;
  if (line.items.some((i) => !ALLOWED.has(i.kind))) return WAR_DEMAND_REASONS.badItem;
  const oaths = line.items.filter((i) => i.kind === 'oath').length;
  if (oaths > 1) return WAR_DEMAND_REASONS.oneOath;
  const lines2 = termLinesOf(line.items);
  if (oaths === 0 && lines2.length > 0) return WAR_DEMAND_REASONS.noOath;
  return checkTermLines(lines2);
}
