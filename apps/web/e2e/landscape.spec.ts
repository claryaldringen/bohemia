import { test, expect, type Page } from '@playwright/test';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';

test.beforeEach(async ({ context }) => {
  await useUniqueClientIp(context);
});

const readyScene = (page: Page): ReturnType<Page['locator']> =>
  page.locator('canvas[data-scene-ready="true"]');

async function hoverCenter(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  // Dva pohyby – scéna vybírá políčko jednou za snímek po pohybu myši.
  await page.mouse.move(viewport.width / 2 - 5, viewport.height / 2);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
}

test('po vstupu do hry se vykreslí krajina a info o políčku pod kurzorem', async ({ page }) => {
  await registerAndEnterGame(page, 'krajina');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await hoverCenter(page);
  await expect(page.getByTestId('tile-info')).toHaveText(/^(Voda|Les|Louka) · úrodnost \d+$/);
});

test('krajina zůstane po novém načtení stránky stejná', async ({ page }) => {
  await registerAndEnterGame(page, 'stejna-krajina');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await hoverCenter(page);
  const info = page.getByTestId('tile-info');
  await expect(info).toBeVisible();
  const before = { tile: await info.getAttribute('data-tile'), text: await info.textContent() };

  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await hoverCenter(page);
  await expect(info).toHaveAttribute('data-tile', before.tile!);
  await expect(info).toHaveText(before.text!);
});

test('bez WebGPU běží scéna na WebGL', async ({ page }) => {
  await registerAndEnterGame(page, 'webgl');
  await page.goto('/game?renderer=webgl');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveAttribute('data-renderer', 'webgl');
});

test('odhlášení během načítání scény nezpůsobí chybu', async ({ page }) => {
  await registerAndEnterGame(page, 'rychly-odchod');
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('/game');
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('info o políčku zmizí, když kurzor opustí krajinu', async ({ page }) => {
  await registerAndEnterGame(page, 'mimo-krajinu');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await hoverCenter(page);
  await expect(page.getByTestId('tile-info')).toBeVisible();
  await page.getByText('Bohemia', { exact: true }).hover();
  await expect(page.getByTestId('tile-info')).toBeHidden();
});

test('plátno se přizpůsobí velikosti okna', async ({ page }) => {
  await registerAndEnterGame(page, 'velikost-okna');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await page.setViewportSize({ width: 800, height: 600 });
  await expect
    .poll(async () => {
      const box = await page.locator('canvas').boundingBox();
      return box && [Math.round(box.width), Math.round(box.height)];
    })
    .toEqual([800, 600]);
});

test('Babylon se nestahuje na přihlašovací stránce', async ({ page }) => {
  await page.goto('/login');
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text();
    expect(body.includes('Babylon.js v'), src).toBe(false);
  }
});

test('krajina naběhne i bez modelů stromů', async ({ page }) => {
  await registerAndEnterGame(page, 'bez-stromu');
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.route('**/models/**', (route) => route.abort());
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('vývojový náhled krajiny není v produkci dostupný', async ({ request }) => {
  const response = await request.get('/dev/landscape?seed=5');
  expect(response.status()).toBe(404);
});
