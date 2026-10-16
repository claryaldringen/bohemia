import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  // e2e/ jsou Playwright testy – spouští je `npm run test:e2e`, ne Vitest.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
