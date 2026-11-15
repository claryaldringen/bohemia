// Společné kroky e2e vsi (village.spec.ts, worker.spec.ts): hráč, krajina sídla, volná místa
// pro stavby spočítaná ze seedu krajiny stejnými pravidly jako ve hře, přímé čtení a zápis vsi.
import { expect, type Locator, type Page } from '@playwright/test';
import { Client } from 'pg';
import {
  VILLAGE_STATE_SQL_COLUMNS,
  readVillageState,
  updateVillageState,
  writeVillageState as writeStoredVillageState,
} from '@bohemia/db/village-state';
import {
  checkDwellingPlacement,
  checkPlotPlacement,
  fieldPartsFromCells,
  generateLandscapeAttempt,
  tileCenterWorld,
  tileOfWorldPoint,
  type DwellingPlot,
  type Landscape,
  type LayerVersions,
  type SkeletonSlice,
  type PlacementVillage,
  type Position,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import type { PlacementResult } from '../lib/scene/village-types';
import { TEST_DATABASE_URL } from '../playwright.config';
import { registerAndEnterGame } from './helpers';

export interface Seat {
  settlementId: string;
  seed: number;
  landscape: Landscape;
}

export async function query<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
  return withClient(async (client) => (await client.query<T>(sql, params)).rows);
}

/** Jedno spojení na testovací databázi (transakce pomocníků stavu vsi). */
async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Aktivní sídelní sídlo hráče s krajinou – stejně jako ji generuje server (seed a verze vrstev
 * z databáze). Sídla archivovaná restartem hry se nepočítají.
 */
export async function seat(email: string): Promise<Seat> {
  const [row] = await query<{
    id: string;
    landscape_seed: number;
    layer_versions: LayerVersions;
    skeleton: SkeletonSlice | null;
  }>(
    `SELECT s.id, s.landscape_seed, s.layer_versions, s.skeleton
       FROM settlement s JOIN "user" u ON u.id = s.owner_id
      WHERE u.email = $1 AND s.is_seat AND s.archived_at IS NULL`,
    [email],
  );
  if (!row) throw new Error(`Hráč ${email} nemá sídlo.`);
  return {
    settlementId: row.id,
    seed: row.landscape_seed,
    // s výřezem kostry (pozvaný na řece či stezce – verze `skeleton` bez výřezu by neprošla)
    landscape: generateLandscapeAttempt(
      row.landscape_seed,
      row.layer_versions,
      undefined,
      row.skeleton,
    ),
  };
}

/**
 * Druhá ves hráče na mapě vedle – sídlo na políčku o sloupec východně od sídla `settlementId` se stejnou krajinou a stav zkopírovaný
 * z vsi sídla `settlementId` (jedna ves, jedna mapa – migration.md). Pro přepínač vsí bez odchodu.
 */
export async function villageOnNextMap(
  settlementId: string,
  name: string,
  /**
   * Hráčovým mužem se stane vojvoda nové vsi – ta je pak jeho vlastní a v původní vsi (kopie
   * s vojvodou) hráč, který není senior, jen se dívá (seniorate.md – Seniorát). Bez toho je nová
   * ves cizí ves rodu.
   */
  options: { own?: boolean } = {},
): Promise<{ id: string; name: string }> {
  const [map] = await query<{ id: string }>(
    `INSERT INTO settlement (owner_id, landscape_seed, layer_versions, grid_x, grid_y)
       SELECT owner_id, landscape_seed, layer_versions, grid_x + 1, grid_y FROM settlement WHERE id = $1
     RETURNING id`,
    [settlementId],
  );
  const [village] = await query<{ id: string; name: string }>(
    `INSERT INTO village (settlement_id, name, ${VILLAGE_STATE_SQL_COLUMNS})
       SELECT $2, $3, ${VILLAGE_STATE_SQL_COLUMNS} FROM village WHERE settlement_id = $1
     RETURNING id, name`,
    [settlementId, map!.id, name],
  );
  if (!village) throw new Error('Druhá ves nevznikla.');
  if (options.own) {
    const lordId = (await villageStateById(village.id)).dynasty?.lordId ?? null;
    await query(
      `UPDATE house SET lord_village_id = $1, lord_person_id = $3
       WHERE ended_at IS NULL AND player_id = (SELECT owner_id FROM settlement WHERE id = $2)`,
      [village.id, settlementId, lordId],
    );
  }
  return village;
}

