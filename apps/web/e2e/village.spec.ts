import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  buyPrice,
  cemeteryPartsFromCells,
  neighbourOf,
  sellPrice,
  villageGoodStock,
  checkDwellingPlacement,
  checkPlotPlacement,
  freeVillageSite,
  fieldPartsFromCells,
  generateLandscapeAttempt,
  orchardPartsFromCells,
  penSquaresFromCells,
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

/** Uložený stav první vsi sídla (sídlo může mít víc vsí – migration.md). */
async function villageState(settlementId: string): Promise<VillageState> {
  const [row] = await query<{ state: VillageState }>(
    'SELECT state FROM village WHERE settlement_id = $1 ORDER BY created_at, id LIMIT 1',
    [settlementId],
  );
  if (!row) throw new Error('Ves není založená.');
  return row.state;
}

/**
 * Uloží upravený stav první vsi sídla (jako by ho zapsal server) – ukáže ho až další dotaz na ves
 * (`pollVillage`; sám by přišel až s dalším herním dnem).
 */
/**
 * Zeptá se na ves hned (háček dotazování) – po přímé změně uložené vsi. Dotaz sám jde až na
 * začátku dalšího herního dne (v pomalém světě testů nejpozději za 86 s).
 */
async function pollVillage(page: Page): Promise<void> {
  await page.evaluate(() => window.__bohemiaE2E!.pollVillage!());
}

