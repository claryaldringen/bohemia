'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMPAIGN_SPAN_MAX_MS,
  interpolateCampaign,
  type CampaignResponse,
  type CampaignView,
} from '@/lib/campaign-view';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

// Tažení (plán 2026-11-03 – Úloha 6.14; plán 2026-11-15 – Úloha 5; web-ui.md – Dotazování na
// tažení): pohled nese událost serveru `campaign` (server-events.md – Válka), polohy mezi dvěma
// stavy se interpolují. Jeden `GET /api/campaign/<id>?since=-1` jde při otevření, na obnovu po
// mezeře (`sync`) a na `refresh`. Přítomnost vůdce hlásí server z otevřeného spojení s tažením
// v rozsahu (`CampaignMap` – `useEventScope`); zavřená stránka nebo skrytý panel = žádné spojení,
// žádná přítomnost a po 1 herním dni vede zástupce (war.md – Velení: Hráč odejde od tažení).

/** Jak často se překreslí interpolovaný pohled (mapa tažení; scéna si bere `sample` sama). */
const FRAME_MS = 100;

export interface CampaignHandle {
  /** Interpolovaný pohled (překreslí se po `FRAME_MS`); null = ještě nic, nebo tažení nezná. */
  view: CampaignView | null;
  /** Pohled v okamžiku `nowMs` (`performance.now()`) – pro scénu, která kreslí ve své smyčce. */
  sample: (nowMs: number) => CampaignView | null;
  /** Tažení hráč nezná nebo skončilo (404, událost s `view: null`). */
  gone: boolean;
  /** Zeptá se hned (po pokynu hráče). */
  refresh: () => void;
}

/** Novější pohled než `last`? Vyšší takt, nebo v témž taktu jiná fáze (jako `since` dřív). */
function isNewer(last: CampaignView | null, next: CampaignView): boolean {
  return (
    last === null || next.tick > last.tick || (next.tick === last.tick && next.phase !== last.phase)
  );
}

export function useCampaign(campaignId: string | null): CampaignHandle {
  const prevRef = useRef<CampaignView | null>(null);
  const nextRef = useRef<CampaignView | null>(null);
  const receivedRef = useRef(0);
  const spanRef = useRef(CAMPAIGN_SPAN_MAX_MS);
  const idRef = useRef(campaignId);
  const [view, setView] = useState<CampaignView | null>(null);
  const [gone, setGone] = useState(false);
  const on = campaignId !== null && !gone;
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    idRef.current = campaignId;
    prevRef.current = null;
    nextRef.current = null;
    receivedRef.current = 0;
    setView(null);
    setGone(false);
  }, [campaignId]);

  const sample = useCallback((nowMs: number): CampaignView | null => {
    const next = nextRef.current;
    if (next === null) return null;
    const t = (nowMs - receivedRef.current) / spanRef.current;
    return interpolateCampaign(prevRef.current, next, t);
  }, []);

  /** Nový pohled ze serveru (událost, nebo dotaz) – starší nebo týž takt se zahodí. */
  const apply = useCallback(
    (incoming: CampaignView): void => {
      if (!isNewer(nextRef.current, incoming)) return;
      const now = performance.now();
      // odtud se jde z místa, kde je kreslený teď, do nového za dobu mezi body (≈ 10 s)
      prevRef.current = sample(now);
      spanRef.current = Math.max(
        FRAME_MS,
        Math.min(CAMPAIGN_SPAN_MAX_MS, now - receivedRef.current),
      );
      receivedRef.current = now;
      nextRef.current = incoming;
      setView(sample(now));
    },
    [sample],
  );

  const load = useCallback(async (): Promise<void> => {
    if (campaignId === null) return;
    // výpadek sítě nebo vadná odpověď nesmí nic rozbít – stav doplní další událost nebo obnova
    let status: number;
    let body: CampaignResponse;
    try {
      const response = await fetch(`/api/campaign/${campaignId}?since=-1`, { cache: 'no-store' });
      status = response.status;
      body = (await response.json()) as CampaignResponse;
    } catch (error) {
      console.warn('Tažení se nepodařilo načíst.', error);
      return;
    }
    // odpověď k jinému tažení (hráč mezitím přepnul) se zahodí
    if (idRef.current !== campaignId) return;
    if ('error' in body) {
      if (status === 404) setGone(true);
      return;
    }
    apply(body.view);
  }, [campaignId, apply]);

  const ask = useSerialRefresh(load, 'Tažení se nepodařilo načíst.');
  const refresh = useCallback((): void => {
    if (onRef.current) ask();
  }, [ask]);
  useEffect(() => {
    if (campaignId !== null) ask();
  }, [campaignId, ask]);
  // událost platí vždy, když sedí tažení – server ji posílá jen spojení s tímto tažením v rozsahu
  useServerEvent('campaign', (event) => {
    if (event.campaignId !== idRef.current) return;
    if (event.view === null) setGone(true);
    else apply(event.view);
  });
  useServerResync(refresh);

  // plynulý pohyb mezi body
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => {
      if (nextRef.current !== null) setView(sample(performance.now()));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [on, sample]);

  return { view, sample, gone, refresh };
}
