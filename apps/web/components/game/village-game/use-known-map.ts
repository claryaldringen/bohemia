'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { GridCell } from '@bohemia/game';
import type { KnownStatus, KnownVillage } from '@/lib/journey-view';
import type { KnownMapActions } from '../hud/KnownMapEye';

// Známá mapa z domova (journey.md – Známá mapa): seznam map, které rod zná, pro oka v panelech,
// a otevřená mapa (scéna `ForeignJourneyScene` ve známém režimu). Seznam se čte jen pro otevřený
// panel s oky (Rod a vazalové, Vojsko – `useKnownMapList`): při jeho otevření a po návratu ze známé
// mapy, bez dotazování na pozadí (závěrečná recenze – Important 5).

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
  /** Otevřené panely s oky, běžící dotaz a jestli je otevřená známá mapa (dotaz jen ze vsi). */
  const wanted = useRef(0);
  const loading = useRef(false);
  const away = useRef(false);

  const load = useCallback((): void => {
    if (loading.current || away.current) return;
    loading.current = true;
    void fetch('/api/journey?known=villages', { cache: 'no-store' })
      .then((response) => response.json() as Promise<{ known?: KnownVillage[] }>)
      .then((body) => {
        if (body.known) {
          setKnown(body.known);
          setStatus('ready');
        } else setStatus((prev) => (prev === 'ready' ? prev : 'error'));
      })
      .catch(() => {
        // už načtený seznam zůstává platný; selhání před prvním načtením je chyba
        setStatus((prev) => (prev === 'ready' ? prev : 'error'));
      })
      .finally(() => {
        loading.current = false;
      });
  }, []);

  const register = useCallback((): (() => void) => {
    wanted.current++;
    load();
    return () => {
      wanted.current--;
    };
  }, [load]);
  const openCell = useCallback((houseId: string, target: GridCell): void => {
    const opened = { x: target.x, y: target.y };
    away.current = true;
    setLast((prev) => ({ ...prev, [houseId]: opened }));
    setCell(opened);
  }, []);
  const back = useCallback((): void => {
    away.current = false;
    setCell(null);
    // panel, který zůstal otevřený, dostane čerstvý seznam (výjezd mezitím mohl mapu rozšířit)
    if (wanted.current > 0) load();
  }, [load]);
  const actions = useMemo(
    () => ({ status, known, last, open: openCell, register }),
    [status, known, last, openCell, register],
  );
  return { actions, cell, back };
}
