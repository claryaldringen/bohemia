import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './src/client';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema',
  out: './drizzle',
  dbCredentials: { url: databaseUrl(process.env) },
});
