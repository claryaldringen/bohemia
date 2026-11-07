'use client';

import { createContext, useContext } from 'react';
import type { ArmyPanelData, CampaignEstimate, CampaignPlan } from '@/lib/army-view';

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
}

export const ArmyActionsContext = createContext<ArmyActions | null>(null);

export function useArmyActions(): ArmyActions | null {
  return useContext(ArmyActionsContext);
}
