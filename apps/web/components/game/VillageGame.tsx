'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  suggestVillageName,
  type BuildKind,
  type DwellingType,
  type Position,
  type TileCell,
  type WorldClock,
} from '@bohemia/game';
import {
  foundVillage,
  getVillageView,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  renameVillage,
  restartGame,
} from '@/app/game/actions';
import { usePlacement } from '@/hooks/use-placement';
import { usePolling } from '@/hooks/use-polling';
import { buildItem, buildItemForKey } from '@/lib/build-items';
import { setE2EHook } from '@/lib/e2e-hooks';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { targetExists, type VillageTarget } from '@/lib/scene/village-picking';
import { selectionDetails } from '@/lib/selection-details';
import { useSoundPreference } from './SoundToggle';
import { newNotices } from '@/lib/village-notices';
import {
  placementVillageFromScene,
  type BuildOption,
  type SceneVillage,
  type VillageView,
} from '@/lib/village-view';
import { GameView } from './GameView';
import { BuildGrid } from './hud/BuildGrid';
import { CursorReason } from './hud/CursorReason';
import { DefeatScreen } from './hud/DefeatScreen';
import { Minimap } from './hud/Minimap';
import { NoticeLines, type NoticeLine } from './hud/NoticeLines';
import { SelectionPanel } from './hud/SelectionPanel';
import { TopBar } from './hud/TopBar';

/** Stav vsi ze serveru: pohled na ves, ještě nezaložená (null), nebo chyba (svět neběží…). */
export type VillageData = VillageView | null | { error: string };

const POLL_MS = 5000;
/** Nejvíc řádků oznámení najednou – starší ustoupí novějším. */
const MAX_NOTICES = 4;
const CONNECTION_FAILED = 'Spojení se serverem selhalo.';
const EMPTY_SCENE: SceneVillage = { dwellings: [], fields: [] };

type ActionResult = VillageView | { error: string };

/**
 * Server action staveb malovaných po čtvercích podle druhu (obydlí jdou přes `placeDwelling`).
 * Nová stavba po čtvercích = nový řádek tady a záznam v `lib/build-items.ts`.
 */
const SUBMIT_SQUARES: Partial<Record<BuildKind, (cells: TileCell[]) => Promise<ActionResult>>> = {
  field: (cells) => placeField({ cells }),
  cemetery: (cells) => placeCemetery({ cells }),
  orchard: (cells) => placeOrchard({ cells }),
};

function isVillageView(state: VillageData): state is VillageView {
  return state !== null && !('error' in state);
}

/** Obydlí odeslané na server, na jehož odpověď se čeká – ve scéně už stojí jako staveniště. */
interface PendingDwelling {
  id: number;
  type: DwellingType;
  position: Position;
}

/** Ves pro scénu: stav ze serveru a obydlí, která ještě čekají na odpověď serveru. */
function withPending(scene: SceneVillage, pending: readonly PendingDwelling[]): SceneVillage {
  if (pending.length === 0) return scene;
  return {
    ...scene,
    dwellings: [
      ...scene.dwellings,
      ...pending.map((d) => ({ ...d, built: false, progress: 0, inhabited: false })),
    ],
  };
}

/**
 * Hratelná ves s rozhraním jako v 0 A.D.: 3D krajina přes celé okno, horní lišta (jméno vsi,
 * suroviny, datum), minimapa vlevo dole, panel výběru dole uprostřed, mřížka staveb vpravo dole
 * a mizející oznámení nahoře. Bez průvodce – hráč staví, kdy chce. Dokud ves není, mřížka
 * nabízí jen zemnici: její umístění ves založí (s navrženým jménem). Stav vsi drží server – po
 * každé akci a každých 5 s (jen při viditelném panelu) přijde nový VillageView. Ve vymřelé vsi
 * se nestaví; když hráči vymřely všechny vsi, přes zamrzlou scénu je obrazovka porážky
 * s tlačítkem Začít znovu (nové sídlo, stránka se načte znovu).
 */
