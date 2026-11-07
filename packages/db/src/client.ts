import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Lokálně stačí Homebrew Postgres bez hesla; v produkci musí být DATABASE_URL nastavená.
const LOCAL_DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/bohemia';

export function databaseUrl(env: { DATABASE_URL?: string; NODE_ENV?: string }): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === 'production') throw new Error('DATABASE_URL není nastavená.');
  return LOCAL_DATABASE_URL;
}

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

export function createDatabase(url: string): Database {
  return drizzle(new Pool({ connectionString: url }), { schema });
}

/**
 * Malý pool jen pro zámky hráčů (`createPlayerLock`) – zámek drží spojení po celou operaci
 * (web 20, worker 2 spojení). Nečinné spojení se zavře až po 5 min – dotaz na ves přichází jednou
 * za herní den (≈ 86 s) a nemá pokaždé otevírat nové spojení; `keepAlive` pozná mrtvé spojení.
 */
export function createLockPool(url: string, max: number): Pool {
  const pool = new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    application_name: 'bohemia-player-lock',
  });
  // chyba nečinného spojení (restart databáze) – pool ho sám zahodí, proces nesmí spadnout
  pool.on('error', (error) => console.warn(`Pool zámků hráčů: ${error.message}`));
  return pool;
}

/** Transakce Drizzle – ve všem, co adaptéry používají (select, insert, update, execute), jako `Database`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Spojení, nebo transakce: adaptér nad ním běží stejně. */
export type Executor = Database | Transaction;
