'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WAR_SCENE_IDLE_MS,
  WAR_SCENE_POLL_MS,
  type WarSceneResponse,
  type WarSceneView,
} from '@/lib/war-scene-view';
import { usePolling } from './use-polling';

// Válka ve scéně (war.md – Ve scéně – napojení na hru; web-ui.md – Dotazování na válku ve scéně):
// vlastní mapa `GET /api/war-scene/<sídlo>`, cizí mapa `GET /api/campaign/<id>?scene=x,y` – při
// válce na mapě 2× za sekundu, jinak po 5 s; vlastní mapa jen, když dotaz na ves hlásí válku na mapě
// (`MapWatch.war`, D62 – `enabled`), jinak vůbec. Nový stav jen při novém taktu nebo jiném tažení
// (scéna se zbytečně nepřekresluje).

/**
 * Válka na mapě z dotazu `url`: undefined – server ještě neodpověděl, null – na mapě nic není.
 * Vypnuté dotazování = null.
 */
export function useWarScene(url: string, enabled: boolean): WarSceneView | null | undefined {
  const [war, setWar] = useState<WarSceneView | null | undefined>(undefined);
  const lastRef = useRef<WarSceneView | null | undefined>(undefined);

  // jiná mapa nebo vypnuté dotazování – po zapnutí se zeptá hned (ne až po 5 s)
  useEffect(() => {
    lastRef.current = undefined;
    setWar(undefined);
  }, [url, enabled]);

  const poll = useCallback(async (): Promise<void> => {
    const response = await fetch(url, { cache: 'no-store' });
    const body = (await response.json()) as WarSceneResponse;
    if ('error' in body) return;
    const last = lastRef.current;
    const next = body.war;
    if (last === next) return;
    if (last && next && last.campaignId === next.campaignId && last.tick === next.tick) return;
    lastRef.current = next;
    setWar(next);
  }, [url]);

  const delay = useCallback(
    // poprvé hned po otevření mapy, pak podle toho, jestli je na mapě válka
    (): number => (lastRef.current !== null ? WAR_SCENE_POLL_MS : WAR_SCENE_IDLE_MS),
    [],
  );
  usePolling(poll, delay, enabled);
  return enabled ? war : null;
}
