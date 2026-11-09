'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAlarmView } from '@/app/game/actions';
import { alarmPollMs, type AlarmView } from '@/lib/alarm-view';
import { usePolling } from './use-polling';

// Dotazování na varování vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 12): server action `getAlarmView` – při varování nebo s lidmi na útěku každé 2 s (posel,
// skupina, lhůta hráče 1 herní den), jinak každých 10 s (`alarmPollMs`). Panel vsi (Úloha 13) po
// příkazu zavolá `refresh`.

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

  useEffect(() => {
    viewRef.current = null;
    setView(null);
    setError(null);
  }, [villageId]);

  const poll = useCallback(async (): Promise<void> => {
    if (villageId === null) return;
    const result = await load({ villageId });
    if (result !== null && 'error' in result) {
      setError(result.error);
      return;
    }
    // odpověď na dotaz k jiné vsi (hráč mezitím přepnul) se zahodí
    if (result !== null && result.villageId !== villageId) return;
    viewRef.current = result;
    setView(result);
    setError(null);
  }, [villageId, load]);

  const delay = useCallback((): number => alarmPollMs(viewRef.current), []);
  const refresh = usePolling(poll, delay, villageId !== null);
  // první dotaz hned (dotazování začíná až po prodlevě)
  useEffect(() => {
    if (villageId !== null) refresh();
  }, [villageId, refresh]);
  return { view, error, refresh };
}
