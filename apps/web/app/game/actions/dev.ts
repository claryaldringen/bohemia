'use server';

import { getSession } from '@/lib/session';
import { withVillageCache } from '@bohemia/server';
import {
  forceDevDisasterForPlayer,
  skipTimeForPlayerView,
  type TimeSkipResult,
  type VillageActionResult,
} from '@/lib/village';
import { parseDevDisasterInput, parseSkipTimeInput, villageIdOf } from '@/lib/village-input';
import { NOT_SIGNED_IN, INVALID_INPUT } from './_shared';

/**
 * Vývojový režim (disasters.md – plán P10): vynutí letošní zlý rok `{ villageId, kind: 'year',
 * value }`, nebo zítřejší pohromu `{ villageId, kind: 'disaster', value }` a vrátí pohled na ves.
 * Jen pro účet s `devMode` (příznak účtu – klient ho nastavit nemůže; bez něj use-case odmítne).
 */
export async function forceDevDisaster(input: unknown): Promise<VillageActionResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const choice = parseDevDisasterInput(input);
  if (villageId === null || choice === null) return { error: INVALID_INPUT };
  return withVillageCache(() =>
    forceDevDisasterForPlayer(session.user.id, session.user.devMode === true, villageId, choice),
  );
}

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, rok, nebo 10 let – `{ skip: 'month' | 'year' |
 * 'decade', villageId }` (`villageId` null, dokud ves není). Jen pro účet s `devMode` (příznak
 * účtu – klient ho nastavit nemůže; bez něj use-case odmítne). Vrátí ves dopočítanou do nového
 * dneška a nový posun času pro hodiny v prohlížeči.
 */
export async function skipTime(input: unknown): Promise<TimeSkipResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const parsed = parseSkipTimeInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() =>
    skipTimeForPlayerView(
      session.user.id,
      session.user.devMode === true,
      parsed.skip,
      villageIdOf(input),
    ),
  );
}