async function writeVillageState(settlementId: string, state: VillageState): Promise<void> {
  await query(
    `UPDATE village SET state = $2::jsonb, version = version + 1
      WHERE id = (SELECT id FROM village WHERE settlement_id = $1 ORDER BY created_at, id LIMIT 1)`,
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
 * polozemnici (celé políčko, dům uprostřed), který nepřekáží ani jednomu (ani poli nic nevezme).
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
            // pozemek smí i na pole (zmenší ho) – test chce pole celé
            if (check.ok && check.position && check.takenLand.length === 0) {
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
  await expect(people).toHaveText(/^\d+( \/ ≈ \d+)?$/, { timeout: 30_000 });
  await expect
    .poll(async () => Number.parseInt((await people.textContent()) ?? '', 10), { timeout: 30_000 })
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
  await expect(grid.getByRole('button')).toHaveCount(13);
  // Nové obydlí ani dílnu nemá kdo osídlit – zakladatelé si stavějí vlastní zemnici. Hřbitov,
  // sad, modla, svatyně ani ohrada lidi nechtějí (modla a svatyně dospělé duby, ohrada stromy –
  // krajina je má).
  await expect(grid.getByRole('button', { name: 'Polozemnice' })).toBeDisabled();
  for (const craft of ['Hrnčíř', 'Kovář', 'Uhlíř', 'Tesař']) {
    await expect(grid.getByRole('button', { name: craft })).toBeDisabled();
  }
  await expect(grid.getByRole('button', { name: 'Hřbitov' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Sad' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Modla' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Svatyně' })).toBeEnabled();
  await expect(grid.getByRole('button', { name: 'Ohrada' })).toBeEnabled();
  // štěstí obyvatel v horní liště (happiness.md) – výchozí kolem 50
  await expect(page.getByTestId('village-happiness')).toHaveText(/^\d+$/);
  expect((await villageState(s.settlementId)).fields).toEqual([]);

  // Jméno se přepíše přímo v horní liště (tužka vedle jména – klik na jméno přepíná vsi).
  await page.getByRole('button', { name: 'Přejmenovat ves' }).click();
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
  await pollVillage(page);
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
  // zemnice zakladatelů je dvorec – obyvatelé jako rodina; dovednosti jen v panelu osoby (lord.md)
  await expect(panel.getByTestId('manor-family').getByRole('listitem')).toHaveCount(4);
  await expect(
    panel.getByTestId('manor-family').locator('[data-testid^="manor-arms-"]'),
  ).toHaveCount(0);

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

  // Zemnice dostavěná (R pak vrací pohled na první obydlí, ne na místo vsi) a její zakladatelé
  // dospělí a jeden dospělý navíc – z domácnosti smí odejít jediná rodina (Lidé k osídlení,
  // kinship.md: pár, který dům nedrží, smí odejít kdykoli), tedy jedno nové obydlí.
  const full = withBuiltFirstDwelling(await villageState(s.settlementId));
  const adultBorn = full.lastDay - Math.ceil(16 * 365.25);
  for (const person of full.people) person.bornDay = Math.min(person.bornDay, adultBorn);
  full.people.push({
    id: full.nextId++,
    bornDay: adultBorn,
    dwellingId: full.people[0]!.dwellingId,
  });
  await writeVillageState(s.settlementId, full);
  await pollVillage(page);
  // Pohled vsi už vidí dostavěné obydlí – R teprve pak vrací pohled na něj.
  await expect(polozemnice).toBeEnabled({ timeout: 20_000 });

  // Klik na čtverec pole vybere jen díl, dvojklik celé pole (fields.md – Co hráč vidí); čtverec
  // nejdál od zemnice, ať klik nezachytí střecha.
  // Myš u okraje obrazovky posouvá kameru (okrajové rolování) – po klávese X zůstala vlevo.
  await page.mouse.move(640, 360);
  await page.keyboard.press('r');
  const fieldCenter = spots.cells
    .map((cell) => tileCenterWorld(s.landscape, cell.x, cell.y))
    .sort(
      (a, b) =>
        Math.hypot(b.x - spots.dwelling.x, b.z - spots.dwelling.z) -
        Math.hypot(a.x - spots.dwelling.x, a.z - spots.dwelling.z),
    )[0]!;
  // Kamera po R plynule přejíždí na ves – počkat, až se bod na obrazovce ustálí.
  let lastPoint = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(
          await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), fieldCenter),
        );
        const settled = now !== 'null' && now === lastPoint;
        lastPoint = now;
        return settled;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const fieldPoint = JSON.parse(lastPoint) as { x: number; y: number };
  const panel = page.getByTestId('selection-panel');
  await page.mouse.move(fieldPoint.x - 3, fieldPoint.y);
  await page.mouse.click(fieldPoint.x, fieldPoint.y);
  await expect(panel).toHaveAttribute('data-kind', 'field-part');
  await expect(panel.getByTestId('selection-area')).toHaveText(/ m²$/);
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await page.mouse.dblclick(fieldPoint.x, fieldPoint.y);
  await expect(panel).toHaveAttribute('data-kind', 'field');
  await expect(panel.getByTestId('selection-area')).toHaveText(/ ha$/);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

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
  // Hlad nastavený přímo v uložené vsi – další dotaz na ves ho ohlásí. „Ves hladoví“ je stupeň
  // s příděl pod 90 % (population.md – Co hráč vidí); samotný příznak `hungry` je jen šetření.
  await query(
    `UPDATE village SET state = state || '{"hungry": true, "ration": 0.5}'::jsonb, version = version + 1
      WHERE settlement_id = $1`,
    [s.settlementId],
  );
  await pollVillage(page);
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

  // Ohrazený hřbitov se třemi hroby přímo v uložené vsi – další dotaz ho ukáže.
  const state = await villageState(s.settlementId);
  const cemetery = state.cemeteries![0]!;
  cemetery.builtDay = state.lastDay;
  cemetery.graves = 3;
  state.constructions = state.constructions.filter((c) => c.kind !== 'cemetery');
  await query('UPDATE village SET state = $2, version = version + 1 WHERE settlement_id = $1', [
    s.settlementId,
    JSON.stringify(state),
  ]);
  await pollVillage(page);
  await expect(panel.getByTestId('selection-graves')).toHaveText('3/56', { timeout: 20_000 });
  await expect(panel.getByTestId('selection-years')).toBeVisible();
});

test('hráč postaví ohradu koní z rozcestníku ohrad – panel ukáže koně, místa a obilí', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'kone');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const grid = page.getByTestId('build-grid');
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: spots.dwelling }],
    constructions: [],
    parts: [],
  };
  const tile = tileOfWorldPoint(s.landscape, spots.dwelling.x, spots.dwelling.z)!;
  const cell = [3, 4, 5, 6]
    .flatMap((r) => [
      { x: tile.x + r, y: tile.y },
      { x: tile.x - r, y: tile.y },
      { x: tile.x, y: tile.y + r },
      { x: tile.x, y: tile.y - r },
    ])
    .find((c) => penSquaresFromCells(s.landscape, village, [c], 'horse').check.ok);
  expect(cell).toBeDefined();

  // Rozcestník ohrad (O) nabízí i Ohradu koní – druh z mřížky staveb.
  await page.keyboard.press('o');
  const horsePen = grid.getByRole('button', { name: 'Ohrada koní' });
  await expect(horsePen).toBeVisible();
  await horsePen.click();
  await confirmPlacement(page, { kind: 'squares', cells: [cell!], variant: 'horse' });
  await expect
    .poll(async () => (await villageState(s.settlementId)).pens?.[0]?.species)
    .toBe('horse');

  // Hotová ohrada se dvěma koněm v uložené vsi – panel: koně / místa, obilí a seno na zimu.
  const state = await villageState(s.settlementId);
  const pen = state.pens![0]!;
  pen.builtDay = state.lastDay;
  pen.horses = [
    { id: 1, bornDay: state.lastDay - 3000, sex: 'male', training: 50 },
    { id: 2, bornDay: state.lastDay - 2300, sex: 'female', training: 0 },
  ];
  state.constructions = state.constructions.filter((c) => c.kind !== 'pen');
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);
  await page.keyboard.press('r');
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), pen);
  expect(point).not.toBeNull();
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(point!.x - 3, point!.y);
        await page.mouse.click(point!.x, point!.y);
        return panel.getAttribute('data-kind');
      },
      { timeout: 20_000 },
    )
    .toBe('pen');
  await expect(panel.getByTestId('selection-pen-animals')).toHaveText('2/4', { timeout: 20_000 });
  await expect(panel.getByTestId('selection-horses-grain')).toHaveText('1,5');
  await expect(panel.getByTestId('selection-horses-hay')).toBeVisible();
  await expect(panel.getByTestId('selection-horse-1')).toHaveText('8');
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

  // Kliknutí na čtverec sadu vybere jen ten čtverec (fields.md – Co hráč vidí) – sází se, úroda 0.
  await page.keyboard.press('r');
  const center = tileCenterWorld(s.landscape, cells[0]!.x, cells[0]!.y);
  const point = await page.evaluate((p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z), center);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toHaveAttribute('data-kind', 'orchard-square');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await expect(panel.getByTestId('selection-yield')).toHaveText('0');
  // Dvojklik vybere celý sad – sázející se sad ukáže průběh výsadby a odhad úrody.
  await page.mouse.dblclick(point!.x, point!.y);
  await expect(panel).toHaveAttribute('data-kind', 'orchard');
  await expect(panel.getByTestId('selection-progress')).toBeVisible();
  await expect(panel.getByTestId('selection-yield')).toHaveText('0');

  // Sad vysazený před 30 lety přímo v uložené vsi – další dotaz ho ukáže v plné
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
  await pollVillage(page);
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

