import type { TermItem, VillageGiftLine } from './types';

// Věnování dílu odúmrti v jednání (vassalage.md – Vymření rodu – odúmrť). Čistá kontrola řádku;
// že díl pánovi patří, hlídá use-case při převodu.

const VILLAGE_GIFT_REASONS = {
  oneLine: 'Věnovat lze jeden díl odúmrti.',
  empty: 'Věnovaný díl nesmí být prázdný.',
  alone: 'Věnování dílu odúmrti je samostatné jednání.',
} as const;

/** Je řádek věnováním dílu odúmrti? */
export function isVillageGiftLine(item: { kind: string }): item is VillageGiftLine {
  return item.kind === 'village-gift';
}

/** Kontrola kola: věnování je jediný řádek kola a díl není prázdný. */
export function checkVillageGiftItems(items: readonly TermItem[]): string | null {
  const lines = items.filter(isVillageGiftLine);
  const line = lines[0];
  if (!line) return null;
  if (lines.length > 1) return VILLAGE_GIFT_REASONS.oneLine;
  if (items.length > 1) return VILLAGE_GIFT_REASONS.alone;
  if (line.escheatId.length === 0 || line.villageIds.length + line.vassalIds.length === 0) {
    return VILLAGE_GIFT_REASONS.empty;
  }
  return null;
}
