import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  surfaceAt,
  tileCenterWorld,
  tileOfWorldPoint,
  type Landscape,
  type Person,
  type Pos,
} from '@bohemia/game';
import { E2E_ENV } from '../playwright.config';
import { useUniqueClientIp } from './helpers';
import { journeyScene, placeJourney, screenOf, sendLord, villageWithMen } from './journey-helpers';
import {
  changeVillageState,
  found,
  newPlayer,
  pollVillage,
  query,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  type Seat,
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
    // dostavěný dvorec – jeho panel ukazuje obyvatele s portrétem vojvody
    return withBuiltFirstDwelling({
      ...st,
      people: [...st.people, man(base, 'Ctibor'), man(base + 1, 'Neklan')],
    });
  });
  const lordId = state.dynasty!.lordId!;
  await pollVillage(page);

  // výběr vojvody ukáže řadu mužů a sílu skupiny
  // vojvodu vybere klik na jeho portrét v panelu dvorce (stejně jako klik ve scéně)
  const panel = page.getByTestId('selection-panel');
  await expect
    .poll(
      async () => {
        const at = await screenOf(page, spots.dwelling.x, spots.dwelling.z);
        await page.mouse.click(at.x, at.y);
        return panel.getAttribute('data-kind', { timeout: 1000 }).catch(() => null);
      },
      { timeout: 60_000 },
    )
    .toBe('dwelling');
  await panel.getByTestId(`resident-select-${lordId}`).click();
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

// Výjezd ve scéně vsi (journey.md – Scéna vsi; plán 2026-11-13 – Úloha 8b): jezdci jedou, praporek
// stojí v cíli (cíl ve vodě posunutý na souš), čekající skupina má přesýpací hodiny a cizí výjezd
// u vsi hostitel vidí a klikem pozná vojvodu a rod. Kreslení ověřuje háček scény `journeyScene`.

