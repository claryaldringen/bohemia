'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SEAT_CELL,
  type ExpeditionCommand,
  type ExpeditionView,
  type GridCell,
} from '@bohemia/game';
import { commandExpedition } from '@/app/game/actions/journey';
import { useExpeditions, type ExpeditionsHandle } from '@/hooks/use-journey';
import { foreignJourneySelection, watchedJourneyCell } from '@/lib/journey-scene-view';
import { expeditionPersonState, type ExpeditionPersonState } from '@/lib/expedition-buttons';
import {
  expeditionReason,
  lordJourneyViewOf,
  partiesOf,
  partyJourneyViewOf,
  partyMembersOf,
} from '@/lib/journey-view';
import type { JourneyView } from '@/lib/journey-view';
import type { ScenePerson } from '@/lib/person-view';
import { edgeDirection, orderClick, orderFromClick } from '@/lib/scene/journey-orders';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import {
  peopleTarget,
  selectedPeopleIds,
  selectedPeopleVillage,
  type PartyOf,
} from '@/lib/scene/village-selection';

// Rozkazy vybraným lidem ve scéně (expeditions.md – Výběr a skupina; jako jednotky v 0 A.D.):
// vybraní lidé (klik, Shift + klik, klik na člena skupiny venku vybere celou skupinu) dostanou
// pravým tlačítkem do krajiny rozkaz – doma se z nich stane skupina, venku se přesměruje. Herní
// pravidla a ověření rozkazu má server (`commandExpedition`) – tady jen výběr, rozkaz z kliknutí
// (`orderFromClick`), texty u kurzoru a která mapa je ve scéně.

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

/** Scéna cizí mapy (`ForeignJourneyScene`) a strana její mapy v metrech. */
export interface ForeignLordScene {
  scene: LandscapeScene;
  mapSizeM: number;
}

export interface ExpeditionOrders {
  /** Skupina člověka venku (ve výpravě jeho vsi) – klik na člena skupiny vybere celou skupinu. */
  partyOf: PartyOf;
  /** Popisek u kurzoru: „Na sousední mapu“ u okraje, nebo důvod odmítnutí rozkazu. */
  note: CursorNote | null;
  /** Cizí mapa, kterou scéna ukazuje; null – scéna vsi. */
  watching: GridCell | null;
  /** Pohled na skupinu, za kterou scéna jde (vybraná skupina, bez výběru skupina vojvody). */
  followed: JourneyView | null;
  /** Zpět na ves (⌂) – výprava běží dál. */
  back: () => void;
  /** Scéna cizí mapy, až je hotová (null – zmizela) – pravé tlačítko dává rozkazy i tam. */
  bindForeign: (foreign: ForeignLordScene | null) => void;
  /** Vojvoda na výpravě pro horní lištu (portrét s podkovou). */
  away: { name: string | null; selected: boolean; onSelect: () => void } | null;
  /** Vybraní lidé pro tlačítka Osedlat, Sesednout a Domů (na cizí mapě v horním rohu). */
  buttons: ExpeditionPersonState[];
  /** Příkaz vybraným lidem (Domů, Osedlat, Sesednout…); důvod odmítnutí u `screen` (místo kliknutí). */
  command: (c: ExpeditionCommand, screen?: { x: number; y: number }) => void;
}

/** Vojvoda vsi pro horní lištu: id, jméno a jestli je pryč. */
export interface LordAway {
  id: number;
  name: string | null;
  away: boolean;
}

/** Rozkaz jako vstup server action (`parseExpeditionInput`): plochý rozkaz, nebo saddle / dismount. */
function inputOf(c: ExpeditionCommand): unknown {
  return c.kind === 'order' ? c.order : { kind: c.kind };
}

/**
 * Dotazování na výpravy: běží, dokud ves ví o lidech venku (`expeditionsAway`) nebo právě vyjeli
 * (`markSent` – ves to ještě neví); po návratu všech se dotazy zastaví.
 */
export function useExpeditionPolling(
  expeditionsAway: boolean,
  refreshVillage: () => void,
): { expeditions: ExpeditionsHandle; markSent: () => void } {
  const [sent, setSent] = useState(false);
  const onPartyEnded = useCallback((): void => refreshVillage(), [refreshVillage]);
  const expeditions = useExpeditions(expeditionsAway || sent, onPartyEnded);
  // ves už o lidech venku ví – vyslání netřeba hlídat zvlášť
  useEffect(() => {
    if (expeditionsAway && sent) setSent(false);
  }, [expeditionsAway, sent]);
  // výprava skončila dřív, než to ves stihla potvrdit
  const seen = useRef(false);
  const latest = expeditions.latest;
  useEffect(() => {
    if (latest.length > 0) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      setSent(false);
    }
  }, [latest]);
  const markSent = useCallback((): void => setSent(true), []);
  return { expeditions, markSent };
}