/**
 * Jak daleko od sebe nová obydlí v testu stojí (m) – blíž by vyšší dům před staveništěm zakryl
 * kliknutí na staveniště (výběr paprskem bere stavbu nejblíž kameře).
 */
const FREE_HOME_SPACING_M = 25;

/**
 * Volná místa pro zemnice u bodu (x, z) – každé projde kontrolou s předchozími obydlími a stojí
 * aspoň FREE_HOME_SPACING_M od nich.
 */
function freeHomes(
  l: Landscape,
  near: Position,
  taken: readonly Position[],
  count: number,
): Position[] {
  const homes: Position[] = [];
  for (const spot of around(near.x, near.z, 240)) {
    const others = [...taken, ...homes];
    if (others.some((o) => Math.hypot(o.x - spot.x, o.z - spot.z) < FREE_HOME_SPACING_M)) continue;
    const village: PlacementVillage = {
      dwellings: [...taken, ...homes].map((position) => ({ type: 'zemnice', position })),
      constructions: [],
      parts: [],
    };
    if (!checkDwellingPlacement(l, village, 'zemnice', spot).ok) continue;
    homes.push(spot);
    if (homes.length === count) return homes;
  }
  throw new Error('U vsi není místo pro další zemnice.');
}

test('domácnosti se stěhují do nových domů – Ctrl + A vybere obydlí, domy se umístí postupně', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'stehovani');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // Dvě dostavěná obydlí s domácnostmi (zakladatelé a mladý pár vedle) a klády na hromadě.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const [neighbour] = freeHomes(s.landscape, spots.dwelling, [spots.dwelling], 1);
  const pairHome = state.nextId++;
  state.dwellings.push({
    id: pairHome,
    type: 'zemnice',
    builtDay: state.lastDay,
    condition: 1,
    position: neighbour!,
  });
  const adultBorn = state.lastDay - Math.ceil(20 * 365.25);
  for (let i = 0; i < 2; i++) {
    state.people.push({ id: state.nextId++, bornDay: adultBorn, dwellingId: pairHome });
  }
  state.woodLogs = 30;
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  // Ctrl + A vybere obě obydlí (jakmile dotaz na ves přinese druhé) – panel ukáže domácnosti.
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(10, 300);
        await page.keyboard.press('Control+A');
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 20_000 },
    )
    .toBe('dwellings');
  await expect(panel.getByTestId('selection-households')).toHaveText('2');
  // odchod do nové vsi už jde (migration.md – fáze 3 a 4), testuje ho vlastní test níž
  await expect(panel.getByTestId('leave-village')).toBeEnabled();

  // Přestěhovat do zemnice: nový dům se umístí za každou domácnost, jeden za druhým.
  await panel.getByTestId('relocate-zemnice').click();
  const homes = freeHomes(s.landscape, spots.dwelling, [spots.dwelling, neighbour!], 2);
  for (const position of homes) {
    await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position });
  }
  await expect
    .poll(async () =>
      (await villageState(s.settlementId)).constructions
        .filter((c) => c.relocates !== undefined)
        .map((c) => c.relocates)
        .sort(),
    )
    .toEqual([state.dwellings[0]!.id, pairHome].sort());
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Staveniště nového domu jde zrušit – dřevo se vrátí na hromadu, domácnost zůstane doma.
  await page.keyboard.press('r');
  const point = await page.evaluate(
    (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
    homes[0]!,
  );
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x - 3, point!.y);
  await page.mouse.click(point!.x, point!.y);
  await expect(panel).toHaveAttribute('data-kind', 'site');
  await panel.getByTestId('cancel-construction').click();
  await expect
    .poll(
      async () =>
        (await villageState(s.settlementId)).constructions.filter((c) => c.relocates !== undefined)
          .length,
    )
    .toBe(1);
});

