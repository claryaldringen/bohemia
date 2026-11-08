'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WAR_SCENE_IDLE_MS,
  WAR_SCENE_POLL_MS,
  type WarSceneResponse,
  type WarSceneView,
} from '@/lib/war-scene-view';
import { usePolling } from './use-polling';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru; web-ui.md – Dotazování na
// válku ve scéně): `GET /api/war-scene/<sídlo>` – při válce na mapě 2× za sekundu, jinak po 5 s.
// Nový stav jen při novém taktu nebo jiném tažení (scéna se zbytečně nepřekresluje).

export function useWarScene(settlementId: string, enabled: boolean): WarSceneView | null {
  const [war, setWar] = useState<WarSceneView | null>(null);
  const lastRef = useRef<WarSceneView | null>(null);
  const polledRef = useRef(false);

  useEffect(() => {
    lastRef.current = null;
    polledRef.current = false;
    setWar(null);
  }, [settlementId]);

  const poll = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/war-scene/${settlementId}`, { cache: 'no-store' });
    const body = (await response.json()) as WarSceneResponse;
    polledRef.current = true;
    if ('error' in body) return;
    const last = lastRef.current;
    const next = body.war;
    if (last === next) return;
    if (last && next && last.campaignId === next.campaignId && last.tick === next.tick) return;
    lastRef.current = next;
    setWar(next);
  }, [settlementId]);

  const delay = useCallback(
    // poprvé hned po otevření hry, pak podle toho, jestli je na mapě válka
    (): number => (!polledRef.current || lastRef.current ? WAR_SCENE_POLL_MS : WAR_SCENE_IDLE_MS),
    [],
  );
  usePolling(poll, delay, enabled);
  return enabled ? war : null;
}
