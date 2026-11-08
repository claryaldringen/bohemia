// Panel Upozornění (absence.md – Návrat; Martin 8. 11. 2026: „může si přece sám zobrazit panel
// s notifikacemi a kroniku“): historie upozornění mezi hráči od nejnovějších, po stránkách.
// Upozornění vsi se neukládají (odvozují se z rozdílu pohledů) – pokrývá je kronika.
// Čisté funkce – server z nich skládá stránku, prohlížeč stránky spojuje.

import { dateOfDayIndex, type PlayerNotice, type PlayerNoticeKind } from '@bohemia/game';
import { formatGameDate } from './game-date';
import { playerNoticeText } from './player-notices';

/** Kolik upozornění má stránka (návrh Clauda). */
export const NOTICE_PAGE_SIZE = 30;

export interface NoticeEntryView {
  id: number;
  kind: PlayerNoticeKind;
  /** Herní datum vzniku („12. března 507“). */
  dateLabel: string;
  text: string;
}

/** Stránka historie – nejnovější první. */
export interface NoticePage {
  items: NoticeEntryView[];
  /** Starší upozornění jsou – další stránka se ptá na `id` menší než toto; null = nejsou. */
  olderThan: number | null;
}

/** Dotaz na stránku: upozornění před `before` (null = od nejnovějšího). */
export interface NoticeAsk {
  before: number | null;
}

/** Dotaz ze vstupu server action (`{ before? }`); neplatný null. */
export function parseNoticeAsk(input: unknown): NoticeAsk | null {
  if (typeof input !== 'object' || input === null) return null;
  const before = (input as { before?: unknown }).before;
  if (before === undefined || before === null) return { before: null };
  if (typeof before !== 'number' || !Number.isSafeInteger(before) || before < 0) return null;
  return { before };
}

/**
 * Stránka z řádků repozitáře (`rows` = nejnovější první, nejvýš NOTICE_PAGE_SIZE + 1 – poslední
 * navíc jen říká, že starší jsou).
 */
export function noticePage(rows: readonly PlayerNotice[]): NoticePage {
  const shown = rows.slice(0, NOTICE_PAGE_SIZE);
  return {
    items: shown.map((n) => ({
      id: n.id,
      kind: n.kind,
      dateLabel: formatGameDate(dateOfDayIndex(n.gameDay)),
      text: playerNoticeText(n),
    })),
    olderThan: rows.length > NOTICE_PAGE_SIZE ? (shown.at(-1)?.id ?? null) : null,
  };
}

/** Přidá starší stránku pod zobrazené. */
export function appendOlderNotices(shown: NoticePage, older: NoticePage): NoticePage {
  const known = new Set(shown.items.map((n) => n.id));
  return {
    items: [...shown.items, ...older.items.filter((n) => !known.has(n.id))],
    olderThan: older.olderThan,
  };
}

/** Nová první stránka nad už zobrazenými staršími: nová nahradí tytéž, starší zůstanou. */
export function mergeNewestNotices(shown: NoticePage | null, fresh: NoticePage): NoticePage {
  const oldest = fresh.items.at(-1)?.id;
  if (!shown || oldest === undefined) return fresh;
  const older = shown.items.filter((n) => n.id < oldest);
  if (older.length === 0) return fresh;
  return { items: [...fresh.items, ...older], olderThan: shown.olderThan };
}

/** Nejvyšší `id` na stránce (co hráč viděl), jinak null. */
export function newestNoticeId(page: NoticePage | null): number | null {
  return page?.items[0]?.id ?? null;
}
