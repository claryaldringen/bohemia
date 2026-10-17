'use client';

import { useEffect, useRef } from 'react';

/**
 * Volá `poll` každých `intervalMs`, dokud je panel prohlížeče vidět (ve skrytém stojí, po návratu
 * se zeptá hned). Další dotaz začne až po dokončení předchozího. `enabled: false` = nic.
 */
export function usePolling(poll: () => Promise<void>, intervalMs: number, enabled: boolean): void {
  const pollRef = useRef(poll);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let stopped = false;

    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!stopped && document.visibilityState === 'visible') {
        timer = setTimeout(() => void tick(), intervalMs);
      }
    };
    const tick = async (): Promise<void> => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (running || stopped) return;
      running = true;
      try {
        await pollRef.current();
      } catch (error) {
        console.warn('Stav vsi se nepodařilo načíst.', error);
      } finally {
        running = false;
        schedule();
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void tick();
      else if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
