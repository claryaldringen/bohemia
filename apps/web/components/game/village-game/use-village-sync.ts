'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Landscape, MapWatch, PlayerNotice, WorldClock } from '@bohemia/game';
import { getVillageView } from '@/app/game/actions';
import {
  useEventScope,
  useSerialRefresh,
  useServerEvent,
  useServerResync,
} from '@/hooks/use-server-events';
import {
  carriedCartRoutes,
  cartRoutesMemo,
  cartRoutesOf,
  cartRoutesRequest,
  withCartRouteResult,
  type CartRoutesMemo,
} from '@/lib/cart-routes';
import { cartRouter } from '@/lib/cart-router';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { LandscapeTransfer } from '@/lib/landscape-transfer';
import { isVillageNone } from '@/lib/player-notices';
import { keepSceneData, knownSceneData, lostSceneData } from '@/lib/scene-routes';
import { knownViewPieces, unpackViewPieces } from '@/lib/view-pieces';
import { nextDayCheckMs } from '@/lib/village-day-check';
import { villageEventIsNews } from '@/lib/village-events';
import { newNotices } from '@/lib/village-notices';
import type { VillageView } from '@/lib/village-view';
import type { NoticeLine } from '../hud/NoticeLines';
import {
  CONNECTION_FAILED,
  isVillageView,
  withoutStamp,
  type ActionResult,
  type VillageData,
} from './village-data';

export interface VillageSync {
  /** Poslední použitý stav vsi ze serveru (s trasami vozů – do dopočtu nových s posledními). */
  village: VillageData;
  /** Pohled na ves, nebo null (ještě nezaložená, chyba). */
  view: VillageView | null;
  /** Chyba, proč ves nejde zobrazit; null – žádná. */
  villageError: string | null;
  /** Poslední pohled pro akce a dotazy – čte se až při volání (akce jdou rychle po sobě). */
  viewRef: RefObject<VillageView | null>;
  /** Akce nad vsí na serveru (ve frontě za předchozími); vrátí chybu pro hráče, nebo null. */
  runAction: (action: () => Promise<VillageData>) => Promise<string | null>;
  /** Akce stavby – chyba se ohlásí řádkem nahoře. */
  runBuildAction: (action: () => Promise<ActionResult>) => Promise<void>;
  /** Zeptá se na ves hned (i s upozorněními) – např. po návratu vojvody z výjezdu. */
  refresh: () => void;
  /** Válka nebo jezdci na mapě vsi – jen tehdy se scéna ptá na válku a jezdce (D62). */
  watch: MapWatch;
}

/** Odložená obnova, která platí vždy (upozornění, obnova po mezeře, hlídač dne, `refresh`). */
const ALWAYS = (): boolean => true;

/**
 * Stav vsi ze serveru (web-ui.md – Obnova pohledu vsi (události)): dotaz jen na událost serveru –
 * `village` s novou verzí (`villageEventIsNews`), `notices`, obnova po mezeře spojení – a na
 * hlídač dne (svět bez workeru); dotazy jdou po jednom, náraz dá nejvýš jeden další. Nový pohled
 * se použije hned a trasy vozů z Web Workeru (`cartRouter`), až dojdou; pořadí odpovědí a fronta
 * akcí. Odpověď dotazu řekne i, jestli je na mapě válka nebo jezdci (`watch`). Upozornění mezi
 * hráči z odpovědi předá `playerNotices` (ref – obsluhu skládají panely, které potřebují
 * `viewRef`), nová upozornění vsi `pushNotice`.
 */
