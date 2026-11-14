import 'server-only';
import { createDatabase, databaseUrl, type Database } from '@bohemia/db';
import type { PlayerLock } from '@bohemia/game';
import { WEB_LOCK_POOL_SIZE, WEB_LOCK_WAIT_MS, createPlayerLocks } from '@bohemia/server';

// V dev režimu Next při každé změně kódu moduly znovu načte – pooly sdílíme přes globalThis,
// jinak by každé načtení otevřelo nová spojení do databáze. Pool zámků hráčů zavře až konec
// procesu – spojení skončí a Postgres jeho zámky uvolní sám.
const globalForDb = globalThis as unknown as { bohemiaDb?: Database; bohemiaLocks?: PlayerLock };

/** Databáze vzniká až při prvním použití – `next build` stránky jen importuje. */
export function getDatabase(): Database {
  if (globalForDb.bohemiaDb) return globalForDb.bohemiaDb;
  const db = createDatabase(databaseUrl(process.env));
  // restart Postgresu zahodí nečinná spojení – pool je zahodí a připojí se znovu, proces nesmí
  // spadnout na události `error` bez posluchače (jako pool zámků a worker)
  db.$client.on('error', (error) => console.warn(`Pool databáze: ${error.message}`));
  return (globalForDb.bohemiaDb = db);
}

/**
 * Zámek hráče v DB (platí i proti workeru) s vlastním poolem spojení – bere se uvnitř fronty
 * v procesu (`exclusivePlayer` v exclusive.ts).
 */
export function getPlayerLock(): PlayerLock {
  return (globalForDb.bohemiaLocks ??= createPlayerLocks(
    databaseUrl(process.env),
    WEB_LOCK_POOL_SIZE,
    { waitTimeoutMs: WEB_LOCK_WAIT_MS },
  ).locks);
}
