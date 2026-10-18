// Vývojový účet pro lokální hraní bez registrace a ověřování e-mailu.
// Spuštění: npm run db:seed-dev (z kořene repa). Opakované spuštění účet obnoví (heslo, ověření).
// Účet má vývojový režim – v liště vedle data přeskočí čas o měsíc nebo rok.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createDatabase, databaseUrl, schema } from '@bohemia/db';
import { DEV_EMAIL_DOMAIN } from '../lib/dev-login';

// Jen pro lokální databázi – v produkci skript odmítne běžet. Ve vývoji se přihlásí i samotným
// jménem (lib/dev-login.ts doplní doménu).
const DEV_USER = {
  name: 'Jarmil',
  email: `jarmil@${DEV_EMAIL_DOMAIN}`,
  password: 'prdel',
} as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Vývojový účet se v produkci nezakládá.');
  }
  const db = createDatabase(databaseUrl(process.env));
  try {
    const passwordHash = await hashPassword(DEV_USER.password);
    const now = new Date();
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, DEV_USER.email));
    const userId = existing?.id ?? randomUUID();

    if (existing) {
      await db
        .update(schema.user)
        .set({ emailVerified: true, devMode: true, updatedAt: now })
        .where(eq(schema.user.id, userId));
    } else {
      await db.insert(schema.user).values({
        id: userId,
        name: DEV_USER.name,
        email: DEV_USER.email,
        emailVerified: true,
        devMode: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Better Auth drží heslo v účtu poskytovatele „credential“ (accountId = id uživatele).
    const [credential] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
    if (credential) {
      await db
        .update(schema.account)
        .set({ password: passwordHash, updatedAt: now })
        .where(eq(schema.account.id, credential.id));
    } else {
      await db.insert(schema.account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }
    console.log(`Vývojový účet ${DEV_USER.email} je připravený (heslo v ${import.meta.filename}).`);
  } finally {
    await db.$client.end();
  }
}

await main();
