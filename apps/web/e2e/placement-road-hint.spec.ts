import { test, expect, type Page } from '@playwright/test';
import {
  checkPlotPlacement,
  obstaclesOf,
  rotatedPlot,
  tileCenterWorld,
  type DwellingPlot,
  type Position,
  type Road,
  type VillageState,
} from '@bohemia/game';
import { useUniqueClientIp } from './helpers';
import {
  confirmPlacement,
  dwellingVariant,
  found,
  newPlayer,
  pollVillage,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  writeVillageState,
} from './village-helpers';

// Náhled umisťování stavby (D96 – Martin 18. 11. 2026): pozemek, který zasahuje do cesty, ukáže
// zásah žlutě a u kurzoru varování „Cesta se přeruší“ – postavit to jde. Pozemek bez natočení má
// střed pod kurzorem (neskáče po políčkách) a server ho přijme stejně jako náhled.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 180_000 });

/** Kurzor nad bod krajiny (x, z). */
async function hover(page: Page, x: number, z: number): Promise<void> {
  const point = await page.evaluate((q) => window.__bohemiaE2E!.projectToScreen!(q[0], q[1]), [
    x,
    z,
  ] as [number, number]);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 4, point!.y);
  await page.mouse.move(point!.x, point!.y, { steps: 3 });
}

const roadHints = (page: Page): Promise<number> =>
  page.evaluate(() => window.__bohemiaE2E!.roadHints?.() ?? -1);

test('pozemek přes cestu: zásah žlutě s varováním, mimo cestu nic; střed mimo políčko projde', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'cesta-zasah');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  state.woodLogs = 600;
  // pozemek se středem mimo střed volného políčka (bez natočení) – jak ho položí kurzor
  const tile = tileCenterWorld(s.landscape, spots.second.plot.cell.x, spots.second.plot.cell.y);
  const obstacles = obstaclesOf(s.landscape);
  let chosen: { plot: DwellingPlot; position: Position } | null = null;
  for (const [dx, dz] of [
    [3.37, -2.12],
    [-3.37, 2.12],
    [2.41, 3.05],
    [-2.41, -3.05],
  ] as const) {
    const plot = rotatedPlot(
      s.landscape,
      { x: tile.x + dx, z: tile.z + dz, rotation: 0 },
      'center',
    );
    if (!plot?.square) continue;
    const check = checkPlotPlacement(s.landscape, state, 'polozemnice', plot, obstacles);
    if (check.ok && check.position) {
      chosen = { plot, position: check.position };
      break;
    }
  }
  expect(chosen).not.toBeNull();
  const { plot, position } = chosen!;
  const center = plot.square!;
  // vyšlapaná cesta sever – jih středem pozemku
  const road: Road = {
    id: state.nextId++,
    points: [
      { x: center.x, z: center.z - 40 },
      { x: center.x, z: center.z + 40 },
    ],
    bornDay: state.lastDay,
    grade: 'trodden',
    traffic: [],
    spots: [],
  };
  state.roads = { ...(state.roads ?? { roads: [] }), roads: [road] } as VillageState['roads'];
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  await page.evaluate((p) => window.__bohemiaE2E!.moveCameraTo!(p[0], p[1]), [
    center.x,
    center.z,
  ] as [number, number]);
  await page.mouse.move(640, 300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1200);

  await (await dwellingVariant(page, 'Polozemnice')).click();
  // kurzor na cestě – pozemek ji přeruší: žlutý zásah a varování u kurzoru
  await hover(page, center.x, center.z);
  await expect.poll(() => roadHints(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('status').filter({ hasText: 'Cesta se přeruší' })).toBeVisible();
  // o 30 m dál pozemek cestu nezasáhne – nic žlutého
  await hover(page, center.x + 30, center.z);
  await expect.poll(() => roadHints(page), { timeout: 20_000 }).toBe(0);
  await expect(page.getByRole('status').filter({ hasText: 'Cesta se přeruší' })).toHaveCount(0);

  // stavbu to neblokuje: pozemek přes cestu se středem mimo políčko server přijme
  await confirmPlacement(page, { kind: 'dwelling', type: 'polozemnice', position, plot });
  await expect
    .poll(async () => {
      const next = await villageState(s.settlementId);
      return next.constructions.find((c) => c.kind === 'dwelling' && c.plot)?.plot?.square ?? null;
    })
    .toEqual(center);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
});
