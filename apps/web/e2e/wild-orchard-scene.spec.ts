import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Zdivočelý sad ve scéně (orchard.md – Zdivočelý sad) na vývojové ukázce vsi (/dev/landscape):
// staré řady jabloní s náletem různého stáří a pár jinými dřevinami. Ukázka v produkčním buildu
// e2e testů není, test běží jen s `WILD_ORCHARD_DEV_URL` (adresa vývojového serveru);
// `WILD_ORCHARD_SHOTS=<složka>` uloží malý snímek (výřez 800 × 500).
const DEV_URL = process.env.WILD_ORCHARD_DEV_URL;
const SHOTS_DIR = process.env.WILD_ORCHARD_SHOTS;

test.skip(!DEV_URL, 'vyžaduje vývojový server (WILD_ORCHARD_DEV_URL)');
test.describe.configure({ timeout: 300_000 });
test.use({ viewport: { width: 1280, height: 800 } });

interface DevScene {
  setVillage(village: object): void;
  moveCameraTo(x: number, z: number): void;
  villageState: { dwellings: { position: { x: number; z: number } }[] } | null;
  landscape: { cellSizeM: number };
  rtsCamera: { camera: { radius: number; lowerRadiusLimit: number | null } };
}
type DevWindow = Window & { __bohemiaDev?: { scene: DevScene } };

test('opuštěný sad: staré řady a nepravidelný nálet', async ({ page }) => {
  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${DEV_URL}/dev/landscape`, { waitUntil: 'networkidle', timeout: 180_000 });
  await expect(page.locator('canvas[data-scene]')).toHaveAttribute(
    'data-renderer',
    /webgl|webgpu/,
    {
      timeout: 120_000,
    },
  );
  await page.getByRole('button', { name: 'Natočené stavby' }).click({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  const center = await page.evaluate(() => {
    const scene = (window as unknown as DevWindow).__bohemiaDev!.scene;
    const v = scene.villageState!;
    const size = scene.landscape.cellSizeM;
    const home = v.dwellings[0]!.position;
    // sad 3 × 2 čtverce 60 m od domu; nálet: pseudonáhodně 5 stromků na čtverec
    const squares = [];
    const wildTrees = [];
    let id = 3_221_225_472;
    let seed = 12345;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const x = home.x + 60 + i * size;
        const z = home.z + j * size;
        squares.push({
          cell: { x: 100 + i, y: 100 + j },
          x,
          z,
          size,
          planting: 1,
          growth: 1,
          fruit: false,
        });
        for (let k = 0; k < 5; k++) {
          wildTrees.push({
            id: id++,
            x: x + (rnd() - 0.5) * (size - 3),
            z: z + (rnd() - 0.5) * (size - 3),
            apple: rnd() < 0.8,
            age: Math.floor(rnd() * 30),
          });
        }
      }
    }
    scene.setVillage({ ...v, orchards: [{ id: 1, squares }], wildTrees });
    scene.moveCameraTo(home.x + 60 + size, home.z + size / 2);
    scene.rtsCamera.camera.lowerRadiusLimit = 0;
    scene.rtsCamera.camera.radius = 90;
    return home;
  });
  expect(center).toBeTruthy();
  await page.waitForTimeout(3500);
  if (SHOTS_DIR) {
    await page.screenshot({
      path: `${SHOTS_DIR}/wild-orchard.png`,
      clip: { x: 240, y: 200, width: 800, height: 450 },
    });
  }
  expect(errors).toEqual([]);
});
