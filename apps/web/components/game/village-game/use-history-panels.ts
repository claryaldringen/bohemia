'use client';

import { useEffect, useRef } from 'react';
import { useChronicle, type ChronicleControl } from '@/hooks/use-chronicle';
import { useNotices, type NoticesControl } from '@/hooks/use-notices';
import { usePanelHotkeys } from '@/hooks/use-panel-hotkeys';
import type { VillageView } from '@/lib/village-view';

/**
 * Panely Kronika a Upozornění (web-ui.md – Panel Kronika, Panel Upozornění, Zkratky panelů):
 * střídají se navzájem i s nabídkou a panely rodu a války (`othersOpen`, `closeOthers`); zkratky
 * J a U jako tlačítka v liště – kronika jen u živé vsi.
 */
export function useHistoryPanels({
  view,
  noticeTick,
  othersOpen,
  closeOthers,
  hotkeys,
}: {
  view: VillageView | null;
  /** Čítač doručených upozornění mezi hráči (`usePlayerNotices`). */
  noticeTick: number;
  /** Je otevřená nabídka, panel rodu nebo války? */
  othersOpen: boolean;
  /** Zavře nabídku a panely rodu a války. */
  closeOthers: () => void;
  /** Zkratky panelů platí (nabídka zavřená a hra neskončila). */
  hotkeys: boolean;
}): { chronicle: ChronicleControl; noticeHistory: NoticesControl } {
  const closeNoticesRef = useRef<() => void>(() => undefined);
  // Panel Kronika (absence.md – Návrat) – střídá se s panely rodu, války a nabídkou
  const chronicle = useChronicle({
    villageId: view && !view.extinct ? view.id : null,
    latest: view?.chronicle[0],
    othersOpen,
    closeOthers: () => {
      closeOthers();
      closeNoticesRef.current();
    },
  });
  // Panel Upozornění (absence.md – Návrat) – střídá se s kronikou, panely rodu a války i nabídkou
  const noticeHistory = useNotices({
    tick: noticeTick,
    enabled: true,
    othersOpen,
    closeOthers: () => {
      closeOthers();
      chronicle.close();
    },
  });
  useEffect(() => {
    closeNoticesRef.current = noticeHistory.close;
  }, [noticeHistory.close]);
  // Zkratky J (Kronika) a U (Upozornění) jako tlačítka v liště – kronika jen u živé vsi
  usePanelHotkeys((panel) => {
    if (panel === 'notices') noticeHistory.toggle();
    else if (view && !view.extinct) chronicle.toggle();
  }, hotkeys);
  return { chronicle, noticeHistory };
}
