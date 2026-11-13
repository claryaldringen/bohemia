import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

// Testovací databáze a port e2e z prostředí – jediné místo, odkud je čtou Playwright (e2e),
// testy adaptérů a souběhu (`test:db`) i skript `test:db:create`. Bez proměnných platí dnešní
// výchozí hodnoty; s nimi jde pouštět e2e a `test:db` z víc pracovních stromů naráz – každý
// strom s vlastním portem a vlastní databází (docs/code/web-ui.md – e2e).

export const DEFAULT_TEST_DATABASE = 'bohemia_test';
export const DEFAULT_E2E_PORT = 3011;

/** Homebrew Postgres lokálně – uživatel `postgres` bez hesla. */
const SERVER_URL = 'postgres://postgres@127.0.0.1:5432';

/** Testy databázi vyprazdňují (TRUNCATE) – vývojová, měřicí ani systémové databáze nikdy. */
const PROTECTED_DATABASES: ReadonlySet<string> = new Set([
  'bohemia',
  'bohemia_measure',
  'postgres',
  'template0',
  'template1',
]);

const MIGRATIONS_FOLDER = path.join(import.meta.dirname, '../drizzle');

/** Prostředí procesu – čte se z něj jen `TEST_DATABASE` a `E2E_PORT`. */
export type TestEnv = Readonly<Record<string, string | undefined>>;

/** Jméno testovací databáze z `TEST_DATABASE`; chráněné databáze a neplatná jména odmítne. */
export function testDatabaseName(env: TestEnv = process.env): string {
  const name = env.TEST_DATABASE || DEFAULT_TEST_DATABASE;
  if (PROTECTED_DATABASES.has(name.toLowerCase())) {
    throw new Error(
      `TEST_DATABASE=${name} odmítnuto – testy databázi vyprazdňují, použij např. bohemia_test_2.`,
    );
  }
  // jen jednoduchý identifikátor – jméno jde do CREATE DATABASE bez parametru
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`TEST_DATABASE=${name} není platné jméno (malá písmena, číslice a _).`);
  }
  return name;
}

/** Připojovací adresa testovací databáze. */
export function testDatabaseUrl(env: TestEnv = process.env): string {
  return `${SERVER_URL}/${testDatabaseName(env)}`;
}

/** Port `next start` pro Playwright z `E2E_PORT`. */
export function e2ePort(env: TestEnv = process.env): number {
  if (!env.E2E_PORT) return DEFAULT_E2E_PORT;
  const port = Number(env.E2E_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORT=${env.E2E_PORT} není platný port.`);
  }
  return port;
}

/**
 * Indexy tabulky `table`, jak je nechají migrace: jméno → poslední `CREATE INDEX` (bez středníku);
 * co pozdější migrace zruší (`DROP INDEX`), vypadne. Indexy primárních klíčů a omezení zakládá
 * `CREATE TABLE` – sem nepatří.
 */
export function migratedIndexes(table: string): Map<string, string> {
  const indexes = new Map<string, string>();
  const files = readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const statements = readFileSync(path.join(MIGRATIONS_FOLDER, file), 'utf8').split(
      '--> statement-breakpoint',
    );
    for (const statement of statements) {
      const dropped = /^DROP INDEX (?:IF EXISTS )?"([^"]+)"/m.exec(statement);
      if (dropped?.[1]) indexes.delete(dropped[1]);
      const created = /^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"[^;]*/m.exec(statement);
      if (created?.[1] && created[2] === table) indexes.set(created[1], created[0]);
    }
  }
  return indexes;
}

/** Jméno jako identifikátor v SQL. */
function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Vrátí indexy tabulky `settlement` do stavu z migrací (porovnává jména). Test migrace 0013
 * (`shared-grid-migration.db.test.ts`) je za běhu mění – ruší `settlement_grid_idx` a zakládá
 * starý `settlement_owner_grid_idx`; přerušený běh by databázi nechal bez unikátního indexu políčka
 * a testy „obsazené políčko“ dalšího běhu by spadly. Chybí-li index, tabulka se napřed vyprázdní –
 * zbylá data přerušeného testu by unikátní index nedovolila založit (testy ji vyprazdňují tak jako
 * tak). Databázi v pořádku nechá být. Vrací, zda něco opravil.
 */
export async function restoreSettlementIndexes(client: Pool | Client): Promise<boolean> {
  const expected = migratedIndexes('settlement');
  // jen indexy mimo omezení (primární klíč, UNIQUE) – ty patří tabulce a migrace je nezakládají zvlášť
  const found = await client.query<{ name: string }>(
    `SELECT c.relname AS name
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = to_regclass('public.settlement')
        AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid)`,
  );
  const actual = new Set(found.rows.map((row) => row.name));
  const extra = [...actual].filter((name) => !expected.has(name));
  const missing = [...expected].filter(([name]) => !actual.has(name));
  for (const name of extra) await client.query(`DROP INDEX IF EXISTS ${quoted(name)}`);
  if (missing.length > 0) await client.query('TRUNCATE "settlement" CASCADE');
  for (const [, statement] of missing) {
    await client.query(statement.replace(/INDEX /, 'INDEX IF NOT EXISTS '));
  }
  return extra.length + missing.length > 0;
}

/** Chybové kódy Postgresu při souběžném založení téže databáze – databáze už pak existuje. */
const ALREADY_EXISTS_CODES: ReadonlySet<string> = new Set(['42P04', '23505']);

/**
 * Založí testovací databázi, když neexistuje, pustí do ní migrace a vrátí indexy tabulky
 * `settlement` do stavu z migrací (`restoreSettlementIndexes`) – běh tak nezávisí na tom, jak
 * skončil předchozí. Vrátí její adresu.
 */
export async function prepareTestDatabase(env: TestEnv = process.env): Promise<string> {
  const name = testDatabaseName(env);
  const admin = new Client({ connectionString: `${SERVER_URL}/postgres` });
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === undefined || !ALREADY_EXISTS_CODES.has(code)) throw error;
  } finally {
    await admin.end();
  }
  const url = testDatabaseUrl(env);
  const db = drizzle(new Pool({ connectionString: url }));
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await restoreSettlementIndexes(db.$client);
  } finally {
    await db.$client.end();
  }
  return url;
}
