import { defineConfig } from 'vitest/config';
import { SLOW_TESTS } from './slow-tests';

export default defineConfig({
  test: { setupFiles: ['./src/test-setup.ts'], include: [...SLOW_TESTS] },
});
