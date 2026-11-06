import { test, expect } from '@playwright/test';
import {
  checkFortificationPlacement,
  dwellingGatePoint,
  obstaclesOf,
  placementVillageOf,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type Road,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import { useUniqueClientIp } from './helpers';
import {
  block,
  found,
  newPlayer,
  pollVillage,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  writeVillageState,
} from './village-helpers';

// Opevnění v rozhraní (fortifications.md – Rozhraní): hráč v mřížce staveb otevře rozcestník,
// vybere palisádu a nakreslí obvod 3 × 3 čtverce přes pevnou cestu – u kurzoru je cena a útočiště,
// Enter postaví, brána vznikne na cestě a panel ukáže délku a bránu.

/** Důvod u kurzoru (`BLOCKS_GATE` v jádře). */
const BLOCKS_GATE_REASON = 'Zatarasí sousedům branku.';

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 180_000 });

/** Blok 3 × 3 čtverce u vsi, kam palisáda smí (stejná kontrola jako ve hře). */
function fortSpot(l: Landscape, state: VillageState): TileCell[] {
  const home = tileOfWorldPoint(l, state.dwellings[0]!.position.x, state.dwellings[0]!.position.z)!;
  const village = placementVillageOf(state, state.lastDay);
  for (let r = 3; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cells = block(home.x + dx, home.y + dy, 3, 3);
        if (checkFortificationPlacement(l, village, obstaclesOf(l), cells, null, 'palisade').ok) {
          return cells;
        }
      }
    }
  }
  throw new Error('V krajině není volné místo pro opevnění.');
}

test('hráč nakreslí palisádu přes pevnou cestu – cena u kurzoru, Enter postaví, brána na cestě, panel', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'opevneni');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // dostavěná zemnice a klády na hromadě (palisáda 3 × 3 čtverce ≈ 130 klád)
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  state.woodLogs = 600;
  const cells = fortSpot(s.landscape, state);
  const corner = tileCenterWorld(s.landscape, cells[0]!.x, cells[0]!.y);
  const opposite = tileCenterWorld(s.landscape, cells[8]!.x, cells[8]!.y);
  const middle = tileCenterWorld(s.landscape, cells[4]!.x, cells[4]!.y);
  // pevná cesta přes střed plochy – protne západní i východní stranu obvodu
  const road: Road = {
    id: state.nextId++,
    points: [
      { x: middle.x - 40, z: middle.z },
      { x: middle.x + 40, z: middle.z },
    ],
    bornDay: state.lastDay,
    grade: 'improved',
    traffic: [],
    spots: [],
  };
  state.roads = { ...(state.roads ?? { roads: [] }), roads: [road] } as VillageState['roads'];
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  // pohled na ves; kolečkem se oddálí, ať je obvod celý v záběru (u okraje okna by se kamera
  // posouvala) – kamera po zoomu ještě dojíždí, proto chvíli počkat
  const showVillage = async (): Promise<void> => {
    await page.keyboard.press('r');
    await page.mouse.move(640, 360);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(800);
  };
  await showVillage();

  // P otevře rozcestník druhů, palisáda spustí malování
  const grid = page.getByTestId('build-grid');
  await page.keyboard.press('p');
  await expect(grid).toHaveAttribute('data-group', 'fortification');
  await grid.getByRole('button', { name: 'Palisáda' }).click();

  // tah od rohu k rohu bloku – obvod, cena a útočiště u kurzoru
  const at = async (p: { x: number; z: number }): Promise<{ x: number; y: number }> => {
    const point = await page.evaluate((q) => window.__bohemiaE2E!.projectToScreen!(q.x, q.z), p);
    expect(point).not.toBeNull();
    return point!;
  };
  const from = await at(corner);
  const to = await at(opposite);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const cost = page.getByTestId('placement-cost');
  await expect(cost.locator('[data-cost="labor"]')).toBeVisible({ timeout: 20_000 });
  await expect(cost.locator('[data-cost="logs"]')).toBeVisible();
  await expect(cost.locator('[data-cost="refuge"]')).toBeVisible();
  const logs = Number.parseInt((await cost.locator('[data-cost="logs"]').textContent()) ?? '', 10);
  // 3 × 3 čtverce ≈ 180 m obvodu × 70 klád na 100 m
  expect(logs).toBeGreaterThan(100);
  expect(logs).toBeLessThan(150);

  // Enter postaví – brány samy na obou průsečících cesty s obvodem
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await villageState(s.settlementId)).fortifications?.length ?? 0, {
      timeout: 20_000,
    })
    .toBe(1);
  const fort = (await villageState(s.settlementId)).fortifications![0]!;
  expect(fort.kind).toBe('palisade');
  expect(fort.gates).toHaveLength(2);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // klik na obvod vybere opevnění – panel ukáže délku a brány
  await pollVillage(page);
  await showVillage();
  // západní strana obvodu u prvního čtverce (pás palisády 1,5 m uvnitř plochy) – kamera po
  // návratu a oddálení ještě dojíždí, proto se bod počítá při každém pokusu znovu
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const edge = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), {
          x: corner.x - 7.5 + 0.75,
          z: corner.z,
        });
        if (!edge) return null;
        await page.mouse.move(edge.x + 2, edge.y);
        await page.mouse.click(edge.x, edge.y);
        return panel.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
      },
      { timeout: 30_000 },
    )
    .toBe('fortification');
  const length = Number.parseInt(
    (await panel.getByTestId('selection-fort-length').textContent()) ?? '',
    10,
  );
  expect(length).toBeGreaterThan(170);
  expect(length).toBeLessThan(190);
  await expect(panel.getByTestId('selection-fort-gates')).toHaveText('2');
  await expect(panel.getByTestId('selection-fort-progress')).toBeVisible();

  // snímek dev vsi s vybraným obvodem a otevřeným panelem (jen na požádání)
  const shot = process.env.FORT_UI_SHOT;
  if (shot) {
    await page.evaluate((p) => window.__bohemiaE2E!.moveCameraTo!(p.x, p.z), middle);
    await page.mouse.move(640, 300);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
  }
});

