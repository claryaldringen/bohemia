import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  checkDwellingPlacement,
  surfaceAt,
  tileCenterWorld,
  type ExpeditionView,
  type JourneyHunt,
  type SeenCell,
  type Landscape,
  type PlacementVillage,
  type Pos,
  type Position,
} from '@bohemia/game';
import { E2E_ENV } from '../playwright.config';
import { useUniqueClientIp } from './helpers';
import {
  huntOfSettlement,
  addVillagers,
  journeyScene,
  placeJourney,
  placeReturning,
  screenOf,
  sendLord,
  villageWithMen,
} from './journey-helpers';
import {
  changeVillageState,
  crossesTo,
  homeSpot,
  query,
  readyScene,
  shiftPlayerTo,
  villageState,
  writeVillageState,
} from './village-helpers';

// Scéna cizí mapy za vojvodou (journey.md – Scéna cizí mapy; plán 2026-11-13 – Úloha 9b), hra
// s workerem: vojvoda A je na sousední mapě se vsí B – klik na jeho portrét v liště přepne scénu na
// ni (`foreign-scene` s políčkem mapy B), závoj mlhy je kolem jezdců odkrytý, objevené stavby
// odpovídají dohledu, pravé tlačítko dává rozkazy i tam, při čekání zůstává praporek
// a po Domů se scéna vrátí na ves (skupina je na domovské mapě) a přijde upozornění. Cestu
// přes celou mapu nahrazuje zápis polohy skupiny do kontrolního bodu výjezdu.

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