/** Nejbližší voda k bodu `from` (střed čtverce, mimo okrajový pás mapy); žádná – null. */
function waterNear(l: Landscape, from: Pos): Pos | null {
  const half = (l.size * l.cellSizeM) / 2;
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      if (surfaceAt(l, x, y) !== 'water') continue;
      const p = tileCenterWorld(l, x, y);
      if (Math.abs(p.x) > half - 60 || Math.abs(p.z) > half - 60) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

test('výjezd ve scéně: jezdci, praporek i u vody, přesýpací hodiny a cizí vojvoda u vsi', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  // A kreslí i modely (snímek jezdců); B jen ovládá
  await b.route('**/models/**', (route) => route.abort());
  const [A, B] = await Promise.all([
    villageWithMen(a, 'scenaa', 'Bořivoj'),
    villageWithMen(b, 'scenab', 'Vratislav'),
  ]);

  // A pošle vojvodu 45 m na východ: ve scéně jedou jezdci, v cíli stojí praporek
  const goal = { x: A.dwelling.x + 45, z: A.dwelling.z };
  await sendLord(a, A, goal);
  await expect
    .poll(async () => (await journeyScene(a)).riders.filter((r) => r.own).length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  const start = (await journeyScene(a)).riders.find((r) => r.own)!;
  await expect
    .poll(
      async () => {
        const banner = (await journeyScene(a)).banner;
        return banner ? Math.hypot(banner.x - goal.x, banner.z - goal.z) : Infinity;
      },
      { timeout: 60_000 },
    )
    .toBeLessThan(8);
  // jezdci jedou: nakreslený muž se vzdaluje od místa, kde se objevil (e2e běží s omezeným
  // pohybem – muži stojí na posledním stavu, plynulý posun kryjí unit testy JourneyGlide)
  await expect
    .poll(
      async () => {
        const riders = (await journeyScene(a)).riders.filter((r) => r.own);
        const same = riders.find((r) => r.key === start.key);
        return same ? Math.hypot(same.x - start.x, same.z - start.z) : 0;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(3);

  // na místě čeká: nad skupinou přesýpací hodiny s počtem dní do návratu
  await expect
    .poll(async () => (await journeyScene(a)).hourglass ?? 0, { timeout: 240_000 })
    .toBeGreaterThanOrEqual(1);
  const shot = process.env.JOURNEY_SHOT;
  if (shot) {
    await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [goal.x, goal.z]);
    await a.waitForTimeout(3000);
    await a.screenshot({ path: shot, clip: { x: 320, y: 140, width: 640, height: 400 } });
  }

  // cizí vojvoda: výjezd B stojí u vsi A v dohledu domů – A ho vidí a klik ukáže jméno a rod
  await sendLord(b, B, { x: B.dwelling.x + 45, z: B.dwelling.z });
  const [cellA] = await query<{ x: number; y: number }>(
    'SELECT grid_x AS x, grid_y AS y FROM settlement WHERE id = $1',
    [A.seat.settlementId],
  );
  const near = { x: A.dwelling.x + 20, z: A.dwelling.z - 25 };
  await expect
    .poll(
      async () => {
        await placeJourney(B.seat.settlementId, cellA!, near);
        return (await journeyScene(a)).riders.some((r) => !r.own);
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toBe(true);
  await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [near.x, near.z]);
  const visitorPanel = a.getByTestId('visitor-panel');
  await expect
    .poll(
      async () => {
        const rider = (await journeyScene(a)).riders.find((r) => !r.own);
        if (!rider) return false;
        const at = await screenOf(a, rider.x, rider.z);
        await a.mouse.click(at.x, at.y - 10);
        return visitorPanel.isVisible();
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await expect(a.getByTestId('selection-panel')).toContainText('Vratislav');
  await expect(a.getByTestId('visitor-house')).not.toBeEmpty();

  // cíl ve vodě: praporek stojí na nejbližším dosažitelném místě, ne ve vodě
  const water = waterNear(A.seat.landscape, A.dwelling);
  if (water) {
    await a.getByTestId('lord-away-badge').click();
    await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [water.x, water.z]);
    const at = await screenOf(a, water.x, water.z);
    await a.mouse.click(at.x, at.y, { button: 'right' });
    await expect
      .poll(
        async () => {
          const banner = (await journeyScene(a)).banner;
          return banner !== null && Math.hypot(banner.x - goal.x, banner.z - goal.z) > 8;
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    const banner = (await journeyScene(a)).banner!;
    const tile = tileOfWorldPoint(A.seat.landscape, banner.x, banner.z)!;
    expect(surfaceAt(A.seat.landscape, tile.x, tile.y)).not.toBe('water');
    expect(Math.hypot(banner.x - water.x, banner.z - water.z)).toBeGreaterThan(0.5);
  } else {
    test.info().annotations.push({ type: 'note', description: 'Krajina A nemá vodu.' });
  }
  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

// Odjezd a příjezd výjezdu (journey.md – Scéna vsi – Odjezd a příjezd; plán 2026-11-13 – Úloha 8c):
// bez omezeného pohybu (s ním se odjezd přeskočí) – vojvodův kůň dojde z ohrady ke kůlu, vojvoda
// nasedne a vyjede branou dvorce; po návratu (Domů) přijede a kůň vejde zpět do ohrady.

/** Hráč s dvorcem (dům a dvůr na východ), ohradou koní s koněm vojvody a dvěma muži rodu. */
async function manorWithHorse(
  page: Page,
  prefix: string,
): Promise<{ seat: Seat; dwelling: Pos; lordId: number; horseId: number }> {
  const { seat: s } = await newPlayer(page, prefix);
  const l = s.landscape;
  const spot = villageSpots(l).dwelling;
  await found(page, spot, 'Bořivoj');
  const tile = tileOfWorldPoint(l, spot.x, spot.z)!;
  const house = tileCenterWorld(l, tile.x, tile.y);
  const penCell = { x: tile.x + 2, y: tile.y + 2 };
  const pen = tileCenterWorld(l, penCell.x, penCell.y);
  const horseId = 1;
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
    const built = withBuiltFirstDwelling({
      ...st,
      people: [...st.people, man(base, 'Ctibor'), man(base + 1, 'Neklan')],
    });
    return {
      ...built,
      // první obydlí jako dvorec – dům uprostřed políčka vchodem ke dvoru, brána na konci dvora
      dwellings: built.dwellings.map((d) =>
        d.id === lord.dwellingId
          ? {
              ...d,
              type: 'dvorec' as const,
              position: { x: house.x, z: house.z, rotation: Math.PI / 2 },
              plot: { cell: tile, variant: 'center' as const, yard: { x: tile.x + 1, y: tile.y } },
            }
          : d,
      ),
      pens: [
        {
          id: 1,
          species: 'horse' as const,
          cell: penCell,
          x: pen.x,
          z: pen.z,
          builtDay: st.lastDay,
          horses: [
            {
              id: horseId,
              bornDay: st.lastDay - 6 * 366,
              sex: 'male' as const,
              training: 60,
              riderId: lord.id,
            },
          ],
        },
      ],
    };
  });
  await pollVillage(page);
  return { seat: s, dwelling: house, lordId: state.dynasty!.lordId!, horseId };
}

test('výjezd ve scéně: kůň z ohrady ke kůlu, odjezd branou dvorce a návrat do ohrady', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
  await useUniqueClientIp(ctx);
  const page = await ctx.newPage();
  const v = await manorWithHorse(page, 'odjezd');
  await sendLord(page, v, { x: v.dwelling.x + 45, z: v.dwelling.z });

  // odjezd: háček hlásí odjíždění, kůň jde z ohrady (ohrada ho nekreslí) ke kůlu
  await expect
    .poll(async () => (await journeyScene(page)).phase, { timeout: 60_000 })
    .toBe('departing');
  const gate = (await journeyScene(page)).gate!;
  expect(gate).not.toBeNull();
  // jak blízko brány byl vojvoda na koni – scéna se ptá v taktu animací, test každých 50 ms
  await page.evaluate(
    ([gx, gz, key]) => {
      const w = window as unknown as { __gateMin?: number };
      w.__gateMin = Infinity;
      const id = setInterval(() => {
        for (const r of window.__bohemiaE2E?.journeyScene?.().riders ?? []) {
          if (r.own && r.mounted && r.key === key) {
            w.__gateMin = Math.min(w.__gateMin!, Math.hypot(r.x - gx!, r.z - gz!));
          }
        }
      }, 50);
      setTimeout(() => clearInterval(id), 240_000);
    },
    [gate.x, gate.z, String(v.lordId)] as const,
  );
  await expect
    .poll(
      async () => {
        const scene = await journeyScene(page);
        return scene.led.length > 0 && scene.awayHorses.includes(v.horseId);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const shot = process.env.JOURNEY_DEPARTURE_SHOT;
  if (shot) {
    await page.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [gate.x, gate.z]);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: shot, clip: { x: 320, y: 140, width: 640, height: 400 } });
  }
  // vojvoda nasedl a vyjel branou dvorce, pak dohnal skupinu
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __gateMin: number }).__gateMin), {
      timeout: 180_000,
    })
    .toBeLessThan(2);
  await expect
    .poll(async () => (await journeyScene(page)).phase, { timeout: 120_000 })
    .toBe('riding');

  // Domů: skupina přijede, vojvoda sesedne a kůň vejde do ohrady
  await page.getByTestId('lord-away-badge').click();
  await page.getByTestId('lord-home').click();
  await expect
    .poll(async () => (await journeyScene(page)).phase, { timeout: 240_000 })
    .toBe('arriving');
  await expect
    .poll(
      async () => {
        const scene = await journeyScene(page);
        return scene.phase === null && !scene.awayHorses.includes(v.horseId);
      },
      { timeout: 240_000 },
    )
    .toBe(true);
  await ctx.close();
});
