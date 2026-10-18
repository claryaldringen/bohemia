'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CRAFT_BASE,
  shiftWorldClock,
  suggestVillageName,
  type BuildKind,
  type Craft,
  type DwellingPlot,
  type DwellingType,
  type Position,
  type SacredBuildingKind,
  type TileCell,
  type TimeSkip,
  type WorldClock,
} from '@bohemia/game';
import {
  cancelRelocation,
  foundDevVillage,
  foundVillage,
  getVillageView,
  placeCemetery,
  placeDwelling,
  placeField,
  placeOrchard,
  placePen,
  placeSacred,
  placeWorkshop,
  relocateHousehold,
  renameVillage,
  restartGame,
  selectVillage,
  skipTime,
  trainTeam,
} from '@/app/game/actions';
import { usePlacement } from '@/hooks/use-placement';
import { usePolling } from '@/hooks/use-polling';
import { authClient } from '@/lib/auth-client';
import { buildItem, buildItemForKey } from '@/lib/build-items';
import { setE2EHook } from '@/lib/e2e-hooks';
import { opensMenu } from '@/lib/game-menu';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import {
  allDwellingsTarget,
  nextSelection,
  presentTarget,
  selectsAllDwellings,
} from '@/lib/scene/village-selection';
import type { PlacementMode, PlacementResult } from '@/lib/scene/village-types';
import { selectionDetails } from '@/lib/selection-details';
import { useSoundPreference } from './SoundToggle';
import { rememberVillage } from '@/lib/village-choice';
import type { VillageListItem } from '@/lib/village-list';
import { newNotices } from '@/lib/village-notices';
import {
  placementVillageFromScene,
  scenePlot,
  type BuildOption,
  type ScenePlot,
  type SceneVillage,
  type VillageView,
} from '@/lib/village-view';
import { GameView } from './GameView';
import { BuildGrid } from './hud/BuildGrid';
import { CursorReason } from './hud/CursorReason';
import { DefeatScreen } from './hud/DefeatScreen';
import { GameMenu } from './hud/GameMenu';
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
const SIGN_OUT_FAILED = 'Odhlášení selhalo – zkus to prosím znovu.';
const EMPTY_SCENE: SceneVillage = { dwellings: [], fields: [] };

type ActionResult = VillageView | { error: string };

/**
 * Server action staveb malovaných po čtvercích podle druhu (obydlí jdou přes `placeDwelling`).
 * Nová stavba po čtvercích = nový řádek tady a záznam v `lib/build-items.ts`.
 */
const SUBMIT_SQUARES: Partial<
  Record<BuildKind, (villageId: string, cells: TileCell[]) => Promise<ActionResult>>
> = {
  field: (villageId, cells) => placeField({ villageId, cells }),
  cemetery: (villageId, cells) => placeCemetery({ villageId, cells }),
  orchard: (villageId, cells) => placeOrchard({ villageId, cells }),
  pen: (villageId, cells) => placePen({ villageId, cells }),
};

function isVillageView(state: VillageData): state is VillageView {
  return state !== null && !('error' in state);
}

/**
 * Obydlí, dílna, modla nebo svatyně odeslané na server, na jehož odpověď se čeká – ve scéně už
 * stojí jako staveniště (záporné id). Obydlí na pozemku nese i pozemek, dílna řemeslo.
 */
type PendingSite =
  | {
      kind: 'dwelling';
      id: number;
      type: DwellingType;
      position: Position;
      plot?: ScenePlot;
      craft?: Craft;
    }
  | { kind: 'sacred'; id: number; type: SacredBuildingKind; position: Position };

/** Ves pro scénu: stav ze serveru a stavby, které ještě čekají na odpověď serveru. */
function withPending(scene: SceneVillage, pending: readonly PendingSite[]): SceneVillage {
  if (pending.length === 0) return scene;
  const dwellings = pending.flatMap((d) =>
    d.kind === 'dwelling'
      ? [
          {
            id: d.id,
            type: d.type,
            position: d.position,
            ...(d.plot ? { plot: d.plot } : {}),
            ...(d.craft ? { craft: d.craft } : {}),
            built: false,
            progress: 0,
            inhabited: false,
          },
        ]
      : [],
  );
  const sacred = pending.flatMap((d) =>
    d.kind === 'sacred'
      ? [{ id: d.id, kind: d.type, position: d.position, built: false, progress: 0 }]
      : [],
  );
  return {
    ...scene,
    dwellings: [...scene.dwellings, ...dwellings],
    ...(sacred.length > 0
      ? {
          sacred: {
            oaks: scene.sacred?.oaks ?? [],
            groves: scene.sacred?.groves ?? [],
            buildings: [...(scene.sacred?.buildings ?? []), ...sacred],
          },
        }
      : {}),
  };
}

