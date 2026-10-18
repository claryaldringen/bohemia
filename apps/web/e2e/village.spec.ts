import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPlotPlacement,
  fieldPartsFromCells,
  generateLandscapeAttempt,
  orchardPartsFromCells,
  suggestVillageName,
  tileCenterWorld,
  tileOfWorldPoint,
  type DwellingPlot,
  type Landscape,
  type LayerVersions,
  type PlacementVillage,
  type Position,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import type { PlacementResult } from '../lib/scene/village-types';
import { TEST_DATABASE_URL } from '../playwright.config';
import { openGameMenu, registerAndEnterGame, useUniqueClientIp } from './helpers';

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

/**
 * Aktivní sídelní sídlo hráče s krajinou – stejně jako ji generuje server (seed a verze vrstev
 * z databáze). Sídla archivovaná restartem hry se nepočítají.
 */
async function seat(email: string): Promise<Seat> {
  const [row] = await query<{ id: string; landscape_seed: number; layer_versions: LayerVersions }>(
    `SELECT s.id, s.landscape_seed, s.layer_versions
       FROM settlement s JOIN "user" u ON u.id = s.owner_id
      WHERE u.email = $1 AND s.is_seat AND s.archived_at IS NULL`,
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

/** Uloží upravený stav vsi (jako by ho zapsal server) – další dotaz na ves (5 s) ho ukáže. */
async function writeVillageState(settlementId: string, state: VillageState): Promise<void> {
  await query(
    'UPDATE village SET state = $2::jsonb, version = version + 1 WHERE settlement_id = $1',
    [settlementId, JSON.stringify(state)],
  );
}

/**
 * Dostavěná zemnice zakladatelů – stav jako u vsí uložených dřív, než si ji osadníci stavěli
 * sami (obydlí s id domácnosti, stavba zmizí).
 */
function withBuiltFirstDwelling(state: VillageState): VillageState {
  const site = state.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null);
  if (!site || site.dwellingId === null || site.position === null) return state;
  return {
    ...state,
    constructions: state.constructions.filter((c) => c !== site),
    dwellings: [
      {
        id: site.dwellingId,
        type: 'zemnice',
        builtDay: state.lastDay,
        condition: 1,
        position: site.position,
      },
      ...state.dwellings,
    ],
  };
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
 * Místo pro první zemnici u místa vsi, pole 3 × 2 čtverce (0,135 ha) vedle ní a pozemek pro
 * polozemnici (celé políčko, dům uprostřed), který nepřekáží ani jednomu.
 */
function villageSpots(l: Landscape): {
  dwelling: Position;
  cells: TileCell[];
  second: { position: Position; plot: DwellingPlot };
} {
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
      for (let r = 1; r <= 8; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const plot: DwellingPlot = {
              cell: { x: tile.x + dx, y: tile.y + dy },
              variant: 'center',
            };
            const check = checkPlotPlacement(l, village, 'polozemnice', plot);
            if (check.ok && check.position) {
              return { dwelling, cells, second: { position: check.position, plot } };
            }
          }
        }
      }
    }
  }
  throw new Error('V krajině není volné místo pro ves.');
}

/** Nejbližší čtverec ke zemnici, kam smí hřbitov (blízkost obydlí jen varuje). */
function cemeterySpot(l: Landscape, dwelling: Position): TileCell {
  const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
  if (!tile) throw new Error('Zemnice leží mimo krajinu.');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: dwelling }],
    constructions: [],
    parts: [],
  };
  for (let r = 2; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cell = { x: tile.x + dx, y: tile.y + dy };
        if (cemeteryPartsFromCells(l, village, [cell], [dwelling]).check.ok) return cell;
      }
    }
  }
  throw new Error('U zemnice není místo pro hřbitov.');
}

