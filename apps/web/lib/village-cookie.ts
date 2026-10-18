import 'server-only';
import { cookies } from 'next/headers';
import { parseVillageId } from './village-input';

// Vybraná ves hráče (migration.md – Víc vsí jednoho hráče): přepínač v horní liště ji zapamatuje
// v cookie, stránka /game ji příště otevře. Jen id – že ves patří hráči, ověří server vždy znovu.

const VILLAGE_COOKIE = 'bohemia_village';
/** Výběr vydrží rok (svět běží jeden skutečný rok). */
const VILLAGE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** Zapamatovaná vybraná ves, nebo null. */
export async function selectedVillageId(): Promise<string | null> {
  return parseVillageId((await cookies()).get(VILLAGE_COOKIE)?.value);
}

/** Zapamatuje vybranou ves (jen ze server action – cookie se smí měnit jen tam). */
export async function rememberVillage(villageId: string): Promise<void> {
  (await cookies()).set(VILLAGE_COOKIE, villageId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: VILLAGE_COOKIE_MAX_AGE_S,
    secure: process.env.NODE_ENV === 'production',
  });
}
