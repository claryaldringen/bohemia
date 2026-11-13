import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { e2ePort, testDatabaseUrl } from '@bohemia/db/test-database';

// Port a testovací databáze z prostředí (`E2E_PORT`, výchozí 3011; `TEST_DATABASE`, výchozí
// bohemia_test) – e2e tak jde pustit z víc pracovních stromů naráz (docs/code/web-ui.md – e2e).
const PORT = e2ePort();
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_DATABASE_URL = testDatabaseUrl();
export const MAIL_OUTBOX_DIR = path.join(import.meta.dirname, 'e2e/.mail-outbox');

/** Prostředí webu v testech – stejné dostane i worker v projektu `worker` (e2e/worker.spec.ts). */
export const E2E_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  MAIL_OUTBOX_DIR,
  BETTER_AUTH_URL: BASE_URL,
  BETTER_AUTH_SECRET: 'e2e-testovaci-tajemstvi-jen-pro-lokalni-testy',
  // Běžící pomalý svět (200 let = 1000 herních let, herní den ≈ 4,8 h) – ves jde založit
  // a během testů se herní datum prakticky nemění.
  WORLD_START: '2000-01-01T00:00:00+01:00',
  WORLD_END: '2200-01-01T00:00:00+01:00',
  // Testovací háček umisťování staveb (lib/e2e-hooks.ts) – vepíše se do tohoto buildu.
  NEXT_PUBLIC_E2E_HOOKS: '1',
  // Google se v testech nepoužívá – tlačítko se nezobrazí.
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
};

export default defineConfig({
  testDir: './e2e',
  // Testy sdílejí jednu testovací databázi a jeden outbox e-mailů.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  // reducedMotion: voda ve scéně stojí – nepřetržité softwarové kreslení by zdrželo vstupy myši.
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', reducedMotion: 'reduce' },
  projects: [
    // Hra bez workeru – web dopočítává sám (záložní cesta, plán workeru – Globální omezení).
    {
      name: 'chromium',
      testIgnore: /\/(worker|journey|journey-worker)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Hra s workerem: spec ho pustí vedle `next start` se stejným prostředím a na konci čistě ukončí.
    {
      name: 'worker',
      testMatch: /\/(worker|journey|journey-worker)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Produkční build: dev server kompiluje stránky až na požádání a přestavuje je za běhu,
    // takže kliknutí před dokončením hydratace se ztrácela.
    command: `next build && next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: E2E_ENV,
  },
});
