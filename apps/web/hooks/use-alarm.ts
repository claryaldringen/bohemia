'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAlarmView } from '@/app/game/actions';
import type { AlarmView } from '@/lib/alarm-view';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

// Varování vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Úloha 12): server
// action `getAlarmView`. Bez dotazování – server oznámí změnu (server-events.md – Klient): dotaz
// hned při změně vsi, na `alarm` téže vsi (bod tažení s touto vsí mezi varovanými), na `village`
// téže vsi (jen když je co ukazovat), na obnovu po mezeře a na `refresh` – panel vsi (Úloha 13)
// ho volá po příkazu. Dotazy jdou po jednom, náraz událostí dá nejvýš jeden další.

type Load = (input: { villageId: string }) => Promise<AlarmView | null | { error: string }>;

export interface AlarmHandle {
  /** Pohled; null = ještě nic, nebo ves hráč nevidí. */
  view: AlarmView | null;
  /** Poslední chyba dotazu (česky); null – žádná. */
  error: string | null;
  /** Zeptá se hned (po příkazu hráče). */
  refresh: () => void;
}

export function useAlarm(villageId: string | null, load: Load = getAlarmView): AlarmHandle {
  const [view, setView] = useState<AlarmView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<AlarmView | null>(null);
  // ves, na kterou se teď ptáme – odpověď k jiné (hráč mezitím přepnul) se zahodí
  const villageRef = useRef(villageId);

  useEffect(() => {
    villageRef.current = villageId;
    viewRef.current = null;
    setView(null);
    setError(null);
  }, [villageId]);

  const poll = useCallback(async (): Promise<void> => {
    if (villageId === null) return;
    const result = await load({ villageId });
    if (villageRef.current !== villageId) return;
    if (result !== null && 'error' in result) {
      setError(result.error);
      return;
    }
    if (result !== null && result.villageId !== villageId) return;
    viewRef.current = result;
    setView(result);
    setError(null);
  }, [villageId, load]);

  const ask = useSerialRefresh(poll, 'Varování vsi se nepodařilo načíst.');
  const refresh = useCallback((): void => {
    if (villageRef.current !== null) ask();
  }, [ask]);
  // první dotaz hned po výběru vsi
  useEffect(() => {
    if (villageId !== null) refresh();
  }, [villageId, refresh]);
  useServerEvent('alarm', (event) => {
    if (event.villageId === villageRef.current) refresh();
  });
  // změna vsi (lidé na útěku, návrat) – jen když je co ukazovat (varování nebo Vrátit se); nové
  // varování přijde událostí `alarm`
  useServerEvent('village', (event) => {
    const shown = viewRef.current;
    if (
      event.villageId === villageRef.current &&
      shown !== null &&
      (shown.warned || shown.ret !== null)
    )
      refresh();
  });
  useServerResync(refresh);
  return { view, error, refresh };
}
