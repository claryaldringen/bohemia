import { test, expect, type Page } from '@playwright/test';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';

// Trasy vozů ve Web Workeru (lib/cart-router.ts) v produkčním buildu: Worker se opravdu načte
// z chunku a vrátí trasy; když se nenačte nebo selže, spočítá je hlavní vlákno. Požadavek jde
// přes testovací háček `cartRoutes` (lib/e2e-hooks.ts) týmž routerem jako hra – čerstvá ves
// žádné vozy nemá, takže by Worker jinak vůbec nevznikl.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 120_000 });

interface RoutesWindow {
  __bohemiaE2E?: {
    cartRoutes?: (r: unknown) => Promise<{ carts: unknown[]; out: unknown; home: unknown }>;
  };
}

// Požadavek bez světa vozové sítě: každý cíl vyjde bez trasy (null), ale odpověď musí přijít.
const REQUEST = {
  world: null,
  carts: [
    { kind: 'two-wheel', goal: { to: { x: 1, z: 1 }, reachM: 2 } },
    { kind: 'two-wheel', goal: null },
  ],
  outGoals: [{ to: { x: 1, z: 1 }, reachM: 2 }],
  homeGoals: [],
};

async function askRoutes(page: Page): Promise<{ carts: unknown[]; out: unknown; home: unknown }> {
  await page.waitForFunction(() =>
    Boolean((window as unknown as RoutesWindow).__bohemiaE2E?.cartRoutes),
  );
  return page.evaluate(
    (request) => (window as unknown as RoutesWindow).__bohemiaE2E!.cartRoutes!(request),
    REQUEST,
  );
}

test('trasy vozů spočítá Web Worker z chunku produkčního buildu', async ({ page }) => {
  const workerUrls: string[] = [];
  page.on('worker', (w) => workerUrls.push(w.url()));
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await registerAndEnterGame(page, 'worker');
  const worker = page.waitForEvent('worker');
  const result = await askRoutes(page);
  expect(result).toEqual({ carts: [null, null], out: null, home: null });
  expect((await worker).url()).toMatch(/_next\/static\/.*\.js/);
  expect(workerUrls.length).toBeGreaterThanOrEqual(1);
  expect(errors.filter((e) => e.includes('Worker tras vozů'))).toEqual([]);
});

test('bez Workeru spočítá trasy hlavní vlákno', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { Worker: unknown }).Worker = function () {
      throw new Error('Worker není');
    };
  });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await registerAndEnterGame(page, 'noworker');
  expect(await askRoutes(page)).toEqual({ carts: [null, null], out: null, home: null });
  expect(errors.some((e) => e.includes('Worker tras vozů selhal'))).toBe(true);
});

test('Worker, jehož chunk se nenačte, přepne na hlavní vlákno', async ({ page }) => {
  // chunk Workeru (Turbopack ho pojmenuje podle modulu) – ostatní skripty stránky jdou dál
  await page.route(/_next\/static\/.*worker.*\.js/i, (route) => route.abort());
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await registerAndEnterGame(page, 'brokenworker');
  expect(await askRoutes(page)).toEqual({ carts: [null, null], out: null, home: null });
  expect(errors.some((e) => e.includes('Worker tras vozů selhal'))).toBe(true);
});
