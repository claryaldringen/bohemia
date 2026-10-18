import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  // tsconfig má pro Next.js `jsx: preserve` – testy komponent (statický render) JSX převedou samy.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // e2e/ jsou Playwright testy – spouští je `npm run test:e2e`, ne Vitest.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
