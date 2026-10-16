import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3011;
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/bohemia_test';
export const MAIL_OUTBOX_DIR = path.join(import.meta.dirname, 'e2e/.mail-outbox');

export default defineConfig({
  testDir: './e2e',
  // Testy sdílejí jednu testovací databázi a jeden outbox e-mailů.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Produkční build: dev server kompiluje stránky až na požádání a přestavuje je za běhu,
    // takže kliknutí před dokončením hydratace se ztrácela.
    command: `next build && next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      MAIL_OUTBOX_DIR,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET: 'e2e-testovaci-tajemstvi-jen-pro-lokalni-testy',
      // Pevný svět daleko v budoucnu – výsledek testů nezávisí na dnešním datu.
      WORLD_START: '2100-01-01T00:00:00+01:00',
      WORLD_END: '2101-01-01T00:00:00+01:00',
      // Google se v testech nepoužívá – tlačítko se nezobrazí.
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    },
  },
});
