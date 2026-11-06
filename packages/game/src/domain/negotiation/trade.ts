import { checkAidBundle } from '../vassalage/loan';
import type { TermItem, TradeLine } from './types';

// Obchod mezi hráči (vassalage.md – Hospodářství mezi hráči; Martin 2. 11. 2026: obchod mezi
// hráči ano, jen makrokomodity, dopravu platí ten, kdo posílá – návrh Clauda). Čistá pravidla
// kontroly řádku `trade`; vlastnictví vsí hlídá use-case.

export const TRADE_REASONS = {
  onlyTrade: 'Obchod nesmí obsahovat jiné řádky.',
  oneLine: 'Obchod má jediný řádek.',
  badGoods: 'Obchodovat smí jen obilí, seno, dobytek, koně a klády.',
  badVillage: 'Ves musí patřit tomu, kdo ji uvádí.',
  noTarget: 'Příjemce nemá kam zásilku poslat.',
  noDialogs: 'Obchod teď nejde sjednat.',
} as const;

/** Je řádek řádkem obchodu? */
export function isTradeLine(item: { kind: string }): item is TradeLine {
  return item.kind === 'trade';
}

/** Kontrola čísel řádku: obě strany jen makrokomodity v mezích a neprázdné. */
export function checkTradeLine(line: TradeLine): string | null {
  const bad = checkAidBundle(line.give) ?? checkAidBundle(line.get);
  if (bad) return TRADE_REASONS.badGoods;
  return Object.keys(line.fromVillage).length > 2 ? TRADE_REASONS.badVillage : null;
}

/** Kolo jednání o obchodu: jediný řádek obchodu a nic jiného. */
export function checkTradeItems(items: readonly TermItem[]): string | null {
  const trades = items.filter(isTradeLine);
  if (trades.length !== items.length) return TRADE_REASONS.onlyTrade;
  const line = trades[0];
  if (!line || trades.length !== 1) return TRADE_REASONS.oneLine;
  return checkTradeLine(line);
}
