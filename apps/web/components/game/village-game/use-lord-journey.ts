'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SEAT_CELL, type GridCell, type JourneyCandidate } from '@bohemia/game';
import { commandJourney, getJourneyCandidates, launchJourney } from '@/app/game/actions/journey';
import { useExpeditions, type ExpeditionsHandle } from '@/hooks/use-journey';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { edgeDirection, lordClick, orderFromClick } from '@/lib/scene/journey-orders';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { foreignJourneySelection, watchedJourneyCell } from '@/lib/journey-scene-view';
import { journeyReason, lordJourneyViewOf, type JourneyView } from '@/lib/journey-view';
import type { VillageView } from '@/lib/village-view';
import type { LordJourneyUi } from '../hud/LordJourneyPanel';

// Ovládání vojvody ve scéně vsi (lord-control.md – Rozkazy, Co hráč vidí; plán 2026-11-13 – Úloha
// 8a): vybraný vojvoda doma → řada mužů rodu k družině, pravé tlačítko do krajiny ho vyšle; na cestě
// ho pravé tlačítko přesměruje a Domů vrací – i na cizí mapě, kam scéna jde za ním (Úloha 9b). Herní
// pravidla a ověření rozkazu má server – tady jen výběr, rozkaz z kliknutí (`orderFromClick`), texty
// u kurzoru a která mapa je ve scéně.

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

/** Scéna cizí mapy za vojvodou (`ForeignJourneyScene`) a strana její mapy v metrech. */
export interface ForeignLordScene {
  scene: LandscapeScene;
  mapSizeM: number;
}

export interface LordJourney {
  /**
   * Dotazování na výpravy: pohledy na všechny výpravy hráče (scéna) a z nich pohled na výjezd
   * vojvody (`view` interpolovaný, `latest` poslední ze serveru) pro jeho panel.
   */
  journey: {
    view: JourneyView | null;
    latest: JourneyView | null;
    expeditions: ExpeditionsHandle;
  };
  /** Ovládání do panelu výběru, je-li vybraný vojvoda; jinak null. */
  panel: LordJourneyUi | null;
  /** Vojvoda na výjezdu pro horní lištu (portrét s podkovou). */
  away: { name: string | null; selected: boolean; onSelect: () => void } | null;
  /** Popisek u kurzoru: „Na sousední mapu“ u okraje, nebo důvod odmítnutí rozkazu. */
  note: CursorNote | null;
  /** Cizí mapa, kterou scéna ukazuje za vojvodou; null – scéna vsi. */
  watching: GridCell | null;
  /** Zpět na ves (⌂) – výjezd běží dál. */
  back: () => void;
  /** Scéna cizí mapy, až je hotová (null – zmizela) – pravé tlačítko dává rozkazy i tam. */
  bindForeign: (foreign: ForeignLordScene | null) => void;
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
  const expeditionsAway = view?.expeditionsAway === true;
  const villageId = view?.id ?? null;
  const lordSelected = lordId !== null && selected?.kind === 'person' && selected.id === lordId;

  // Dotazujeme se, dokud jsou lidé pryč (ves to ví) nebo právě vyjeli; po návratu hloučku se ves
  // obnoví a dotazy stojí, dokud ves nepotvrdí, že nikdo pryč není.
  const [launched, setLaunched] = useState(false);
  // vyslání čeká na odpověď / vyšlo, ale ves ještě neví, že je vojvoda pryč – čte je pravé kliknutí
  // (dvojité kliknutí nevyšle dvakrát, druhé kliknutí po úspěchu je už rozkaz výjezdu)
  const launching = useRef(false);
  const launchedRef = useRef(false);
  const onPartyEnded = useCallback((): void => refreshVillage(), [refreshVillage]);
  const running = expeditionsAway || launched;
  const expeditions = useExpeditions(running, onPartyEnded);
  const journeyViews = expeditions.views;
  const latestViews = expeditions.latest;
  // ves už o lidech pryč ví – vyslání netřeba hlídat zvlášť
  useEffect(() => {
    if (!expeditionsAway || !launched) return;
    setLaunched(false);
    launchedRef.current = false;
  }, [expeditionsAway, launched]);
  // výprava skončila dřív, než to ves stihla potvrdit
  const seenViews = useRef(false);
  useEffect(() => {
    if (latestViews.length > 0) seenViews.current = true;
    else if (seenViews.current) {
      seenViews.current = false;
      setLaunched(false);
      launchedRef.current = false;
    }
  }, [latestViews]);
  const journeyViewNow = useMemo(() => lordJourneyViewOf(journeyViews), [journeyViews]);
  const latest = useMemo(() => lordJourneyViewOf(latestViews), [latestViews]);
  const journey = useMemo(
    () => ({ view: journeyViewNow, latest, expeditions }),
    [journeyViewNow, latest, expeditions],
  );
  const journeyView = journey.view;
  const refreshJourney = expeditions.refresh;

