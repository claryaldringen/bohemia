import { configDefaults, defineConfig } from 'vitest/config';
import { SLOW_TESTS } from './slow-tests';

export default defineConfig({
  // pojistka kopie stavu: sdílené záznamy se v testech zmrazí (domain/village/clone.ts)
  // pomalé testy jedou odděleně (vitest.slow.config.ts, `npm run test:slow`)
  test: {
    setupFiles: ['./src/test-setup.ts'],
    exclude: [...configDefaults.exclude, ...SLOW_TESTS],
  },
});
