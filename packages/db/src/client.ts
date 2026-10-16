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

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(url: string): Database {
  return drizzle(new Pool({ connectionString: url }), { schema });
}
