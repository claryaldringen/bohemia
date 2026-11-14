'use server';

import { withVillageCache } from '@bohemia/server';
import { commandExpeditionForPlayer, commandJourneyForPlayer } from '@/lib/journey';
import { parseJourneyOrder } from '@/lib/journey-input';
import { parseExpeditionInput } from '@/lib/expedition-input';
import { expeditionReason, journeyReason } from '@/lib/journey-view';
import { INVALID_INPUT, NOT_SIGNED_IN, playerId } from './_shared';

// Server actions výjezdu vojvody (lord-control.md; plán 2026-11-13 – Úloha 7). Tvar vstupu ověřuje
// `journey-input.ts`, význam (bod na mapě, soused, dosažitelnost, válka) use-casy. Žádná herní
// logika tady.

/**
 * Rozkaz do běžícího výjezdu (`go` / `cross` / `home`): záměr na takt teď + 2 (`tick`), nebo důvod
 * odmítnutí česky. Zámek vsi se nebere – rozkaz je jen záměr do úložiště výjezdu, nesmí čekat na
 * dopočet vsi (jako pokyn do tažení).
 */
export async function commandJourney(
  input: unknown,
): Promise<{ ok: true; tick: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const order = parseJourneyOrder(input);
  if (order === null) return { error: INVALID_INPUT };
  const result = await commandJourneyForPlayer(id, order);
  return result.queued ? { ok: true, tick: result.tick } : { error: journeyReason(result.reason) };
}

/**
 * Příkaz vybraným lidem vsi (expeditions.md – Výběr a skupina) `{ villageId, people, command }`:
 * Jdi sem, Přes okraj, Domů, Osedlat, Sesednout. Napřed rozkaz lidem, kteří už jsou ve výpravě
 * (bez zámku vsi – jen záměr), jsou-li ve výběru lidé ze vsi, přidá je `musterExpedition` pod
 * zámkem hráče (právo `war`). `{ ok }`, nebo důvod odmítnutí česky.
 */
export async function commandExpedition(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseExpeditionInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await withVillageCache(() => commandExpeditionForPlayer(id, parsed));
  if ('error' in result) return result;
  return result.ok ? { ok: true } : { error: expeditionReason(result.reason) };
}
