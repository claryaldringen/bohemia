import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Počasí roku ve scéně (disasters.md – Ve scéně) na vývojové ukázce (/dev/landscape, přepínač
// Počasí): kruté sucho a déšť mění snímek, návrat na normální rok dá přesně původní snímek, draw
// cally bez deště nepřibudou (déšť = jeden mesh navíc). Krupobití (P12) scénu ztmaví a pruh je
// vidět (kroupy a bílý pás), povodeň rozlije vodu nad políčka u potoka. Požár (P13) – plameny nad
// hořícím domem a řada lidí s vědry od vody (podávají / chodí). Ukázka v produkčním buildu e2e testů
// není (404) – test běží jen s `WEATHER_DEV_URL` (adresa vývojového serveru, např.
// http://localhost:3015), jinak se přeskočí. `WEATHER_SHOTS=<složka>` uloží malé snímky.
const DEV_URL = process.env.WEATHER_DEV_URL;
const SHOTS_DIR = process.env.WEATHER_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (WEATHER_DEV_URL)');
test.describe.configure({ timeout: 600_000 });
// omezený pohyb: voda a kapky stojí – snímky jsou srovnatelné bajt po bajtu
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

interface DevScene {
  perfStats(): { drawCalls: number } | null;
  engine: { beginFrame(): void; endFrame(): void };
  scene: {
    render(updateCameras: boolean): void;
    getMeshByName(
      name: string,
    ): { isEnabled(): boolean; getTotalVertices(): number; thinInstanceCount: number } | null;
    spriteManagers?: { name: string; sprites: { isVisible: boolean }[] }[];
  };
}
type DevWindow = Window & { __bohemiaDev?: { scene: DevScene }; __fixedNow?: number };

const CLIP = { x: 240, y: 150, width: 800, height: 500 };

/** Průměrný jas snímku 0–255 (dekódování PNG v prohlížeči). */
async function brightness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    }
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

/** Je mesh scény zapnutý a má vrcholy? */
async function meshOn(page: Page, name: string): Promise<boolean> {
  return page.evaluate((n) => {
    const mesh = (window as unknown as DevWindow).__bohemiaDev!.scene.scene.getMeshByName(n);
    return !!mesh && mesh.isEnabled() && mesh.getTotalVertices() > 0;
  }, name);
}

/** Počasí z přepínače, chvíli počká na překreslení a vrátí snímek výřezu a draw cally. */
async function weather(
  page: Page,
  value: string,
  name: string,
): Promise<{ png: Buffer; drawCalls: number }> {
  await page.getByTestId('dev-weather').selectOption(value);
  await page.waitForTimeout(2500);
  const png = await page.screenshot({ clip: CLIP });
  if (SHOTS_DIR) {
    await page.screenshot({ path: `${SHOTS_DIR}/weather-${name}.png`, clip: CLIP, scale: 'css' });
  }
  // draw cally ustáleného snímku – snímek po změně počasí překreslí i stínovou mapu
  const drawCalls = await page.evaluate(() => {
    const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
    scene.engine.beginFrame();
    scene.scene.render(false);
    scene.engine.endFrame();
    return scene.perfStats()?.drawCalls ?? -1;
  });
  return { png, drawCalls };
}

