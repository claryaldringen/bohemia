// Pozvánkové kódy – abecedy, tvar a čtení z textu (vassalage.md – Čísla, Pro implementaci).

/** Znaky kódu: bez O, I, L, 0 a 1, které se pletou (31 znaků). */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Délka kódu bez pomlčky. */
export const INVITE_CODE_LENGTH = 8;

/** Nový kód; `random` vrací číslo z [0, 1) (náhoda přichází parametrem – žádné `Math.random`). */
export function newInviteCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const index = Math.min(
      INVITE_ALPHABET.length - 1,
      Math.floor(random() * INVITE_ALPHABET.length),
    );
    code += INVITE_ALPHABET.charAt(index);
  }
  return code;
}

/** Kód k zobrazení po čtveřicích: `BH7K-M2QX`. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Kód z toho, co hráč napsal (malá písmena, mezery, pomlčky): velkými písmeny bez oddělovačů,
 * nebo null, když to kód být nemůže.
 */
export function parseInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]+/g, '').toUpperCase();
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const char of code) if (!INVITE_ALPHABET.includes(char)) return null;
  return code;
}

/** Stav pozvánky, podle kterého se rozhoduje, jestli ji jde rezervovat. */
export interface InviteState {
  issuerId: string;
  validUntil: Date;
  reservedBy: string | null;
  usedBy: string | null;
  revokedAt: Date | null;
}

/** Nevyužitá, nezrušená a ještě platná pozvánka (počítá se do stropu vydaných kódů). */
export function isInviteUnused(invite: InviteState, now: Date): boolean {
  return invite.revokedAt === null && invite.usedBy === null && invite.validUntil > now;
}

/** Může ji `userId` rezervovat: nevyužitá, platná, ne vlastní a nerezervovaná jiným. */
export function isInviteAvailableTo(invite: InviteState, userId: string, now: Date): boolean {
  return (
    isInviteUnused(invite, now) &&
    invite.issuerId !== userId &&
    (invite.reservedBy === null || invite.reservedBy === userId)
  );
}
