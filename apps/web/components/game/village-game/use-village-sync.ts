'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Landscape, PlayerNotice, WorldClock } from '@bohemia/game';
import { getVillageView } from '@/app/game/actions';
import { usePolling } from '@/hooks/use-polling';
import { cartRoutesRequest, withCartRouteResult, withCartRoutes } from '@/lib/cart-routes';
import { cartRouter } from '@/lib/cart-router';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { LandscapeTransfer } from '@/lib/landscape-transfer';
import { isVillageNone } from '@/lib/player-notices';
import { keepSceneData, knownSceneData, lostSceneData } from '@/lib/scene-routes';
import { knownViewPieces, unpackViewPieces } from '@/lib/view-pieces';
import { newNotices } from '@/lib/village-notices';
import { nextPollDelayMs } from '@/lib/village-polling';
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
  /** Poslední použitý stav vsi ze serveru (s trasami vozů dne). */
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
}

/**
 * Stav vsi ze serveru (web-ui.md – Dotazování na ves): dotaz na začátku dalšího herního dne
 * (`usePolling`), použití nového pohledu s trasami vozů z Web Workeru (`cartRouter`), pořadí
 * odpovědí a fronta akcí. Upozornění mezi hráči z odpovědi předá `playerNotices` (ref – obsluhu
 * skládají panely, které potřebují `viewRef`), nová upozornění vsi `pushNotice`.
 */
export function useVillageSync({
  initialVillage,
  landscape,
  decoded,
  settlementId,
  clock,
  pushNotice,
  playerNotices,
}: {
  initialVillage: VillageData;
  landscape: LandscapeTransfer;
  decoded: Landscape;
  settlementId: string;
  clock: WorldClock;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
  playerNotices: RefObject<(received: readonly PlayerNotice[] | undefined) => void>;
}): VillageSync {
  // trasy vozů a spřežení spočítá prohlížeč z cílů, které poslal server (cart-routes.ts)
  const [village, setVillage] = useState<VillageData>(() =>
    isVillageView(initialVillage)
      ? { ...initialVillage, scene: withCartRoutes(initialVillage.scene, decoded) }
      : initialVillage,
  );
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
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
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

  /**
   * Použije nový stav vsi a ohlásí upozornění, která mezitím nově vznikla. Pohled se použije až
   * s trasami vozů dne (z Workeru); novější pohled, který mezitím přišel, má přednost.
   */
  const applyVillage = useCallback(
    async (received: VillageData): Promise<void> => {
      const ticket = ++applyTicket.current;
      // kusy pohledu, které server vynechal (klient je má), se doplní z posledního pohledu
      // (view-pieces.ts); trasy vozů a spřežení spočítá prohlížeč z cílů dne (cart-routes.ts)
      const unpacked = isVillageView(received)
        ? unpackViewPieces(received, viewRef.current)
        : { view: null, lost: false };
      let next: VillageData = received;
      if (unpacked.view) {
        const scene = keepSceneData(unpacked.view.scene, viewRef.current?.scene);
        const request = cartRoutesRequest(scene);
        next = {
          ...unpacked.view,
          scene: request ? withCartRouteResult(scene, await router.routes(request)) : scene,
        };
      }
      if (ticket !== applyTicket.current) return;
      setVillage(next);
      if (!isVillageView(next)) return;
      // zahozená trasy nebo vyšlapanost: bez otisku, ať další dotaz doručí plný pohled hned
      viewRef.current =
        unpacked.lost || (isVillageView(received) && lostSceneData(received.scene, next.scene))
          ? withoutStamp(next)
          : next;
      // nový pohled napřed – chyba při porovnání (pohled z doby před změnou kódu) se nesmí
      // opakovat při každém dalším dotazu
      const previous = noticedRef.current;
      noticedRef.current = next;
      for (const notice of newNotices(previous, next)) pushNotice(notice);
    },
    [pushNotice, router],
  );

  const poll = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    const seq = ++requestSeq.current;
    const known = viewRef.current?.stamp;
    const result = await getVillageView({
      villageId: viewRef.current?.id ?? null,
      ...(known ? { known } : {}),
      ...knownSceneData(viewRef.current?.scene),
      pieces: knownViewPieces(viewRef.current),
      withNotices: true,
    });
    // Server upozornění už označil za přečtená – ukázat i z odpovědi, která se jinak zahodí.
    if (result !== null && 'playerNotices' in result) playerNotices.current(result.playerNotices);
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
    } else await applyVillage(result);
  }, [applyVillage, playerNotices, pushNotice, settlementId]);
  // Další dotaz na začátku dalšího herního dne hráče (nejdřív za 5 s, nejpozději za 86 s) – ves
  // se dopočítává po dnech, akce vracejí čerstvou ves samy.
  const pollDelay = useCallback(
    (): number => nextPollDelayMs(viewRef.current?.dayIndex ?? null, clock, Date.now()),
    [clock],
  );
  // Bez vsi se ptáme jen kvůli upozorněním mezi hráči (založení vrátí pohled samo); po konci hry
  // se nic nemění.
  const pollNow = usePolling(poll, pollDelay, !gameOver);
  // Testovací háček: zeptat se na ves hned (test změnil uloženou ves přímo v databázi).
  useEffect(() => {
    setE2EHook('pollVillage', pollNow);
    return () => setE2EHook('pollVillage', undefined);
  }, [pollNow]);

  const runAction = useCallback(
    (action: () => Promise<VillageData>): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        busyRef.current = true;
        const seq = ++requestSeq.current;
        try {
          const result = await action();
          if (result !== null && 'error' in result) return result.error;
          appliedSeq.current = Math.max(appliedSeq.current, seq);
          await applyVillage(result);
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

  const runBuildAction = useCallback(
    (action: () => Promise<ActionResult>): Promise<void> =>
      runAction(action).then((failure) => {
        if (failure !== null) pushNotice({ kind: 'error', tone: 'error', text: failure });
      }),
    [runAction, pushNotice],
  );

  return { village, view, villageError, viewRef, runAction, runBuildAction };
}
