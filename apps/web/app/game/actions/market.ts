'use server';

import {
  marketOverviewForPlayer,
  marketPeopleForPlayer,
  orderArmsForPlayer,
  sendMarketExpeditionForPlayer,
  type VillageActionResult,
} from '@/lib/village';
import {
  parseArmsOrderInput,
  parseMarketExpeditionInput,
  parseMarketPeopleInput,
  villageIdOf,
} from '@/lib/village-input';
import type { MarketTripPeople, MarketVillage } from '@bohemia/game';
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
 * Lidé na prodej pro náhled výpravy (markets.md – Rozhodnutí plánu 3, bod 10): `{ villageId,
 * families, men, women }` – kolik skupin odejde a volní dospělí bez nich (`marketTripPeople`).
 */
export async function getMarketPeople(
  input: unknown,
): Promise<MarketTripPeople | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const people = parseMarketPeopleInput(input);
  if (villageId === null || people === null) return { error: INVALID_INPUT };
  return marketPeopleForPlayer(id, villageId, people);
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

/**
 * Objednávka zbroje u cizích kupců ve vsi (markets.md – Rozhodnutí plánu 4, bod 15): `{ villageId,
 * good, amount }` – kolik kusů má ves od kupců koupit, 0 = nic.
 */
export async function orderArms(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseArmsOrderInput, orderArmsForPlayer);
}
