import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// Porážka ve scéně (docs/code/scene-village.md – Kreslení porážky) se dá vidět jen ve vývojovém
// náhledu `/dev/landscape` (listopad, „Lidé“) – ten produkční build, proti kterému běží ostatní
// e2e testy, nemá (404). Test proto běží jen s `SLAUGHTER_DEV_URL` (adresa vývojového serveru,
// např. http://localhost:3013), jinak se přeskočí. `SLAUGHTER_SHOTS=<složka>` navíc uloží malé
// snímky okamžiků sekvence.
const DEV_URL = process.env.SLAUGHTER_DEV_URL;
const SHOTS_DIR = process.env.SLAUGHTER_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (SLAUGHTER_DEV_URL)');
test.describe.configure({ timeout: 900_000 });
test.use({
  reducedMotion: 'no-preference',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});

/** Okamžiky sekvence jako podíl herního dne porážky (SLAUGHTER_PHASES). */
const MOMENTS: readonly { name: string; at: number }[] = [
  { name: '0-privedeni', at: 0.03 },
  { name: '1-omraceni', at: 0.1 },
  { name: '2-pad', at: 0.128 },
  { name: '3-vykrveni', at: 0.28 },
  { name: '4-zvedani', at: 0.382 },
  { name: '5-visi', at: 0.45 },
  { name: '6-vyvrzeni', at: 0.55 },
  { name: '7-rozctvrceni', at: 0.745 },
  { name: '8-kyty-na-prkne', at: 0.82 },
  { name: '9-odnos', at: 0.92 },
];

interface DevHook {
  scene: {
    scene: { meshes: { name: string }[] };
    village: {
      slaughter: {
        plan: {
          window: { startMs: number; endMs: number };
          stations: { species: string; x: number; z: number }[];
        } | null;
      };
    };
    slaughterFocus(): { x: number; z: number } | null;
    rtsCamera: { camera: { radius: number; lowerRadiusLimit: number | null } };
    moveCameraTo(x: number, z: number): void;
    villageState: { labor?: object } | null;
    setVillage(village: object): void;
    setWorkDayClock(clock: ((day: number) => { startMs: number; endMs: number }) | null): void;
  };
}
type DevWindow = Window & { __bohemiaDev?: DevHook; __fixedNow?: number };

/** Zastaví hodiny stránky na okamžiku porážky `at` (podíl dne) – snímek se pak nerozjede. */
async function setMoment(page: Page, at: number): Promise<void> {
  await page.evaluate((fraction) => {
    const w = window as unknown as DevWindow;
    const win = w.__bohemiaDev!.scene.village.slaughter.plan!.window;
    w.__fixedNow = win.startMs + fraction * (win.endMs - win.startMs);
  }, at);
  await page.waitForTimeout(700);
}

test('porážka ve scéně: modely, stanoviště a celá sekvence naběhnou (WebGL)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    const w = window as unknown as DevWindow;
    const real = Date.now.bind(Date);
    Date.now = (): number => w.__fixedNow ?? real();
  });
  await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
  await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-renderer', 'webgl', {
    timeout: 120_000,
  });

  // ukázková ves (domy, pole), listopad (den roku 310) a lidé s ukázkovou prací
  await page.getByRole('button', { name: 'Natočené stavby' }).click({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.getByTestId('dev-season-day').fill('310');
  // vývojová stránka nemá hodiny světa – den porážky 86 s jako herní den (PLOUGH_DAY_DEBUG)
  await page.evaluate(() => {
    (window as unknown as DevWindow).__bohemiaDev!.scene.setWorkDayClock(() => ({
      startMs: 0,
      endMs: 86_000,
    }));
  });
  await page.getByTestId('dev-people').click();
  await page.waitForFunction(
    () => {
      const d = (window as unknown as DevWindow).__bohemiaDev;
      return (d?.scene.village?.slaughter.plan?.window ?? null) !== null;
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => {
      const names = (window as unknown as DevWindow).__bohemiaDev!.scene.scene.meshes.map(
        (m) => m.name,
      );
      return names.some((n) => n.startsWith('slaughter-carcass-'));
    },
    undefined,
    { timeout: 120_000 },
  );
  const names = await page.evaluate(() =>
    (window as unknown as DevWindow).__bohemiaDev!.scene.scene.meshes.map((m) => m.name),
  );
  expect(names.some((n) => /^slaughter-carcass-/.test(n))).toBe(true);
  // kozlina, necky a špalek z slaughter.glb (díly s předponou „slaughter-“)
  expect(
    names.filter((n) => n.startsWith('slaughter-') && !n.includes('carcass')).length,
  ).toBeGreaterThan(0);

  const focus = await page.evaluate(() =>
    (window as unknown as DevWindow).__bohemiaDev!.scene.slaughterFocus(),
  );
  expect(focus).not.toBeNull();

  // kamera ke stanovišti a přiblížení
  await page.evaluate((f) => {
    (window as unknown as DevWindow).__bohemiaDev!.scene.moveCameraTo(f!.x, f!.z);
  }, focus);
  // přiblížení pod běžnou mez ovládání (50 m) – stanoviště je malé
  await page.evaluate(() => {
    const camera = (window as unknown as DevWindow).__bohemiaDev!.scene.rtsCamera.camera;
    camera.lowerRadiusLimit = 0;
    camera.radius = 14;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      if (getComputedStyle(el).borderStyle === 'dashed') el.style.display = 'none';
    }
  });

  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
  for (const moment of MOMENTS) {
    await setMoment(page, moment.at);
    await page.evaluate((f) => {
      (window as unknown as DevWindow).__bohemiaDev!.scene.moveCameraTo(f!.x, f!.z);
    }, focus);
    await page.waitForTimeout(300);
    if (SHOTS_DIR) {
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${moment.name}.png`),
        clip: { x: 440, y: 275, width: 400, height: 250 },
      });
    }
  }

  // jen kráva (velká kozlina; v demu se druh losuje) – druh se mění přes ukázkovou práci vsi
  await page.evaluate(() => {
    const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
    const state = scene.villageState!;
    scene.setVillage({ ...state, labor: { ...state.labor!, slaughter: { cow: 1 } } });
  });
  await page.waitForFunction(
    () => {
      const plan = (window as unknown as DevWindow).__bohemiaDev!.scene.village.slaughter.plan;
      return plan?.stations.some((st) => st.species === 'cow') ?? false;
    },
    undefined,
    { timeout: 60_000 },
  );
  // kráva (velká kozlina u ohrady skotu) – hlava visícího zvířete nesmí sahat k zemi
  const cow = await page.evaluate(() =>
    (window as unknown as DevWindow).__bohemiaDev!.scene.village.slaughter.plan!.stations.find(
      (st) => st.species === 'cow',
    ),
  );
  if (cow && SHOTS_DIR) {
    await page.evaluate((c) => {
      (window as unknown as DevWindow).__bohemiaDev!.scene.moveCameraTo(c.x, c.z);
    }, cow);
    for (const moment of [
      { name: 'kráva-1-omráčení', at: 0.1 },
      { name: 'kráva-2-visí', at: 0.5 },
      { name: 'kráva-3-čtvrtiny', at: 0.745 },
    ]) {
      await setMoment(page, moment.at);
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${moment.name}.png`),
        clip: { x: 340, y: 160, width: 600, height: 375 },
      });
    }
  }
  expect(errors).toEqual([]);
});
