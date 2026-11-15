'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JOURNEY_POLL_MS,
  VISITORS_IDLE_MS,
  type ExpeditionVisitor,
  type JourneyVisitorsResponse,
} from '@/lib/journey-view';
import { usePolling } from './use-polling';

// Jezdci na mapě vsi (lord-control.md – Soused; journey.md – Scéna vsi): `GET /api/journey?visitors=`
// – vlastní výjezd vždy, cizí jen v dohledu domů. S jezdci na mapě 2× za sekundu, jinak po 5 s
// (jako válka ve scéně – use-war-scene.ts); jen když dotaz na ves hlásí výpravu na mapě
// (`MapWatch.riders`, D62 – `enabled`), jinak vůbec. Nový seznam jen při změně taktu nebo výjezdů.

const NONE: ExpeditionVisitor[] = [];

/** Klíč seznamu – skupiny a jejich takty (stejný klíč = scéna se nepřekresluje). */
function visitorsKey(list: readonly ExpeditionVisitor[]): string {
  return list.map((v) => `${v.journeyId}:${v.partyId}:${v.tick}:${v.people.length}`).join('|');
}

/** Jezdci na mapě vsi `villageId`; vypnuté dotazování nebo bez vsi = prázdno. */
export function useJourneyVisitors(
  villageId: string | null,
  enabled: boolean,
): ExpeditionVisitor[] {
  const [visitors, setVisitors] = useState<ExpeditionVisitor[]>(NONE);
  // klíč posledního seznamu; null – server ještě neodpověděl
  const keyRef = useRef<string | null>(null);

  // jiná ves nebo vypnuté dotazování – po zapnutí se zeptá hned (ne až po 5 s)
  useEffect(() => {
    keyRef.current = null;
    setVisitors(NONE);
  }, [villageId, enabled]);

  const poll = useCallback(async (): Promise<void> => {
    if (villageId === null) return;
    // výpadek sítě nebo vadná odpověď nesmí zastavit dotazování – zkusí se znovu za chvíli
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
    const key = visitorsKey(body.visitors);
    if (key === keyRef.current) return;
    keyRef.current = key;
    setVisitors(body.visitors.length > 0 ? body.visitors : NONE);
  }, [villageId]);

  // s jezdci na mapě 2× za sekundu, jinak po 5 s (poprvé hned po otevření mapy)
  const delay = useCallback(
    (): number => (keyRef.current !== '' ? JOURNEY_POLL_MS : VISITORS_IDLE_MS),
    [],
  );
  const on = enabled && villageId !== null;
  usePolling(poll, delay, on);
  return on ? visitors : NONE;
}
