import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Mapy z kostry světa ve scéně (world-skeleton.md – Mapa z kostry) na vývojovém náhledu
// /dev/landscape?skeleton=…: každý výřez se načte bez chyby, u soutoku řek, brodu a pramene se
// kamera podívá na místo. Náhled v produkčním buildu e2e testů není (404), test běží jen
// s `SKELETON_SCENE_DEV_URL` (adresa vývojového serveru); `SKELETON_SCENE_SHOTS=<složka>` uloží
// snímek každého výřezu.
const DEV_URL = process.env.SKELETON_SCENE_DEV_URL;
const SHOTS_DIR = process.env.SKELETON_SCENE_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (SKELETON_SCENE_DEV_URL)');
test.describe.configure({ timeout: 300_000 });
test.use({ viewport: { width: 1280, height: 800 } });

const SLICES = ['straight', 'corner', 'junction', 'source', 'trail', 'ford', 'crossroads'];
/** Výřezy, u kterých se kamera po načtení podívá na soutok řek, brod stezky nebo pramen. */
const FOCUSED = new Set(['junction', 'ford', 'source']);

for (const name of SLICES) {
  test(`mapa z kostry „${name}“ se ve scéně načte bez chyby`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`${DEV_URL}/dev/landscape?seed=1&skeleton=${name}`, {
      waitUntil: 'networkidle',
      timeout: 180_000,
    });
    const canvas = page.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
    await expect(page.getByTestId('dev-skeleton-slices')).toBeVisible();
    // tlačítka náhledu se povolí, až je scéna hotová
    await page.waitForFunction(() => '__bohemiaDev' in window, undefined, { timeout: 120_000 });
    await expect(page.getByTestId('dev-skeleton-focus')).toBeEnabled({
      enabled: FOCUSED.has(name),
    });
    await expect(page.getByTestId('dev-skeleton-route')).toBeEnabled({
      enabled: ['trail', 'ford', 'crossroads'].includes(name),
    });
    if (SHOTS_DIR) {
      mkdirSync(SHOTS_DIR, { recursive: true });
      // snímek scény bez lišt náhledu
      await page.addStyleTag({ content: 'nav, div.fixed.top-12 { display: none !important; }' });
      await page.waitForTimeout(3000);
      await canvas.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
    }
    expect(errors).toEqual([]);
  });
}