test('druhá ves na téže mapě (vývojový režim) – jméno vsi v liště přepíná mezi vsemi', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'vsi');
  await found(page, villageSpots(s.landscape).dwelling);
  const name = page.getByTestId('village-name');
  const first = suggestVillageName(s.seed);
  await expect(name).toHaveText(first);
  // bez vývojového režimu tlačítko druhé vsi není
  await expect(page.getByTestId('dev-second-village')).toHaveCount(0);
  await query('UPDATE "user" SET dev_mode = true WHERE email = $1', [email]);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });

  // Druhá ves vznikne na téže mapě a rozhraní se na ni hned přepne.
  await page.getByTestId('dev-second-village').click();
  const villages = (): Promise<{ id: string; name: string }[]> =>
    query<{ id: string; name: string }>(
      'SELECT id, name FROM village WHERE settlement_id = $1 ORDER BY created_at, id',
      [s.settlementId],
    );
  await expect.poll(async () => (await villages()).length, { timeout: 30_000 }).toBe(2);
  const [one, two] = await villages();
  expect(one!.name).toBe(first);
  await expect(name).toHaveText(two!.name, { timeout: 30_000 });

  // Přejmenování platí jen pro vybranou ves.
  await page.getByRole('button', { name: 'Přejmenovat ves' }).click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Druhovice');
  await page.keyboard.press('Enter');
  await expect(name).toHaveText('Druhovice');

  // Klik na jméno otevře seznam vsí (jméno a lidé), klik na ves ji přepne.
  await name.click();
  const list = page.getByTestId('village-list');
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.locator(`[data-village="${two!.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(list.locator(`[data-village="${one!.id}"]`)).toContainText(first);
  await list.locator(`[data-village="${one!.id}"] button`).click();
  await expect(list).toHaveCount(0);
  await expect(name).toHaveText(first);
  expect((await villages()).map((v) => v.name)).toEqual([first, 'Druhovice']);

  // Výběr se pamatuje – po novém načtení stránky je vybraná zase první ves, pak druhá.
  await page.reload();
  await expect(name).toHaveText(first, { timeout: 30_000 });
  await name.click();
  await list.locator(`[data-village="${two!.id}"] button`).click();
  await expect(name).toHaveText('Druhovice');
  await page.reload();
  await expect(name).toHaveText('Druhovice', { timeout: 30_000 });
});

test('ves postaví ve dvorci zemskou stezku a pošle po ní výpravu k sousedovi', async ({ page }) => {
  const { seat: s } = await newPlayer(page, 'obchod');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // Dostavěná zemnice zakladatelů je dvorec vojvody (trade.md); zásoby na obchod.
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  Object.assign(state, {
    storesKg: 4000,
    meatKg: 300,
    cheeseKg: 300,
    legumesKg: 300,
    woodLogs: 40,
    crafts: { charcoalKg: 400, potteryKg: 60, ironBarsKg: 20 },
  });
  await writeVillageState(s.settlementId, state);
  await pollVillage(page);

  // Klik na dvorec – panel dvorce s vylepšeními vsi
  await page.keyboard.press('r');
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const point = await page.evaluate(
          (p) => window.__bohemiaE2E!.projectToScreen!(p.x, p.z),
          spots.dwelling,
        );
        if (!point) return null;
        await page.mouse.move(point.x - 3, point.y);
        await page.mouse.click(point.x, point.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await expect(panel.getByTestId('manor-trade')).toBeDisabled();

  // Zemská stezka: růžice 8 směrů – první směr, kudy stezka vede
  await panel.getByTestId('manor-trail').click();
  const compass = page.getByTestId('trail-compass');
  await expect(compass).toBeVisible();
  const open = compass.locator('button[data-status="none"]:not([disabled])').first();
  const direction = (await open.getAttribute('data-testid'))!.replace('trail-', '');
  await open.click();
  await expect
    .poll(async () => (await villageState(s.settlementId)).trails?.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(1);
  await expect(page.locator('[data-testid="village-notice"][data-kind="error"]')).toHaveCount(0);

  // Stezka je dostavěná (jako po letech práce) – obchod se otevře
  const built = await villageState(s.settlementId);
  const trail = built.trails![0]!;
  trail.builtDay = built.lastDay;
  built.constructions = built.constructions.filter((c) => c.trail === undefined);
  for (const road of built.roads?.roads ?? []) {
    if (trail.pieces.some((p) => p.roadId === road.id)) road.grade = 'improved';
  }
  await writeVillageState(s.settlementId, built);
  await pollVillage(page);
  await expect(panel.getByTestId('manor-trade')).toBeEnabled({ timeout: 20_000 });
  await panel.getByTestId('manor-trade').click();
  await expect(page.getByTestId('trade-panel')).toBeVisible();

  // Výhodná výměna: kus nabízeného zboží za sháněné, které ves má
  const neighbour = neighbourOf(built.seed, trail.direction);
  const want = neighbour.offers[0]!;
  const pay = neighbour.demands.find(
    (g) => villageGoodStock(built, g) * sellPrice(g) >= buyPrice(want),
  )!;
  const amount = Math.ceil(buyPrice(want) / sellPrice(pay));
  await page.getByTestId(`trade-get-${want}`).locator('input').fill('1');
  await page.getByTestId(`trade-give-${pay}`).locator('input').fill(String(amount));
  await expect(page.getByTestId('trade-balance')).toHaveAttribute('data-fair', 'true');
  await page.getByTestId('trade-send').click();
  await expect
    .poll(async () => (await villageState(s.settlementId)).trade?.expeditions.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(1);
  const sent = await villageState(s.settlementId);
  expect(sent.trade!.expeditions[0]).toMatchObject({ direction, get: { [want]: 1 } });
  expect(sent.chronicle.some((e) => e.kind === 'trade-departed')).toBe(true);
});

/**
 * Ves se dvěma domácnostmi – zakladatelé v dostavěné zemnici a mladý pár ve druhé zemnici vedle –
 * a zásobami; stav jako by ho uložil server.
 */
async function twoHouseholds(s: Seat, near: Position): Promise<VillageState> {
  const state = withBuiltFirstDwelling(await villageState(s.settlementId));
  const [neighbour] = freeHomes(s.landscape, near, [near], 1);
  const home = state.nextId++;
  state.dwellings.push({
    id: home,
    type: 'zemnice',
    builtDay: state.lastDay,
    condition: 1,
    position: neighbour!,
  });
  const adultBorn = state.lastDay - Math.ceil(20 * 365.25);
  state.people.push(
    { id: state.nextId++, bornDay: adultBorn, dwellingId: home, sex: 'male' },
    { id: state.nextId++, bornDay: adultBorn, dwellingId: home, sex: 'female' },
  );
  state.storesKg = 1500;
  await writeVillageState(s.settlementId, state);
  return state;
}

/** Ctrl + A vybere všechna obydlí (jakmile dotaz na ves přinese obě) – panel víc obydlí. */
async function selectAllDwellings(page: Page): Promise<ReturnType<Page['getByTestId']>> {
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(10, 300);
        await page.keyboard.press('Control+A');
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 20_000 },
    )
    .toBe('dwellings');
  return panel;
}

test('lidé odejdou založit novou ves na téže mapě – stará ves zůstane opuštěná', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'odchod');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const before = await twoHouseholds(s, spots.dwelling);
  await pollVillage(page);

  // Všechna obydlí → Odejít → nová ves na téže mapě: hráč umístí první zemnici daleko od staré.
  const panel = await selectAllDwellings(page);
  await panel.getByTestId('leave-village').click();
  await panel.getByTestId('leave-here').click();
  const site = freeVillageSite(
    s.landscape,
    before.dwellings.map((d) => ({ x: d.position.x, z: d.position.z })),
  );
  expect(site).not.toBeNull();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: site! });

  const villages = (): Promise<{ id: string; name: string; state: VillageState }[]> =>
    query<{ id: string; name: string; state: VillageState }>(
      'SELECT id, name, state FROM village WHERE settlement_id = $1 ORDER BY created_at, id',
      [s.settlementId],
    );
  await expect.poll(async () => (await villages()).length, { timeout: 30_000 }).toBe(2);
  const [old, fresh] = await villages();
  // odešli všichni – stará ves je opuštěná, nová stojí jako staveniště první zemnice
  expect(old!.state.abandonedDay).toBeDefined();
  expect(old!.state.people).toEqual([]);
  expect(fresh!.state.people).toHaveLength(before.people.length);
  expect(fresh!.state.constructions[0]!.position).toEqual(site);
  // rozhraní se přepnulo na novou ves, stará je v přepínači opuštěná
  await expect(page.getByTestId('village-name')).toHaveText(fresh!.name, { timeout: 30_000 });
  await page.getByTestId('village-name').click();
  await expect(
    page.getByTestId('village-list').locator(`[data-village="${old!.id}"]`),
  ).toHaveAttribute('data-state', 'abandoned');
});

test('lidé odejdou na novou mapu – po cestě umístí první zemnici', async ({ page }) => {
  const { email, seat: s } = await newPlayer(page, 'novamapa');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const before = await twoHouseholds(s, spots.dwelling);
  await pollVillage(page);

  // Všechna obydlí → Odejít → na východ: nová mapa vedle, lidé jsou na cestě.
  const panel = await selectAllDwellings(page);
  await panel.getByTestId('leave-village').click();
  await panel.getByTestId('leave-E').click();
  const maps = (): Promise<
    {
      id: string;
      grid_x: number | null;
      grid_y: number | null;
      landscape_seed: number;
      layer_versions: LayerVersions;
    }[]
  > =>
    query(
      `SELECT s.id, s.grid_x, s.grid_y, s.landscape_seed, s.layer_versions
         FROM settlement s JOIN "user" u ON u.id = s.owner_id
        WHERE u.email = $1 AND s.archived_at IS NULL ORDER BY s.created_at`,
      [email],
    );
  await expect.poll(async () => (await maps()).length, { timeout: 30_000 }).toBe(2);
  const [home, east] = await maps();
  expect(home).toMatchObject({ id: s.settlementId, grid_x: 0, grid_y: 0 });
  expect(east).toMatchObject({ grid_x: 1, grid_y: 0 });
  const [travelling] = await query<{ id: string; name: string; state: VillageState }>(
    'SELECT id, name, state FROM village WHERE settlement_id = $1',
    [east!.id],
  );
  expect(travelling!.state.journey?.direction).toBe('E');
  expect(travelling!.state.people).toHaveLength(before.people.length);
  await expect(
    page.locator('[data-testid="village-notice"][data-kind="households-left"]'),
  ).toBeVisible();

  // Přepnutí na ves na cestě načte novou mapu – řádek „na cestě“, stavět se zatím nedá.
  await page.getByTestId('village-name').click();
  await page
    .getByTestId('village-list')
    .locator(`[data-village="${travelling!.id}"] button`)
    .click();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('village-name')).toHaveText(travelling!.name, { timeout: 30_000 });
  await expect(page.getByTestId('journey-banner')).toHaveAttribute('data-arrived', 'false');
  await expect(page.getByTestId('build-grid').getByRole('button')).toHaveCount(0);

  // Lidé dorazili (příjezd posunutý na den odchodu) – jediná stavba je první zemnice.
  const arrived = structuredClone(travelling!.state);
  arrived.journey!.arrivalDay = arrived.journey!.departedDay;
  await query('UPDATE village SET state = $2::jsonb, version = version + 1 WHERE id = $1', [
    travelling!.id,
    JSON.stringify(arrived),
  ]);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('journey-banner')).toHaveAttribute('data-arrived', 'true');
  const grid = page.getByTestId('build-grid');
  await expect(grid.getByRole('button')).toHaveCount(1);
  const land = generateLandscapeAttempt(east!.landscape_seed, east!.layer_versions);
  const first = villageSpots(land).dwelling;
  await grid.getByRole('button', { name: 'Zemnice' }).click();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: first });
  await expect
    .poll(
      async () =>
        (
          await query<{ state: VillageState }>('SELECT state FROM village WHERE id = $1', [
            travelling!.id,
          ])
        )[0]!.state.journey,
      { timeout: 30_000 },
    )
    .toBeUndefined();
  await expect(page.getByTestId('journey-banner')).toHaveCount(0);
});
