import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Pole uživatele navíc oproti Better Auth (apps/web/lib/auth.ts) – klient je smí poslat při registraci.
  plugins: [inferAdditionalFields({ user: { language: { type: 'string' } } })],
});
