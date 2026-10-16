import 'server-only';
import { createDatabase, databaseUrl, type Database } from '@bohemia/db';

// V dev režimu Next při každé změně kódu moduly znovu načte – pool sdílíme přes globalThis,
// jinak by každé načtení otevřelo nová spojení do databáze.
const globalForDb = globalThis as unknown as { bohemiaDb?: Database };

/** Databáze vzniká až při prvním použití – `next build` stránky jen importuje. */
export function getDatabase(): Database {
  return (globalForDb.bohemiaDb ??= createDatabase(databaseUrl(process.env)));
}
