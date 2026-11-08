'use client';

import { createContext, useContext } from 'react';
import type { GridCell } from '@bohemia/game';
import type { ArmyPanelData, CampaignEstimate, CampaignPlan } from '@/lib/army-view';
import type { CampaignSummary } from '@/lib/campaign-view';
import type { CampaignActions } from '@/components/game/hud/CampaignMap';
import type { WatchedMap } from '@/lib/war-scene-view';

/**
 * Cizí mapa ve scéně (war.md – Ve scéně – cizí mapa; web-ui.md – Cizí mapa ve scéně): mapa tažení
 * přepne 3D scénu na mapu, na které vojsko stojí, a zpět na vlastní ves.
 */
export interface SceneWatch {
  /** Políčko sídla ve scéně – vojsko na něm ukazuje scéna vsi sama (null – mimo mřížku světa). */
  home: GridCell | null;
  /** Cizí mapa, kterou scéna právě ukazuje; null – vlastní ves. */
  watching: WatchedMap | null;
  watch: (map: WatchedMap) => void;
  back: () => void;
}

/**
 * Volání serveru pro panel Vojsko (server actions) – panel je dostane z kontextu, aby šel
 * vykreslit i v testech bez serveru. Chyba je `{ error }` česky.
 */
export interface ArmyActions {
  load: (input: {
    villageId: string;
    targetVillageId: string | null;
  }) => Promise<ArmyPanelData | { error: string }>;
  plan: (plan: CampaignPlan) => Promise<CampaignEstimate | { error: string }>;
  launch: (plan: CampaignPlan) => Promise<{ ok: true } | { error: string }>;
  /** Běžící tažení hráče (pohled na tažení – Ú6.14); chybí = panel je neukazuje. */
  campaigns?: () => Promise<CampaignSummary[] | { error: string }>;
  /** Živé vedení otevřeného tažení. */
  campaign?: CampaignActions;
  /** Přepnutí scény na cizí mapu tažení; chybí = mapa tažení tlačítko nemá (testy bez hry). */
  scene?: SceneWatch;
}

export const ArmyActionsContext = createContext<ArmyActions | null>(null);

export function useArmyActions(): ArmyActions | null {
  return useContext(ArmyActionsContext);
}
