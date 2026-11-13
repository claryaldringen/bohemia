import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { Person } from '@bohemia/game';
import { E2E_ENV } from '../playwright.config';
import { useUniqueClientIp } from './helpers';
import {
  changeVillageState,
  found,
  newPlayer,
  pollVillage,
  query,
  villageSpots,
  villageState,
} from './village-helpers';

// Ovládání vojvody (lord-control.md – Co hráč vidí; plán 2026-11-13 – Úloha 8a), hra s workerem:
// výběr vojvody ukáže družinu, pravé tlačítko do krajiny ho vyšle, v liště je jeho portrét
// s podkovou, Domů ho vrátí a upozornění ohlásí návrat. Worker běží vedle `next start`.

const WORKER_DIR = path.join(import.meta.dirname, '../../worker');
let worker: ChildProcess | null = null;
let output = '';
let exited: Promise<number | null> = Promise.resolve(null);

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.beforeAll(async () => {
  await query('TRUNCATE "user" CASCADE', []);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: WORKER_DIR,
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
  expect(code, output).toBe(0);
});

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  await page.route('**/models/**', (route) => route.abort());
});

/** Bod krajiny na obrazovce (háček scény) – kam kliknout. */
async function screenOf(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const at = await page.evaluate(
    ([px, pz]) => window.__bohemiaE2E!.projectToScreen!(px!, pz!),
    [x, z],
  );
  if (!at) throw new Error('Bod je mimo záběr.');
  return at;
}

test('vojvoda: družina, rozkaz pravým tlačítkem, portrét v liště, Domů a upozornění o návratu', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'vyjezd');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling);

  // dva dospělí muži rodu k vojvodovi (bez nich by družina neměla koho nabídnout)
  const state = await changeVillageState(s.settlementId, (st) => {
    const lord = st.people.find((p) => p.id === st.dynasty?.lordId)!;
    const base = Math.max(...st.people.map((p) => p.id)) + 1;
    const man = (id: number, name: string): Person => ({
      id,
      bornDay: st.lastDay - 22 * 366,
      dwellingId: lord.dwellingId,
      sex: 'male',
      line: true,
      name,
    });
    return { ...st, people: [...st.people, man(base, 'Ctibor'), man(base + 1, 'Neklan')] };
  });
  const lordId = state.dynasty!.lordId!;
  await pollVillage(page);

  // výběr vojvody ukáže řadu mužů a sílu skupiny
  await page.evaluate((id) => window.__bohemiaE2E!.selectPerson!(id), lordId);
  const retinue = page.getByTestId('lord-retinue');
  await expect(retinue).toBeVisible({ timeout: 30_000 });
  const men = retinue.getByTestId('lord-retinue-man');
  await expect(men).toHaveCount(2);
  const strength = page.getByTestId('lord-strength');
  const base = Number(await strength.textContent());
  await men.first().click();
  await expect(men.first()).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(await strength.textContent())).toBeGreaterThan(base);
  await men.first().click();
  await expect(men.first()).toHaveAttribute('aria-pressed', 'false');
  await men.first().click();

  // pravé tlačítko do krajiny blízko vsi: vojvoda je pryč, v liště je jeho portrét s podkovou
  const dwelling = spots.dwelling;
  const target = await screenOf(page, dwelling.x + 45, dwelling.z);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  const badge = page.getByTestId('lord-away-badge');
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () =>
      (await villageState(s.settlementId)).people.some((p) => p.away?.kind === 'journey'),
    )
    .toBe(true);

  // panel muže na cestě ukazuje činnost výjezdu
  await badge.click();
  await expect(page.getByTestId('selection-person-activity')).toHaveText(
    /je na cestě|čeká \(\d+ (den|dny|dnů)\)|vrací se domů/,
    { timeout: 30_000 },
  );

  // Domů: výjezd se vrátí a ohlásí návrat, vojvoda je zpět doma
  await page.getByTestId('lord-home').click();
  await expect(page.getByText('Bořivoj se vrátil.')).toBeVisible({ timeout: 240_000 });
  await expect(badge).toHaveCount(0, { timeout: 60_000 });
});