/** Louka (střed čtverce) v mezikruží `minR`–`maxR` kolem `from`, aspoň 120 m od okraje mapy. */
function meadowSpot(l: Landscape, from: Pos, minR: number, maxR: number): Pos {
  const half = (l.size * l.cellSizeM) / 2;
  let best: Pos | null = null;
  let bestScore = Infinity;
  for (let y = 0; y < l.size; y++) {
    for (let x = 0; x < l.size; x++) {
      if (surfaceAt(l, x, y) !== 'meadow') continue;
      const p = tileCenterWorld(l, x, y);
      if (Math.abs(p.x) > half - 120 || Math.abs(p.z) > half - 120) continue;
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < minR || d > maxR) continue;
      const score = Math.abs(d - (minR + maxR) / 2);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  if (!best) throw new Error('Na mapě není louka v potřebné vzdálenosti.');
  return best;
}

/** Vzdálenost bodu `p` od úsečky `a`–`b`. */
function segmentDistance(p: Pos, a: Pos, b: Pos): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Místo pro zemnici vedle obydlí `near` aspoň `minM` od cesty `a`–`b` – mimo dohled skupiny. */
function farHome(l: Landscape, near: Pos, a: Pos, b: Pos, minM: number): Position {
  const half = (l.size * l.cellSizeM) / 2;
  const village: PlacementVillage = {
    dwellings: [{ type: 'zemnice', position: { x: near.x, z: near.z, rotation: 0 } }],
    constructions: [],
    parts: [],
  };
  for (let y = 0; y < l.size; y += 3) {
    for (let x = 0; x < l.size; x += 3) {
      const p = tileCenterWorld(l, x, y);
      if (Math.abs(p.x) > half - 120 || Math.abs(p.z) > half - 120) continue;
      if (segmentDistance(p, a, b) < minM) continue;
      const spot = { x: p.x, z: p.z, rotation: 0 };
      if (checkDwellingPlacement(l, village, 'zemnice', spot).ok) return spot;
    }
  }
  throw new Error('Na mapě B není místo pro vzdálený dům.');
}

/** Pohled hráče na první výpravu (`GET /api/journey` z prohlížeče): mapa skupiny a co o ní rod ví. */
async function journeyView(
  page: Page,
): Promise<{ cell: { x: number; y: number }; seen: SeenCell | null } | null> {
  const body = await page.evaluate(async () => {
    const response = await fetch('/api/journey', { cache: 'no-store' });
    return (await response.json()) as { views?: unknown };
  });
  const view = ((body.views ?? []) as ExpeditionView[])[0];
  const cell = view?.parties[0]?.groups[0]?.cell;
  return view && cell ? { cell, seen: view.seen[`${cell.x},${cell.y}`] ?? null } : null;
}

async function fogAt(page: Page, p: Pos): Promise<'hidden' | 'explored' | 'seen' | 'lit' | null> {
  return page.evaluate(([x, z]) => window.__bohemiaE2E?.journeyFog?.(x!, z!) ?? null, [p.x, p.z]);
}

async function shownDwellings(page: Page): Promise<number[]> {
  const village = await page.evaluate(
    () => window.__bohemiaE2E?.foreignVillage?.() ?? { dwellings: [] },
  );
  return village.dwellings.map((d) => d.id);
}

test('scéna jde za vojvodou na cizí mapu: mlha, objevené stavby, rozkazy a návrat', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const ctxs = await Promise.all([browser.newContext(), browser.newContext()]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page];
  // A kreslí i modely (snímek cizí mapy); B jen zakládá ves
  await b.route('**/models/**', (route) => route.abort());
  const [A, B] = await Promise.all([
    villageWithMen(a, 'cizimapaa', 'Bořivoj'),
    villageWithMen(b, 'cizimapab', 'Vratislav'),
  ]);
  await ctxs[1]!.close();

  // na mapě B: skupina 45–75 m od domu B (v dohledu), cíl rozkazu ≈ 210 m dál a druhý dům B
  // daleko od cesty mezi nimi (mimo dohled po celou dobu)
  const lB = B.seat.landscape;
  const start = meadowSpot(lB, B.dwelling, 45, 75);
  const goal = meadowSpot(lB, start, 190, 230);
  const far = farHome(lB, B.dwelling, start, goal, 320);
  const stateB = await changeVillageState(B.seat.settlementId, (st) => ({
    ...st,
    nextId: st.nextId + 1,
    dwellings: [
      ...st.dwellings,
      { id: st.nextId, type: 'zemnice', builtDay: st.lastDay, condition: 1, position: far },
    ],
  }));
  const farId = stateB.dwellings.at(-1)!.id;
  const nearId = stateB.dwellings.find(
    (d) => d.position.x === B.dwelling.x && d.position.z === B.dwelling.z,
  )!.id;

  // ves B na volné políčko vedle A, odkud skupina od cíle rozkazu přejde okrajem na mapu A:
  // krajina B vznikla pro jiné políčko a hustý les na okraji je neprůchodný (plán
  // 2026-11-16-dense-forest – Rozhodnutí 8) – na straně bez navázání by „Domů“ na mapě B uvízlo
  // a vracející se výjezd by skončil hned (journey.md – Návrat), dřív než ho test přenese domů
  const cells = await query<{ id: string; x: number; y: number }>(
    `SELECT id, grid_x AS x, grid_y AS y FROM settlement
      WHERE archived_at IS NULL AND grid_x IS NOT NULL`,
    [],
  );
  const cellA = cells.find((c) => c.id === A.seat.settlementId)!;
  const mapA = {
    cell: { x: cellA.x, y: cellA.y },
    landscape: A.seat.landscape,
    state: await villageState(A.seat.settlementId),
  };
  const step = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ].find(
    (d) =>
      !cells.some(
        (c) => c.id !== B.seat.settlementId && c.x === cellA.x + d.x && c.y === cellA.y + d.y,
      ) &&
      crossesTo(
        { cell: { x: cellA.x + d.x, y: cellA.y + d.y }, landscape: lB, state: stateB },
        goal,
        mapA,
      ),
  );
  if (!step) throw new Error('Mapa B nenavazuje na mapu A z žádné volné strany.');
  const cellB = { x: cellA.x + step.x, y: cellA.y + step.y };
  await query('UPDATE settlement SET grid_x = $2, grid_y = $3 WHERE id = $1', [
    B.seat.settlementId,
    cellB.x,
    cellB.y,
  ]);

  // A vyšle vojvodu kousek od vsi; skupina se (zápisem do bodu výjezdu) ocitne na mapě B a worker
  // tam objeví dům u ní
  await sendLord(a, A, { x: A.dwelling.x + 45, z: A.dwelling.z });
  await expect
    .poll(
      async () => {
        await placeJourney(A.seat.settlementId, cellB, start);
        const view = await journeyView(a);
        return (
          view !== null &&
          view.cell.x === cellB.x &&
          view.cell.y === cellB.y &&
          (view.seen?.parts.some((p) => p.key === `dwelling:${nearId}`) ?? false)
        );
      },
      { timeout: 180_000, intervals: [2000] },
    )
    .toBe(true);

  // klik na portrét v liště přepne scénu na mapu vojvody
  await a.getByTestId('lord-away-badge').click();
  const foreign = a.getByTestId('foreign-scene');
  await expect(foreign).toHaveAttribute('data-cell', `${cellB.x},${cellB.y}`, { timeout: 30_000 });
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  await expect
    .poll(async () => (await journeyScene(a)).riders.filter((r) => r.own).length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);

  // závoj mlhy: kolem jezdců jasno, vzdálený dům v neobjeveném
  await expect.poll(() => fogAt(a, start), { timeout: 30_000 }).toBe('seen');
  expect(await fogAt(a, far)).toBe('hidden');
  const stats = await a.evaluate(() => window.__bohemiaE2E!.armyStats!());
  expect(stats.some((m) => m.name === 'fog-veil')).toBe(true);
  // objevené stavby odpovídají dohledu: dům u skupiny ano, vzdálený ne
  await expect.poll(() => shownDwellings(a), { timeout: 30_000 }).toContain(nearId);
  expect(await shownDwellings(a)).not.toContain(farId);
  // výběr klikem jako ve vsi: klik do prázdna (od domu B pryč) výběr zruší – panel výjezdu zmizí;
  // klik na vojvodu ve scéně ho vybere zpět (panel výjezdu, portrét v liště stisknutý)
  // vybraná skupina vojvody = portrét v liště je stisknutý (na cizí mapě panel výběru není)
  const badge = a.getByTestId('lord-away-badge');
  const selected = async (): Promise<boolean> =>
    (await badge.getAttribute('aria-pressed')) === 'true';
  await expect.poll(selected).toBe(true);
  const empty = {
    x: start.x + (start.x - B.dwelling.x) * 0.6,
    z: start.z + (start.z - B.dwelling.z) * 0.6,
  };
  await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [start.x, start.z]);
  await expect
    .poll(
      async () => {
        const at = await screenOf(a, empty.x, empty.z);
        await a.mouse.click(at.x, at.y);
        return selected();
      },
      { timeout: 30_000, intervals: [2000] },
    )
    .toBe(false);
  await expect
    .poll(
      async () => {
        const lord = (await journeyScene(a)).riders.find((r) => r.own && r.personId === A.lordId);
        if (!lord) return false;
        const at = await screenOf(a, lord.x, lord.z);
        await a.mouse.click(at.x, at.y - 10);
        return selected();
      },
      { timeout: 60_000, intervals: [2000] },
    )
    .toBe(true);
  await expect(a.getByTestId('lord-away-badge')).toHaveAttribute('aria-pressed', 'true');

  // pravé tlačítko i na cizí mapě (vojvoda vybraný klikem): jdi sem – praporek v cíli
  await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [goal.x, goal.z]);
  await expect
    .poll(
      async () => {
        const at = await screenOf(a, goal.x, goal.z);
        await a.mouse.click(at.x, at.y, { button: 'right' });
        const banner = (await journeyScene(a)).banner;
        return banner !== null && Math.hypot(banner.x - goal.x, banner.z - goal.z) < 8;
      },
      { timeout: 120_000, intervals: [4000] },
    )
    .toBe(true);
  // skupina odjela: kde stála, je objevené (šeré), u jezdců jasno; vzdálený dům dál neobjevený
  await expect.poll(() => fogAt(a, start), { timeout: 300_000 }).toBe('explored');
  const rider = (await journeyScene(a)).riders.find((r) => r.own)!;
  expect(await fogAt(a, rider)).toBe('seen');
  expect(await shownDwellings(a)).not.toContain(farId);
  // snímek: odkryté šeré kolem místa odjezdu a domu B, jasno u jezdců, dál neobjevené
  const shot = process.env.JOURNEY_FOREIGN_SHOT;
  if (shot) {
    // jezdci (jasno), místo odjezdu a dům B (šeré) a neobjevené okolí v jednom záběru
    const mid = { x: (rider.x + B.dwelling.x) / 2, z: (rider.z + B.dwelling.z) / 2 };
    await a.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!, 320), [mid.x, mid.z]);
    await a.waitForTimeout(3000);
    await a.screenshot({ path: shot, clip: { x: 160, y: 90, width: 960, height: 540 } });
  }

  // Domů: skupina (zápisem do bodu) na domovské mapě ≈ 180 m od vsi – scéna se vrátí na ves hned,
  // ne až s koncem výjezdu; po dojetí upozornění (v liště jen 6 s – hlídá se od návratu scény).
  // Uložení bodu workerem může zápis přepsat – dokud výjezd běží, skupina se na mapu vrátí znovu.
  await a.getByTestId('expedition-home').click();
  const home = { x: cellA.x, y: cellA.y };
  // místo, odkud cesta domů vede – návrat se domů nepřenese (Martin 17. 11. 2026)
  const back = homeSpot(mapA, A.dwelling, 150, 210);
  await expect
    .poll(
      async () => {
        await placeReturning(A.seat.settlementId, home, back);
        return foreign.count();
      },
      { timeout: 180_000, intervals: [1000] },
    )
    .toBe(0);
  const [journey] = await query<{ status: string }>(
    `SELECT j.status FROM journey j JOIN settlement s ON s.owner_id = j.player_id WHERE s.id = $1`,
    [A.seat.settlementId],
  );
  expect(journey?.status).toBe('active');
  await expect
    .poll(
      async () => {
        await placeReturning(A.seat.settlementId, home, back);
        return a.getByText('Bořivoj se vrátil.').isVisible();
      },
      { timeout: 300_000, intervals: [1000] },
    )
    .toBe(true);
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  // portrét vojvody v liště zmizí, až ves zpracuje návrat (`away`) – ve zpomaleném světě e2e později
  await ctxs[0]!.close();
});

