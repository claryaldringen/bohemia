import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  checkDwellingPlacement,
  fieldPartsFromCells,
  generateLandscapeAttempt,
  suggestVillageName,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type LayerVersions,
  type PlacementVillage,
  type Position,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import type { PlacementResult } from '../lib/scene/village-types';
import { TEST_DATABASE_URL } from '../playwright.config';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';

// Ves projde celou cestou hráče (rozhraní jako v 0 A.D., server actions, scéna) – jen kliknutí
// do 3D scény při umisťování nahrazuje testovací háček `window.__bohemiaE2E.confirmPlacement`
// (lib/e2e-hooks.ts, jen v buildu s NEXT_PUBLIC_E2E_HOOKS=1). Krajina nového hráče je náhodná
// a bezhlavý prohlížeč kreslí softwarově – volná místa pro stavby proto test spočítá předem ze
// seedu krajiny v databázi stejnými pravidly, jaká používá hra.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  // Bez modelů stromů naběhne softwarově kreslená scéna rychleji (viz landscape.spec.ts).
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 120_000 });

interface Seat {
  settlementId: string;
  seed: number;
  landscape: Landscape;
}

async function query<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** Sídlo hráče s krajinou – stejně jako ji generuje server (seed a verze vrstev z databáze). */
async function seat(email: string): Promise<Seat> {
  const [row] = await query<{ id: string; landscape_seed: number; layer_versions: LayerVersions }>(
    `SELECT s.id, s.landscape_seed, s.layer_versions
       FROM settlement s JOIN "user" u ON u.id = s.owner_id
      WHERE u.email = $1`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá sídlo.`);
  return {
    settlementId: row.id,
    seed: row.landscape_seed,
    landscape: generateLandscapeAttempt(row.landscape_seed, row.layer_versions),
  };
}

/** Uložený stav vsi sídla. */
async function villageState(settlementId: string): Promise<VillageState> {
  const [row] = await query<{ state: VillageState }>(
    'SELECT state FROM village WHERE settlement_id = $1',
    [settlementId],
  );
  if (!row) throw new Error('Ves není založená.');
  return row.state;
}

/** Obdélník čtverců (políček) s levým horním čtvercem (x, y). */
function block(x: number, y: number, width: number, height: number): TileCell[] {
  const cells: TileCell[] = [];
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) cells.push({ x: x + i, y: y + j });
  return cells;
}

/** Místa kolem bodu (x, z) po kružnicích – od nejbližšího. */
function* around(x: number, z: number, maxR: number): Generator<Position> {
  for (let r = 0; r <= maxR; r += 6) {
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * 2 * Math.PI;
      yield { x: x + r * Math.cos(angle), z: z + r * Math.sin(angle), rotation: 0 };
    }
  }
}

/**
 * Místo pro první zemnici u místa vsi, pole 3 × 2 čtverce (0,135 ha) vedle ní a místo pro
 * polozemnici, které nepřekáží ani jednomu.
 */
function villageSpots(l: Landscape): { dwelling: Position; cells: TileCell[]; second: Position } {
  const site = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  for (const dwelling of around(site.x, site.z, 240)) {
    if (!checkDwellingPlacement(l, null, 'zemnice', dwelling).ok) continue;
    const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
    if (!tile) continue;
    for (const [x, y] of [
      [tile.x + 1, tile.y - 1],
      [tile.x - 3, tile.y - 1],
      [tile.x - 1, tile.y + 1],
      [tile.x - 1, tile.y - 2],
    ] as const) {
      const cells = block(x, y, 3, 2);
      const withHouse: PlacementVillage = {
        dwellings: [{ type: 'zemnice', position: dwelling }],
        constructions: [],
        parts: [],
      };
      if (!fieldPartsFromCells(l, withHouse, cells, [dwelling]).check.ok) continue;
      const village: PlacementVillage = { ...withHouse, parts: cells.map((cell) => ({ cell })) };
      for (const second of around(dwelling.x, dwelling.z, 120)) {
        if (checkDwellingPlacement(l, village, 'polozemnice', second).ok) {
          return { dwelling, cells, second };
        }
      }
    }
  }
  throw new Error('V krajině není volné místo pro ves.');
}

const readyScene = (page: Page): ReturnType<Page['locator']> =>
  page.locator('canvas[data-scene-ready="true"]');

/** Potvrdí běžící umisťování háčkem – naběhne, až je scéna připravená. */
async function confirmPlacement(page: Page, result: PlacementResult): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__bohemiaE2E?.confirmPlacement === 'function',
    null,
    {
      timeout: 60_000,
    },
  );
  await page.evaluate((r) => window.__bohemiaE2E!.confirmPlacement!(r), result);
}

/** Nový hráč s krajinou a připravenou scénou. */
async function newPlayer(page: Page, prefix: string): Promise<{ email: string; seat: Seat }> {
  const email = await registerAndEnterGame(page, prefix);
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  return { email, seat: await seat(email) };
}

/** Založí ves umístěním první zemnice z mřížky staveb. */
async function found(page: Page, dwelling: Position): Promise<void> {
  await page.getByTestId('build-grid').getByRole('button', { name: 'Zemnice' }).click();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: dwelling });
  await expect(page.getByTestId('village-people')).toHaveText('4', { timeout: 30_000 });
}

test('nový hráč založí ves umístěním zemnice, přejmenuje ji a vybere zemnici', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'ves');
  const grid = page.getByTestId('build-grid');
  // Bez průvodce: dokud ves není, nabídka má jen zemnici a žádný popis kroků.
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(page.getByText(/Založ ves|Vyznač první pole/)).toHaveCount(0);
  const spots = villageSpots(s.landscape);

  await found(page, spots.dwelling);
  const name = page.getByTestId('village-name');
  await expect(name).toHaveText(suggestVillageName(s.seed));
  await expect(grid.getByRole('button')).toHaveCount(3);
  await expect(grid.getByRole('button', { name: 'Polozemnice' })).toBeEnabled();
  expect((await villageState(s.settlementId)).fields).toEqual([]);

  // Jméno se přepíše přímo v horní liště.
  await name.click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Testovice');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Testovice');

  // R vrátí pohled na ves, kliknutí na zemnici ji vybere a panel ukáže obyvatele.
  await page.keyboard.press('r');
  const point = await page.evaluate(
    (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
    spots.dwelling,
  );
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'dwelling');
  await expect(panel.getByTestId('selection-occupants')).toHaveText('4/6');
  await expect(panel.getByTestId('selection-ages').getByRole('listitem')).toHaveCount(4);
  // Pravé tlačítko výběr zruší (jako v 0 A.D.).
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await expect(panel).toHaveCount(0);

  // Ves je uložená na serveru – po novém načtení stránky je tu dál i s novým jménem.
  await page.reload();
  await expect(page.getByTestId('village-name')).toHaveText('Testovice', { timeout: 30_000 });
});

test('hráč staví kdykoli – polozemnici i pole hned po založení', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'stavby');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');

  // Polozemnice hned – žádné odemčení plnou domácností.
  await grid.getByRole('button', { name: 'Polozemnice' }).click();
  await expect(grid.getByRole('button', { name: 'Polozemnice' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await confirmPlacement(page, { kind: 'dwelling', type: 'polozemnice', position: spots.second });
  await expect
    .poll(async () => {
      const state = await villageState(s.settlementId);
      return state.constructions.filter((c) => c.kind === 'dwelling').map((c) => c.dwellingType);
    })
    .toEqual(['polozemnice']);

  // Pole klávesovou zkratkou C, kdykoli po založení.
  await page.keyboard.press('c');
  await expect(grid.getByRole('button', { name: 'Pole' })).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);
});

test('upozornění vsi se ukáže krátkým řádkem nahoře a samo zmizí', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'upozorneni');
  await found(page, villageSpots(s.landscape).dwelling);
  // Hlad nastavený přímo v uložené vsi – další dotaz na ves (každých 5 s) ho ohlásí.
  await query(
    `UPDATE village SET state = jsonb_set(state, '{hungry}', 'true'), version = version + 1
      WHERE settlement_id = $1`,
    [s.settlementId],
  );
  const notice = page.locator('[data-testid="village-notice"][data-kind="hungry"]');
  await expect(notice).toHaveText('Ves hladoví', { timeout: 20_000 });
  await expect(notice).toHaveCount(0, { timeout: 15_000 });
});
