// Vstup server actions panelu „Rod a vazalové“ – jen tvar, kód ověří až use-case.

/** `{ code }` – pozvánkový kód (text do 16 znaků), jinak null. */
export function parseRevokeInviteInput(input: unknown): { code: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const code = (input as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 && code.length <= 16 ? { code } : null;
}