export function VillageGame({
  landscape,
  seed,
  initialVillage,
  world,
  email,
  initialNowMs,
}: {
  landscape: LandscapeTransfer;
  /** Seed krajiny sídla – podle něj hra navrhne jméno vsi. */
  seed: number;
  initialVillage: VillageData;
  /** Svět jako na serveru – herní datum v liště a dým z obydlí podle herního dne. */
  world: WorldClock;
  /** E-mail přihlášeného hráče (popisek odhlášení). */
  email: string;
  /** Čas serveru při renderu (datum v liště sedí s HTML ze serveru). */
  initialNowMs: number;
}): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [village, setVillage] = useState<VillageData>(initialVillage);
  const [pending, setPending] = useState<PendingDwelling[]>([]);
  const [selected, setSelected] = useState<VillageTarget | null>(null);
  const [placingItem, setPlacingItem] = useState<BuildKind | null>(null);
  const [notices, setNotices] = useState<NoticeLine[]>([]);
  const [soundOn, setSoundOn] = useSoundPreference();
  const placement = usePlacement(scene);
  const view = isVillageView(village) ? village : null;
  const villageError = village !== null && 'error' in village ? village.error : null;
  const gameOver = view?.gameOver === true;

  // Pořadí odpovědí: dotaz, který začal dřív než už použitá odpověď, se zahodí.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const busyRef = useRef(false);
  /** Akce na serveru jdou za sebou (Shift + klik staví víc obydlí rychle po sobě). */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const viewRef = useRef(view);
  const pendingRef = useRef<PendingDwelling[]>([]);
  const pendingId = useRef(0);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  // Poslední použitý pohled na ves – nová upozornění se počítají proti němu.
  const noticedRef = useRef<VillageView | null>(view);
  const noticeId = useRef(0);

  const pushNotice = useCallback((notice: Omit<NoticeLine, 'id'>): void => {
    setNotices((list) => [...list, { ...notice, id: ++noticeId.current }].slice(-MAX_NOTICES));
  }, []);
  const expireNotice = useCallback((id: number): void => {
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);

  /** Použije nový stav vsi a ohlásí upozornění, která mezitím nově vznikla. */
  const applyVillage = useCallback(
    (next: VillageData): void => {
      setVillage(next);
      if (!isVillageView(next)) return;
      viewRef.current = next;
      const fresh = newNotices(noticedRef.current, next);
      noticedRef.current = next;
      for (const notice of fresh) pushNotice(notice);
    },
    [pushNotice],
  );

  useEffect(() => {
    scene?.setWorldClock(world);
  }, [scene, world]);

  const sceneVillage = useMemo(
    () => withPending(view ? view.scene : EMPTY_SCENE, pending),
    [view, pending],
  );
  useEffect(() => {
    scene?.setVillage(sceneVillage);
  }, [scene, sceneVillage]);

  // R vrací pohled na ves – na první obydlí, jakmile ves stojí.
  const home = view?.scene.dwellings[0]?.position ?? null;
  useEffect(() => {
    if (scene && home) scene.setCameraHome(home.x, home.z);
  }, [scene, home]);

  // Výběr kliknutím do scény; zaniklý cíl (dostavěné staveniště, zarostlé pole) se zruší.
  useEffect(() => scene?.onSelect(setSelected), [scene]);
  const current = selected && targetExists(sceneVillage, selected) ? selected : null;
  useEffect(() => {
    scene?.setSelection(current);
  }, [scene, current]);

  // Testovací háček: kde je bod krajiny na obrazovce (kliknutí na obydlí v e2e testu).
  useEffect(() => {
    if (!scene) return;
    setE2EHook('projectToScreen', (x, z) => scene.projectToScreen(x, z));
    return () => setE2EHook('projectToScreen', undefined);
  }, [scene]);

  const poll = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    const seq = ++requestSeq.current;
    const result = await getVillageView();
    if (busyRef.current || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    // Chyba (např. odhlášení v jiném panelu) poslední pohled na ves nesmaže – jen se ohlásí.
    if (result !== null && 'error' in result && viewRef.current) {
      pushNotice({ kind: 'error', tone: 'error', text: result.error });
    } else applyVillage(result);
  }, [applyVillage, pushNotice]);
  // Dokud ves není, není co obnovovat (založení vrátí pohled samo); po konci hry se nic nemění.
  usePolling(poll, POLL_MS, village !== null && !gameOver);

  /** Akce nad vsí na serveru (ve frontě za předchozími); vrátí chybu pro hráče, nebo null. */
  const runAction = useCallback(
    (action: () => Promise<ActionResult>): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        busyRef.current = true;
        const seq = ++requestSeq.current;
        try {
          const result = await action();
          if ('error' in result) return result.error;
          appliedSeq.current = Math.max(appliedSeq.current, seq);
          applyVillage(result);
          return null;
        } catch (error) {
          console.error('Akce vsi selhala.', error);
          return CONNECTION_FAILED;
        } finally {
          busyRef.current = false;
        }
      };
      const next = queueRef.current.then(run, run);
      queueRef.current = next;
      return next;
    },
    [applyVillage],
  );

  /** Akce stavby – chyba se ohlásí řádkem nahoře. */
  const runBuildAction = useCallback(
    (action: () => Promise<ActionResult>): Promise<void> =>
      runAction(action).then((failure) => {
        if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
      }),
    [runAction, pushNotice],
  );

  /** Ves pro kontrolu umístění v prohlížeči – i s obydlími, která ještě čekají na server. */
  const placementVillage = useCallback(() => {
    const scene = withPending(viewRef.current?.scene ?? EMPTY_SCENE, pendingRef.current);
    return placementVillageFromScene(scene);
  }, []);

  const setPendingList = (list: PendingDwelling[]): void => {
    pendingRef.current = list;
    setPending(list);
  };

  /** Postaví obydlí – první zemnice ves založí (osadníci si ji postaví), další jsou stavby. */
  const buildDwelling = (type: DwellingType, position: Position): void => {
    const entry: PendingDwelling = { id: -1 - pendingId.current++, type, position };
    setPendingList([...pendingRef.current, entry]);
    void runBuildAction(() =>
      viewRef.current === null
        ? foundVillage({ name: suggestVillageName(seed), dwelling: position })
        : placeDwelling({ type, position }),
    ).finally(() => setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)));
  };

  // vymřelá ves nic nestaví – nabídka staveb je prázdná (i zkratky)
  const options: Partial<Record<BuildKind, BuildOption | null>> = view
    ? view.extinct
      ? {}
      : view.build
    : villageError === null
      ? { zemnice: null }
      : {};

  const startBuild = (kind: BuildKind): void => {
    if (!scene || !(kind in options)) return;
    const option = options[kind];
    if (option && !option.affordable) return;
    setSelected(null);
    setPlacingItem(kind);
    const item = buildItem(kind);
    if (item.placement === 'squares') {
      const submit = SUBMIT_SQUARES[kind];
      if (!submit) throw new Error(`Stavba ${kind} nemá server action.`);
      placement.start(
        {
          kind: 'squares',
          preview: (cells) => ({ ...item.check(decoded, placementVillage(), cells), label: '' }),
        },
        (result) => {
          if (result.kind === 'squares') void runBuildAction(() => submit(result.cells));
        },
      );
      return;
    }
    placement.start(
      {
        kind: 'dwelling',
        type: item.dwellingType,
        check: (position) =>
          item.check(decoded, placementVillage(), position, viewRef.current?.woodLogs ?? 0),
      },
      (result) => {
        if (result.kind === 'dwelling') buildDwelling(result.type, result.position);
      },
    );
  };
  const startBuildRef = useRef(startBuild);
  useEffect(() => {
    startBuildRef.current = startBuild;
  });

  // Klávesy rozhraní: zkratky staveb (Z, X, C, V, B) a Esc zruší výběr.
  const placingRef = useRef(placement.active);
  useEffect(() => {
    placingRef.current = placement.active;
  }, [placement.active]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      if (event.code === 'Escape' && placingRef.current === null) {
        setSelected(null);
        return;
      }
      const item = buildItemForKey(event);
      if (!item || event.repeat) return;
      event.preventDefault();
      startBuildRef.current(item.kind);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleSound = (): void => {
    const next = !soundOn;
    setSoundOn(next);
    // Přímo v obsluze kliknutí – Safari pustí zvuk jen v gestu uživatele.
    scene?.setSoundEnabled(next);
  };

  const rename = (name: string): Promise<string | null> => runAction(() => renameVillage({ name }));

  // Ves vymřela uprostřed umisťování – stavba už nejde, umisťování skončí.
  const extinct = Boolean(view?.extinct);
  const cancelPlacement = placement.cancel;
  useEffect(() => {
    if (extinct) cancelPlacement();
  }, [extinct, cancelPlacement]);

  /** Začít znovu po konci hry – nové sídlo s novou krajinou, proto se stránka načte znovu. */
  const restart = async (): Promise<string | null> => {
    try {
      const result = await restartGame();
      if ('error' in result) return result.error;
      window.location.reload();
      return null;
    } catch (error) {
      console.error('Nový začátek selhal.', error);
      return CONNECTION_FAILED;
    }
  };

  return (
    <>
      <GameView landscape={landscape} onSceneReady={setScene} overlays={false} />
      <TopBar
        view={view}
        world={world}
        initialNowMs={initialNowMs}
        email={email}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onRename={rename}
      />
      <Minimap landscape={decoded} scene={scene} village={sceneVillage} />
      <SelectionPanel details={selectionDetails(view, sceneVillage, current)} />
      <BuildGrid
        options={options}
        active={placement.active ? placingItem : null}
        disabled={scene === null}
        onBuild={startBuild}
      />
      <NoticeLines
        notices={notices}
        status={villageError === null ? null : `Ves teď nejde zobrazit: ${villageError}`}
        onExpire={expireNotice}
      />
      <CursorReason preview={placement.active ? placement.preview : null} />
      {gameOver && view?.extinct && (
        <DefeatScreen name={view.name} lifespan={view.extinct} onRestart={restart} />
      )}
    </>
  );
}