export function useVillageSync({
  initialVillage,
  landscape,
  decoded,
  settlementId,
  clock,
  pushNotice,
  playerNotices,
  initialWatch,
}: {
  initialVillage: VillageData;
  /** Válka a jezdci na mapě při načtení stránky (`mapWatchForPlayer`). */
  initialWatch: MapWatch;
  landscape: LandscapeTransfer;
  decoded: Landscape;
  settlementId: string;
  clock: WorldClock;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  playerNotices: RefObject<(received: readonly PlayerNotice[] | undefined) => void>;
}): VillageSync {
  // trasy vozů a spřežení spočítá prohlížeč z cílů, které poslal server (cart-routes.ts); první
  // pohled v hlavním vlákně (jednou při načtení stránky)
  const [first] = useState(() => firstVillage(initialVillage, decoded));
  const [village, setVillage] = useState<VillageData>(first.village);
  // Děje se na mapě vsi něco, na co se scéna ptá zvlášť (válka, jezdci)? Řekne dotaz na ves (D62).
  const [watch, setWatch] = useState<MapWatch>(initialWatch);
  const view = isVillageView(village) ? village : null;
  const villageError = village !== null && 'error' in village ? village.error : null;
  const gameOver = view?.gameOver === true;

  // Pořadí odpovědí: dotaz, který začal dřív než už použitá odpověď, se zahodí.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const busyRef = useRef(false);
  /**
   * Obnovy, o které se během akce někdo řekl – po akci se ověří znovu (událost uložení, které
   * udělala sama akce, už po ní nic nenese – Rozhodnutí 5) a stačí jedna.
   */
  const pendingRef = useRef<(() => boolean)[]>([]);
  /** Akce na serveru jdou za sebou (Shift + klik staví víc obydlí rychle po sobě). */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  // po konci hry se nic nemění – žádné dotazy
  const gameOverRef = useRef(gameOver);
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);
  // Klient zahodil trasy nebo vyšlapanost – další dotaz se zeptá bez otisku a kusů (plný pohled).
  // Drží se mimo `viewRef`: efekt výš by pohled bez otisku po vykreslení přepsal zpátky.
  const stampLostRef = useRef(false);
  // Poslední použitý pohled na ves – nová upozornění se počítají proti němu.
  const noticedRef = useRef<VillageView | null>(view);

  // trasy vozů nových dní počítá Web Worker (cart-router.ts) – scéna mezitím nestojí
  const router = useMemo(() => cartRouter(landscape, decoded), [landscape, decoded]);
  useEffect(() => () => router.dispose(), [router]);
  // Testovací háček: trasy vozů přes týž router (Worker i záloha) – e2e/cart-worker.spec.ts
  useEffect(() => {
    setE2EHook('cartRoutes', (request) => router.routes(request));
    return () => setE2EHook('cartRoutes', undefined);
  }, [router]);
  const applyTicket = useRef(0);
  // poslední spočítané trasy – nový pohled jede s nimi, než dojdou jeho vlastní
  const routesMemo = useRef<CartRoutesMemo | null>(first.memo);

  /**
   * Použije nový stav vsi hned a ohlásí upozornění, která mezitím nově vznikla. Trasy vozů dne
   * počítá Web Worker mimo kritickou cestu (D63): do té doby pohled jede s posledními známými
   * trasami (`carriedCartRoutes`), s novými se použije znovu – jen když mezitím nepřišel novější
   * pohled. Na trasy tak nečeká dotazování na ves ani fronta akcí.
   */
  const applyVillage = useCallback(
    (received: VillageData): void => {
      const ticket = ++applyTicket.current;
      // kusy pohledu, které server vynechal (klient je má), se doplní z posledního pohledu
      // (view-pieces.ts); trasy vozů a spřežení spočítá prohlížeč z cílů dne (cart-routes.ts)
      const unpacked = isVillageView(received)
        ? unpackViewPieces(received, viewRef.current)
        : { view: null, lost: false };
      let next: VillageData = received;
      if (unpacked.view) {
        const view = unpacked.view;
        const scene = keepSceneData(view.scene, viewRef.current?.scene);
        const request = cartRoutesRequest(scene);
        if (request) {
          const carried = carriedCartRoutes(scene, request, routesMemo.current);
          const applied: VillageView = { ...view, scene: withCartRouteResult(scene, carried) };
          next = applied;
          void router.routes(request).then((result) => {
            if (result === null) return;
            routesMemo.current = cartRoutesMemo(scene, request, result);
            if (ticket !== applyTicket.current) return;
            const routed: VillageView = { ...view, scene: withCartRouteResult(scene, result) };
            if (viewRef.current === applied) viewRef.current = routed;
            if (noticedRef.current === applied) noticedRef.current = routed;
            setVillage(routed);
          });
        } else next = { ...view, scene };
      }
      setVillage(next);
      if (!isVillageView(next)) return;
      // zahozená trasy nebo vyšlapanost: další dotaz bez otisku, ať doručí plný pohled hned
      viewRef.current = next;
      stampLostRef.current =
        unpacked.lost || (isVillageView(received) && lostSceneData(received.scene, next.scene));
      // nový pohled napřed – chyba při porovnání (pohled z doby před změnou kódu) se nesmí
      // opakovat při každém dalším dotazu
      const previous = noticedRef.current;
      noticedRef.current = next;
      for (const notice of newNotices(previous, next)) pushNotice(notice);
    },
    [pushNotice, router],
  );

  const poll = useCallback(async (): Promise<void> => {
    const seq = ++requestSeq.current;
    const base =
      stampLostRef.current && viewRef.current ? withoutStamp(viewRef.current) : viewRef.current;
    const known = base?.stamp;
    const result = await getVillageView({
      villageId: viewRef.current?.id ?? null,
      ...(known ? { known } : {}),
      ...knownSceneData(viewRef.current?.scene),
      pieces: knownViewPieces(base),
      withNotices: true,
    });
    // Server upozornění už označil za přečtená – ukázat i z odpovědi, která se jinak zahodí.
    if (result !== null && 'playerNotices' in result) playerNotices.current(result.playerNotices);
    // co se děje na mapě vsi (válka, jezdci) – i z nezměněného pohledu (D62)
    if (result !== null && 'watch' in result && result.watch) {
      const fresh = result.watch;
      setWatch((old) => (old.war === fresh.war && old.riders === fresh.riders ? old : fresh));
    }
    if (busyRef.current || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    // Hráč ještě nemá ves – dorazila jen upozornění; ves, kterou jsme měli, zmizela (jako null).
    if (isVillageNone(result)) {
      if (viewRef.current !== null) window.location.reload();
      return;
    }
    // Od pohledu, který máme, se nic nezměnilo (stejný den i verze vsí) – server nic neposlal.
    if (result !== null && 'unchanged' in result) return;
    // Ves zmizela nebo leží na jiné mapě (restart hry v jiném panelu) – načíst znovu i s krajinou.
    const lost = viewRef.current !== null && result === null;
    if (lost || (isVillageView(result) && result.settlementId !== settlementId)) {
      window.location.reload();
      return;
    }
    // Chyba (např. odhlášení v jiném panelu) poslední pohled na ves nesmaže – jen se ohlásí.
    if (result !== null && 'error' in result && viewRef.current) {
      pushNotice({ kind: 'error', tone: 'error', text: result.error });
    } else applyVillage(result);
  }, [applyVillage, playerNotices, pushNotice, settlementId]);

  // Dotaz na ves hned: jeden naráz, volání během něj dají nejvýš jeden další. Během akce se
  // obnova odloží za ni – akce vrátí čerstvý pohled sama (odpověď dotazu by se stejně zahodila).
  const ask = useSerialRefresh(poll, 'Stav vsi se nepodařilo načíst.');
  const refreshWhen = useCallback(
    (stillNews: () => boolean): void => {
      if (gameOverRef.current) return;
      if (busyRef.current) pendingRef.current.push(stillNews);
      else if (stillNews()) ask();
    },
    [ask],
  );
  const refreshNow = useCallback((): void => refreshWhen(ALWAYS), [refreshWhen]);

  // Události ze serveru (server-events.md – Klient): spojení nese zobrazenou ves; novou verzi vsi
  // hráče, nová upozornění a mezeru ve spojení (`sync`, kolo pojistky) dočte dotaz na ves.
  useEventScope({ villageId: view?.id ?? null });
  useServerEvent('village', (event) => {
    refreshWhen(() => villageEventIsNews(viewRef.current, event));
  });
  useServerEvent('notices', refreshNow);
  useServerResync(refreshNow);

  // Hlídač dne (Rozhodnutí 8): nový den oznámí uložení vsi workerem. Když pohled nového dne
  // nepřijde do `DAY_CHECK_GRACE_MS` po začátku dne (svět bez workeru, přetížený worker), zeptá
  // se jednou sám – jen ve viditelném panelu (skrytý dočte vše po návratu, `sync` s mezerou).
  const dayIndex = view?.dayIndex ?? null;
  useEffect(() => {
    if (gameOver) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (): void => {
      const ms = nextDayCheckMs(dayIndex, clock, Date.now());
      // dlouhý odklad po kouscích – setTimeout nad 2^31 − 1 ms by se spustil hned
      if (ms !== null) timer = setTimeout(check, Math.min(ms, MAX_TIMER_MS));
    };
    const check = (): void => {
      timer = null;
      if ((nextDayCheckMs(dayIndex, clock, Date.now()) ?? 0) > 0) {
        arm();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if ((viewRef.current?.dayIndex ?? null) === dayIndex) refreshNow();
    };
    arm();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [dayIndex, gameOver, clock, refreshNow]);

  // Testovací háček: zeptat se na ves hned (test změnil uloženou ves přímo v databázi – záloha,
  // změnu oznámí i trigger).
  useEffect(() => {
    setE2EHook('pollVillage', refreshNow);
    return () => setE2EHook('pollVillage', undefined);
  }, [refreshNow]);

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
          // obnovy odložené za akci – s pohledem akce (událost jejího vlastního uložení nic nestojí)
          const pending = pendingRef.current;
          pendingRef.current = [];
          if (pending.some((stillNews) => stillNews())) refreshNow();
        }
      };
      const next = queueRef.current.then(run, run);
      queueRef.current = next;
      return next;
    },
    [applyVillage, refreshNow],
  );

  const runBuildAction = useCallback(
    (action: () => Promise<ActionResult>): Promise<void> =>
      runAction(action).then((failure) => {
        if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
      }),
    [runAction, pushNotice],
  );

  return {
    village,
    view,
    villageError,
    viewRef,
    runAction,
    runBuildAction,
    refresh: refreshNow,
    watch,
  };
}

/** Nejdelší odklad `setTimeout` (2^31 − 1 ms) – delší se v prohlížeči spustí hned. */
const MAX_TIMER_MS = 2_147_483_647;

/** První pohled s trasami vozů z hlavního vlákna a paměť tras pro další pohledy. */
function firstVillage(
  initial: VillageData,
  decoded: Landscape,
): { village: VillageData; memo: CartRoutesMemo | null } {
  const request = isVillageView(initial) ? cartRoutesRequest(initial.scene) : null;
  if (!isVillageView(initial) || !request) return { village: initial, memo: null };
  const result = cartRoutesOf(request, decoded);
  return {
    village: { ...initial, scene: withCartRouteResult(initial.scene, result) },
    memo: cartRoutesMemo(initial.scene, request, result),
  };
}