/**
 * Hratelná ves s rozhraním jako v 0 A.D.: 3D krajina přes celé okno, horní lišta (jméno vsi,
 * suroviny, datum), minimapa vlevo dole, panel výběru dole uprostřed, mřížka staveb vpravo dole
 * a mizející oznámení nahoře. Bez průvodce – hráč staví, kdy chce. Dokud ves není, mřížka
 * nabízí jen zemnici: její umístění ves založí (s navrženým jménem). Stav vsi drží server – po
 * každé akci a každých 5 s (jen při viditelném panelu) přijde nový VillageView. Ve vymřelé vsi
 * se nestaví; když hráči vymřely všechny vsi, přes zamrzlou scénu je obrazovka porážky
 * s tlačítkem Začít znovu (nové sídlo, stránka se načte znovu). Nabídka hry (tlačítko v liště,
 * F10) nabízí Začít znovu i se živou vsí (po potvrzení) a odhlášení. Ve vývojovém režimu jsou
 * vedle data šipky přeskočení času – hodiny v liště i ve scéně jdou o posun času hráče napřed.
 * Hráč může mít víc vsí (migration.md): jméno vsi v liště je přepínač – ves na téže mapě se
 * přepne na místě, na jiné mapě se stránka načte znovu (jiná krajina). Akce nesou id vsi.
 * Ctrl / Shift + klik přidá obydlí k výběru, Ctrl + A vybere všechna; panel výběru obydlí
 * nabídne Přestěhovat (nový dům postupně každé domácnosti).
 */
