'use client';

import { useCallback, useRef, useState } from 'react';
import { mergeNoticeLines } from '@/lib/player-notices';
import type { NoticeLine } from '../hud/NoticeLines';

/** Nejvíc řádků oznámení najednou – starší ustoupí novějším. */
const MAX_NOTICES = 4;

export interface NoticeLines {
  /** Mizející řádky oznámení nahoře (`NoticeLines`). */
  notices: NoticeLine[];
  /** Přidá řádek ze vsi nebo chybu akce (kladné id z čítače). */
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  /** Připojí řádky upozornění mezi hráči (`mergeNoticeLines` – bez těch, které už jsou vidět). */
  mergeNotices: (lines: readonly NoticeLine[]) => void;
  /** Řádek doběhl – zmizí. */
  expireNotice: (id: number) => void;
}

/** Mizející řádky oznámení nahoře – oznámení vsi, chyby akcí i upozornění mezi hráči. */
export function useNoticeLines(): NoticeLines {
  const [notices, setNotices] = useState<NoticeLine[]>([]);
  const noticeId = useRef(0);
  const pushNotice = useCallback((notice: Omit<NoticeLine, 'id'>): void => {
    setNotices((list) => [...list, { ...notice, id: ++noticeId.current }].slice(-MAX_NOTICES));
  }, []);
  const mergeNotices = useCallback((lines: readonly NoticeLine[]): void => {
    setNotices((list) => mergeNoticeLines(list, lines, MAX_NOTICES));
  }, []);
  const expireNotice = useCallback((id: number): void => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);
  return { notices, pushNotice, mergeNotices, expireNotice };
}
