'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMPAIGN_POLL_MS,
  interpolateCampaign,
  PRESENCE_EVERY_MS,
  type CampaignResponse,
  type CampaignView,
} from '@/lib/campaign-view';
import { usePolling } from './use-polling';

// Dotazování na tažení (plán 2026-11-03 – Úloha 6.14; web-ui.md – Dotazování na tažení): 2× za
// sekundu `GET /api/campaign/<id>?since=<takt>`, polohy mezi dvěma stavy se interpolují. Otevřené
// tažení vůdce hlásí přítomnost (záměr `presence`); zavřená stránka nebo skrytý panel prohlížeče
// = žádná přítomnost a po 1 herním dni vede zástupce (war.md – Velení: Hráč odejde od tažení).

/** Jak často se překreslí interpolovaný pohled (mapa tažení; scéna si bere `sample` sama). */
const FRAME_MS = 100;

export interface CampaignHandle {
  /** Interpolovaný pohled (překreslí se po `FRAME_MS`); null = ještě nic, nebo tažení nezná. */
  view: CampaignView | null;
  /** Pohled v okamžiku `nowMs` (`performance.now()`) – pro scénu, která kreslí ve své smyčce. */
  sample: (nowMs: number) => CampaignView | null;
  /** Tažení hráč nezná nebo skončilo (404). */
  gone: boolean;
  /** Zeptá se hned (po pokynu hráče). */
  refresh: () => void;
}

export function useCampaign(
  campaignId: string | null,
  presence: ((campaignId: string) => Promise<unknown>) | null,
): CampaignHandle {
  const prevRef = useRef<CampaignView | null>(null);
  const nextRef = useRef<CampaignView | null>(null);
  const receivedRef = useRef(0);
  const spanRef = useRef(CAMPAIGN_POLL_MS);
  const [view, setView] = useState<CampaignView | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    prevRef.current = null;
    nextRef.current = null;
    setView(null);
    setGone(false);
  }, [campaignId]);

  const sample = useCallback((nowMs: number): CampaignView | null => {
    const next = nextRef.current;
    if (next === null) return null;
    const t = (nowMs - receivedRef.current) / spanRef.current;
    return interpolateCampaign(prevRef.current, next, t);
  }, []);

  const poll = useCallback(async (): Promise<void> => {
    if (campaignId === null) return;
    const since = nextRef.current?.tick ?? -1;
    const response = await fetch(`/api/campaign/${campaignId}?since=${since}`, {
      cache: 'no-store',
    });
    const body = (await response.json()) as CampaignResponse;
    if ('error' in body) {
      if (response.status === 404) setGone(true);
      return;
    }
    if (!body.view.fresh && nextRef.current !== null) return;
    const now = performance.now();
    // nový stav: odtud se jde z místa, kde je kreslený teď, do nového za dobu mezi dotazy
    prevRef.current = sample(now);
    spanRef.current = Math.max(
      FRAME_MS,
      Math.min(4 * CAMPAIGN_POLL_MS, now - receivedRef.current || CAMPAIGN_POLL_MS),
    );
    receivedRef.current = now;
    nextRef.current = body.view;
    setView(sample(now));
  }, [campaignId, sample]);

  const enabled = campaignId !== null && !gone;
  const refresh = usePolling(poll, () => CAMPAIGN_POLL_MS, enabled);

  // plynulý pohyb mezi dotazy
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (nextRef.current !== null) setView(sample(performance.now()));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [enabled, sample]);

  // přítomnost: jen vůdce, jen otevřené tažení a jen viditelný panel prohlížeče
  const leader = view?.leader === true && view.phase !== 'done' && view.phase !== 'disbanded';
  useEffect(() => {
    if (!enabled || !leader || presence === null || campaignId === null) return;
    const send = (): void => {
      if (document.visibilityState === 'visible') void presence(campaignId).catch(() => {});
    };
    send();
    const timer = setInterval(send, PRESENCE_EVERY_MS);
    document.addEventListener('visibilitychange', send);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', send);
    };
  }, [enabled, leader, presence, campaignId]);

  return { view, sample, gone, refresh };
}
