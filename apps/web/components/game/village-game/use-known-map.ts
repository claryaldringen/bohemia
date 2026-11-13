'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GridCell } from '@bohemia/game';
import type { KnownStatus, KnownVillage } from '@/lib/journey-view';
import type { KnownMapActions } from '../hud/KnownMapEye';

// Známá mapa z domova (journey.md – Známá mapa): seznam map, které rod zná, pro oka v panelech,
// a otevřená mapa (scéna `ForeignJourneyScene` ve známém režimu). Seznam se obnoví při vstupu do
// hry, po návratu z mapy a jednou za čas – výjezdy a tažení ho rozšiřují.

const REFRESH_MS = 20_000;

export interface KnownMap {
  /** Co dostanou oka v panelech. */
  actions: KnownMapActions;
  /** Otevřená známá mapa; null – scéna vsi. */
  cell: GridCell | null;
  /** Zpět na ves (⌂). */
  back: () => void;
}

export function useKnownMap(): KnownMap {
  const [known, setKnown] = useState<readonly KnownVillage[]>([]);
  const [status, setStatus] = useState<KnownStatus>('loading');
  const [cell, setCell] = useState<GridCell | null>(null);
  const [last, setLast] = useState<Readonly<Record<string, GridCell>>>({});

  const open = cell === null;
  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = (): void => {
      void fetch('/api/journey?known=villages', { cache: 'no-store' })
        .then((response) => response.json() as Promise<{ known?: KnownVillage[] }>)
        .then((body) => {
          if (!live) return;
          if (body.known) {
            setKnown(body.known);
            setStatus('ready');
          } else setStatus((prev) => (prev === 'ready' ? prev : 'error'));
        })
        .catch(() => {
          // už načtený seznam zůstává platný; selhání před prvním načtením je chyba
          if (live) setStatus((prev) => (prev === 'ready' ? prev : 'error'));
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open]);

  const openCell = useCallback((houseId: string, target: GridCell): void => {
    const opened = { x: target.x, y: target.y };
    setLast((prev) => ({ ...prev, [houseId]: opened }));
    setCell(opened);
  }, []);
  const back = useCallback((): void => setCell(null), []);
  const actions = useMemo(
    () => ({ status, known, last, open: openCell }),
    [status, known, last, openCell],
  );
  return { actions, cell, back };
}