/** Id vsi sídla (jedna ves, jedna mapa – migration.md). */
export async function villageIdOf(settlementId: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    'SELECT id FROM village WHERE settlement_id = $1 ORDER BY created_at, id LIMIT 1',
    [settlementId],
  );
  if (!row) throw new Error('Ves není založená.');
  return row.id;
}

/** Uložený stav vsi podle id (kodek `@bohemia/db/village-state` – stav je v DB komprimovaný). */
export async function villageStateById(villageId: string): Promise<VillageState> {
  const state = await withClient((client) => readVillageState(client, villageId));
  if (!state) throw new Error(`Ves ${villageId} neexistuje.`);
  return state;
}

/** Uložený stav vsi sídla. */
export async function villageState(settlementId: string): Promise<VillageState> {
  return villageStateById(await villageIdOf(settlementId));
}

/** Ves sídla – id, jméno a uložený stav. */
export async function villageOf(
  settlementId: string,
): Promise<{ id: string; name: string; state: VillageState }> {
  const [row] = await query<{ id: string; name: string }>(
    'SELECT id, name FROM village WHERE settlement_id = $1 ORDER BY created_at, id LIMIT 1',
    [settlementId],
  );
  if (!row) throw new Error('Ves není založená.');
  return { ...row, state: await villageStateById(row.id) };
}

/**
 * Zeptá se na ves hned (háček dotazování) – po přímé změně uložené vsi. Dotaz sám jde až na
 * začátku dalšího herního dne (v pomalém světě testů nejpozději za 86 s).
 */
/**
 * Druh obydlí (Zemnice, Polozemnice, Srub) v rozcestníku mřížky staveb – otevře ho
 * tlačítkem Obydlí, je-li zavřený. Rozcestník zavře Escape.
 */
export async function dwellingVariant(page: Page, name: string): Promise<Locator> {
  const grid = page.getByTestId('build-grid');
  if ((await grid.getAttribute('data-group')) !== 'dwelling') {
    await grid.getByRole('button', { name: 'Obydlí', exact: true }).click();
  }
  return grid.getByRole('button', { name, exact: true });
}

export async function pollVillage(page: Page): Promise<void> {
  await page.evaluate(() => window.__bohemiaE2E!.pollVillage!());
}

/**
 * Uloží upravený stav vsi sídla (jako by ho zapsal server) – ukáže ho až další dotaz na ves
 * (`pollVillage`; sám by přišel až s dalším herním dnem).
 */
export async function writeVillageState(settlementId: string, state: VillageState): Promise<void> {
  await writeVillageStateById(await villageIdOf(settlementId), state);
}

/** Zapíše stav vsi podle id jako server (kodek, odvozené sloupce, souhrn; verze + 1). */
export async function writeVillageStateById(villageId: string, state: VillageState): Promise<void> {
  await withClient((client) => writeStoredVillageState(client, villageId, state));
}

/**
 * Atomická úprava uloženého stavu vsi podle id (náhrada `jsonb_set` – stav je v DB komprimovaný);
 * verze + 1 jako zápis serveru. Vrátí nový stav.
 */
export async function changeVillageStateById(
  villageId: string,
  change: (state: VillageState) => VillageState,
): Promise<VillageState> {
  return withClient((client) => updateVillageState(client, villageId, change));
}

/** Atomická úprava uloženého stavu vsi sídla. */
export async function changeVillageState(
  settlementId: string,
  change: (state: VillageState) => VillageState,
): Promise<VillageState> {
  return changeVillageStateById(await villageIdOf(settlementId), change);
}

/**
 * Dostavěná zemnice zakladatelů – stav jako u vsí uložených dřív, než si ji osadníci stavěli
 * sami (obydlí s id domácnosti, stavba zmizí).
 */
