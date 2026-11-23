'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import type { LevyDialogView, MarketVillage } from '@bohemia/game';
import {
  getMarketOverview,
  levyDialogs,
  passagesToAnswer,
  protectionView,
} from '@/app/game/actions';
import type { ProtectionView } from '@/lib/protection';
import type { PassageView, SummonsDialogView } from '@/lib/summons';
import type { VillageView } from '@/lib/village-view';
import { CONNECTION_FAILED } from './village-data';

export interface Panels {
  /** Nabídka hry (F10) – po konci hry se neukáže (`menuShown` ve `VillageGame`). */
  menuOpen: boolean;
  /** Otevře nabídku a zavře panely rodu a války (umisťování a výběr zruší `VillageGame`). */
  showMenu: () => void;
  closeMenu: () => void;
  /** Zavře nabídku i panely rodu a války – otevřela se kronika nebo upozornění. */
  closeAll: () => void;
  houseOpen: boolean;
  openHouse: () => void;
  closeHouse: () => void;
  warOpen: boolean;
  openWar: () => void;
  closeWar: () => void;
  /** Ohlášené průchody vojsk, na které hráč odpovídá (panel války). */
  passages: PassageView[];
  refreshPassages: () => Promise<void>;
  /** Ochrana vojskem zobrazené vsi (vassalage.md – Ochrana vojskem). */
  protection: ProtectionView | null;
  /** Akce panelu války se serverem: chyba spojení = hláška, po úspěchu nové načtení ochrany. */
  warAction: (
    run: () => Promise<{ error: string } | object>,
  ) => Promise<{ ok: true } | { error: string }>;
  /** Dialog Odvody (úloha 4.4) – rozdělení po vsích se počítá až při otevření. */
  levy: {
    open: boolean;
    dialogs: LevyDialogView[] | null;
    summons: SummonsDialogView[];
    error: string | null;
  };
  openLevy: () => Promise<void>;
  closeLevy: () => void;
  /** Panel Trh (markets.md – Pravidla 9) – přehled vsí se načte až při otevření. */
  market: { open: boolean; villages: MarketVillage[] | null; error: string | null };
  openMarket: () => Promise<void>;
  closeMarket: () => void;
}

/**
 * Panely z lišty, které se střídají (web-ui.md – Panel „Rod a vazalové“, Panel války, Dialog
 * Odvody): nabídka hry, rod, válka a odvody. Otevření jednoho zavře nabídku (a rod s válkou
 * jeden druhý); data panelu války a odvodů se načítají až při otevření. Kronika a upozornění
 * se s nimi střídají přes `closeAll` (`useHistoryPanels`).
 */
export function usePanels({
  refreshHouse,
  refreshEscheats,
  setHouseError,
  viewRef,
}: {
  refreshHouse: () => Promise<void>;
  refreshEscheats: () => Promise<void>;
  setHouseError: (error: string | null) => void;
  viewRef: RefObject<VillageView | null>;
}): Panels {
  const [menuOpen, setMenuOpen] = useState(false);
  const [houseOpen, setHouseOpen] = useState(false);
  const [warOpen, setWarOpen] = useState(false);
  const openHouse = useCallback((): void => {
    setMenuOpen(false);
    setWarOpen(false);
    setHouseError(null);
    setHouseOpen(true);
    void refreshHouse();
    void refreshEscheats();
  }, [refreshHouse, refreshEscheats, setHouseError]);
  const closeHouse = useCallback((): void => setHouseOpen(false), []);
  // Panel války (war.md – Co hráč vidí): textový přehled válek; data jsou v pohledu na rod
  const [passages, setPassages] = useState<PassageView[]>([]);
  const refreshPassages = useCallback(async (): Promise<void> => {
    try {
      const result = await passagesToAnswer();
      if ('passages' in result) setPassages(result.passages);
    } catch {
      // ohlášení se ukážou při dalším otevření panelu
    }
  }, []);
  // ochrana vojskem (vassalage.md – Ochrana vojskem) – pro zobrazenou ves
  const [protection, setProtection] = useState<ProtectionView | null>(null);
  const refreshProtection = useCallback(async (): Promise<void> => {
    try {
      const result = await protectionView({ villageId: viewRef.current?.id ?? null });
      if ('protection' in result) setProtection(result.protection);
    } catch {
      // ochrana se ukáže při dalším otevření panelu
    }
  }, [viewRef]);
  const warAction = useCallback(
    async (
      run: () => Promise<{ error: string } | object>,
    ): Promise<{ ok: true } | { error: string }> => {
      try {
        const result = await run();
        if ('error' in result) return { error: result.error };
        void refreshProtection();
        return { ok: true };
      } catch {
        return { error: CONNECTION_FAILED };
      }
    },
    [refreshProtection],
  );
  const openWar = useCallback((): void => {
    setMenuOpen(false);
    setHouseOpen(false);
    setWarOpen(true);
    void refreshHouse();
    void refreshPassages();
    void refreshProtection();
  }, [refreshHouse, refreshPassages, refreshProtection]);
  const closeWar = useCallback((): void => setWarOpen(false), []);
  const [levyOpen, setLevyOpen] = useState(false);
  const [levy, setLevy] = useState<LevyDialogView[] | null>(null);
  const [summons, setSummons] = useState<SummonsDialogView[]>([]);
  const [levyError, setLevyError] = useState<string | null>(null);
  const openLevy = useCallback(async (): Promise<void> => {
    setMenuOpen(false);
    setLevyError(null);
    setLevyOpen(true);
    try {
      const result = await levyDialogs();
      if ('error' in result) setLevyError(result.error);
      else {
        setLevy(result.dialogs);
        setSummons(result.summons);
      }
    } catch {
      setLevyError(CONNECTION_FAILED);
    }
  }, []);
  const closeLevy = useCallback((): void => {
    setLevyOpen(false);
    setLevy(null);
    void refreshHouse();
  }, [refreshHouse]);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketVillages, setMarketVillages] = useState<MarketVillage[] | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  // číslo posledního otevření – zpožděná odpověď staršího otevření (nebo po zavření) stav nepřepíše
  const marketRequest = useRef(0);
  const openMarket = useCallback(async (): Promise<void> => {
    const villageId = viewRef.current?.id;
    if (!villageId) return;
    const request = ++marketRequest.current;
    setMenuOpen(false);
    setMarketError(null);
    setMarketVillages(null);
    setMarketOpen(true);
    try {
      const result = await getMarketOverview({ villageId });
      if (request !== marketRequest.current) return;
      if ('error' in result) setMarketError(result.error);
      else setMarketVillages(result);
    } catch {
      if (request === marketRequest.current) setMarketError(CONNECTION_FAILED);
    }
  }, [viewRef]);
  const closeMarket = useCallback((): void => {
    marketRequest.current += 1;
    setMarketOpen(false);
  }, []);
  const showMenu = useCallback((): void => {
    setHouseOpen(false);
    setWarOpen(false);
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback((): void => setMenuOpen(false), []);
  const closeAll = useCallback((): void => {
    setHouseOpen(false);
    setWarOpen(false);
    setMenuOpen(false);
    closeMarket();
  }, [closeMarket]);

  return {
    menuOpen,
    showMenu,
    closeMenu,
    closeAll,
    houseOpen,
    openHouse,
    closeHouse,
    warOpen,
    openWar,
    closeWar,
    passages,
    refreshPassages,
    protection,
    warAction,
    levy: { open: levyOpen, dialogs: levy, summons, error: levyError },
    openLevy,
    closeLevy,
    market: { open: marketOpen, villages: marketVillages, error: marketError },
    openMarket,
    closeMarket,
  };
}