/** Nejbližší dva čtverce ke zemnici (vedle sebe), kam smí sad – staví se jako pole. */
function orchardSpot(l: Landscape, dwelling: Position): TileCell[] {
  const tile = tileOfWorldPoint(l, dwelling.x, dwelling.z);
  if (!tile) throw new Error('Zemnice leží mimo krajinu.');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: dwelling }],
    constructions: [],
    parts: [],
  };
  for (let r = 2; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cells = block(tile.x + dx, tile.y + dy, 2, 1);
        if (orchardPartsFromCells(l, village, cells, [dwelling]).check.ok) return cells;
      }
    }
  }
  throw new Error('U zemnice není místo pro sad.');
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
  // ves zakládají 4 lidé – v den založení se ale může narodit dítě, proto aspoň 4
  const people = page.getByTestId('village-people');
  await expect(people).toHaveText(/^\d+$/, { timeout: 30_000 });
  await expect
    .poll(async () => Number(await people.textContent()), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(4);
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
  await expect(grid.getByRole('button')).toHaveCount(10);
  // Nové obydlí ani dílnu nemá kdo osídlit – zakladatelé si stavějí vlastní zemnici. Hřbitov,
  // sad, modla ani svatyně lidi nechtějí (modla a svatyně dospělé duby – krajina je má).
  await expect(grid.getByRole('button', { name: 'Polozemnice' })).toBeDisabled();
  for (const craft of ['Hrnčíř', 'Kovář', 'Uhlíř']) {
    await expect(grid.getByRole('button', { name: craft })).toBeDisabled();
  }
  await expect(grid.getByRole('button', { name: 'Hřbitov' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Sad' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Modla' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Svatyně' })).toBeEnabled();
  // štěstí obyvatel v horní liště (happiness.md) – výchozí kolem 50
  await expect(page.getByTestId('village-happiness')).toHaveText(/^\d+$/);
  expect((await villageState(s.settlementId)).fields).toEqual([]);

  // Jméno se přepíše přímo v horní liště.
  await name.click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Testovice');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Testovice');

  // Zemnici si osadníci teprve staví – v uložené vsi je to stavba, obydlí zatím žádné.
  const founded = await villageState(s.settlementId);
  expect(founded.dwellings).toEqual([]);
  expect(founded.constructions).toEqual([
    expect.objectContaining({
      kind: 'dwelling',
      dwellingType: 'zemnice',
      position: spots.dwelling,
    }),
  ]);

  // R vrátí pohled na ves, kliknutí na zemnici ji vybere – panel ukáže průběh stavby.
  await page.keyboard.press('r');
  const point = await page.evaluate(
    (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
    spots.dwelling,
  );
  expect(point).not.toBeNull();
  const clickZemnice = async (): Promise<void> => {
    await page.mouse.move(point!.x - 3, point!.y);
    await page.mouse.click(point!.x, point!.y);
  };
  await clickZemnice();
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'site');
  const progress = Number(
    await panel.getByTestId('selection-progress').getAttribute('aria-valuenow'),
  );
  expect(progress).toBeLessThan(100);
  // Pravé tlačítko výběr zruší (jako v 0 A.D.).
  await page.mouse.click(point!.x, point!.y, { button: 'right' });
  await expect(panel).toHaveCount(0);

  // Dostavěná zemnice (i ves uložená dřív se zemnicí od založení): osadníci v ní bydlí.
  await writeVillageState(s.settlementId, withBuiltFirstDwelling(founded));
  await expect
    .poll(
      async () => {
        await clickZemnice();
        return panel.getAttribute('data-kind');
      },
      { timeout: 20_000 },
    )
    .toBe('dwelling');
  await expect(panel.getByTestId('selection-occupants')).toHaveText('4/6');
  await expect(panel.getByTestId('selection-ages').getByRole('listitem')).toHaveCount(4);

  // Ves je uložená na serveru – po novém načtení stránky je tu dál i s novým jménem.
  await page.reload();
  await expect(page.getByTestId('village-name')).toHaveText('Testovice', { timeout: 30_000 });
});

test('obydlí jde stavět, jen když je kým ho osadit – pole kdykoli', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'stavby');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const polozemnice = grid.getByRole('button', { name: 'Polozemnice' });

  // Lidé k osídlení nejsou: tlačítko zašedlé, v popisku chybějící lidé červeně, zkratka nic.
  await expect(polozemnice).toBeDisabled();
  await expect(grid.getByRole('button', { name: 'Zemnice', exact: true })).toBeDisabled();
  await polozemnice.hover();
  const settlers = grid
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Polozemnice' }) })
    .locator('[data-resource="settlers"]');
  await expect(settlers).toBeVisible();
  await expect(settlers).toHaveAttribute('data-missing', 'true');
  await page.mouse.move(10, 300);
  await page.keyboard.press('x');
  await expect(polozemnice).toHaveAttribute('aria-pressed', 'false');

  // Pole klávesovou zkratkou C, kdykoli po založení.
  await page.keyboard.press('c');
  await expect(grid.getByRole('button', { name: 'Pole' })).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);

  // Zemnice dostavěná a domácnost v ní plná se 4 dospělými – jeden pár k osídlení.
  const full = withBuiltFirstDwelling(await villageState(s.settlementId));
  const adultBorn = full.lastDay - Math.ceil(16 * 365.25);
  for (const person of full.people) person.bornDay = Math.min(person.bornDay, adultBorn);
  for (let i = 0; i < 2; i++) {
    full.people.push({
      id: full.nextId++,
      bornDay: adultBorn,
      dwellingId: full.people[0]!.dwellingId,
    });
  }
  await writeVillageState(s.settlementId, full);
  await expect(polozemnice).toBeEnabled({ timeout: 20_000 });
  await polozemnice.click();
  await expect(polozemnice).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, {
    kind: 'dwelling',
    type: 'polozemnice',
    position: spots.second.position,
    plot: spots.second.plot,
  });
  await expect
    .poll(async () => {
      const state = await villageState(s.settlementId);
      return state.constructions.filter((c) => c.kind === 'dwelling').map((c) => c.dwellingType);
    })
    .toEqual(['polozemnice']);
  // Jediný pár čeká na rozestavěnou polozemnici – další obydlí zase nejde.
  await expect(polozemnice).toBeDisabled();
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

