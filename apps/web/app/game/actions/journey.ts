'use server';

import type { JourneyCandidate, JourneyRefusal } from '@bohemia/game';
import { withVillageCache } from '@bohemia/server';
import {
  commandJourneyForPlayer,
  journeyCandidatesForPlayer,
  launchJourneyForPlayer,
} from '@/lib/journey';
import { parseJourneyOrder, parseLaunchJourneyInput } from '@/lib/journey-input';
import { journeyReason } from '@/lib/journey-view';
import { parseVillageId } from '@/lib/village-input';
import { INVALID_INPUT, NOT_SIGNED_IN, playerId } from './_shared';

// Server actions výjezdu vojvody (lord-control.md; plán 2026-11-13 – Úloha 7). Tvar vstupu ověřuje
// `journey-input.ts`, význam (bod na mapě, soused, dosažitelnost, válka) use-casy. Žádná herní
// logika tady.

/** Kandidáti na výjezd z vsi `villageId` a důvod, proč výjezd nejde (null = jde). */
export async function getJourneyCandidates(villageId: unknown): Promise<
  | {
      refusal: JourneyRefusal | null;
      reason: string | null;
      lord: JourneyCandidate | null;
      men: JourneyCandidate[];
    }
  | { error: string }
> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseVillageId(villageId);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await withVillageCache(() => journeyCandidatesForPlayer(id, parsed));
  if ('error' in result) return result;
  return { ...result, reason: result.refusal === null ? null : journeyReason(result.refusal) };
}

/** Vyšle vojvodu `{ villageId, retinue, order }`; `{ ok }`, nebo důvod odmítnutí česky. */
export async function launchJourney(
  input: unknown,
): Promise<{ ok: true; journeyId: string } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseLaunchJourneyInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await withVillageCache(() => launchJourneyForPlayer(id, parsed));
  if ('error' in result) return result;
  return result.ok ? result : { error: journeyReason(result.reason) };
}

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
