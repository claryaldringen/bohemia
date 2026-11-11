import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { newSteward } from '@bohemia/game';
import { E2E_ENV } from '../playwright.config';
import { useUniqueClientIp } from './helpers';
import {
  confirmPlacement,
  found,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  selectAllDwellings,
  twoHouseholds,
  villageSpots,
  villageState,
  villageStateById,
  writeVillageStateById,
} from './village-helpers';

// Hra s workerem (plán workeru – 6. Testy): vedle `next start` běží `apps/worker` proti téže
// databázi `bohemia_test` se stejným prostředím jako web. Worker posouvá vsi, i když se na ně
// nikdo nedívá – test proto stránku před čekáním na workera zavře (`about:blank`), ať ves
// nedopočítá web. Na konci se worker ukončí signálem jako při `Ctrl + C` a musí skončit čistě.

const WORKER_DIR = path.join(import.meta.dirname, '../../worker');

let worker: ChildProcess | null = null;
let output = '';
let exited: Promise<number | null> = Promise.resolve(null);

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.beforeAll(async () => {
  // Worker bere první hráče nejvíc pozadu – staří hráči jiných specifikací (posun času o rok)
  // by ho zdrželi. Každý test si zakládá vlastního hráče, prázdná databáze nic nebere.
  await query('TRUNCATE "user" CASCADE', []);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: WORKER_DIR,
    // krátké spaní bez práce – posun času hráče v testu worker vezme hned
    env: { ...process.env, ...E2E_ENV, WORKER_IDLE_MS: '300', WORKER_LOG: 'info' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker = child;
  exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  await expect.poll(() => output, { timeout: 30_000 }).toContain('start –');
});

test.afterAll(async () => {
  if (!worker) return;
  worker.kill('SIGTERM');
  const code = await Promise.race([
    exited,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 30_000)),
  ]);
  if (code === 'timeout') worker.kill('SIGKILL');
  // čisté ukončení: dokončí dávku, pustí zámky, zavře pooly a skončí s kódem 0
  expect(code, output).toBe(0);
  expect(output).toContain('dokončuji dávku a končím');
  expect(output).toContain('worker skončil');
  expect(output).not.toMatch(/chyba u hráče|kolo selhalo/);
  const [locks] = await query<{ count: string }>(
    "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'",
    [],
  );
  expect(locks!.count).toBe('0');
});

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  // Bez modelů stromů naběhne softwarově kreslená scéna rychleji (viz landscape.spec.ts).
  await page.route('**/models/**', (route) => route.abort());
});

/** Posune dnešek hráče o `days` herních dní (posun času – accounts.md). */
async function shiftPlayer(email: string, days: number): Promise<void> {
  await query(
    `INSERT INTO player_time_offset (player_id, offset_days)
     SELECT id, $2 FROM "user" WHERE email = $1
     ON CONFLICT (player_id) DO UPDATE SET offset_days = $2, updated_at = now()`,
    [email, days],
  );
}

interface Stamp {
  id: string;
  last_day: number;
  version: number;
}

async function stamp(villageId: string): Promise<Stamp> {
  const [row] = await query<Stamp>('SELECT id, last_day, version FROM village WHERE id = $1', [
    villageId,
  ]);
  if (!row) throw new Error('Ves není v databázi.');
  return row;
}

test('worker dožene ves 30 dní pozadu – hra ji otevře bez dopočtu a staví dál', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'worker');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  const [village] = await query<Stamp>(
    'SELECT id, last_day, version FROM village WHERE settlement_id = $1',
    [s.settlementId],
  );

  // Hráč 30 herních dní nehrál: stránka zavřená, dnešek hráče o 30 dní dál – ves dopočte worker.
  await page.goto('about:blank');
  await shiftPlayer(email, 30);
  const target = village!.last_day + 30;
  await expect
    .poll(async () => (await stamp(village!.id)).last_day, { timeout: 60_000 })
    .toBe(target);
  const caught = await stamp(village!.id);

  // Hra ves otevře, jak ji uložil worker – web nic nedopočítává ani neukládá.
  await page.goto('/game');
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('village-people')).toHaveText(/^\d+/, { timeout: 30_000 });
  expect(await stamp(village!.id)).toEqual(caught);

  // Akce s běžícím workerem: pole (zkratka C) v dnešku hráče, dotaz na ves ho ukáže.
  await page.keyboard.press('c');
  await confirmPlacement(page, { kind: 'squares', cells: spots.cells });
  await expect.poll(async () => (await villageState(s.settlementId)).fields.length).toBe(1);
  const built = await villageState(s.settlementId);
  expect(built.lastDay).toBe(target);
  await pollVillage(page);
  await page.getByRole('button', { name: 'Přejmenovat ves' }).click();
  await page.getByRole('textbox', { name: 'Jméno vsi' }).fill('Dělnice');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('village-name')).toHaveText('Dělnice');
});

test('ves na cestě se správcem se po příjezdu založí sama – hráč na ni přepne', async ({
  page,
}) => {
  const { email, seat: s } = await newPlayer(page, 'wcesta');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);
  await twoHouseholds(s, spots.dwelling);
  await pollVillage(page);

  // Všechna obydlí → Odejít → na východ: nová mapa vedle, lidé jsou na cestě.
  const panel = await selectAllDwellings(page);
  await panel.getByTestId('leave-village').click();
  await panel.getByTestId('leave-E').click();
  const travelling = (): Promise<{ id: string; name: string }[]> =>
    query(
      `SELECT v.id, v.name FROM village v
         JOIN settlement s ON s.id = v.settlement_id
        WHERE s.owner_id = (SELECT id FROM "user" WHERE email = $1) AND s.id <> $2`,
      [email, s.settlementId],
    );
  await expect.poll(async () => (await travelling()).length, { timeout: 90_000 }).toBe(1);
  const [awayRow] = await travelling();
  const away = { ...awayRow!, state: await villageStateById(awayRow!.id) };
  expect(away.state.journey?.direction).toBe('E');

  // Stránka zavřená; lidé dorazí hned (příjezd v den odchodu) a cestou zapnuli správce. Dnešek
  // hráče o 2 dny dál – ves je pozadu a dopočte ji worker: správce sám umístí první zemnici.
  await page.goto('about:blank');
  const arrived = structuredClone(away.state);
  arrived.journey!.arrivalDay = arrived.journey!.departedDay;
  arrived.steward = newSteward(arrived.lastDay, true);
  await writeVillageStateById(away.id, arrived);
  await shiftPlayer(email, 2);
  await expect
    .poll(
      async () => {
        const state = await villageStateById(away.id);
        return {
          travelling: state.journey !== undefined,
          building: state.dwellings.length + state.constructions.length > 0,
          day: state.lastDay,
        };
      },
      // dopočet vsi workerem (smyčka s odklady) – pod zátěží stroje trvá i přes minutu
      { timeout: 150_000 },
    )
    .toEqual({ travelling: false, building: true, day: arrived.lastDay + 2 });

  // Přepnutí na novou ves v seznamu vsí – už není na cestě.
  await page.goto('/game');
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('village-name').click();
  await page
    .getByTestId('village-list')
    .locator(`[data-village="${away.id}"] [data-testid="village-select"]`)
    .click();
  await expect(page.getByTestId('village-name')).toHaveText(away.name, { timeout: 30_000 });
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('journey-banner')).toHaveCount(0);
});
