'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { warSceneKey, type WarSceneResponse, type WarSceneView } from '@/lib/war-scene-view';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

// Válka ve scéně (war.md – Ve scéně – napojení na hru; web-ui.md – Válka ve scéně): stav nese
// událost serveru `war` s klíčem mapy (`warKeyOfSettlement` / `warKeyOfScene`, server-events.md –
// Válka) – po mlze války, jen když hráč smí vidět. Jeden dotaz na `url` (vlastní mapa
// `GET /api/war-scene/<sídlo>`, cizí `GET /api/campaign/<id>?scene=x,y`) jde při zapnutí, změně
// klíče a na obnovu po mezeře (`sync`); `enabled` řídí jen dotaz, událost svého klíče platí vždy.
// Nový stav jen při novém taktu nebo jiném tažení (scéna se zbytečně nepřekresluje).

/**
 * Válka na mapě s klíčem `key`: undefined – ještě nic nepřišlo, null – na mapě nic není.
 */
export function useWarScene(
  key: string,
  url: string,
  enabled: boolean,
): WarSceneView | null | undefined {
  const [war, setWar] = useState<WarSceneView | null | undefined>(undefined);
  const lastRef = useRef<WarSceneView | null | undefined>(undefined);
  const keyRef = useRef(key);
  /**
   * Počet událostí tohoto klíče – odpověď dotazu, během kterého přišla událost, se zahodí:
   * událost je stejně čerstvá nebo novější a cokoli novějšího server pošle sám.
   */
  const eventsRef = useRef(0);
  const onRef = useRef(enabled);
  onRef.current = enabled;

  // jiná mapa – stav se zahodí; přepnutí `enabled` ho nemění (událost platí vždy)
  useEffect(() => {
    keyRef.current = key;
    lastRef.current = undefined;
    setWar(undefined);
  }, [key]);

  const apply = useCallback((next: WarSceneView | null): void => {
    const last = lastRef.current;
    if (last !== undefined && warSceneKey(last) === warSceneKey(next)) return;
    lastRef.current = next;
    setWar(next);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const seen = eventsRef.current;
    // výpadek sítě nebo vadná odpověď nesmí nic rozbít – stav doplní další událost nebo obnova
    let body: WarSceneResponse;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      body = (await response.json()) as WarSceneResponse;
    } catch (error) {
      console.warn('Válku ve scéně se nepodařilo načíst.', error);
      return;
    }
    if ('error' in body || !('war' in body)) return;
    // jiná mapa (hráč mezitím přepnul), nebo mezitím přišla událost – ta má přednost
    if (keyRef.current !== key || eventsRef.current !== seen) return;
    apply(body.war);
  }, [key, url, apply]);

  const ask = useSerialRefresh(load, 'Válku ve scéně se nepodařilo načíst.');
  const refresh = useCallback((): void => {
    if (onRef.current) ask();
  }, [ask]);
  useEffect(() => {
    if (enabled) ask();
  }, [enabled, key, ask]);
  // událost platí vždy, když sedí klíč – server ji posílá jen spojením, která smí válku vidět
  useServerEvent('war', (event) => {
    if (event.key !== keyRef.current) return;
    eventsRef.current++;
    apply(event.war);
  });
  useServerResync(refresh);
  return war;
}
