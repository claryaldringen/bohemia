'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  interpolateJourney,
  JOURNEY_POLL_MS,
  type JourneyResponse,
  type JourneyView,
} from '@/lib/journey-view';
import { usePolling } from './use-polling';

// Dotazování na výjezd vojvody (plán 2026-11-13 – Úloha 7): 2× za sekundu `GET /api/journey`,
// polohy mezi dvěma stavy se interpolují. Dotazuje se jen s `running` (hráč má výjezd – ví to
// pohled na ves, nebo právě vyslal) a jen ve viditelném panelu prohlížeče (`usePolling`).

/** Jak často se překreslí interpolovaný pohled (scéna si bere `sample` sama). */
const FRAME_MS = 100;

export interface JourneyHandle {
  /** Interpolovaný pohled; null = ještě nic, nebo žádný výjezd neběží. */
  view: JourneyView | null;
  /** Pohled v okamžiku `nowMs` (`performance.now()`) – pro scénu, která kreslí ve své smyčce. */
  sample: (nowMs: number) => JourneyView | null;
  /** Zeptá se hned (po rozkazu nebo vyslání). */
  refresh: () => void;
}

/**
 * `onEnded` se zavolá, když pohled po běžícím výjezdu zmizí (skupina je doma) – volající obnoví ves
 * a přestane se ptát (`running: false`).
 */
export function useJourney(running: boolean, onEnded?: () => void): JourneyHandle {
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);
  const prevRef = useRef<JourneyView | null>(null);
  const nextRef = useRef<JourneyView | null>(null);
  const receivedRef = useRef(0);
  const spanRef = useRef(JOURNEY_POLL_MS);
  const [view, setView] = useState<JourneyView | null>(null);

  useEffect(() => {
    if (running) return;
    prevRef.current = null;
    nextRef.current = null;
    setView(null);
  }, [running]);

  const sample = useCallback((nowMs: number): JourneyView | null => {
    const next = nextRef.current;
    if (next === null) return null;
    const t = (nowMs - receivedRef.current) / spanRef.current;
    return interpolateJourney(prevRef.current, next, t);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    // výpadek sítě nebo vadná odpověď nesmí zastavit dotazování – zkusí se znovu za chvíli
    let body: JourneyResponse;
    try {
      const response = await fetch('/api/journey', { cache: 'no-store' });
      body = (await response.json()) as JourneyResponse;
    } catch (error) {
      console.warn('Výjezd vojvody se nepodařilo načíst.', error);
      return;
    }
    if ('error' in body) return;
    const now = performance.now();
    if (body.view === null) {
      const wasRunning = nextRef.current !== null;
      prevRef.current = null;
      nextRef.current = null;
      setView(null);
      if (wasRunning) endedRef.current?.();
      return;
    }
    // pohled se stejným taktem se neposouvá (worker ukládá kontrolní bod zřídka)
    if (nextRef.current?.tick === body.view.tick) return;
    // nový stav: odtud se jde z místa, kde je kreslený teď, do nového za dobu mezi dotazy
    prevRef.current = sample(now);
    spanRef.current = Math.max(
      FRAME_MS,
      Math.min(4 * JOURNEY_POLL_MS, now - receivedRef.current || JOURNEY_POLL_MS),
    );
    receivedRef.current = now;
    nextRef.current = body.view;
    setView(sample(now));
  }, [sample]);

  const refresh = usePolling(poll, () => JOURNEY_POLL_MS, running);

  // plynulý pohyb mezi dotazy
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (nextRef.current !== null) setView(sample(performance.now()));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [running, sample]);

  return { view, sample, refresh };
}
