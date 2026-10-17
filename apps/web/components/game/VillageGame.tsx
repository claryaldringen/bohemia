'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { checkDwellingPlacement, fieldPartsFromOutline } from '@bohemia/game';
import { foundVillage, getVillageView, placeDwelling, placeField } from '@/app/game/actions';
import { usePlacement } from '@/hooks/use-placement';
import { usePolling } from '@/hooks/use-polling';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { fieldPreviewLabel } from '@/lib/village-format';
import {
  foundingSceneVillage,
  placementVillageFromScene,
  type SceneVillage,
  type VillageView,
} from '@/lib/village-view';
import { BuildMenu, type BuildItem } from './BuildMenu';
import { FoundingPanel, type FoundingInput } from './FoundingPanel';
import { GameView } from './GameView';
import { PlacementBubble } from './PlacementBubble';
import { VillagePanel } from './VillagePanel';

/** Stav vsi ze serveru: pohled na ves, ještě nezaložená (null), nebo chyba (svět neběží…). */
export type VillageData = VillageView | null | { error: string };

const POLL_MS = 5000;
const TOAST_MS = 6000;
const CONNECTION_FAILED = 'Spojení se serverem selhalo – zkus to prosím znovu.';

function isVillageView(state: VillageData): state is VillageView {
  return state !== null && !('error' in state);
}

/**
 * Hratelná ves: 3D krajina, založení vsi (dokud není), panel vsi, nabídka staveb a bublina
 * u kurzoru při umisťování. Stav vsi drží server – po každé akci a každých 5 s (jen při
 * viditelném panelu) přijde nový VillageView a promítne se do panelu i scény.
 */
export function VillageGame({
  landscape,
  seed,
  initialVillage,
}: {
  landscape: LandscapeTransfer;
  /** Seed krajiny sídla – podle něj hra nabídne jméno vsi. */
  seed: number;
  initialVillage: VillageData;
}): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [village, setVillage] = useState<VillageData>(initialVillage);
  const [preview, setPreview] = useState<SceneVillage>(() =>
    foundingSceneVillage(decoded, null, null),
  );
  const [placingItem, setPlacingItem] = useState<BuildItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const placement = usePlacement(scene);
  const view = isVillageView(village) ? village : null;
  const villageError = village !== null && 'error' in village ? village.error : null;

  // Pořadí odpovědí: dotaz, který začal dřív než už použitá odpověď, se zahodí.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const busyRef = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const sceneVillage = view ? view.scene : preview;
  useEffect(() => {
    scene?.setVillage(sceneVillage);
  }, [scene, sceneVillage]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const poll = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    const seq = ++requestSeq.current;
    const result = await getVillageView();
    if (busyRef.current || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    // Chyba (např. odhlášení v jiném panelu) poslední pohled na ves nesmaže – jen se ohlásí.
    if (result !== null && 'error' in result && viewRef.current) setToast(result.error);
    else setVillage(result);
  }, []);
  // Dokud ves není, není co obnovovat (založení vrátí pohled samo).
  usePolling(poll, POLL_MS, village !== null);

  /** Akce nad vsí na serveru; vrátí chybu pro hráče, nebo null (pohled se rovnou použije). */
  const runAction = useCallback(
    async (action: () => Promise<VillageView | { error: string }>): Promise<string | null> => {
      busyRef.current = true;
      setBusy(true);
      const seq = ++requestSeq.current;
      try {
        const result = await action();
        if ('error' in result) return result.error;
        appliedSeq.current = Math.max(appliedSeq.current, seq);
        setVillage(result);
        return null;
      } catch (error) {
        console.error('Akce vsi selhala.', error);
        return CONNECTION_FAILED;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const runBuildAction = (action: () => Promise<VillageView | { error: string }>): void => {
    void runAction(action).then((failure) => {
      if (failure !== null) setToast(failure);
    });
  };

  const onFound = useCallback(
    (input: FoundingInput): Promise<string | null> => runAction(() => foundVillage(input)),
    [runAction],
  );

  const startBuild = (item: BuildItem): void => {
    setToast(null);
    setPlacingItem(item);
    if (item === 'field') {
      placement.start(
        {
          kind: 'field',
          preview: (outline) => {
            const scene = viewRef.current?.scene ?? { dwellings: [], fields: [] };
            const result = fieldPartsFromOutline(
              decoded,
              placementVillageFromScene(scene),
              outline,
              scene.dwellings.map((d) => d.position),
            );
            return { check: result.check, label: fieldPreviewLabel(result) };
          },
        },
        (result) => {
          if (result.kind === 'field')
            runBuildAction(() => placeField({ outline: result.outline }));
        },
      );
      return;
    }
    placement.start(
      {
        kind: 'dwelling',
        type: item,
        check: (position) => {
          const scene = viewRef.current?.scene ?? { dwellings: [], fields: [] };
          return checkDwellingPlacement(decoded, placementVillageFromScene(scene), item, position);
        },
      },
      (result) => {
        if (result.kind === 'dwelling') {
          runBuildAction(() => placeDwelling({ type: result.type, position: result.position }));
        }
      },
    );
  };

  return (
    <>
      <GameView landscape={landscape} onSceneReady={setScene} />
      {village === null && (
        <FoundingPanel
          landscape={decoded}
          seed={seed}
          sceneReady={scene !== null}
          placement={placement}
          onPreviewVillage={setPreview}
          onFound={onFound}
        />
      )}
      {villageError !== null && (
        <p
          role="status"
          className="fixed top-12 left-2 z-10 max-w-80 rounded bg-stone-100/90 px-3 py-2 text-sm text-stone-700 shadow backdrop-blur dark:bg-stone-950/85 dark:text-stone-300"
        >
          Ves teď nejde zobrazit: {villageError}
        </p>
      )}
      {view && <VillagePanel view={view} />}
      {view && (
        <BuildMenu
          view={view}
          placing={
            placement.active && placingItem ? { item: placingItem, kind: placement.active } : null
          }
          busy={busy}
          sceneReady={scene !== null}
          onBuild={startBuild}
          onCancel={placement.cancel}
        />
      )}
      <PlacementBubble preview={placement.active ? placement.preview : null} />
      {toast && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 z-20 flex max-w-md -translate-x-1/2 items-start gap-3 rounded bg-red-800/95 px-3 py-2 text-sm text-white shadow-lg"
        >
          <p>{toast}</p>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={() => setToast(null)}
            className="rounded px-1 text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