export function VillageGame({
  landscape,
  seed,
  settlementId,
  initialVillage,
  world,
  timeOffsetDays: initialTimeOffsetDays,
  devMode,
  email,
  initialNowMs,
}: {
  landscape: LandscapeTransfer;
  /** Seed krajiny sídla – podle něj hra navrhne jméno vsi. */
  seed: number;
  /** Sídlo (mapa) načtené krajiny – ves z jiného sídla se přepne novým načtením stránky. */
  settlementId: string;
  initialVillage: VillageData;
  /** Svět jako na serveru – herní datum v liště a dým z obydlí podle herního dne. */
  world: WorldClock;
  /** Posun času hráče ve dnech (vývojový režim) – hodiny v liště a ve scéně jdou o tolik napřed. */
  timeOffsetDays: number;
  /** Vývojový režim účtu – šipky přeskočení času vedle data. */
  devMode: boolean;
  /** E-mail přihlášeného hráče (popisek odhlášení v nabídce). */
  email: string;
  /** Čas serveru při renderu (datum v liště sedí s HTML ze serveru). */
  initialNowMs: number;
}): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [village, setVillage] = useState<VillageData>(initialVillage);
  const [pending, setPending] = useState<PendingSite[]>([]);
  const [selected, setSelected] = useState<VillageTarget | null>(null);
  const [placingItem, setPlacingItem] = useState<BuildKind | null>(null);
  const [notices, setNotices] = useState<NoticeLine[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timeOffsetDays, setTimeOffsetDays] = useState(initialTimeOffsetDays);
  const [skipping, setSkipping] = useState<TimeSkip | null>(null);
  const [foundingDevVillage, setFoundingDevVillage] = useState(false);
  const [soundOn, setSoundOn] = useSoundPreference();
  // Hodiny hráče: svět posunutý o jeho posun času – datum, roční období i dým jako na serveru.
  const clock = useMemo(() => shiftWorldClock(world, timeOffsetDays), [world, timeOffsetDays]);
  const placement = usePlacement(scene);
  const view = isVillageView(village) ? village : null;
  const villageError = village !== null && 'error' in village ? village.error : null;
  const gameOver = view?.gameOver === true;
  // Po konci hry je přes všechno obrazovka porážky – nabídka se neukáže.
  const menuShown = menuOpen && !gameOver;

  // Pořadí odpovědí: dotaz, který začal dřív než už použitá odpověď, se zahodí.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const busyRef = useRef(false);
  /** Akce na serveru jdou za sebou (Shift + klik staví víc obydlí rychle po sobě). */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const viewRef = useRef(view);
  const pendingRef = useRef<PendingSite[]>([]);
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
    scene?.setWorldClock(clock);
  }, [scene, clock]);

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

  // Výběr kliknutím do scény (s Ctrl / Shift přidá nebo ubere obydlí); zaniklý cíl (dostavěné
  // staveniště, zarostlé pole) se zruší, z víc obydlí zbydou jen ta, která ještě stojí.
  useEffect(
    () =>
      scene?.onSelect((target, additive) =>
        setSelected((prev) => nextSelection(prev, target, additive)),
      ),
    [scene],
  );
  const current = useMemo(() => presentTarget(sceneVillage, selected), [sceneVillage, selected]);
  const sceneVillageRef = useRef(sceneVillage);
  useEffect(() => {
    sceneVillageRef.current = sceneVillage;
  }, [sceneVillage]);
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
    const result = await getVillageView({ villageId: viewRef.current?.id ?? null });
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
    (action: () => Promise<VillageData>): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        busyRef.current = true;
        const seq = ++requestSeq.current;
        try {
          const result = await action();
          if (result !== null && 'error' in result) return result.error;
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

  const setPendingList = (list: PendingSite[]): void => {
    pendingRef.current = list;
    setPending(list);
  };

  /**
   * Postaví obydlí – první zemnice ves založí (osadníci si ji postaví), další jsou stavby;
   * polozemnice na pozemku (`plot`).
   */
  const buildDwelling = (type: DwellingType, position: Position, plot?: DwellingPlot): void => {
    const entry: PendingSite = {
      kind: 'dwelling',
      id: -1 - pendingId.current++,
      type,
      position,
      ...(plot ? { plot: scenePlot(decoded, plot) } : {}),
    };
    setPendingList([...pendingRef.current, entry]);
    const villageId = viewRef.current?.id ?? null;
    void runBuildAction(() =>
      villageId === null
        ? foundVillage({ name: suggestVillageName(seed), dwelling: position })
        : placeDwelling({ villageId, type, position, ...(plot ? { plot } : {}) }),
    ).finally(() => setPendingList(pendingRef.current.filter((d) => d.id !== entry.id)));
  };

  /**
   * Nový dům stěhující se domácnosti (migration.md) – staveniště hned ve scéně, server umístění
   * ověří znovu.
   */
  const buildRelocation = (
    villageId: string,
    dwellingId: number,
    result: Extract<PlacementResult, { kind: 'dwelling' }>,
  ): void => {
    const { type, position, plot } = result;
    const entry: PendingSite = {
      kind: 'dwelling',
      id: -1 - pendingId.current++,
      type,
      position,
      ...(plot ? { plot: scenePlot(decoded, plot) } : {}),
    };
    setPendingList([...pendingRef.current, entry]);
    void runBuildAction(() =>
      relocateHousehold({ villageId, dwellingId, type, position, ...(plot ? { plot } : {}) }),
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

  // vymřelá ves nic nestaví – nabídka staveb je prázdná (i zkratky)
  const options: Partial<Record<BuildKind, BuildOption | null>> = view
    ? view.extinct
      ? {}
      : view.build
    : villageError === null
      ? { zemnice: null }
      : {};

  /** Umisťování obydlí: zemnice půdorysem u kurzoru, polozemnice na pozemku (políčku). */
  const dwellingMode = (type: DwellingType): PlacementMode => {
    const item = buildItem(type);
    if (item.placement === 'plot') {
      return {
        kind: 'plot',
        type,
        check: (plot) =>
          item.check(decoded, placementVillage(), plot, viewRef.current?.woodLogs ?? 0),
      };
    }
    if (item.placement !== 'footprint') throw new Error(`${type} se neumisťuje jako obydlí.`);
    return {
      kind: 'dwelling',
      type,
      check: (position) =>
        item.check(decoded, placementVillage(), position, viewRef.current?.woodLogs ?? 0),
    };
  };

  /**
   * Přestěhovat domácnosti obydlí `householdIds` (migration.md): hráč umístí nový dům typu
   * `type` postupně za každou domácnost – po umístění jedné hned běží umisťování další (jako
   * Shift + klik u staveb); Esc nebo pravé tlačítko zbytek zruší.
   */
  const relocate = (type: DwellingType, householdIds: readonly number[]): void => {
    const villageId = viewRef.current?.id;
    if (!scene || !villageId || householdIds.length === 0) return;
    const queue = [...householdIds];
    setSelected(null);
    setPlacingItem(null);
    const run = (): void => {
      placement.start(dwellingMode(type), (result, keepPlacing) => {
        const household = queue.shift();
        if (result.kind !== 'dwelling' || household === undefined) return;
        buildRelocation(villageId, household, result);
        if (queue.length === 0) {
          if (keepPlacing) placement.cancel();
        } else if (!keepPlacing) run();
      });
    };
    run();
  };

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
          const villageId = viewRef.current?.id;
          if (result.kind === 'squares' && villageId) {
            void runBuildAction(() => submit(villageId, result.cells));
          }
        },
      );
      return;
    }
    const onDwelling = (result: PlacementResult): void => {
      if (result.kind === 'dwelling') buildDwelling(result.type, result.position, result.plot);
    };
    if (item.placement === 'plot' || item.placement === 'footprint') {
      placement.start(dwellingMode(item.dwellingType), onDwelling);
      return;
    }
    if (item.placement === 'workshop') {
      placement.start(
        {
          kind: 'workshop',
          craft: item.craft,
          type: item.dwellingType,
          check: (position) =>
            item.check(decoded, placementVillage(), position, viewRef.current?.woodLogs ?? 0),
        },
        (result) => {
          if (result.kind === 'workshop') buildWorkshop(result.craft, result.position);
        },
      );
      return;
    }
    if (item.placement === 'sacred') {
      placement.start(
        {
          kind: 'sacred',
          type: item.sacredKind,
          check: (position) => item.check(decoded, placementVillage(), position),
        },
        (result) => {
          if (result.kind === 'sacred') buildSacred(result.type, result.position);
        },
      );
      return;
    }
  };
  const startBuildRef = useRef(startBuild);
  useEffect(() => {
    startBuildRef.current = startBuild;
  });

  // Nabídka hry: otevření zruší umisťování i výběr – v nabídce se nestaví ani nevybírá.
  const cancelPlacement = placement.cancel;
  const openMenu = (): void => {
    if (gameOver) return;
    cancelPlacement();
    setSelected(null);
    setMenuOpen(true);
  };
  const openMenuRef = useRef(openMenu);
  useEffect(() => {
    openMenuRef.current = openMenu;
  });
  const closeMenu = useCallback((): void => setMenuOpen(false), []);

  // Klávesy rozhraní: F10 otevře nabídku, zkratky staveb (Z, X, C, V, B, N, M, F, G, H, O), Esc zruší
  // výběr.
  // Otevřená nabídka klávesy zachytí dřív (GameMenu) – sem pak nedojdou.
  const placingRef = useRef(placement.active);
  useEffect(() => {
    placingRef.current = placement.active;
  }, [placement.active]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      if (opensMenu(event)) {
        event.preventDefault(); // F10 v některých prohlížečích skočí do jejich nabídky
        openMenuRef.current();
        return;
      }
      if (event.code === 'Escape' && placingRef.current === null) {
        setSelected(null);
        return;
      }
      // Ctrl + A – všechna obydlí vsi (migration.md); při umisťování ne (malování po čtvercích)
      if (selectsAllDwellings(event)) {
        event.preventDefault(); // prohlížeč by označil text stránky
        if (placingRef.current === null) setSelected(allDwellingsTarget(sceneVillageRef.current));
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

  const rename = (name: string): Promise<string | null> => {
    const villageId = viewRef.current?.id;
    return villageId
      ? runAction(() => renameVillage({ villageId, name }))
      : Promise.resolve(CONNECTION_FAILED);
  };

  /**
   * Přepne na jinou ves hráče (přepínač v liště) a zapamatuje ji (cookie). Ves na téže mapě se
   * načte na místě a pohled skočí na ni; ves na jiné mapě má jinou krajinu – stránka se načte
   * znovu (server ověří, že ves patří hráči).
   */
  const switchVillage = (village: VillageListItem): void => {
    const shown = viewRef.current;
    if (!shown || village.id === shown.id) return;
    cancelPlacement();
    setSelected(null);
    if (village.settlementId !== settlementId) {
      rememberVillage(village.id);
      window.location.reload();
      return;
    }
    void runAction(() => selectVillage({ villageId: village.id })).then((failure) => {
      if (failure !== null) {
        pushNotice({ kind: 'error', tone: 'error', text: failure });
        return;
      }
      rememberVillage(village.id);
      lookAtVillage();
    });
  };

  /** Pohled na první obydlí (staveniště) právě ukázané vsi – po přepnutí vsi. */
  const lookAtVillage = (): void => {
    const first = viewRef.current?.scene.dwellings[0]?.position;
    if (first) scene?.moveCameraTo(first.x, first.z);
  };

  /** Vývojový režim: druhá ves na téže mapě – rozhraní se na ni hned přepne. */
  const foundSecondVillage = (): void => {
    const villageId = viewRef.current?.id;
    if (!villageId || foundingDevVillage) return;
    cancelPlacement();
    setSelected(null);
    setFoundingDevVillage(true);
    void runAction(() => foundDevVillage({ villageId })).then((failure) => {
      setFoundingDevVillage(false);
      if (failure !== null) {
        pushNotice({ kind: 'error', tone: 'error', text: failure });
        return;
      }
      const founded = viewRef.current?.id;
      if (founded) rememberVillage(founded);
      lookAtVillage();
    });
  };

  /**
   * Vývojový režim: přeskočí čas o měsíc, nebo rok. Server posune čas hráče a vrátí ves
   * v novém dni – hodiny v liště a ve scéně se posunou s ní. Dokud se čeká, šipky čekají.
   */
  const skippingRef = useRef(false);
  const skipTimeBy = (skip: TimeSkip): void => {
    // ref: dvojklik dřív, než se tlačítka překreslí jako zamčená, nepřeskočí dvakrát
    if (skippingRef.current) return;
    skippingRef.current = true;
    setSkipping(skip);
    void runAction(async () => {
      const result = await skipTime({ skip, villageId: viewRef.current?.id ?? null });
      if ('error' in result) return result;
      setTimeOffsetDays(result.timeOffsetDays);
      return result.village;
    }).then((failure) => {
      skippingRef.current = false;
      setSkipping(null);
      if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
    });
  };

  // Ves vymřela uprostřed umisťování – stavba už nejde, umisťování skončí.
  const extinct = Boolean(view?.extinct);
  useEffect(() => {
    if (extinct) cancelPlacement();
  }, [extinct, cancelPlacement]);

  /**
   * Začít znovu – nové sídlo s novou krajinou, proto se stránka načte znovu. Po konci hry
   * (obrazovka porážky) bez `abandon`, z nabídky se živou vsí s `abandon` (hráč to potvrdil).
   */
  const restart = async (abandon: boolean): Promise<string | null> => {
    try {
      const result = await restartGame(abandon ? { abandon: true } : undefined);
      if ('error' in result) return result.error;
      window.location.reload();
      return null;
    } catch (error) {
      console.error('Nový začátek selhal.', error);
      return CONNECTION_FAILED;
    }
  };

  /** Odhlášení z nabídky – i se session už neplatnou (odhlášení v jiném panelu) na úvod. */
  const signOut = async (): Promise<string | null> => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error('Odhlášení selhalo.', error);
      return SIGN_OUT_FAILED;
    }
    window.location.assign('/');
    return null;
  };

  return (
    <>
      <GameView landscape={landscape} onSceneReady={setScene} overlays={false} />
      <TopBar
        view={view}
        world={clock}
        initialNowMs={initialNowMs}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        menuOpen={menuShown}
        onToggleMenu={() => (menuShown ? closeMenu() : openMenu())}
        onRename={rename}
        onSelectVillage={switchVillage}
        devTime={devMode ? { pending: skipping, onSkip: skipTimeBy } : null}
        devVillage={
          devMode && view && !view.extinct
            ? { pending: foundingDevVillage, onFound: foundSecondVillage }
            : null
        }
      />
      <Minimap landscape={decoded} scene={scene} village={sceneVillage} />
      <SelectionPanel
        details={selectionDetails(view, sceneVillage, current)}
        onTrainTeam={(penId) => {
          const villageId = viewRef.current?.id;
          return villageId
            ? runBuildAction(() => trainTeam({ villageId, penId }))
            : Promise.resolve();
        }}
        onRelocate={relocate}
        onCancelRelocation={(constructionId) => {
          const villageId = viewRef.current?.id;
          return villageId
            ? runBuildAction(() => cancelRelocation({ villageId, constructionId }))
            : Promise.resolve();
        }}
      />
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
      {menuShown && (
        <GameMenu
          canRestart={view !== null}
          email={email}
          onClose={closeMenu}
          onRestart={() => restart(true)}
          onSignOut={signOut}
        />
      )}
      {gameOver && view?.extinct && (
        <DefeatScreen name={view.name} lifespan={view.extinct} onRestart={() => restart(false)} />
      )}
    </>
  );
}
