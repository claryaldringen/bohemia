'use client';

import { createContext, useContext } from 'react';
import type { VillageRight } from '@bohemia/game';
import type { VillageRightsView } from '@/lib/village-view-types';

// Práva hráče v zobrazené vsi (seniorate.md – Co hráč vidí): rozhoduje server (`VillageView.rights`),
// rozhraní jen zašedne a u kurzoru řekne důvod („Rozhoduje Bořivoj.“). Kontext obalí celé HUD,
// takže tlačítka nemusí dostávat práva přes props.

const RightsContext = createContext<VillageRightsView | null>(null);

export const RightsProvider = RightsContext.Provider;

/** Důvod, proč `right` v téhle vsi chybí; null, když ho hráč má (nebo práva nejsou známá). */
export function rightDeniedReason(
  rights: VillageRightsView | null | undefined,
  right: VillageRight,
): string | null {
  if (!rights || rights.allowed.includes(right)) return null;
  return rights.reason ?? 'Tady nerozhoduješ.';
}

/** Důvod, proč `right` v zobrazené vsi chybí, nebo null. */
export function useRightDenied(right: VillageRight): string | null {
  return rightDeniedReason(useContext(RightsContext), right);
}
