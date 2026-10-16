import { execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { Client } from 'pg';
import { MAIL_OUTBOX_DIR, TEST_DATABASE_URL } from '../playwright.config';

/** Testovací databáze dostane aktuální migrace a začíná prázdná, stejně jako outbox e-mailů. */
export default async function globalSetup(): Promise<void> {
  execSync('npm run db:migrate -w @bohemia/db', {
    cwd: '../..',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('TRUNCATE "user", "session", "account", "verification" CASCADE');
  await client.end();
  await rm(MAIL_OUTBOX_DIR, { recursive: true, force: true });
}
