'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  interpolateExpeditions,
  JOURNEY_POLL_MS,
  type ExpeditionView,
  type JourneyResponse,
} from '@/lib/journey-view';
import { usePolling } from './use-polling';

// Dotazování na výpravy (expeditions.md; plán 2026-11-14 – Úloha 7): 2× za sekundu
// `GET /api/journey`, polohy hloučků mezi dvěma stavy se interpolují. Dotazuje se jen s `running`
// (ves má lidi pryč, nebo právě vyslal rozkaz) a jen ve viditelném panelu prohlížeče (`usePolling`).

/** Jak často se překreslí interpolovaný pohled (scéna si bere `sample` sama). */
const FRAME_MS = 100;

const NONE: ExpeditionView[] = [];

export interface ExpeditionsHandle {
  /** Interpolované pohledy na výpravy; prázdné = ještě nic, nebo žádná neběží. */
  views: ExpeditionView[];
  /**
   * Poslední pohledy ze serveru bez interpolace (nové jen s novým taktem) – scéna vsi si mezi
   * stavy posouvá muže sama (journey-riders.ts).
   */
  latest: ExpeditionView[];
  /** Pohledy v okamžiku `nowMs` (`performance.now()`) – pro scénu, která kreslí ve své smyčce. */
  sample: (nowMs: number) => ExpeditionView[];
  /** Zeptá se hned (po rozkazu). */
  refresh: () => void;
}

/** Klíče všech hloučků pohledů – výprava, skupina a hlouček. */
function groupKeys(views: readonly ExpeditionView[]): Set<string> {
  const keys = new Set<string>();
  for (const v of views) {
    for (const p of v.parties) for (const g of p.groups) keys.add(`${v.journeyId}:${p.id}:${g.id}`);
  }
  return keys;
}

/** Takty pohledů – stejné takty = nic nového (worker ukládá kontrolní bod zřídka). */
const ticksOf = (views: readonly ExpeditionView[]): string =>
  views.map((v) => `${v.journeyId}@${v.tick}`).join('|');

/**
 * `onPartyEnded` se zavolá, když po běžícím dotazu zmizí skupina nebo hlouček (je doma, padl,
 * splynul) – volající obnoví ves a přestane se ptát (`running: false`), až nic neběží.
 */
export function useExpeditions(running: boolean, onPartyEnded?: () => void): ExpeditionsHandle {
  const endedRef = useRef(onPartyEnded);
  useEffect(() => {
    endedRef.current = onPartyEnded;
  }, [onPartyEnded]);
  const prevRef = useRef<ExpeditionView[]>(NONE);
  const nextRef = useRef<ExpeditionView[]>(NONE);
  const receivedRef = useRef(0);
  const spanRef = useRef(JOURNEY_POLL_MS);
  const [views, setViews] = useState<ExpeditionView[]>(NONE);
  const [latest, setLatest] = useState<ExpeditionView[]>(NONE);

  useEffect(() => {
    if (running) return;
    prevRef.current = NONE;
    nextRef.current = NONE;
    setViews(NONE);
    setLatest(NONE);
  }, [running]);

  const sample = useCallback((nowMs: number): ExpeditionView[] => {
    const next = nextRef.current;
    if (next.length === 0) return NONE;
    const t = (nowMs - receivedRef.current) / spanRef.current;
    return interpolateExpeditions(prevRef.current, next, t);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    // výpadek sítě nebo vadná odpověď nesmí zastavit dotazování – zkusí se znovu za chvíli
    let body: JourneyResponse;
    try {
      const response = await fetch('/api/journey', { cache: 'no-store' });
      body = (await response.json()) as JourneyResponse;
    } catch (error) {
      console.warn('Výpravy se nepodařilo načíst.', error);
      return;
    }
    if ('error' in body || !Array.isArray(body.views)) return;
    const now = performance.now();
    const before = nextRef.current;
    const fresh = body.views.length > 0 ? body.views : NONE;
    // zmizela skupina nebo hlouček – ves se obnoví (lidé se vrátili), dotazování běží dál
    const ended = [...groupKeys(before)].some((k) => !groupKeys(fresh).has(k));
    if (fresh.length === 0) {
      prevRef.current = NONE;
      nextRef.current = NONE;
      setViews(NONE);
      setLatest(NONE);
    } else if (ticksOf(before) !== ticksOf(fresh)) {
      // nový stav: odtud se jde z místa, kde je kreslený teď, do nového za dobu mezi dotazy
      prevRef.current = sample(now);
      spanRef.current = Math.max(
        FRAME_MS,
        Math.min(4 * JOURNEY_POLL_MS, now - receivedRef.current || JOURNEY_POLL_MS),
      );
      receivedRef.current = now;
      nextRef.current = fresh;
      setLatest(fresh);
      setViews(sample(now));
    }
    if (ended) endedRef.current?.();
  }, [sample]);

  const refresh = usePolling(poll, () => JOURNEY_POLL_MS, running);

  // plynulý pohyb mezi dotazy
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      if (nextRef.current.length > 0) setViews(sample(performance.now()));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [running, sample]);

  return { views, latest, sample, refresh };
}