export function withBuiltFirstDwelling(state: VillageState): VillageState {
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
export function block(x: number, y: number, width: number, height: number): TileCell[] {
  const cells: TileCell[] = [];
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) cells.push({ x: x + i, y: y + j });
  return cells;
}

/** Místa kolem bodu (x, z) po kružnicích – od nejbližšího. */
export function* around(x: number, z: number, maxR: number): Generator<Position> {
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
export function villageSpots(l: Landscape): {
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

export const readyScene = (page: Page): ReturnType<Page['locator']> =>
  page.locator('canvas[data-scene-ready="true"]');

/** Potvrdí běžící umisťování háčkem – naběhne, až je scéna připravená. */
export async function confirmPlacement(page: Page, result: PlacementResult): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__bohemiaE2E?.confirmPlacement === 'function',
    null,
    {
      // pod zátěží stroje se scéna připravuje i přes minutu
      timeout: 120_000,
    },
  );
  await page.evaluate((r) => window.__bohemiaE2E!.confirmPlacement!(r), result);
}

/** Nový hráč s krajinou a připravenou scénou. */
export async function newPlayer(
  page: Page,
  prefix: string,
): Promise<{ email: string; seat: Seat }> {
  const email = await registerAndEnterGame(page, prefix);
  // Softwarové kreslení + načtení modelů pod zátěží stroje (víc souběžných e2e) přesáhlo 60 s.
  await expect(readyScene(page)).toBeVisible({ timeout: 150_000 });
  return { email, seat: await seat(email) };
}

/** Pojmenuje vojvodu v panelu jména před založením vsi (lord.md – Kde se jméno zadává). */
export async function nameLord(page: Page, name: string): Promise<void> {
  const panel = page.getByTestId('line-name-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId('line-name-input').fill(name);
  await panel.getByTestId('line-name-input').press('Enter');
  await expect(panel).toHaveCount(0);
}

/**
 * Založí ves umístěním první zemnice z mřížky staveb – nejdřív pojmenuje vojvodu (`lordName`; null
 * – vojvoda už jméno má).
 */
export async function found(
  page: Page,
  dwelling: Position,
  lordName: string | null = 'Bořivoj',
): Promise<void> {
  if (lordName !== null) await nameLord(page, lordName);
  await page.getByTestId('build-grid').getByRole('button', { name: 'Zemnice' }).click();
  await confirmPlacement(page, { kind: 'dwelling', type: 'zemnice', position: dwelling });
  // ves zakládají 4 lidé – v den založení se ale může narodit dítě, proto aspoň 4
  const people = page.getByTestId('village-people');
  // založení vsi je server action + dopočet – pod zátěží stroje trvá déle než 30 s
  await expect(people).toHaveText(/^\d+( \/ ≈ \d+)?$/, { timeout: 90_000 });
  await expect
    .poll(async () => Number.parseInt((await people.textContent()) ?? '', 10), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(4);
}

/**
 * Jak daleko od sebe nová obydlí v testu stojí (m) – blíž by vyšší dům před staveništěm zakryl
 * kliknutí na staveniště (výběr paprskem bere stavbu nejblíž kameře).
 */
export const FREE_HOME_SPACING_M = 25;

/**
 * Volná místa pro zemnice u bodu (x, z) – každé projde kontrolou s předchozími obydlími a stojí
 * aspoň FREE_HOME_SPACING_M od nich.
 */
export function freeHomes(
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

/**
 * Ves se dvěma domácnostmi – zakladatelé v dostavěné zemnici a mladý pár ve druhé zemnici vedle –
 * a zásobami; stav jako by ho uložil server.
 */
export async function twoHouseholds(s: Seat, near: Position): Promise<VillageState> {
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
export async function selectAllDwellings(page: Page): Promise<ReturnType<Page['getByTestId']>> {
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        await page.mouse.move(10, 300);
        await page.keyboard.press('Control+A');
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      // Ctrl+A zabere, až je scéna s obydlími nakreslená – pod zátěží stroje to trvá přes 20 s
      { timeout: 90_000 },
    )
    .toBe('dwellings');
  return panel;
}
