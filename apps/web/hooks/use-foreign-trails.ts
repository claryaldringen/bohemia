'use client';

import { useEffect, useRef } from 'react';
import type { ForeignMapTrails } from '@/lib/foreign-map';
import type { ForeignTrailsResponse } from '@/lib/war-scene-view';

// Dočtení pokračování stezek cizí mapy (návrh Clauda podle D62 – server cizí stavby mimo dohled
// neposílá): mimo mapu rodu a vazala pošle server jen objevené části os. Když muži objeví víc
// (stopa toho, co o mapě vědí, naroste o `TRAIL_REFRESH_POINTS` bodů), prohlížeč osy dočte –
// jen je, bez krajiny.

/** Po kolika nových bodech stopy se osy dočtou (body po `JOURNEY.trailStepM`). */
const TRAIL_REFRESH_POINTS = 8;

/**
 * Dočte pokračování stezek z `url` (`?map=<x>,<y>&trails`), když stopa `trailLength` naroste;
 * první osy přišly s krajinou (`loaded`), takže hned po načtení se nedočítá. `url` null –
 * nedočítat (mapa rodu či vazala má osy celé, známá mapa je bez nich).
 */
export function useForeignTrails(
  url: string | null,
  loaded: boolean,
  trailLength: number,
  onTrails: (trails: ForeignMapTrails) => void,
): void {
  const step = Math.floor(trailLength / TRAIL_REFRESH_POINTS);
  const shown = useRef<{ url: string; step: number } | null>(null);
  const onTrailsRef = useRef(onTrails);
  useEffect(() => {
    onTrailsRef.current = onTrails;
  }, [onTrails]);
  useEffect(() => {
    if (!url || !loaded) {
      shown.current = null;
      return;
    }
    if (shown.current?.url !== url) {
      shown.current = { url, step };
      return;
    }
    if (shown.current.step === step) return;
    shown.current = { url, step };
    let live = true;
    void fetch(url, { cache: 'no-store' })
      .then((response) => response.json() as Promise<ForeignTrailsResponse>)
      .then((body) => {
        if (live && !('error' in body)) onTrailsRef.current(body.trails);
      })
      .catch(() => {
        // další dočtení přijde s dalšími body stopy
      });
    return () => {
      live = false;
    };
  }, [url, loaded, step]);
}