test('hráč založí hřbitov po čtvercích a vybere ho – panel ukáže hroby', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'hrbitov');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const cell = cemeterySpot(s.landscape, spots.dwelling);

  // Hřbitov klávesovou zkratkou V, malování po čtvercích jako pole.
  await page.keyboard.press('v');
  await expect(grid.getByRole('button', { name: 'Hřbitov' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await confirmPlacement(page, { kind: 'squares', cells: [cell] });
  await expect
    .poll(async () => (await villageState(s.settlementId)).cemeteries?.length ?? 0)
    .toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Kliknutí na čtverec hřbitova ho vybere – nehotový ukáže jen průběh založení.
  await page.keyboard.press('r');
  const center = tileCenterWorld(s.landscape, cell.x, cell.y);
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), center);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'cemetery');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();

  // Ohrazený hřbitov se třemi hroby přímo v uložené vsi – další dotaz (každých 5 s) ho ukáže.
  const state = await villageState(s.settlementId);
  const cemetery = state.cemeteries![0]!;
  cemetery.builtDay = state.lastDay;
  cemetery.graves = 3;
  state.constructions = state.constructions.filter((c) => c.kind !== 'cemetery');
  await query('UPDATE village SET state = $2, version = version + 1 WHERE settlement_id = $1', [
    s.settlementId,
    JSON.stringify(state),
  ]);
  await expect(panel.getByTestId('selection-graves')).toHaveText('3/56', { timeout: 20_000 });
  await expect(panel.getByTestId('selection-years')).toBeVisible();
});

test('hráč vysadí sad po čtvercích a vybere ho – panel ukáže výsadbu, stáří a úrodu', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'sad');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const cells = orchardSpot(s.landscape, spots.dwelling);

  // Sad klávesovou zkratkou B, malování po čtvercích jako pole.
  await page.keyboard.press('b');
  await expect(grid.getByRole('button', { name: 'Sad' })).toHaveAttribute('aria-pressed', 'true');
  await confirmPlacement(page, { kind: 'squares', cells });
  await expect.poll(async () => (await villageState(s.settlementId)).orchards?.length ?? 0).toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Kliknutí na čtverec sadu ho vybere – sázející se sad ukáže průběh výsadby a odhad úrody.
  await page.keyboard.press('r');
  const center = tileCenterWorld(s.landscape, cells[0]!.x, cells[0]!.y);
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), center);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'orchard');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await expect(panel.getByTestId('selection-yield')).toHaveText('0');

  // Sad vysazený před 30 lety přímo v uložené vsi – další dotaz (každých 5 s) ho ukáže v plné
  // úrodě: 2 čtverce = 0,045 ha × 3 t = 135 kg jablek.
  const state = await villageState(s.settlementId);
  const orchard = state.orchards![0]!;
  for (const square of orchard.squares) {
    square.plantedDay = state.lastDay - Math.ceil(30 * 365.25);
    square.plantingDone = square.plantingCost;
    delete square.obstacles;
    delete square.trees;
  }
  state.constructions = state.constructions.filter((c) => c.kind !== 'orchard');
  await query('UPDATE village SET state = $2, version = version + 1 WHERE settlement_id = $1', [
    s.settlementId,
    JSON.stringify(state),
  ]);
  await expect(panel.getByTestId('selection-age')).toHaveText(/^(29|30)$/, { timeout: 20_000 });
  await expect(panel.getByTestId('selection-progress')).toHaveCount(0);
  await expect(panel.getByTestId('selection-yield')).not.toHaveText('0');
});

