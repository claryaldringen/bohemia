'use client';

import { useCallback, useState, type RefObject } from 'react';
import type { PlayerNotice } from '@bohemia/game';
import { noticeOpener, playerNoticeLine, type NoticePanel } from '@/lib/player-notices';
import type { NoticeLine } from '../hud/NoticeLines';

export interface PlayerNotices {
  /** Čítač doručených upozornění – panel Upozornění se při změně načte znovu (`useNotices`). */
  tick: number;
  /** Ukáže upozornění z odpovědi dotazu na ves (server je tím označil za přečtená). */
  show: (received: readonly PlayerNotice[] | undefined) => void;
}

/**
 * Upozornění mezi hráči (world.md – Schránka): přicházejí v odpovědi dotazu na ves, ukážou se
 * řádkem nahoře a klik na řádek otevře panel (rod, válka, odvody) nebo dvorec vsi s varováním
 * (`openVillage` – ref, funkce vzniká až u přepínání vsí). Každá dávka obnoví pohled rodu.
 */
export function usePlayerNotices({
  refreshHouse,
  openHouse,
  openWar,
  openLevy,
  openVillage,
  mergeNotices,
}: {
  refreshHouse: () => Promise<void>;
  openHouse: () => void;
  openWar: () => void;
  openLevy: () => Promise<void>;
  openVillage: RefObject<(villageId: string) => void>;
  mergeNotices: (lines: readonly NoticeLine[]) => void;
}): PlayerNotices {
  const [noticeTick, setNoticeTick] = useState(0);
  const openNoticePanel = useCallback(
    (panel: NoticePanel): void => {
      if (panel === 'house') openHouse();
      else if (panel === 'war') openWar();
      else void openLevy();
    },
    [openHouse, openLevy, openWar],
  );
  const showPlayerNotices = useCallback(
    (received: readonly PlayerNotice[] | undefined): void => {
      if (!received || received.length === 0) return;
      void refreshHouse();
      setNoticeTick((t) => t + 1);
      const open = {
        village: (villageId: string) => openVillage.current(villageId),
        panel: openNoticePanel,
      };
      const lines = received.map((n) => ({
        ...playerNoticeLine(n),
        onOpen: noticeOpener(n, open),
      }));
      mergeNotices(lines);
    },
    [mergeNotices, openNoticePanel, openVillage, refreshHouse],
  );
  return { tick: noticeTick, show: showPlayerNotices };
}
