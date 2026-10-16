import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { createDatabase, databaseUrl, schema, type Database } from '@bohemia/db';
import { resetPasswordMail, sendMail, verificationMail } from './mail';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const isGoogleEnabled = Boolean(googleClientId && googleClientSecret);

// V dev režimu Next při každé změně kódu modul znovu načte – pool sdílíme přes globalThis,
// jinak by každé načtení otevřelo nová spojení do databáze.
const globalForDb = globalThis as unknown as { bohemiaDb?: Database };

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- typ instance Better Auth se odvozuje z konfigurace
function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    user: {
      additionalFields: {
        // Zatím vždy čeština – výběr jazyka přijde s překlady.
        language: { type: 'string', required: true, defaultValue: 'cs', input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendMail(resetPasswordMail(user.email, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      // Kdo se pokusí přihlásit s neověřeným e-mailem, dostane nový odkaz – nezůstane zaseknutý.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendMail(verificationMail(user.email, url)),
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;

/**
 * Přihlašování i připojení k databázi vznikají až při prvním požadavku. `next build` stránky
 * jen importuje a databázi nepotřebuje – chybějící DATABASE_URL se projeví až za běhu.
 */
export function getAuth(): Auth {
  return (auth ??= createAuth(
    (globalForDb.bohemiaDb ??= createDatabase(databaseUrl(process.env))),
  ));
}
