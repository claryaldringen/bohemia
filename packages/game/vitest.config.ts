import { defineConfig } from 'vitest/config';

export default defineConfig({
  // pojistka kopie stavu: sdílené záznamy se v testech zmrazí (domain/village/clone.ts)
  test: { setupFiles: ['./src/test-setup.ts'] },
});
