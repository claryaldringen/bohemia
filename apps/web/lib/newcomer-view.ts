import type { LanguageGroup, NewcomerStatus } from '@bohemia/game';

// Pohled nováčka pro panel (newcomers.md – Rozhraní). Čisté typy a pomocné funkce bez serveru.
// Typy se odvozují z jádra (`NewcomerStatus`), jen konec týdne jde do klienta jako ISO čas.

type IsolatedStatus = Extract<NewcomerStatus, { phase: 'isolated' }>;

/** Řádek nabídky pánů: rod, jméno vojvody a jazyková skupina rodu. */
export type NewcomerOfferView = IsolatedStatus['offer'][number];

/** Odeslaná žádost nováčka – čeká, nebo ji rod odmítl. */
export type NewcomerRequestView = IsolatedStatus['requests'][number];

/**
 * Stav nováčka pro klienta: `NewcomerStatus` z jádra, `deadline` je konec týdne čekání (ISO čas),
 * null dokud žádná žádost neběží.
 */
export type NewcomerStatusView =
  | (Omit<IsolatedStatus, 'deadline'> & { deadline: string | null })
  | Exclude<NewcomerStatus, { phase: 'isolated' }>;

/** Převod stavu z jádra na pohled pro klienta. */
export function newcomerStatusView(status: NewcomerStatus): NewcomerStatusView {
  return status.phase === 'isolated'
    ? { ...status, deadline: status.deadline === null ? null : status.deadline.toISOString() }
    : status;
}

/** Nováček čeká na odpověď pánů (aspoň jedna žádost bez odpovědi). */
export function newcomerWaiting(status: NewcomerStatusView | null): boolean {
  return status?.phase === 'isolated' && status.requests.some((r) => r.state === 'pending');
}

/** Odříznutý nováček ještě nerozhodl (nežádá, nebo ho všichni odmítli) – panel volby cesty. */
export function newcomerUndecided(status: NewcomerStatusView | null): boolean {
  return status?.phase === 'isolated' && !newcomerWaiting(status);
}

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
