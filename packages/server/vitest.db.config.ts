import { defineConfig } from 'vitest/config';

// Testy souběhu proti lokální testovací databázi (Homebrew Postgres; `TEST_DATABASE`, výchozí
// bohemia_test) – sdílejí ji s testy adaptérů v `packages/db`, proto běží po souborech a kořenový
// `test:db` pouští balíčky po sobě. globalSetup databázi založí, když neexistuje, a zmigruje.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    globalSetup: ['src/__tests__/test-database-setup.ts'],
  },
});
