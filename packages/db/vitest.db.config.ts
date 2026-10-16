import { defineConfig } from 'vitest/config';

// Testy adaptérů proti lokální databázi bohemia_test (Homebrew Postgres).
export default defineConfig({
  test: { include: ['src/**/*.db.test.ts'], fileParallelism: false },
});