test('palisáda, která zatarasí branku zemnice – důvod u kurzoru a červená značka ve scéně', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'opevneni-branka');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  state.woodLogs = 600;
  // Pás palisády je úzký (okraj plochy do 1,5 m dovnitř) a branka stojí 1 m před zemnicí, proto
  // zemnici (v uloženém stavu) natočíme k ose a posuneme tak, aby branka padla do pásu plochy
  // 2 × 2 nebo 3 × 3 čtverce před domem; pás přitom nesmí ležet přes obrys zemnice ani pozemek.
  // Kontrola z jádra musí vrátit BLOCKS_GATE s body branky.
  const original = state.dwellings[0]!;
  const reasons = new Map<string, number>();
  let cells: TileCell[] | null = null;
  let village = placementVillageOf(state, state.lastDay);
  const shifts: number[] = [];
  for (let k = 0; k <= 64; k++) shifts.push(k * 0.25, -k * 0.25);
  const moves = [...shifts.map((d) => [d, 0] as const), ...shifts.map((d) => [0, d] as const)];
  for (const [mx, mz] of moves) {
    if (cells) break;
    state.dwellings[0] = {
      ...original,
      position: { x: original.position.x + mx, z: original.position.z + mz, rotation: 0 },
    };
    village = placementVillageOf(state, state.lastDay);
    const gate = dwellingGatePoint(s.landscape, state.dwellings[0]);
    const gateTile = tileOfWorldPoint(s.landscape, gate.x, gate.z);
    if (!gateTile) continue;
    for (let size = 2; size <= 3 && !cells; size++) {
      for (let dy = -size; dy <= 1 && !cells; dy++) {
        for (let dx = -size; dx <= 1 && !cells; dx++) {
          const candidate = block(gateTile.x + dx, gateTile.y + dy, size, size);
          const check = checkFortificationPlacement(
            s.landscape,
            village,
            obstaclesOf(s.landscape),
            candidate,
            null,
            'palisade',
          );
          if (check.ok) continue;
          const why = check.reason ?? '?';
          reasons.set(why, (reasons.get(why) ?? 0) + 1);
          if (check.reason === BLOCKS_GATE_REASON && (check.where?.points?.length ?? 0) > 0) {
            cells = candidate;
          }
        }
      }
    }
  }
  if (!cells) {
    throw new Error(
      `Kolem branky zemnice není plocha, která ji zatarasí. Důvody: ${JSON.stringify([...reasons])}`,
    );
  }
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  await page.keyboard.press('r');
  await page.mouse.move(640, 360);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(800);

  const grid = page.getByTestId('build-grid');
  await page.keyboard.press('p');
  await grid.getByRole('button', { name: 'Palisáda' }).click();
  const at = async (c: TileCell): Promise<{ x: number; y: number }> => {
    const w = tileCenterWorld(s.landscape, c.x, c.y);
    const point = await page.evaluate((q) => window.__bohemiaE2E!.projectToScreen!(q.x, q.z), w);
    expect(point).not.toBeNull();
    return point!;
  };
  const from = await at(cells[0]!);
  const to = await at(cells[cells.length - 1]!);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('status').filter({ hasText: /Zatarasí/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.__bohemiaE2E!.paintProblems?.() ?? 0))
    .toBeGreaterThan(0);

  const shot = process.env.FORT_HINT_SHOT;
  if (shot) {
    const gate = checkFortificationPlacement(
      s.landscape,
      village,
      obstaclesOf(s.landscape),
      cells,
      null,
      'palisade',
    ).where!.points![0]!;
    await page.evaluate((p) => window.__bohemiaE2E!.moveCameraTo!(p.x, p.z), gate);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
  }
});
