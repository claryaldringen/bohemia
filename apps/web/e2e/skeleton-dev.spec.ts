import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Vývojový náhled kostry světa (/dev/skeleton, world-skeleton.md). Náhled v produkčním buildu
// e2e testů není (404), test proto běží jen s `SKELETON_DEV_URL` (adresa vývojového serveru,
// např. http://localhost:3039). `SKELETON_SHOTS=<složka>` uloží snímek.
const DEV_URL = process.env.SKELETON_DEV_URL;
const SHOTS_DIR = process.env.SKELETON_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (SKELETON_DEV_URL)');

test('náhled kostry světa nakreslí mřížku a čáry řek', async ({ page }) => {
  await page.goto(`${DEV_URL}/dev/skeleton?x=0&y=0&size=64`, { waitUntil: 'networkidle' });
  const svg = page.locator('svg[data-skeleton]');
  await expect(svg).toBeVisible();
  expect(await svg.locator('rect').count()).toBe(64 * 64);
  expect(await svg.locator('line[data-river]').count()).toBeGreaterThan(0);
  if (SHOTS_DIR) {
    mkdirSync(SHOTS_DIR, { recursive: true });
    await svg.screenshot({ path: `${SHOTS_DIR}/skeleton.png` });
  }
});
