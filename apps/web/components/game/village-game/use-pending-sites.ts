'use client';

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import {
  CRAFT_BASE,
  suggestVillageName,
  type BuildableDwellingType,
  type Craft,
  type DwellingPlot,
  type Landscape,
  type Position,
  type SacredBuildingKind,
} from '@bohemia/game';
import {
  foundVillage,
  placeDwelling,
  placeQuarry,
  placeSacred,
  placeThreshingFloor,
  placeWorkshop,
  settleJourney,
} from '@/app/game/actions';
import {
  placementVillageFromScene,
  scenePlot,
  type SceneVillage,
  type VillageView,
} from '@/lib/village-view';
import { EMPTY_SCENE, withPending, type PendingSite } from './scene-village';
import type { ActionResult } from './village-data';

export interface PendingSites {
  /** Ves pro scénu: stav ze serveru a staveniště, která čekají na odpověď serveru. */
  sceneVillage: SceneVillage;
  /** Ves pro kontrolu umístění v prohlížeči – i s obydlími, která ještě čekají na server. */
  placementScene: () => SceneVillage;
  placementVillage: () => ReturnType<typeof placementVillageFromScene>;
  /**
   * Postaví obydlí – první zemnice ves založí (osadníci si ji postaví), další jsou stavby;
   * polozemnice na pozemku (`plot`).
   */
  buildDwelling: (type: BuildableDwellingType, position: Position, plot?: DwellingPlot) => void;
  buildWorkshop: (craft: Craft, position: Position) => void;
  buildSacred: (type: SacredBuildingKind, position: Position) => void;
  buildThreshingFloor: (position: Position) => void;
  buildQuarry: (position: Position) => void;
}

/**
 * Staveniště odeslaná na server (web-ui.md – Stavba): obydlí, dílna, modla, svatyně a humno se
 * ve scéně ukážou hned (záporné id) a zabírají místo v kontrole umístění, dokud server
 * neodpoví. Akce jdou přes frontu `runBuildAction` (Shift + klik staví víc obydlí po sobě).
 */
export function usePendingSites({
  view,
  viewRef,
  decoded,
  seed,
  founderNameRef,
  runBuildAction,
}: {
  view: VillageView | null;
  viewRef: RefObject<VillageView | null>;
  decoded: Landscape;
  /** Seed krajiny sídla – podle něj hra navrhne jméno vsi. */
  seed: number;
  founderNameRef: RefObject<string | null>;
  runBuildAction: (action: () => Promise<ActionResult>) => Promise<void>;
}): PendingSites {
  const [pending, setPending] = useState<PendingSite[]>([]);
  const pendingRef = useRef<PendingSite[]>([]);
  const pendingId = useRef(0);

  const sceneVillage = useMemo(
    () => withPending(view ? view.scene : EMPTY_SCENE, pending),
    [view, pending],
  );

  const placementScene = useCallback(
    () => withPending(viewRef.current?.scene ?? EMPTY_SCENE, pendingRef.current),
    [viewRef],
  );
  const placementVillage = useCallback(
    () => placementVillageFromScene(placementScene()),
    [placementScene],
  );

  const setPendingList = (list: PendingSite[]): void => {
    pendingRef.current = list;
    setPending(list);
  };

  const buildDwelling = (
    type: BuildableDwellingType,
    position: Position,
    plot?: DwellingPlot,
  ): void => {
    const entry: PendingSite = {
      kind: 'dwelling',
      id: -1 - pendingId.current++,
      type,
      position,
      ...(plot ? { plot: scenePlot(decoded, plot) } : {}),
    };
    setPendingList([...pendingRef.current, entry]);
    const villageId = viewRef.current?.id ?? null;
    // lidé dorazili na novou mapu – první zemnice založí jejich ves (migration.md – fáze 4)
    const arrived = viewRef.current?.journey?.arrived === true;
    void runBuildAction(() =>
      villageId === null
        ? foundVillage({
            name: suggestVillageName(seed),
            dwelling: position,
            ...(founderNameRef.current !== null ? { lordName: founderNameRef.current } : {}),
          })
        : arrived
          ? settleJourney({ villageId, dwelling: position })
          : placeDwelling({ villageId, type, position, ...(plot ? { plot } : {}) }),
    ).finally(() => setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)));
  };

  /** Zahájí stavbu řemeslné dílny (crafts.md) – staveniště hned ve scéně. */
  const buildWorkshop = (craft: Craft, position: Position): void => {
    const entry: PendingSite = {
      kind: 'dwelling',
      id: -1 - pendingId.current++,
      type: CRAFT_BASE[craft],
      position,
      craft,
    };
    setPendingList([...pendingRef.current, entry]);
    const villageId = viewRef.current?.id;
    if (!villageId) return;
    void runBuildAction(() => placeWorkshop({ villageId, craft, position })).finally(() =>
      setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)),
    );
  };

  /** Zahájí stavbu modly nebo svatyně (happiness.md) – staveniště hned ve scéně. */
  const buildSacred = (type: SacredBuildingKind, position: Position): void => {
    const entry: PendingSite = { kind: 'sacred', id: -1 - pendingId.current++, type, position };
    setPendingList([...pendingRef.current, entry]);
    const villageId = viewRef.current?.id;
    if (!villageId) return;
    void runBuildAction(() => placeSacred({ villageId, kind: type, position })).finally(() =>
      setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)),
    );
  };

  /** Zahájí stavbu humna (production-chains.md – Humno) – v kontrole umístění hned zabírá místo. */
  const buildThreshingFloor = (position: Position): void => {
    const entry: PendingSite = { kind: 'threshing-floor', id: -1 - pendingId.current++, position };
    setPendingList([...pendingRef.current, entry]);
    const villageId = viewRef.current?.id;
    if (!villageId) return;
    void runBuildAction(() => placeThreshingFloor({ villageId, position })).finally(() =>
      setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)),
    );
  };

  /** Zahájí stavbu lomu na skalním výchozu (fortifications.md – Kámen); server místo ověří. */
  const buildQuarry = (position: Position): void => {
    const villageId = viewRef.current?.id;
    if (!villageId) return;
    void runBuildAction(() => placeQuarry({ villageId, position }));
  };

  return {
    sceneVillage,
    placementScene,
    placementVillage,
    buildDwelling,
    buildWorkshop,
    buildSacred,
    buildThreshingFloor,
    buildQuarry,
  };
}
