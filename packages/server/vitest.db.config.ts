import { defineConfig } from 'vitest/config';

// Testy souběhu proti lokální databázi bohemia_test (Homebrew Postgres) – sdílejí ji s testy
// adaptérů v `packages/db`, proto běží po souborech a kořenový `test:db` pouští balíčky po sobě.
export default defineConfig({
  test: { include: ['src/**/*.db.test.ts'], fileParallelism: false, testTimeout: 120_000 },
});
