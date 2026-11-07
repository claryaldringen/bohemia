import type { LanguageGroup } from '@bohemia/game';

// Pohled nováčka pro panel (newcomers.md – Rozhraní). Čisté typy a pomocné funkce bez serveru.

/** Řádek nabídky pánů: rod, jméno vojvody a jazyková skupina rodu. */
export interface NewcomerOfferView {
  houseId: string;
  lordName: string;
  language: LanguageGroup;
}

/** Odeslaná žádost nováčka – čeká, nebo ji rod odmítl. */
export interface NewcomerRequestView {
  houseId: string;
  state: 'pending' | 'rejected';
}

/**
 * Stav nováčka. Odpovídá NewcomerStatus z application/newcomers.ts (Úloha 3) – sjednotit při
 * napojení. `deadline` je konec týdne čekání (ISO čas), null dokud žádná žádost neběží.
 */
export type NewcomerStatusView =
  | {
      phase: 'isolated';
      offer: NewcomerOfferView[];
      requests: NewcomerRequestView[];
      deadline: string | null;
    }
  | { phase: 'placed' };

/** Nejvíc rodů, kterým smí nováček poslat žádost najednou. */
export const MAX_NEWCOMER_REQUESTS = 5;

/** Důvod, proč šestý rod nejde zaškrtnout. */
export const MAX_REQUESTS_REASON = `Nejvýš ${MAX_NEWCOMER_REQUESTS} rodů.`;

/** Názvy jazykových skupin (popisky ikon jazyka). */
export const LANGUAGE_NAMES: Readonly<Record<LanguageGroup, string>> = {
  cs: 'Čeština',
  en: 'English',
  de: 'Deutsch',
  pl: 'Polski',
  it: 'Italiano',
  fr: 'Français',
  es: 'Español',
};

/** Zbývající čas do konce týdne jako „d h m“ / „h:mm:ss“ (poslední den s vteřinami); 0 po konci. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} d ${hours} h`;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}
