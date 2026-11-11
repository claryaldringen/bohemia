'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EscheatView } from '@bohemia/game';
import {
  escheatDialogs,
  housePanel,
  issueInvite,
  newcomerStatusAction,
  revokeInvite,
} from '@/app/game/actions';
import type { HouseView } from '@/lib/house-view';
import type { NewcomerStatusView } from '@/lib/newcomer-view';
import { CONNECTION_FAILED } from './village-data';

export interface House {
  /** Pohled panelu „Rod a vazalové“ (null – ještě nenačtený). */
  view: HouseView | null;
  /** Chyba panelu rodu nebo jednání (česky); null – žádná. */
  error: string | null;
  setError: (error: string | null) => void;
  /** Stav volby pána odříznutého nováčka (null – ještě neznámý). */
  newcomer: NewcomerStatusView | null;
  /** Načte pohled rodu znovu (a u odříznutého rodu i stav nováčka). */
  refresh: () => Promise<void>;
  /** Odúmrti, o kterých hráč jako pán rozhoduje; null – dialog se neukáže. */
  escheats: EscheatView[] | null;
  refreshEscheats: () => Promise<void>;
  closeEscheats: () => void;
  issueInvite: () => Promise<void>;
  revokeInvite: (code: string) => Promise<void>;
  /** Akce jednání: důvod odmítnutí se ukáže v panelu, pohled se obnoví. */
  negotiate: (task: () => Promise<{ ok: true } | { error: string }>) => Promise<void>;
}

/**
 * Rod hráče (web-ui.md – Panel „Rod a vazalové“): pohled se načte po otevření hry (počet vazalů
 * v liště) a obnoví po otevření panelu, po akci a po novém upozornění mezi hráči. U odříznutého
 * rodu i stav nováčka (newcomers.md) – bez vsi se po umístění na mapu světa stránka načte znovu.
 */
export function useHouse({ villageMissing }: { villageMissing: boolean }): House {
  const [house, setHouse] = useState<HouseView | null>(null);
  const [houseError, setHouseError] = useState<string | null>(null);
  // Odříznutý nováček (newcomers.md): stav volby pána se načte jen u odříznutého rodu
  const [newcomer, setNewcomer] = useState<NewcomerStatusView | null>(null);
  const refreshHouse = useCallback(async (): Promise<void> => {
    try {
      const result = await housePanel();
      if ('error' in result) {
        setHouseError(result.error);
        setNewcomer((known) => known ?? { phase: 'placed' });
        return;
      }
      setHouse(result);
      const status: NewcomerStatusView | { error: string } = result.isolated
        ? await newcomerStatusAction()
        : { phase: 'placed' };
      setNewcomer((known) => ('error' in status ? (known ?? { phase: 'placed' }) : status));
    } catch {
      setHouseError(CONNECTION_FAILED);
      // neznámý stav nováčka nesmí zablokovat založení vsi
      setNewcomer((known) => known ?? { phase: 'placed' });
    }
  }, []);
  useEffect(() => {
    void refreshHouse();
  }, [refreshHouse]);
  // Dialog Odúmrť (úloha 4.10): s panelem rodu se zeptá, jestli hráč jako pán o nějaké odúmrti
  // rozhoduje – jen tehdy se ukáže (počítá se na vyžádání, ne v každém dotazu na ves)
  const [escheats, setEscheats] = useState<EscheatView[] | null>(null);
  const refreshEscheats = useCallback(async (): Promise<void> => {
    try {
      const result = await escheatDialogs();
      setEscheats('error' in result || result.escheats.length === 0 ? null : result.escheats);
    } catch {
      setEscheats(null);
    }
  }, []);
  const closeEscheats = useCallback((): void => setEscheats(null), []);

  // Odříznutý nováček bez vsi, který se právě dostal na mapu světa, mohl dostat sídlo s krajinou
  // z políčka světa (svobodný – world-skeleton.md) – scéna se načte znovu; s vsí se krajina nemění.
  const newcomerPhase = useRef<string | null>(null);
  useEffect(() => {
    const phase = newcomer?.phase ?? null;
    if (newcomerPhase.current === 'isolated' && phase === 'placed' && villageMissing) {
      window.location.reload();
    }
    newcomerPhase.current = phase;
  }, [newcomer, villageMissing]);

  const issueHouseInvite = useCallback(async (): Promise<void> => {
    try {
      const result = await issueInvite();
      setHouseError('error' in result ? result.error : null);
    } catch {
      setHouseError(CONNECTION_FAILED);
    }
    await refreshHouse();
  }, [refreshHouse]);
  const revokeHouseInvite = useCallback(
    async (code: string): Promise<void> => {
      try {
        const result = await revokeInvite({ code });
        setHouseError('error' in result ? result.error : null);
      } catch {
        setHouseError(CONNECTION_FAILED);
      }
      await refreshHouse();
    },
    [refreshHouse],
  );
  // akce jednání: výsledek (důvod odmítnutí česky) se ukáže v panelu, pohled se obnoví
  const negotiate = useCallback(
    async (task: () => Promise<{ ok: true } | { error: string }>): Promise<void> => {
      try {
        const result = await task();
        setHouseError('error' in result ? result.error : null);
      } catch {
        setHouseError(CONNECTION_FAILED);
      }
      await refreshHouse();
    },
    [refreshHouse],
  );

  return {
    view: house,
    error: houseError,
    setError: setHouseError,
    newcomer,
    refresh: refreshHouse,
    escheats,
    refreshEscheats,
    closeEscheats,
    issueInvite: issueHouseInvite,
    revokeInvite: revokeHouseInvite,
    negotiate,
  };
}
