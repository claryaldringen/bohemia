'use server';

import {
  marketOverviewForPlayer,
  sendMarketExpeditionForPlayer,
  type VillageActionResult,
} from '@/lib/village';
import { parseMarketExpeditionInput, villageIdOf } from '@/lib/village-input';
import type { MarketVillage } from '@bohemia/game';
import { INVALID_INPUT, NOT_SIGNED_IN, playerId, villageAction } from './_shared';

/** Přehled vsí, kam smí výprava na trh (markets.md – Pravidla 8): `{ villageId }`. */
export async function getMarketOverview(input: {
  villageId: string;
}): Promise<MarketVillage[] | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null) return { error: INVALID_INPUT };
  return marketOverviewForPlayer(id, villageId);
}

/**
 * Výprava na trh (markets.md – Pravidla 2 a 3): `{ villageId, targetVillageId, give, wants,
 * stayDays }`. Povede se – pohled na ves; odmítnutí use-case jde jako chyba s důvodem.
 */
export async function sendMarketExpedition(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseMarketExpeditionInput, async (id, villageId, parsed) => {
    const result = await sendMarketExpeditionForPlayer(id, villageId, parsed);
    return 'refused' in result ? { error: result.refused } : result;
  });
}
