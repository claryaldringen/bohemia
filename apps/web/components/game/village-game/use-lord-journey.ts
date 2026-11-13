'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEAT_CELL, type GridCell, type JourneyCandidate } from '@bohemia/game';
import { commandJourney, getJourneyCandidates, launchJourney } from '@/app/game/actions/journey';
import { useJourney, type JourneyHandle } from '@/hooks/use-journey';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { edgeDirection, orderFromClick } from '@/lib/scene/journey-orders';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageView } from '@/lib/village-view';
import type { LordJourneyUi } from '../hud/LordJourneyPanel';

// Ovládání vojvody ve scéně vsi (lord-control.md – Rozkazy, Co hráč vidí; plán 2026-11-13 – Úloha
// 8a): vybraný vojvoda doma → řada mužů rodu k družině, pravé tlačítko do krajiny ho vyšle; na cestě
// ho pravé tlačítko přesměruje a Domů vrací. Herní pravidla a ověření rozkazu má server – tady jen
// výběr, rozkaz z kliknutí (`orderFromClick`) a texty u kurzoru.

/** Tvar kurzoru u okraje mapy – šipka ve směru přechodu. */
const EDGE_CURSORS = {
  N: 'n-resize',
  NE: 'ne-resize',
  E: 'e-resize',
  SE: 'se-resize',
  S: 's-resize',
  SW: 'sw-resize',
  W: 'w-resize',
  NW: 'nw-resize',
} as const;

/** Jak dlouho zůstane důvod odmítnutí u kurzoru (ms). */
const NOTE_MS = 2500;

export interface CursorNote {
  text: string;
  tone: 'info' | 'error';
  screen: { x: number; y: number };
}

export interface LordJourney {
  /** Dotazování na výjezd (pohled pro scénu a panel). */
  journey: JourneyHandle;
  /** Ovládání do panelu výběru, je-li vybraný vojvoda; jinak null. */
  panel: LordJourneyUi | null;
  /** Vojvoda na výjezdu pro horní lištu (portrét s podkovou). */
  away: { name: string | null; selected: boolean; onSelect: () => void } | null;
  /** Popisek u kurzoru: „Na sousední mapu“ u okraje, nebo důvod odmítnutí rozkazu. */
  note: CursorNote | null;
}

