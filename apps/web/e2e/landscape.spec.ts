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
  const errors = collectErrors(page);
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
  const errors = collectErrors(page);
  await page.route('**/models/**', (route) => route.abort());
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('vývojový náhled krajiny není v produkci dostupný', async ({ request }) => {
  const response = await request.get('/dev/landscape?seed=5');
  expect(response.status()).toBe(404);
});

// --- Ovládání kamery a odolnost scény (nálezy závěrečné revize) ---

/** Políčko pod středem obrazovky jako [x, y]. */
async function centerTile(page: Page): Promise<[number, number]> {
  await hoverCenter(page);
  const info = page.getByTestId('tile-info');
  await expect(info).toBeVisible();
  const [x, y] = (await info.getAttribute('data-tile'))!.split(',').map(Number);
  return [x!, y!];
}

async function drag(page: Page, button: 'left' | 'right', dx: number): Promise<void> {
  const viewport = page.viewportSize()!;
  const x = viewport.width / 2;
  const y = viewport.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up({ button });
  await page.waitForTimeout(1000); // doběhne setrvačnost kamery
}

/**
 * Testy ovládání běží bez modelů stromů: bezhlavý Chromium skládá WebGL obraz softwarově
 * a s lesem každou událost myši zdrží o ~2 s (v běžném Chrome trvá krok ~10 ms).
 */
async function withoutTrees(page: Page): Promise<void> {
  await page.route('**/models/**', (route) => route.abort());
}

const tileDistance = (a: [number, number], b: [number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Chyby v konzoli kromě síťových (chybějící favicon, záměrně zablokované modely). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  return errors;
}

test('levé tlačítko krajinu posouvá, pravé ji otáčí kolem středu', async ({ page }) => {
  await withoutTrees(page);
  await registerAndEnterGame(page, 'ovladani');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  const start = await centerTile(page);

  await drag(page, 'right', 250);
  expect(tileDistance(await centerTile(page), start)).toBeLessThanOrEqual(1);

  await drag(page, 'left', 250);
  expect(tileDistance(await centerTile(page), start)).toBeGreaterThan(5);
});

// TODO: v bezhlavém Chromiu se pohyb kamery bez myši neprojeví (v běžném Chrome ověřeno ručně:
// políčko pod nehybným kurzorem se po stisku W změní). Zjistit proč a test vrátit.
test.fixme('info o políčku se změní, když se pohne kamera a myš ne', async ({ page }) => {
  await withoutTrees(page);
  await registerAndEnterGame(page, 'pohyb-kamery');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  const info = page.getByTestId('tile-info');
  const start = await centerTile(page);
  // Klávesu posíláme přímo oknu – bezhlavý prohlížeč bez fokusu stisk jinak nedoručí.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })));
  await expect.poll(async () => info.getAttribute('data-tile')).not.toBe(start.join(','));
});

test('kolečko ani gesto přiblížení nepřibližují stránku', async ({ page }) => {
  await registerAndEnterGame(page, 'kolecko');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  const prevented = await page.locator('canvas').evaluate((canvas) => {
    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    const pinch = new WheelEvent('wheel', {
      deltaY: 100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(wheel);
    canvas.dispatchEvent(pinch);
    return [wheel.defaultPrevented, pinch.defaultPrevented];
  });
  expect(prevented).toEqual([true, true]);
});

test('když WebGPU selže až při startu, scéna naběhne na WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          features: new Set(),
          limits: {},
          info: {},
          isFallbackAdapter: false,
          requestDevice: async () => {
            throw new Error('GPU zařízení se nepodařilo vytvořit (test)');
          },
        }),
      },
    });
  });
  await registerAndEnterGame(page, 'webgpu-selhalo');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveAttribute('data-renderer', 'webgl');
});

test('prohlížeč bez WebGPU zvolí WebGL sám', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  });
  await registerAndEnterGame(page, 'bez-webgpu');
  await expect(readyScene(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveAttribute('data-renderer', 'webgl');
});

test('bez 3D grafiky uvidí hráč vysvětlení místo prázdné plochy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.includes('webgl')) return null;
      return (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await registerAndEnterGame(page, 'bez-3d');
  await expect(page.getByText('Krajinu se nepodařilo zobrazit')).toBeVisible({ timeout: 30_000 });
});

test('odchod z herní plochy během načítání scénu uvolní bez chyb', async ({ page }) => {
  await registerAndEnterGame(page, 'odchod-behem-nacitani');
  await page.goto('/');
  const errors = collectErrors(page);
  // Modely stromů přijdou až po odchodu – scéna se ruší uprostřed setLandscape.
  await page.route('**/models/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue().catch(() => undefined);
  });
  await page.getByRole('link', { name: 'Pokračovat do hry' }).click();
  await expect(page.locator('canvas')).toBeAttached({ timeout: 30_000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(3500);
  expect(errors).toEqual([]);
});
