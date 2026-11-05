import 'server-only';
import { cookies } from 'next/headers';

/** Cookie s pozvánkovým kódem z registrace – přežije i přesměrování přes Google (OAuth). */
export const INVITE_COOKIE = 'bohemia_invite';

/** Platnost cookie = platnost kódu (vassalage.md – Čísla). */
const INVITE_COOKIE_MAX_AGE_S = 14 * 86_400;

/** Zapamatuje kód (už zkontrolovaný a normalizovaný) pro registraci. */
export async function rememberInvite(code: string): Promise<void> {
  (await cookies()).set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_COOKIE_MAX_AGE_S,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Zapamatovaný kód, nebo undefined. */
export async function rememberedInvite(): Promise<string | undefined> {
  return (await cookies()).get(INVITE_COOKIE)?.value;
}

/** Zapomene kód (po rezervaci nebo když neplatí). */
export async function forgetInvite(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}
