import { defineConfig } from 'vitest/config';
import { SLOW_TESTS } from './slow-tests';

export default defineConfig({
  test: {
    setupFiles: ['./src/test-setup.ts'],
    include: [...SLOW_TESTS],
    // dlouhé běhy trvají desítky sekund (výchozích 5 s nestačí ani zlatému otisku po 3. roce)
    testTimeout: 300_000,
  },
});
