import type { StewardshipLine, TermItem } from './types';

// Správa cizí vsi v jednání (vassalage.md – Hráč jako správce cizí vsi). Čistá kontrola řádku;
// že ves patří pánovi a nemá správce, hlídá use-case.

export const STEWARDSHIP_REASONS = {
  oneLine: 'Nabídnout lze správu jediné vsi.',
  badVillage: 'Správu lze svěřit jen vsi, kterou držíš.',
  notLord: 'Správu vsi nabízí pán svému vazalovi.',
  noPlayer: 'Správu lze svěřit jen hráči.',
  taken: 'Ves už správce má.',
  noLive: 'Správce vsi nemůže být rod, který skončil.',
} as const;

/** Je řádek řádkem správy vsi? */
export function isStewardshipLine(item: { kind: string }): item is StewardshipLine {
  return item.kind === 'stewardship';
}

/** Kontrola kola: nejvýš jeden řádek správy, s neprázdným id vsi. */
export function checkStewardshipItems(items: readonly TermItem[]): string | null {
  const lines = items.filter(isStewardshipLine);
  if (lines.length === 0) return null;
  const line = lines[0];
  if (lines.length > 1 || !line) return STEWARDSHIP_REASONS.oneLine;
  return line.villageId.length > 0 ? null : STEWARDSHIP_REASONS.badVillage;
}