for (const renderer of ['webgl', 'webgpu'] as const) {
  test(`sucho a déšť ve scéně ukázky, normální rok beze změny (${renderer})`, async ({ page }) => {
    if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript((gpu) => {
      if (!gpu) Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      // pevný čas – světlo, období i dny deště se mezi snímky nemění
      const w = window as unknown as DevWindow;
      const real = Date.now.bind(Date);
      const start = real();
      w.__fixedNow = start;
      Date.now = (): number => w.__fixedNow ?? real();
    }, renderer === 'webgpu');
    await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
    const canvas = page.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
    test.info().annotations.push({
      type: 'renderer',
      description: (await canvas.getAttribute('data-renderer')) ?? '?',
    });

    // velké pole se zralým obilím, červenec (den roku 200)
    await page.getByRole('button', { name: 'Velké pole' }).click({ timeout: 120_000 });
    await page.getByTestId('dev-season-day').fill('200');
    await page.waitForTimeout(4000);

    const normal = await weather(page, 'normal', 'normal');
    const drought = await weather(page, 'drought', 'drought');
    const rain = await weather(page, 'rain', 'rain');
    // bouřka s kroupami (P12) – tma, kroupy a bílý pás; povodeň – voda nad políčky u potoka
    const hail = await weather(page, 'hail', 'hail');
    const hailOn = {
      particles: await meshOn(page, 'hail'),
      cover: await meshOn(page, 'hail-cover'),
    };
    const flood = await weather(page, 'flood1000', 'flood');
    const floodOn = await meshOn(page, 'flood-water');
    const back = await weather(page, 'normal', 'normal-again');

    expect(drought.png.equals(normal.png)).toBe(false);
    expect(rain.png.equals(normal.png)).toBe(false);
    // normální rok beze změny – po suchu a dešti přesně stejný snímek
    expect(back.png.equals(normal.png)).toBe(true);
    // krupobití: scéna znatelně tmavší, kroupy a bílý pás zapnuté a v záběru (draw cally navíc)
    const light = {
      normal: await brightness(page, normal.png),
      hail: await brightness(page, hail.png),
    };
    expect(light.hail).toBeLessThan(light.normal * 0.75);
    expect(hailOn).toEqual({ particles: true, cover: true });
    expect(hail.drawCalls).toBeGreaterThanOrEqual(normal.drawCalls + 2);
    // povodeň: plocha vody zapnutá a mění snímek
    expect(floodOn).toBe(true);
    expect(flood.png.equals(normal.png)).toBe(false);
    test.info().annotations.push({
      type: 'brightness',
      description: `normální ${light.normal.toFixed(1)}, krupobití ${light.hail.toFixed(1)}`,
    });
    // mimo déšť žádný draw call navíc, déšť jeden (mesh kapek)
    expect(drought.drawCalls).toBeLessThanOrEqual(normal.drawCalls);
    expect(rain.drawCalls).toBeLessThanOrEqual(normal.drawCalls + 1);
    test.info().annotations.push({
      type: 'drawCalls',
      description: `normální ${normal.drawCalls}, sucho ${drought.drawCalls}, déšť ${rain.drawCalls}, krupobití ${hail.drawCalls}, povodeň ${flood.drawCalls}, znovu ${back.drawCalls}`,
    });
    expect(errors).toEqual([]);
  });
}

/** Plameny hořících domů (viditelné sprity správce `house-fire`) a vědra řetězu (instance). */
async function fireOn(page: Page): Promise<{ flames: number; buckets: number }> {
  return page.evaluate(() => {
    const scene = (window as unknown as DevWindow).__bohemiaDev!.scene.scene;
    const manager = scene.spriteManagers?.find((m) => m.name === 'house-fire');
    const buckets = scene.getMeshByName('fire-buckets');
    return {
      flames: manager ? manager.sprites.filter((s) => s.isVisible).length : 0,
      buckets: buckets?.isEnabled() ? buckets.thinInstanceCount : 0,
    };
  });
}