export function useLordJourney({
  scene,
  view,
  selected,
  setSelected,
  homeCell,
  mapSizeM,
  refreshVillage,
}: {
  scene: LandscapeScene | null;
  view: VillageView | null;
  selected: VillageTarget | null;
  setSelected: (target: VillageTarget | null) => void;
  homeCell: GridCell | null;
  /** Strana mapy krajiny v metrech (okrajový pás rozkazu). */
  mapSizeM: number;
  refreshVillage: () => void;
}): LordJourney {
  const lordId = view?.dynasty?.lordId ?? null;
  const journeyAway = view?.dynasty?.journeyAway === true;
  const villageId = view?.id ?? null;
  const lordSelected = lordId !== null && selected?.kind === 'person' && selected.id === lordId;

  // Dotazujeme se, dokud vojvoda je pryč (ves to ví) nebo právě vyjel; po návratu (pohled zmizí)
  // se ves obnoví a dotazy stojí, dokud ves návrat nepotvrdí.
  const [launched, setLaunched] = useState(false);
  const [ended, setEnded] = useState(false);
  const onEnded = useCallback((): void => {
    setEnded(true);
    setLaunched(false);
    refreshVillage();
  }, [refreshVillage]);
  useEffect(() => {
    if (!journeyAway && ended) setEnded(false);
  }, [journeyAway, ended]);
  const running = (journeyAway || launched) && !ended;
  const journey = useJourney(running, onEnded);
  const journeyView = journey.view;
  const refreshJourney = journey.refresh;

  // Kandidáti na družinu – jen u vybraného vojvody doma
  const [candidates, setCandidates] = useState<{
    refusal: string | null;
    lord: JourneyCandidate | null;
    men: JourneyCandidate[];
  } | null>(null);
  const [retinue, setRetinue] = useState<ReadonlySet<number>>(new Set());
  const dayIndex = view?.dayIndex ?? null;
  useEffect(() => {
    if (!lordSelected || journeyAway || launched || villageId === null) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    void getJourneyCandidates(villageId).then((result) => {
      if (cancelled) return;
      if ('error' in result) {
        setCandidates({ refusal: result.error, lord: null, men: [] });
        return;
      }
      setCandidates({ refusal: result.reason, lord: result.lord, men: result.men });
      // z družiny vypadnou muži, kteří už nemohou jet
      setRetinue(
        (prev) => new Set([...prev].filter((id) => result.men.some((m) => m.personId === id))),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [lordSelected, journeyAway, launched, villageId, dayIndex]);
  useEffect(() => {
    if (!lordSelected) setRetinue(new Set());
  }, [lordSelected]);

  // Popisek u kurzoru
  const [note, setNote] = useState<CursorNote | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showError = useCallback((text: string, screen: { x: number; y: number }): void => {
    if (noteTimer.current !== null) clearTimeout(noteTimer.current);
    setNote({ text, tone: 'error', screen });
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);
  useEffect(
    () => () => {
      if (noteTimer.current !== null) clearTimeout(noteTimer.current);
    },
    [],
  );

  // Pravé tlačítko do krajiny. Skupina na domovské mapě: rozkaz z kliknutí do scény; jinde (jiná
  // mapa) zůstává pravé tlačítko ve vsi beze změny – domů ji pošle ikona.
  const orderCell: GridCell | null = journeyView ? journeyView.home : (homeCell ?? SEAT_CELL);
  const onHomeMap =
    journeyView === null ||
    (journeyView.cell.x === journeyView.home.x && journeyView.cell.y === journeyView.home.y);
  const controllable = journeyAway
    ? journeyView?.controllable === true
    : candidates?.refusal === null;
  const retinueRef = useRef(retinue);
  useEffect(() => {
    retinueRef.current = retinue;
  }, [retinue]);
  useEffect(() => {
    if (!scene || !lordSelected || !controllable || !onHomeMap || orderCell === null) return;
    if (villageId === null) return;
    scene.setLordMode({
      order: (point, screen) => {
        const order = orderFromClick({ lordSelected: true, point, mapSizeM, cell: orderCell });
        if (order === null) return;
        const sent = journeyAway
          ? commandJourney(order).then((r) => ('error' in r ? r.error : null))
          : launchJourney({ villageId, retinue: [...retinueRef.current], order }).then((r) => {
              if ('error' in r) return r.error;
              setLaunched(true);
              refreshVillage();
              return null;
            });
        void sent.then((failure) => {
          if (failure !== null) showError(failure, screen);
          else refreshJourney();
        });
      },
      hover: (point, screen) => {
        const direction = point ? edgeDirection(point, mapSizeM) : null;
        setNote((prev) => {
          if (direction === null || screen === null) return prev?.tone === 'info' ? null : prev;
          return { text: 'Na sousední mapu', tone: 'info', screen };
        });
        return direction === null ? '' : EDGE_CURSORS[direction];
      },
    });
    return () => scene.setLordMode(null);
  }, [
    scene,
    lordSelected,
    controllable,
    onHomeMap,
    orderCell,
    mapSizeM,
    villageId,
    journeyAway,
    refreshVillage,
    refreshJourney,
    showError,
  ]);

  const toggle = useCallback((personId: number): void => {
    setRetinue((prev) => {
      const next = new Set(prev);
      if (!next.delete(personId)) next.add(personId);
      return next;
    });
  }, []);
  const goHome = useCallback((): void => {
    void commandJourney({ kind: 'home' }).then((r) => {
      if ('error' in r) showError(r.error, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      else refreshJourney();
    });
  }, [refreshJourney, showError]);

  let panel: LordJourneyUi | null = null;
  if (lordSelected && journeyAway) {
    if (journeyView?.controllable) {
      panel = {
        mode: 'away',
        lord: null,
        men: [],
        reason: null,
        retinue,
        onToggle: toggle,
        onHome: goHome,
      };
    }
  } else if (lordSelected && candidates) {
    panel = {
      mode: 'home',
      lord: candidates.lord,
      men: candidates.men,
      reason: candidates.refusal,
      retinue,
      onToggle: toggle,
      onHome: goHome,
    };
  }
  const away =
    journeyAway && !ended && lordId !== null
      ? {
          name: view?.dynasty?.lordName ?? null,
          selected: lordSelected,
          onSelect: () => setSelected({ kind: 'person', id: lordId }),
        }
      : null;
  return { journey, panel, away, note };
}
