'use client';

import { createContext, useContext } from 'react';
import type { ArmyPanelData, CampaignEstimate, CampaignPlan } from '@/lib/army-view';
import type { CampaignSummary } from '@/lib/campaign-view';
import type { CampaignActions } from '@/components/game/hud/CampaignMap';

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
}

export const ArmyActionsContext = createContext<ArmyActions | null>(null);

export function useArmyActions(): ArmyActions | null {
  return useContext(ArmyActionsContext);
}
