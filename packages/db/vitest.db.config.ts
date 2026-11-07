import { defineConfig } from 'vitest/config';

// Testy adaptérů proti lokální testovací databázi (Homebrew Postgres) – `TEST_DATABASE`, výchozí
// bohemia_test (src/test-database.ts). globalSetup ji založí, když neexistuje, a zmigruje.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    globalSetup: ['src/__tests__/test-database-setup.ts'],
  },
});
