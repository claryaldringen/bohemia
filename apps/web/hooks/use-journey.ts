'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  expeditionsKey,
  interpolateExpeditions,
  JOURNEY_PUSH_MS,
  type ExpeditionView,
  type JourneyResponse,
} from '@/lib/journey-view';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

// Výpravy (expeditions.md; plán 2026-11-14 – Úloha 7; plán 2026-11-15 – Úloha 4): stav nese událost
// serveru `journeys` (server-events.md – Výpravy), polohy hloučků mezi dvěma stavy se interpolují.
// Jeden `GET /api/journey` jde, když `running` začne platit, na obnovu po mezeře (`sync`) a na
// `refresh`. Události se používají jen s `running` (ves má lidi pryč, nebo právě vyslal rozkaz).

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
  const spanRef = useRef(JOURNEY_PUSH_MS);
  const runningRef = useRef(running);
  const [views, setViews] = useState<ExpeditionView[]>(NONE);
  const [latest, setLatest] = useState<ExpeditionView[]>(NONE);

  useEffect(() => {
    runningRef.current = running;
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

  /** Nový stav ze serveru (událost, nebo dotaz) – interpolace, `latest` a konec hloučku. */
  const apply = useCallback(
    (incoming: ExpeditionView[]): void => {
      const now = performance.now();
      const before = nextRef.current;
      const fresh = incoming.length > 0 ? incoming : NONE;
      // zmizela skupina nebo hlouček – ves se obnoví (lidé se vrátili), události běží dál
      const freshKeys = groupKeys(fresh);
      const ended = [...groupKeys(before)].some((k) => !freshKeys.has(k));
      if (fresh.length === 0) {
        prevRef.current = NONE;
        nextRef.current = NONE;
        setViews(NONE);
        setLatest(NONE);
      } else if (expeditionsKey(before) !== expeditionsKey(fresh)) {
        // nový stav: odtud se jde z místa, kde je kreslený teď, do nového za dobu mezi stavy
        prevRef.current = sample(now);
        spanRef.current = Math.max(
          FRAME_MS,
          Math.min(
            4 * JOURNEY_PUSH_MS,
            receivedRef.current === 0 ? JOURNEY_PUSH_MS : now - receivedRef.current,
          ),
        );
        receivedRef.current = now;
        nextRef.current = fresh;
        setLatest(fresh);
        setViews(sample(now));
      }
      if (ended) endedRef.current?.();
    },
    [sample],
  );

  const load = useCallback(async (): Promise<void> => {
    // výpadek sítě nebo vadná odpověď nesmí nic rozbít – stav doplní další událost nebo obnova
    let body: JourneyResponse;
    try {
      const response = await fetch('/api/journey', { cache: 'no-store' });
      body = (await response.json()) as JourneyResponse;
    } catch (error) {
      console.warn('Výpravy se nepodařilo načíst.', error);
      return;
    }
    if ('error' in body || !Array.isArray(body.views)) return;
    if (runningRef.current) apply(body.views);
  }, [apply]);

  const ask = useSerialRefresh(load, 'Výpravy se nepodařilo načíst.');
  const refresh = useCallback((): void => {
    if (runningRef.current) ask();
  }, [ask]);
  // první dotaz, když ves hlásí výpravu (a po novém rozkazu, který `running` zapne)
  useEffect(() => {
    if (running) ask();
  }, [running, ask]);
  useServerEvent('journeys', (event) => {
    if (runningRef.current) apply(event.views);
  });
  useServerResync(refresh);

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
