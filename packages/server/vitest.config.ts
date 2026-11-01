import { configDefaults, defineConfig } from 'vitest/config';

// Testy proti databázi (*.db.test.ts) běží zvlášť přes `npm run test:db`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.db.test.ts'] },
});
