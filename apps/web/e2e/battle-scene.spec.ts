import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Ukázka Bitva ve scéně (war.md – Ve scéně) na vývojové ukázce /dev/landscape: boj taktem jádra
// u palisády – postavy vojska, koně jezdců rodu, ikony rozkazů skupin a mlha války se objeví;
// útok na hradbu (plán hradeb Úloha 21) – žebříky u palisády s ochozem, otepi a oheň u paty,
// obránci na ochozu; po vypnutí ukázky vše zmizí a draw cally se vrátí. Ukázka v produkčním buildu e2e testů není
// (404) – test běží jen s `BATTLE_DEV_URL` (adresa vývojového serveru, např.
// http://localhost:3020), jinak se přeskočí. `BATTLE_SHOTS=<složka>` uloží menší snímek.
const DEV_URL = process.env.BATTLE_DEV_URL;
const SHOTS_DIR = process.env.BATTLE_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (BATTLE_DEV_URL)');
test.describe.configure({ timeout: 480_000 });
test.use({ viewport: { width: 1280, height: 800 } });

interface DevScene {
  armyStats(): { name: string; count: number }[];
  perfStats(): { drawCalls: number } | null;
  engine: { beginFrame(): void; endFrame(): void };
  scene: { render(updateCameras: boolean): void };
  rtsCamera: { camera: { radius: number } };
}
type DevWindow = Window & { __bohemiaDev?: { scene: DevScene } };

const CLIP = { x: 340, y: 230, width: 600, height: 400 };

test('Bitva: vojsko s koňmi a rozkazy, boj taktem jádra, po vypnutí nic navíc', async ({
  page,
}) => {
  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
  const canvas = page.locator('canvas[data-scene]');
  await expect(canvas).toHaveAttribute('data-renderer', /webgl|webgpu/, { timeout: 120_000 });
  const drawCalls = (): Promise<number> =>
    page.evaluate(() => {
      const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
      scene.engine.beginFrame();
      scene.scene.render(false);
      scene.engine.endFrame();
      return scene.perfStats()?.drawCalls ?? -1;
    });
  const stats = (): Promise<Record<string, number>> =>
    page.evaluate(() =>
      Object.fromEntries(
        (window as unknown as DevWindow)
          .__bohemiaDev!.scene.armyStats()
          .map((s) => [s.name, s.count]),
      ),
    );
  await page.waitForTimeout(3000);
  const before = await drawCalls();

  await page.getByTestId('dev-battle').click();
  await expect(page.getByTestId('dev-battle')).toHaveText('Bitva: boj u brány');
  // modely se načtou a vojsko dojde k bráně
  await expect
    .poll(async () => (await stats())['army-man'] ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(10);
  await page.waitForTimeout(15_000);
  const fight = await stats();
  expect(fight['army-horse']).toBe(2);
  expect(
    (fight['army-order-attack-all'] ?? 0) + (fight['army-order-hold-place'] ?? 0),
  ).toBeGreaterThan(0);
  expect(fight['fog-veil']).toBe(0);
  // muži, koně, stíny, rozkazy a závoj – každý druh jeden draw call (kamera se přesunula k bráně,
  // celkové draw cally se proto jen zapíšou)
  expect(Object.keys(fight).length).toBeGreaterThanOrEqual(5);
  const during = await drawCalls();
  await page.evaluate(() => {
    (window as unknown as DevWindow).__bohemiaDev!.scene.rtsCamera.camera.radius = 70;
  });
  await page.waitForTimeout(800);
  if (SHOTS_DIR) {
    await page.screenshot({
      path: `${SHOTS_DIR}/battle.jpg`,
      clip: CLIP,
      type: 'jpeg',
      quality: 70,
    });
  }

  // útěk vsi: lidé ke lesu a vojsko hloučky
  await page.getByTestId('dev-battle').click();
  await expect(page.getByTestId('dev-battle')).toHaveText('Bitva: útěk vsi');
  await expect
    .poll(async () => (await stats())['army-woman'] ?? 0, { timeout: 30_000 })
    .toBeGreaterThan(0);

  // útok na hradbu: žebříky se opřou o palisádu s ochozem, otepi u paty a oheň
  await page.getByTestId('dev-battle').click();
  await expect(page.getByTestId('dev-battle')).toHaveText('Bitva: útok na hradbu');
  await page.evaluate(() => {
    (window as unknown as DevWindow).__bohemiaDev!.scene.rtsCamera.camera.radius = 60;
  });
  await expect
    .poll(async () => (await stats())['army-ladder-5'] ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  const shot = async (name: string): Promise<void> => {
    if (!SHOTS_DIR) return;
    await page.screenshot({
      path: `${SHOTS_DIR}/${name}.jpg`,
      clip: CLIP,
      type: 'jpeg',
      quality: 70,
    });
  };
  await shot('ladders');
  // otepi u paty – nanosí se a hoří (deset na místo), pak vyhoří a zbude ohořelý průlom
  await expect
    .poll(async () => (await stats())['army-fagot'] ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0);
  await expect.poll(async () => (await stats())['army-fagot'] ?? 0, { timeout: 90_000 }).toBe(10);
  await page.waitForTimeout(3000);
  await shot('fire');
  const walls = await stats();
  // vyhořelé místo otepi ztratí (další místo je může zrovna nanášet)
  await expect
    .poll(async () => (await stats())['army-fagot'] ?? 0, { timeout: 120_000 })
    .not.toBe(10);
  await page.waitForTimeout(1500);
  await shot('burned');

  // vypnuto – nic z války nezůstane
  await page.getByTestId('dev-battle').click();
  await expect(page.getByTestId('dev-battle')).toHaveText('Bitva');
  await page.waitForTimeout(1500);
  expect(await stats()).toEqual({});
  const after = await drawCalls();
  test.info().annotations.push({
    type: 'battle',
    description: `draw cally: před ${before}, s bitvou ${during}, po vypnutí ${after}; instance ${JSON.stringify(fight)}; hradba ${JSON.stringify(walls)}`,
  });
  expect(errors).toEqual([]);
});
