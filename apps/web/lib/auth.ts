import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { schema, type Database } from '@bohemia/db';
import { getDatabase } from './db';
import { resetPasswordMail, sendMail, verificationMail } from './mail';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const isGoogleEnabled = Boolean(googleClientId && googleClientSecret);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- typ instance Better Auth se odvozuje z konfigurace
function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    user: {
      additionalFields: {
        // Zatím vždy čeština – výběr jazyka přijde s překlady.
        language: { type: 'string', required: true, defaultValue: 'cs', input: false },
        // Vývojový režim (přeskakování času) – nastavuje jen `npm run db:seed-dev`, klient nikdy.
        devMode: { type: 'boolean', required: false, defaultValue: false, input: false },
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
  return (auth ??= createAuth(getDatabase()));
}
