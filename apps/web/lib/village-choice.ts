// Vybraná ves hráče (migration.md – Víc vsí jednoho hráče): přepínač v horní liště ji zapamatuje
// v cookie, stránka /game ji příště otevře (`lib/village-cookie.ts`). Jen id – že ves patří
// hráči, ověří server vždy znovu. Cookie zapisuje prohlížeč: zápis v server action by Next.js
// odpověděl novým vykreslením stránky – a s novým objektem krajiny i novou scénou.

export const VILLAGE_COOKIE = 'bohemia_village';
/** Výběr vydrží rok (svět běží jeden skutečný rok). */
const VILLAGE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** Hodnota cookie vybrané vsi (`Set-Cookie` bez domény – platí pro celý web). */
export function villageCookie(villageId: string): string {
  return `${VILLAGE_COOKIE}=${encodeURIComponent(villageId)}; path=/; max-age=${VILLAGE_COOKIE_MAX_AGE_S}; samesite=lax`;
}

/** Zapamatuje vybranou ves v prohlížeči. */
export function rememberVillage(villageId: string): void {
  document.cookie = villageCookie(villageId);
}