test('když ves vymře, hra skončí obrazovkou porážky – Začít znovu dá nové sídlo', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'vymreni');
  await found(page, villageSpots(s.landscape).dwelling);
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0);

  // Všichni zemřeli – ves vymřelá přímo v uložené vsi (jako by ji tak dopočítal server).
  const dead = await villageState(s.settlementId);
  dead.people = [];
  dead.extinctDay = dead.lastDay;
  dead.chronicle.push({ day: dead.lastDay, kind: 'village-extinct' });
  await writeVillageState(s.settlementId, dead);
  await page.reload();

  const defeat = page.getByTestId('defeat-screen');
  await expect(defeat).toBeVisible({ timeout: 30_000 });
  await expect(defeat.getByRole('heading', { name: 'Rod vymřel' })).toBeVisible();
  await expect(defeat.getByTestId('defeat-village')).toHaveText(suggestVillageName(s.seed));
  await expect(defeat.getByTestId('defeat-years')).toHaveText('0 let');
  // vymřelá ves nic nestaví – nabídka staveb je prázdná
  await expect(page.getByTestId('build-grid').getByRole('button')).toHaveCount(0);

  // Po úspěchu se stránka načte znovu (nová krajina) – čeká se na novou navigaci.
  const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
  await defeat.getByRole('button', { name: 'Začít znovu' }).click();
  await reloaded;
  // Nové sídlo s novou krajinou: zase jen zemnice k založení vsi, bez jména a porážky.
  await expect(page.getByTestId('defeat-screen')).toHaveCount(0, { timeout: 30_000 });
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  const grid = page.getByTestId('build-grid');
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(grid.getByRole('button', { name: 'Zemnice' })).toBeVisible();
  await expect(page.getByTestId('village-name')).toHaveCount(0);

  const fresh = await seat(email);
  expect(fresh.settlementId).not.toBe(s.settlementId);
  const [old] = await query<{ archived: boolean; is_seat: boolean }>(
    'SELECT archived_at IS NOT NULL AS archived, is_seat FROM settlement WHERE id = $1',
    [s.settlementId],
  );
  expect(old).toEqual({ archived: true, is_seat: false });
  // vymřelá ves zůstala v archivu u starého sídla
  expect((await villageState(s.settlementId)).extinctDay).toBe(dead.extinctDay);
  expect(
    await query('SELECT 1 FROM village WHERE settlement_id = $1', [fresh.settlementId]),
  ).toEqual([]);
});

test('nabídka hry (F10) zruší umisťování a Začít znovu se živou vsí po potvrzení dá nové sídlo', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'nabidka');
  await found(page, villageSpots(s.landscape).dwelling);
  const grid = page.getByTestId('build-grid');
  const field = grid.getByRole('button', { name: 'Pole' });
  const menu = page.getByRole('dialog', { name: 'Nabídka' });

  // F10 otevře nabídku jako v 0 A.D. – rozběhnuté umisťování skončí, zkratky staveb neběží.
  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F10');
  await expect(menu).toBeVisible();
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('c');
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  // Esc nabídku zavře, tlačítko v liště ji otevře znovu.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await openGameMenu(page);

  // Se živou vsí jen po potvrzení v panelu – Zrušit vrátí k položkám a nic se nestane.
  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  await expect(menu.getByText('Ves i rod zaniknou, začneš v nové krajině.')).toBeVisible();
  await menu.getByRole('button', { name: 'Zrušit' }).click();
  await expect(menu.getByRole('button', { name: 'Odhlásit' })).toBeVisible();
  expect((await seat(email)).settlementId).toBe(s.settlementId);

  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  const reloaded = page.waitForEvent('framenavigated', { timeout: 30_000 });
  await menu.getByRole('button', { name: 'Začít znovu' }).click();
  await reloaded;
  // Nové sídlo s novou krajinou: zase jen zemnice k založení vsi, bez jména a bez nabídky.
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(menu).toHaveCount(0);
  await expect(grid.getByRole('button')).toHaveCount(1);
  await expect(grid.getByRole('button', { name: 'Zemnice' })).toBeVisible();
  await expect(page.getByTestId('village-name')).toHaveCount(0);

  const fresh = await seat(email);
  expect(fresh.settlementId).not.toBe(s.settlementId);
  const [old] = await query<{ archived: boolean; is_seat: boolean }>(
    'SELECT archived_at IS NOT NULL AS archived, is_seat FROM settlement WHERE id = $1',
    [s.settlementId],
  );
  expect(old).toEqual({ archived: true, is_seat: false });
  // opuštěná ves zůstala v archivu, jak byla – nevymřela, jen se dál nedopočítává
  const abandoned = await villageState(s.settlementId);
  expect(abandoned.extinctDay).toBeUndefined();
  expect(abandoned.people.length).toBeGreaterThan(0);
  expect(
    await query('SELECT 1 FROM village WHERE settlement_id = $1', [fresh.settlementId]),
  ).toEqual([]);

  // Bez vsi není co začínat znovu – položka je zamčená.
  await page.keyboard.press('F10');
  await expect(menu.getByRole('button', { name: 'Začít znovu' })).toBeDisabled();
});
