import { rm } from 'node:fs/promises';
import { Client } from 'pg';
import { prepareTestDatabase } from '@bohemia/db/test-database';
import { MAIL_OUTBOX_DIR } from '../playwright.config';

/**
 * Testovací databáze (`TEST_DATABASE`) se založí, když neexistuje, dostane aktuální migrace
 * a začíná prázdná, stejně jako outbox e-mailů.
 */
export default async function globalSetup(): Promise<void> {
  const url = await prepareTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('TRUNCATE "user", "session", "account", "verification" CASCADE');
  await client.end();
  await rm(MAIL_OUTBOX_DIR, { recursive: true, force: true });
}
