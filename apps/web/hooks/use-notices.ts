'use client';

import { useCallback, useEffect, useState } from 'react';
import { getNotices } from '@/app/game/actions';
import {
  appendOlderNotices,
  mergeNewestNotices,
  newestNoticeId,
  type NoticePage,
} from '@/lib/notice-page';

const CONNECTION_FAILED = 'Spojení se serverem selhalo.';
/** Poslední upozornění, které hráč v panelu viděl (jen v tomto prohlížeči). */
const SEEN_KEY = 'bohemia:notices-seen';

type Load = (input: { before: number | null }) => Promise<NoticePage | { error: string }>;

/** Stav panelu Upozornění pro `VillageGame` a lištu. */
export interface NoticesControl {
  open: boolean;
  page: NoticePage | null;
  /** Upozornění novější než ta, která hráč v panelu viděl, mezi nejnovějšími načtenými (číslo u ikony). */
  unread: number;
  /** Upozornění s větším `id` se v otevřeném panelu zvýrazní jako nová. */
  highlightAfter: number;
  loading: boolean;
  error: string | null;
  toggle: () => void;
  close: () => void;
  loadOlder: () => void;
}

function readSeen(): number {
  try {
    const value = Number(window.localStorage.getItem(SEEN_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSeen(id: number): void {
  try {
    window.localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // bez úložiště se číslo u ikony po obnovení stránky vrátí – nic horšího
  }
}

/**
 * Panel Upozornění (notice-page.ts): první stránka se načte po spuštění a kdykoli klientovi
 * dorazí nové upozornění (`tick` roste) – číslo u ikony tak žije i se zavřeným panelem; starší
 * stránky na vyžádání. Otevřením panelu se vše do nejnovějšího považuje za viděné. Panely vpravo
 * nahoře se střídají (`othersOpen`, `closeOthers`) jako u kroniky.
 */
export function useNotices({
  tick,
  enabled,
  othersOpen,
  closeOthers,
  load = getNotices,
}: {
  /** Čítač doručených upozornění (VillageGame) – při změně se stránka načte znovu. */
  tick: number;
  /** Hráč je přihlášen a hra běží; jinak se nic nenačítá. */
  enabled: boolean;
  othersOpen: boolean;
  closeOthers: () => void;
  load?: Load;
}): NoticesControl {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NoticePage | null>(null);
  const [seen, setSeen] = useState<number | null>(null);
  const [highlightAfter, setHighlightAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [othersBefore, setOthersBefore] = useState(othersOpen);
  if (othersBefore !== othersOpen) {
    setOthersBefore(othersOpen);
    if (othersOpen) setOpen(false);
  }

  // uložená hodnota se čte až v prohlížeči (ne při renderu na serveru)
  useEffect(() => setSeen(readSeen()), []);

  const ready = seen !== null;
  useEffect(() => {
    if (!enabled || !ready) return;
    let live = true;
    void load({ before: null })
      .then((result) => {
        if (!live) return;
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setError(null);
        setPage((known) => mergeNewestNotices(known, result));
      })
      .catch(() => {
        if (live) setError(CONNECTION_FAILED);
      });
    return () => {
      live = false;
    };
  }, [enabled, ready, tick, open, load]);

  // v otevřeném panelu je vše do nejnovějšího viděné
  const newest = newestNoticeId(page);
  useEffect(() => {
    if (open && newest !== null && newest !== seen) {
      setSeen(newest);
      writeSeen(newest);
    }
  }, [open, newest, seen]);

  // počítá se z načtených upozornění; víc než stránka se ukáže jako strop
  const unread = open || seen === null || !page ? 0 : page.items.filter((n) => n.id > seen).length;

  const loadOlder = (): void => {
    if (!page || page.olderThan === null || loading) return;
    setLoading(true);
    load({ before: page.olderThan })
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setError(null);
        setPage((known) => (known ? appendOlderNotices(known, result) : known));
      })
      .catch(() => setError(CONNECTION_FAILED))
      .finally(() => setLoading(false));
  };

  const close = useCallback((): void => setOpen(false), []);
  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    closeOthers();
    setError(null);
    setHighlightAfter(seen ?? 0);
    setOpen(true);
  };

  return { open, page, unread, highlightAfter, loading, error, toggle, close, loadOlder };
}
