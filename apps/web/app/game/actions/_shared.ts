import { notePlayerActive } from '@/lib/game';
import { getSession } from '@/lib/session';
import { withVillageCache } from '@bohemia/server';
import { type VillageActionResult } from '@/lib/village';
import { villageIdOf } from '@/lib/village-input';

// Server actions vsi. Každá je veřejný POST endpoint: přihlášení ze session, vstup ověřený
// tvarem, herní pravidla ověří use-casy. Akce nad vsí nesou id vsi (`villageId` – hráč může mít
// víc vsí, migration.md) a server ověří, že ves patří hráči. Chyby vrací jako { error } česky.

export const NOT_SIGNED_IN = 'Nejsi přihlášený – přihlas se prosím znovu.';
export const INVALID_INPUT = 'Neplatný požadavek.';

export async function playerId(): Promise<string | null> {
  const session = await getSession();
  const id = session?.user.id ?? null;
  // hráč s otevřenou hrou je aktivní – jeho vsi neusnou (absence.md – Zátěž serveru)
  if (id !== null) await notePlayerActive(id);
  return id;
}

/**
 * Akce nad vsí: přihlášený hráč, id vsi a vstup ověřený tvarem `parse` – pak `run`. Bez
 * přihlášení, id vsi nebo s jiným tvarem vstupu chyba.
 */
export async function villageAction<T>(
  input: unknown,
  parse: (input: unknown) => T | null,
  run: (playerId: string, villageId: string, parsed: T) => Promise<VillageActionResult>,
): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const parsed = parse(input);
  if (villageId === null || parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => run(id, villageId, parsed));
}

/** Pomocné kontroly tvaru vstupu (jen pro akce, ne pro klienta). */
export const isText = (v: unknown, max = 2000): v is string =>
  typeof v === 'string' && v.length <= max;
export const isId = (v: unknown): v is string => isText(v, 100) && v !== '';
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