test('požár: plameny nad domem a řada lidí s vědry, pak normální den beze změny', async ({
  page,
}) => {
  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    const w = window as unknown as DevWindow;
    const real = Date.now.bind(Date);
    w.__fixedNow = real();
    Date.now = (): number => w.__fixedNow ?? real();
  });
  await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
  const canvas = page.locator('canvas[data-scene]');
  await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
  // ukázková ves s lidmi (dva domy, pole, sad, hřbitov), červenec
  await page.getByRole('button', { name: 'Natočené stavby' }).click({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.getByTestId('dev-season-day').fill('200');
  await page.waitForTimeout(4000);

  const normal = await weather(page, 'normal', 'fire-normal');
  const pass = await weather(page, 'firePass', 'fire-pass');
  const passOn = await fireOn(page);
  const walk = await weather(page, 'fireWalk', 'fire-walk');
  const walkOn = await fireOn(page);
  const back = await weather(page, 'normal', 'fire-normal-again');
  const backOn = await fireOn(page);

  // plameny nad hořícími domy, vědra v řadě – hustý řetěz podává, řídký chodí (vědro na člověka)
  expect(passOn.flames).toBeGreaterThan(10);
  expect(passOn.buckets).toBeGreaterThan(3);
  expect(walkOn.flames).toBeGreaterThan(10);
  expect(walkOn.buckets).toBeGreaterThan(1);
  expect(pass.png.equals(normal.png)).toBe(false);
  // po požáru normální den: žádné plameny, vědra ani draw cally navíc
  expect(backOn).toEqual({ flames: 0, buckets: 0 });
  expect(back.drawCalls).toBe(normal.drawCalls);
  test.info().annotations.push({
    type: 'fire',
    description: `draw cally: normální ${normal.drawCalls}, podávají ${pass.drawCalls}, chodí ${walk.drawCalls}, znovu ${back.drawCalls}; plameny ${passOn.flames}, vědra ${passOn.buckets} / ${walkOn.buckets}`,
  });
  expect(errors).toEqual([]);
});

/** Trychtýř smrště (vidět jen v průchodu a s animacemi) a padlé kmeny vývratů (instance). */
async function tornadoOn(page: Page): Promise<{ funnel: boolean; trunks: number }> {
  return page.evaluate(() => {
    const scene = (window as unknown as DevWindow).__bohemiaDev!.scene.scene;
    const funnel = scene.getMeshByName('tornado-funnel');
    const trunks = ['felled-fallen-2', 'felled-fallen-3']
      .map((name) => scene.getMeshByName(name))
      .reduce((sum, mesh) => sum + (mesh?.isEnabled() ? mesh.thinInstanceCount : 0), 0);
    return { funnel: !!funnel?.isEnabled(), trunks };
  });
}

test.describe('smršť', () => {
  test('smršť: trychtýř a vývraty, při omezeném pohybu jen stopa, pak normální den', async ({
    page,
  }) => {
    if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      const w = window as unknown as DevWindow;
      const real = Date.now.bind(Date);
      w.__fixedNow = real();
      Date.now = (): number => w.__fixedNow ?? real();
    });
    await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
    const canvas = page.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
    await page.getByRole('button', { name: 'Natočené stavby' }).click({ timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.getByTestId('dev-season-day').fill('200');
    await page.waitForTimeout(4000);

    const normal = await weather(page, 'normal', 'tornado-normal');
    // trychtýř víří jen s animacemi (jen na chvíli – softwarové kreslení zdržuje vstupy)
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const f2 = await weather(page, 'tornadoF2', 'tornado-f2');
    const f2On = await tornadoOn(page);
    // omezený pohyb: trychtýř zmizí, ztmavení a vývraty zůstanou
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const f3 = await weather(page, 'tornadoF3', 'tornado-f3-still');
    const f3On = await tornadoOn(page);
    const back = await weather(page, 'normal', 'tornado-normal-again');
    const backOn = await tornadoOn(page);

    expect(f2On.funnel).toBe(true);
    expect(f2On.trunks).toBeGreaterThan(5);
    expect(f3On.funnel).toBe(false);
    expect(f3On.trunks).toBeGreaterThan(f2On.trunks);
    expect(await brightness(page, f3.png)).toBeLessThan((await brightness(page, normal.png)) - 10);
    // po smršti normální den: žádný trychtýř, kmeny ani draw cally navíc
    expect(backOn).toEqual({ funnel: false, trunks: 0 });
    expect(back.drawCalls).toBe(normal.drawCalls);
    test.info().annotations.push({
      type: 'tornado',
      description: `draw cally: normální ${normal.drawCalls}, F2 ${f2.drawCalls}, F3 ${f3.drawCalls}, znovu ${back.drawCalls}; kmeny F2 ${f2On.trunks}, F3 ${f3On.trunks}`,
    });
    expect(errors).toEqual([]);
  });
});
