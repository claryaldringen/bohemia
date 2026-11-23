'use server';

import { withVillageCache } from '@bohemia/server';
import { commandExpeditionForPlayer } from '@/lib/journey';
import { parseExpeditionInput } from '@/lib/expedition-input';
import { expeditionReason } from '@/lib/journey-view';
import { INVALID_INPUT, NOT_SIGNED_IN, playerId } from './_shared';

// Server action výprav (expeditions.md; plán 2026-11-14 – Úloha 7). Tvar vstupu ověřuje
// `expedition-input.ts`, význam (bod na mapě, soused, dosažitelnost, válka) use-casy. Žádná herní
// logika tady.

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
  return result.ok
    ? { ok: true }
    : { error: expeditionReason(result.reason, false, parsed.command.kind === 'strike') };
}
