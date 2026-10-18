'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Volá `poll` za `delayMs()` ms po předchozím dotazu (`delayMs` se zeptá po každém dotazu znovu –
 * např. na začátek dalšího herního dne), dokud je panel prohlížeče vidět (ve skrytém stojí, po
 * návratu se zeptá hned). Další dotaz začne až po dokončení předchozího. `enabled: false` = nic.
 * Vrátí funkci, která se zeptá hned (běží-li dotaz, hned po něm).
 */
export function usePolling(
  poll: () => Promise<void>,
  delayMs: () => number,
  enabled: boolean,
): () => void {
  const pollRef = useRef(poll);
  const delayRef = useRef(delayMs);
  const nowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pollRef.current = poll;
    delayRef.current = delayMs;
  }, [poll, delayMs]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let again = false;
    let stopped = false;

    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!stopped && document.visibilityState === 'visible') {
        timer = setTimeout(() => void tick(), delayRef.current());
      }
    };
    const tick = async (): Promise<void> => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await pollRef.current();
      } catch (error) {
        console.warn('Stav vsi se nepodařilo načíst.', error);
      } finally {
        running = false;
        if (again) {
          again = false;
          void tick();
        } else schedule();
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void tick();
      else if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    nowRef.current = () => void tick();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      nowRef.current = null;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return useCallback(() => nowRef.current?.(), []);
}