export function useExpeditionOrders({
  villageId,
  selection,
  setSelected,
  views,
  persons,
  scene,
  foreign: foreignProp,
  lord,
  homeCell,
  mapSizeM,
  refresh,
  onCommanded,
}: {
  /** Ves scény – domovská ves vybraných lidí doma. */
  villageId: string | null;
  selection: VillageTarget | null;
  setSelected: (target: VillageTarget | null) => void;
  /** Poslední pohledy na výpravy ze serveru (bez interpolace). */
  views: readonly ExpeditionView[];
  /** Lidé vsi scény (`ScenePerson.expedition` – důvod, proč někdo nesmí jít). */
  persons: readonly ScenePerson[];
  scene: LandscapeScene | null;
  /** Scéna cizí mapy, je-li předaná shora; jinak ji nastaví `bindForeign`. */
  foreign?: ForeignLordScene | null;
  lord: LordAway | null;
  homeCell: GridCell | null;
  /** Strana mapy krajiny v metrech (okrajový pás rozkazu). */
  mapSizeM: number;
  /** Zeptá se hned na výpravy (po rozkazu). */
  refresh: () => void;
  /** Rozkaz vyšel – ves se obnoví (lidé odešli ze vsi). */
  onCommanded?: () => void;
}): ExpeditionOrders {
  const [bound, bindForeign] = useState<ForeignLordScene | null>(null);
  const foreign = foreignProp ?? bound;
  const ids = useMemo(() => selectedPeopleIds(selection), [selection]);
  // Id osoby je jedinečné jen ve vsi (D2): vybraní lidé jsou z jiné vsi hráče (`villageId` výběru –
  // člen její výpravy), nebo ze vsi scény. Skupiny, rozkaz i tlačítka jen z výpravy jejich vsi.
  const chosenVillage = selectedPeopleVillage(selection);
  const home = chosenVillage ?? villageId;
  const homeViews = useMemo(() => views.filter((v) => v.villageId === home), [views, home]);
  const sceneViews = useMemo(
    () => views.filter((v) => v.villageId === villageId),
    [views, villageId],
  );

  // kdo je ve které skupině
  const viewsRef = useRef(views);
  const villageIdRef = useRef(villageId);
  const homeRef = useRef(home);
  useEffect(() => {
    viewsRef.current = views;
    villageIdRef.current = villageId;
    homeRef.current = home;
  }, [views, villageId, home]);
  const partyOf = useCallback(
    (personId: number, village: string | undefined): readonly number[] | null =>
      partyMembersOf(viewsRef.current, village ?? villageIdRef.current, personId),
    [],
  );

  // Scéna za skupinou (expeditions.md – Scéna): klik na portrét vojvody v liště přepne scénu na
  // cizí mapu, kde je jeho skupina; scéna jde za hloučkem vůdce vybrané skupiny z mapy na mapu.
  const [following, setFollowing] = useState(false);
  const followed = useMemo(
    () =>
      (ids.length > 0 ? partyJourneyViewOf(homeViews, ids) : null) ?? lordJourneyViewOf(sceneViews),
    [homeViews, sceneViews, ids],
  );
  const watching = watchedJourneyCell(following, followed);
  useEffect(() => {
    if (following && watching === null) setFollowing(false);
  }, [following, watching]);
  const back = useCallback((): void => setFollowing(false), []);

  // Výběr klikem ve scéně cizí mapy jako ve vsi (celá skupina, Shift přidá)
  const foreignScene = foreign?.scene ?? null;
  const selectedRef = useRef(selection);
  useEffect(() => {
    selectedRef.current = selection;
  }, [selection]);
  useEffect(() => {
    if (!foreignScene) return;
    return foreignScene.onSelect((target, additive, double) =>
      setSelected(foreignJourneySelection(selectedRef.current, target, additive, double, partyOf)),
    );
  }, [foreignScene, setSelected, partyOf]);
  // vybraní lidé mají i na cizí mapě kroužek, který jede s nimi (journey.md – Výběr)
  useEffect(() => {
    foreignScene?.setSelection(
      selection?.kind === 'person' || selection?.kind === 'people' ? selection : null,
    );
  }, [foreignScene, selection]);

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

  // Proč nikdo z vybraných nemůže (bez dotazu na server): důvod prvního z nich – lidé vsi scény
  const refusal = useMemo((): string | null => {
    if (chosenVillage !== undefined) return null;
    const chosen = ids.map((id) => persons.find((p) => p.id === id));
    if (chosen.length === 0 || chosen.some((p) => p?.expedition?.refusal === undefined))
      return null;
    const first = chosen[0];
    return first?.expedition?.refusal
      ? expeditionReason(first.expedition.refusal, first.sex === 'female')
      : null;
  }, [ids, persons, chosenVillage]);

  // Rozkaz běží (dvojité pravé kliknutí nevyšle dvakrát)
  const sending = useRef(false);
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);
  const send = useCallback(
    (c: ExpeditionCommand, screen: { x: number; y: number }): void => {
      const people = idsRef.current;
      const village = homeRef.current;
      if (people.length === 0 || village === null || sending.current) return;
      sending.current = true;
      void commandExpedition({ villageId: village, people, command: inputOf(c) })
        .then((result) => {
          if ('error' in result) {
            showError(result.error, screen);
            return;
          }
          onCommanded?.();
          refresh();
        })
        .catch(() => showError('Rozkaz se nepodařilo odeslat.', screen))
        .finally(() => {
          sending.current = false;
        });
    },
    [showError, onCommanded, refresh],
  );
  const command = useCallback(
    (c: ExpeditionCommand, screen?: { x: number; y: number }): void =>
      send(c, screen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }),
    [send],
  );

  // Pravé tlačítko do krajiny mapy, kterou scéna ukazuje (cizí mapa za skupinou, nebo domovská)
  const orderCell: GridCell = watching ?? homeCell ?? SEAT_CELL;
  const orderScene = watching ? (foreign?.scene ?? null) : scene;
  const orderMapSizeM = watching ? (foreign?.mapSizeM ?? mapSizeM) : mapSizeM;
  const refusalRef = useRef(refusal);
  useEffect(() => {
    refusalRef.current = refusal;
  }, [refusal]);
  const active = ids.length > 0;
  useEffect(() => {
    if (!orderScene || !active) return;
    orderScene.setOrderMode({
      order: (point, screen) => {
        const order = orderFromClick({
          selected: true,
          point,
          mapSizeM: orderMapSizeM,
          cell: orderCell,
        });
        const click = orderClick({
          order,
          refusal: refusalRef.current,
          sending: sending.current,
        });
        if (click.kind === 'refuse') showError(click.text, screen);
        if (click.kind === 'send') send({ kind: 'order', order: click.order }, screen);
      },
      hover: (point, screen) => {
        const direction = point ? edgeDirection(point, orderMapSizeM) : null;
        setNote((prev) => {
          if (direction === null || screen === null) return prev?.tone === 'info' ? null : prev;
          return { text: 'Na sousední mapu', tone: 'info', screen };
        });
        return direction === null ? '' : EDGE_CURSORS[direction];
      },
    });
    return () => orderScene.setOrderMode(null);
  }, [orderScene, active, orderMapSizeM, orderCell, send, showError]);

  const buttons = useMemo((): ExpeditionPersonState[] => {
    const parties = partiesOf(homeViews, home);
    // lidé jiné vsi: jen podle její výpravy (lidi vsi scény `persons` nemají), doma = její mapa
    const atHome = chosenVillage === undefined ? homeCell : (homeViews[0]?.home ?? null);
    return ids.flatMap((id) => {
      const person = chosenVillage === undefined ? persons.find((p) => p.id === id) : undefined;
      const state = expeditionPersonState(person, id, parties, atHome);
      return state ? [state] : [];
    });
  }, [ids, homeViews, home, chosenVillage, persons, homeCell]);

  // Odznak vojvody (D1): stráž konce jako dřív u výjezdu – skupina vojvody z pohledů zmizela
  // (došel domů), ves to ale potvrdí až další den (`away.untilDay`); odznak do té doby nesvítí
  const lordOut = useMemo(
    () => lord !== null && partyMembersOf(views, villageId, lord.id) !== null,
    [views, villageId, lord],
  );
  const lordSeen = useRef(false);
  const [lordBack, setLordBack] = useState(false);
  useEffect(() => {
    if (lordOut) {
      lordSeen.current = true;
      setLordBack(false);
    } else if (lordSeen.current) {
      lordSeen.current = false;
      setLordBack(true);
    }
  }, [lordOut]);
  const lordAway = lord?.away === true;
  useEffect(() => {
    if (!lordAway) setLordBack(false);
  }, [lordAway]);

  const lordSelected = lord !== null && chosenVillage === undefined && ids.includes(lord.id);
  const away = useMemo(
    () =>
      lord?.away && !lordBack
        ? {
            name: lord.name,
            selected: lordSelected,
            onSelect: (): void => {
              setSelected(peopleTarget(partyOf(lord.id, undefined) ?? [lord.id]));
              // skupina vojvody na cizí mapě – scéna jde za ní
              const own = viewsRef.current.filter((v) => v.villageId === villageIdRef.current);
              const view = partyJourneyViewOf(own, [lord.id]);
              if (watchedJourneyCell(true, view) !== null) setFollowing(true);
            },
          }
        : null,
    [lord, lordBack, lordSelected, setSelected, partyOf],
  );
  return {
    note,
    watching,
    followed,
    back,
    bindForeign,
    away,
    buttons,
    command,
    partyOf,
  };
}
