'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  visitorsKey,
  type ExpeditionVisitor,
  type JourneyVisitorsResponse,
} from '@/lib/journey-view';
import { useSerialRefresh, useServerEvent, useServerResync } from './use-server-events';

// Jezdci na mapě vsi (lord-control.md – Soused; journey.md – Scéna vsi): vlastní výjezd vždy, cizí
// jen v dohledu domů. Seznam nese událost serveru `visitors` (server-events.md – Výpravy); jeden
// `GET /api/journey?visitors=` jde při zapnutí, změně vsi a na obnovu po mezeře (`sync`). Jen když
// dotaz na ves hlásí výpravu na mapě (`MapWatch.riders`, D62 – `enabled`), jinak vůbec. Nový seznam
// jen při změně taktu nebo výjezdů.

const NONE: ExpeditionVisitor[] = [];

/** Jezdci na mapě vsi `villageId`; vypnuté dotazování nebo bez vsi = prázdno. */
export function useJourneyVisitors(
  villageId: string | null,
  enabled: boolean,
): ExpeditionVisitor[] {
  const [visitors, setVisitors] = useState<ExpeditionVisitor[]>(NONE);
  // klíč posledního seznamu; null – server ještě neodpověděl
  const keyRef = useRef<string | null>(null);
  const villageRef = useRef(villageId);
  const on = enabled && villageId !== null;
  const onRef = useRef(on);

  // jiná ves nebo vypnuté sledování – po zapnutí se zeptá hned
  useEffect(() => {
    villageRef.current = villageId;
    onRef.current = on;
    keyRef.current = null;
    setVisitors(NONE);
  }, [villageId, on]);

  const apply = useCallback((list: readonly ExpeditionVisitor[]): void => {
    const key = visitorsKey(list);
    if (key === keyRef.current) return;
    keyRef.current = key;
    setVisitors(list.length > 0 ? [...list] : NONE);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (villageId === null) return;
    // výpadek sítě nebo vadná odpověď nesmí nic rozbít – stav doplní další událost nebo obnova
    let body: JourneyVisitorsResponse;
    try {
      const response = await fetch(`/api/journey?visitors=${encodeURIComponent(villageId)}`, {
        cache: 'no-store',
      });
      body = (await response.json()) as JourneyVisitorsResponse;
    } catch (error) {
      console.warn('Jezdce na mapě se nepodařilo načíst.', error);
      return;
    }
    if ('error' in body || !Array.isArray(body.visitors)) return;
    // odpověď k jiné vsi (hráč mezitím přepnul) se zahodí
    if (villageRef.current === villageId && onRef.current) apply(body.visitors);
  }, [villageId, apply]);

  const ask = useSerialRefresh(load, 'Jezdce na mapě se nepodařilo načíst.');
  const refresh = useCallback((): void => {
    if (onRef.current) ask();
  }, [ask]);
  useEffect(() => {
    if (on) ask();
  }, [on, villageId, ask]);
  useServerEvent('visitors', (event) => {
    if (onRef.current && event.villageId === villageRef.current) apply(event.visitors);
  });
  useServerResync(refresh);
  return on ? visitors : NONE;
}