// Lov s workerem (hunting.md – Pravidla 2–7; plán 2026-11-22-hunting – Úloha 12): léto, vyhlášení
// tlačítkem dvorce, worker vede honce a zvíře, vojvoda se pravým tlačítkem na zvíře vrhne do
// souboje a po dalším herním dni ves zapíše výsledek (den lovu, maso při zabití, odnos na tyči).
test('lov: tlačítko dvorce, útok pravým tlačítkem na zvíře a výsledek ve vsi', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext();
  await useUniqueClientIp(ctx);
  const page = await ctx.newPage();
  const V = await villageWithMen(page, 'lovworker', 'Bořivoj');
  const settlementId = V.seat.settlementId;
  const [owner] = await query<{ email: string }>(
    `SELECT u.email FROM "user" u JOIN settlement s ON s.owner_id = u.id WHERE s.id = $1`,
    [settlementId],
  );
  const email = owner!.email;

  // dost dospělých mužů, aby ves zítra uvolnila 6 honců, a zásoby, ať ves nehladoví
  await addVillagers(settlementId, 14);
  await changeVillageState(settlementId, (st) => ({
    ...st,
    storesKg: 4000,
    lord: { trains: true },
  }));
  // léto: čas hráče na 10. 7., stav vsi o den před ním (worker dopočte 10. 7. a založí historii práce)
  const july = await shiftPlayerTo(email, 7, 10);
  const summer = await villageState(settlementId);
  summer.lastDay = july - 1;
  await writeVillageState(settlementId, summer);
  await page.reload();
  await expect(readyScene(page)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('r');

  const panel = page.getByTestId('selection-panel');
  const hunt = panel.getByTestId('manor-hunt');
  await expect
    .poll(
      async () => {
        const at = await screenOf(page, V.dwelling.x, V.dwelling.z);
        await page.mouse.move(at.x - 3, at.y);
        await page.mouse.click(at.x, at.y);
        return panel.getByTestId('manor-upgrades').count();
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  await expect(hunt).toBeEnabled({ timeout: 120_000 });
  const before = (await villageState(settlementId)).wildlife?.hunt?.year ?? { days: 0, meatKg: 0 };
  await hunt.click();
  await expect.poll(() => huntOfSettlement(settlementId), { timeout: 60_000 }).not.toBeNull();

  // honci dojdou k lesu a zvíře vyběhne (worker vede lov v taktech výpravy)
  await expect
    .poll(async () => (await huntOfSettlement(settlementId))?.fight?.quarry.state, {
      timeout: 300_000,
      intervals: [2000],
    })
    .not.toBe('hidden');
  const fightOf = async (): Promise<NonNullable<JourneyHunt['fight']> | null> =>
    (await huntOfSettlement(settlementId))?.fight ?? null;
  const quarryKind = (await fightOf())?.quarry.kind;

  // vybrat vojvodu (portrét v panelu dvorce) a pravým tlačítkem na zvíře – klik se opakuje, dokud
  // je zvíře venku, až do útočníka v souboji, nebo konce lovu (zvíře uteklo dřív, než klik trefil)
  await panel.getByTestId(`resident-select-${V.lordId}`).click();
  await expect(panel).toHaveAttribute('data-kind', 'person', { timeout: 30_000 });
  let struck = false;
  await expect
    .poll(
      async () => {
        const fight = await fightOf();
        if (fight && fight.hunters.length > 0) struck = true;
        if (!fight || fight.outcome !== 'ongoing' || struck) return true;
        const stats = await page.evaluate(() => window.__bohemiaE2E!.huntStats!());
        if (!stats.quarry || stats.quarry.lying) return false;
        const { x, z } = stats.quarry.pos;
        await page.evaluate(([px, pz]) => window.__bohemiaE2E!.moveCameraTo!(px!, pz!), [x, z]);
        const at = await page.evaluate(
          ([px, pz]) => window.__bohemiaE2E!.projectToScreen!(px!, pz!),
          [x, z],
        );
        // klik trochu nad patu – zvíře stojí na bodu, výška modelu je nad ním
        if (at) await page.mouse.click(at.x, at.y - 14, { button: 'right' });
        return false;
      },
      { timeout: 240_000, intervals: [1500] },
    )
    .toBe(true);
  // útočník je povinný, dokud lov běží; skončil-li lov dřív (zvíře uteklo po nečinnosti), cesta
  // útoku se tentokrát neověří – výsledek lovu ve vsi níž ano
  if (!struck) {
    expect((await fightOf())?.outcome ?? 'gone').not.toBe('ongoing');
    test
      .info()
      .annotations.push({ type: 'lov', description: 'zvíře uteklo dřív, než klik trefil' });
  }

  // souboj doběhne: zvíře padne, nebo uteče
  await expect
    .poll(async () => (await fightOf())?.outcome, { timeout: 300_000, intervals: [3000] })
    .not.toBe('ongoing');
  const outcome = (await fightOf())?.outcome;
  if (outcome === 'killed') {
    // zabité zvíře nesou honci na tyči
    const beaters = (await huntOfSettlement(settlementId))?.beaters;
    expect(beaters?.end?.carry).toBe(true);
  }

  // další herní den: ves zapíše výsledek lovu (den lovu, při zabití maso)
  await shiftPlayerTo(email, 7, 11);
  await expect
    .poll(async () => (await villageState(settlementId)).wildlife?.hunt?.year.days ?? 0, {
      timeout: 300_000,
      intervals: [2000],
    })
    .toBeGreaterThanOrEqual(before.days + 1);
  const after = (await villageState(settlementId)).wildlife!.hunt!.year;
  if (outcome === 'killed' && quarryKind !== 'wolf') {
    expect(after.meatKg).toBeGreaterThan(before.meatKg);
  }
  await ctx.close();
});
