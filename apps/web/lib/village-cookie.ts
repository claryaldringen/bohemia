import 'server-only';
import { cookies } from 'next/headers';
import { VILLAGE_COOKIE } from './village-choice';
import { parseVillageId } from './village-input';

/**
 * Zapamatovaná vybraná ves (cookie z přepínače vsí – `lib/village-choice.ts`), nebo null. Že ves
 * patří hráči, ověří až `gameEntryForPlayer`.
 */
export async function selectedVillageId(): Promise<string | null> {
  return parseVillageId((await cookies()).get(VILLAGE_COOKIE)?.value);
}