  // Scéna za vojvodou (lord-control.md – Co hráč vidí – Na cestě): klik na portrét v liště přepne
  // scénu na cizí mapu, kde vojvoda je, a ta jde za ním z mapy na mapu; skupina zpět na domovské
  // mapě (po čekání či Domů) nebo konec výjezdu vrátí scénu na ves. ⌂ vrátí ves, výjezd běží dál.
  const [following, setFollowing] = useState(false);
  const watching = watchedJourneyCell(following, latest);
  useEffect(() => {
    if (following && watching === null) setFollowing(false);
  }, [following, watching]);
  const back = useCallback((): void => setFollowing(false), []);
  const [foreign, bindForeign] = useState<ForeignLordScene | null>(null);
  // Výběr klikem ve scéně cizí mapy jako ve vsi: muž vlastního výjezdu se vybere (vojvoda = režim
  // vojvody), klik jinam výběr zruší (`foreignJourneySelection`)
  const foreignScene = foreign?.scene ?? null;
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    if (!foreignScene) return;
    return foreignScene.onSelect((target, additive, double) =>
      setSelected(foreignJourneySelection(selectedRef.current, target, additive, double)),
    );
  }, [foreignScene, setSelected]);
  // vybraný muž výjezdu má i na cizí mapě kroužek, který jede s ním (journey.md – Výběr)
  useEffect(() => {
    foreignScene?.setSelection(selected?.kind === 'person' ? selected : null);
  }, [foreignScene, selected]);

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

  // Pravé tlačítko do krajiny mapy, kterou scéna ukazuje: cizí mapy za vojvodou (`watching`), nebo
  // domovské, je-li skupina na ní; skupina jinde – pravé tlačítko ve vsi zůstává beze změny, domů ji
  // pošle ikona.
  const orderCell: GridCell | null =
    watching ?? (journeyView ? journeyView.home : (homeCell ?? SEAT_CELL));
  const onShownMap =
    watching !== null ||
    journeyView === null ||
    (journeyView.cell.x === journeyView.home.x && journeyView.cell.y === journeyView.home.y);
  const lordScene = watching ? (foreign?.scene ?? null) : scene;
  const lordMapSizeM = watching ? (foreign?.mapSizeM ?? mapSizeM) : mapSizeM;
  // Režim vojvody zůstává zapnutý i při odepřeném výjezdu a během načítání kandidátů – pravé
  // tlačítko pak ukáže důvod u kurzoru (nebo nic) a výběr nezruší (`lordClick`).
  const loading = journeyAway ? journeyView === null : candidates === null;
  const refusal = journeyAway
    ? journeyView !== null && !journeyView.controllable
      ? journeyReason('no-lord')
      : null
    : (candidates?.refusal ?? null);
  const retinueRef = useRef(retinue);
  useEffect(() => {
    retinueRef.current = retinue;
  }, [retinue]);
  useEffect(() => {
    if (!lordScene || !lordSelected || !onShownMap || orderCell === null) return;
    if (villageId === null) return;
    lordScene.setLordMode({
      order: (point, screen) => {
        const order = orderFromClick({
          lordSelected: true,
          point,
          mapSizeM: lordMapSizeM,
          cell: orderCell,
        });
        // vyjel, ale ves to ještě neví – rozkaz jde běžícímu výjezdu (server ho ověří)
        const away = journeyAway || launchedRef.current;
        const click = lordClick({
          order,
          loading: journeyAway ? loading : !away && loading,
          refusal: journeyAway || !away ? refusal : null,
          launching: !away && launching.current,
        });
        if (click.kind === 'refuse') showError(click.text, screen);
        if (click.kind !== 'send') return;
        if (!away) launching.current = true;
        const sent = away
          ? commandJourney(click.order).then((r) => ('error' in r ? r.error : null))
          : launchJourney({ villageId, retinue: [...retinueRef.current], order: click.order })
              .then((r) => {
                if ('error' in r) return r.error;
                launchedRef.current = true;
                setLaunched(true);
                refreshVillage();
                return null;
              })
              .finally(() => {
                launching.current = false;
              });
        void sent.then((failure) => {
          if (failure !== null) showError(failure, screen);
          else refreshJourney();
        });
      },
      hover: (point, screen) => {
        const direction = point ? edgeDirection(point, lordMapSizeM) : null;
        setNote((prev) => {
          if (direction === null || screen === null) return prev?.tone === 'info' ? null : prev;
          return { text: 'Na sousední mapu', tone: 'info', screen };
        });
        return direction === null ? '' : EDGE_CURSORS[direction];
      },
    });
    return () => lordScene.setLordMode(null);
  }, [
    lordScene,
    lordSelected,
    loading,
    refusal,
    onShownMap,
    orderCell,
    lordMapSizeM,
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
    journeyAway && lordId !== null
      ? {
          name: view?.dynasty?.lordName ?? null,
          selected: lordSelected,
          onSelect: () => {
            setSelected({ kind: 'person', id: lordId });
            // vojvoda na cizí mapě – scéna jde za ním
            if (watchedJourneyCell(true, latest) !== null) setFollowing(true);
          },
        }
      : null;
  return { journey, panel, away, note, watching, back, bindForeign };
}
