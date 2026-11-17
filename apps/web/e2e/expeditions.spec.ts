import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { tileCenterWorld, tileOfWorldPoint, type Person, type Pos } from '@bohemia/game';
import { VILLAGE_STATE_SQL_COLUMNS } from '@bohemia/db/village-state';
import { E2E_ENV } from '../playwright.config';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';
import {
  addVillagers,
  journeyScene,
  placeJourney,
  placeReturning,
  screenOf,
  selectPeople,
  sendLord,
  sendSelected,
  villageWithMen,
} from './journey-helpers';
import {
  changeVillageState,
  found,
  homeSpot,
  newPlayer,
  pollVillage,
  query,
  readyScene,
  villageSpots,
  villageState,
  withBuiltFirstDwelling,
  type Seat,
} from './village-helpers';

// Výpravy (expeditions.md – Co hráč vidí; plán 2026-11-14 – Úloha 12), hra s workerem: Shift + klik
// vybere víc lidí, pravé tlačítko je pošle jako skupinu, Osedlat a Sesednout, Domů a upozornění
// o návratu, víc skupin naráz a cizí výprava u vsi. Worker běží vedle `next start`.

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

test('dva vesničané: Shift + klik, pravé tlačítko, výběr jede se skupinou, Domů a zase pracují', async ({
  page,
}) => {
  const { seat: s } = await newPlayer(page, 'vesnicane');
  const spots = villageSpots(s.landscape);
  await found(page, spots.dwelling, 'Bořivoj');
  await changeVillageState(s.settlementId, (st) => withBuiltFirstDwelling(st));
  const ids = await addVillagers(s.settlementId, 2);
  await pollVillage(page);

  // Shift + klik vybere oba vesničany; pravé tlačítko do krajiny je pošle jako jednu skupinu
  await selectPeople(page, ids);
  await sendSelected(page, { x: spots.dwelling.x + 45, z: spots.dwelling.z });
  await expect
    .poll(async () => {
      const people = (await villageState(s.settlementId)).people;
      return ids.every((id) => people.find((p) => p.id === id)?.away?.kind === 'journey');
    })
    .toBe(true);

  // výběr jede se skupinou: praporek stojí u cíle a oba jsou venku
  await expect
    .poll(async () => (await journeyScene(page)).banner, { timeout: 60_000 })
    .not.toBeNull();
  await expect
    .poll(async () => (await journeyScene(page)).riders.filter((r) => r.own).length, {
      timeout: 60_000,
    })
    .toBe(2);

  // klik na jednoho z nich na cestě vybere oba (celá skupina)
  const empty = await screenOf(page, spots.dwelling.x - 60, spots.dwelling.z);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId('selection-people-row')).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const rider = (await journeyScene(page)).riders.find((r) => r.own);
        if (!rider) return 0;
        const at = await screenOf(page, rider.x, rider.z);
        await page.mouse.click(at.x, at.y - 10);
        return page.getByTestId('selection-people-row').locator('li').count();
      },
      { timeout: 60_000, intervals: [1500] },
    )
    .toBe(2);

  // Domů: upozornění o návratu a oba zase pracují (`away` zmizí)
  await page.getByTestId('expedition-home').click();
  // vůdce má od D58 jméno – „Přemysl se vrátil.“; bez vůdce „Výprava se vrátila.“
  await expect(page.getByText(/^(Výprava|\p{Lu}\p{Ll}+) se vrátila?\.$/u)).toBeVisible({
    timeout: 240_000,
  });
  // výprava skončila: venku nejsou jezdci a v úložišti je hotová (`away` ve vsi zmizí s dalším
  // dopočtem vsi – ve zpomaleném světě e2e až za dlouho, proto se tu nečeká)
  await expect
    .poll(async () => (await journeyScene(page)).riders.filter((r) => r.own).length, {
      timeout: 120_000,
      intervals: [3000],
    })
    .toBe(0);
  const [done] = await query<{ status: string }>(
    `SELECT j.status FROM journey j JOIN settlement s ON s.owner_id = j.player_id WHERE s.id = $1`,
    [s.settlementId],
  );
  expect(done?.status).toBe('done');
});

/** Hráč s dvorcem, ohradou se dvěma koňmi (vojvoda a syn Ctibor jsou jezdci) a vesničanem doma. */
async function manorWithHorses(
  page: Page,
  prefix: string,
): Promise<{ seat: Seat; dwelling: Pos; lordId: number; sonId: number; horseIds: number[] }> {
  const { seat: s } = await newPlayer(page, prefix);
  const l = s.landscape;
  const spot = villageSpots(l).dwelling;
  await found(page, spot, 'Bořivoj');
  const tile = tileOfWorldPoint(l, spot.x, spot.z)!;
  const house = tileCenterWorld(l, tile.x, tile.y);
  const penCell = { x: tile.x + 2, y: tile.y + 2 };
  const pen = tileCenterWorld(l, penCell.x, penCell.y);
  let sonId = 0;
  const state = await changeVillageState(s.settlementId, (st) => {
    const lord = st.people.find((p) => p.id === st.dynasty?.lordId)!;
    const base = Math.max(...st.people.map((p) => p.id)) + 1;
    sonId = base;
    // syn mladší než vojvoda – vůdcem skupiny a jménem v upozornění je vojvoda
    const man = (id: number, name: string | undefined, age: number, line: boolean): Person => ({
      id,
      bornDay: st.lastDay - age * 366,
      dwellingId: lord.dwellingId,
      sex: 'male',
      ...(line ? { line: true as const } : {}),
      ...(name === undefined ? {} : { name }),
    });
    const built = withBuiltFirstDwelling({
      ...st,
      people: [
        ...st.people,
        man(base, 'Ctibor', 17, true),
        // vesničan, který jezdcům přivede koně
        man(base + 1, undefined, 30, false),
      ],
    });
    return {
      ...built,
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
              id: 1,
              bornDay: st.lastDay - 6 * 366,
              sex: 'male' as const,
              training: 60,
              riderId: lord.id,
            },
            {
              id: 2,
              bornDay: st.lastDay - 6 * 366,
              sex: 'male' as const,
              training: 60,
              riderId: base,
            },
          ],
        },
      ],
    };
  });
  await pollVillage(page);
  return { seat: s, dwelling: house, lordId: state.dynasty!.lordId!, sonId, horseIds: [1, 2] };
}

test('vojvoda a syn: Osedlat, přes okraj na sousední mapu, Sesednout, Domů – kůň v ohradě', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
  await useUniqueClientIp(ctx);
  const page = await ctx.newPage();
  await page.route('**/models/**', (route) => route.abort());
  const v = await manorWithHorses(page, 'osedlat');
  const [cellHome] = await query<{ x: number; y: number }>(
    'SELECT grid_x AS x, grid_y AS y FROM settlement WHERE id = $1',
    [v.seat.settlementId],
  );

  // Osedlat: vesničan přivede koně a oba jezdci nasednou (ještě před odjezdem – výprava stojí doma)
  await selectPeople(page, [v.lordId, v.sonId]);
  await page.getByTestId('expedition-saddle').click();
  await expect
    .poll(
      async () => {
        const own = (await journeyScene(page)).riders.filter((r) => r.own);
        return own.length === 2 && own.every((r) => r.mounted);
      },
      { timeout: 300_000, intervals: [2000] },
    )
    .toBe(true);
  const saddled = (await villageState(v.seat.settlementId)).pens![0]!.horses!;
  expect(saddled).toHaveLength(2);

  // přes okraj: pravé tlačítko v okrajovém pásu mapy míří na sousední mapu (záznam rozkazu v DB)
  const half = (v.seat.landscape.size * v.seat.landscape.cellSizeM) / 2;
  const edge = { x: half - 10, z: v.dwelling.z };
  await page.evaluate(([x, z]) => window.__bohemiaE2E!.moveCameraTo!(x!, z!), [edge.x, edge.z]);
  await page.waitForTimeout(1500);
  await selectPeople(page, [v.lordId, v.sonId]);
  const click = await screenOf(page, edge.x, edge.z);
  await page.mouse.click(click.x, click.y, { button: 'right' });
  const east = { x: cellHome!.x + 1, y: cellHome!.y };
  await expect
    .poll(
      async () => {
        const [row] = await query<{ cell: { x: number; y: number } | null }>(
          `SELECT c.state->'groups'->0->'goal'->'cell' AS cell FROM journey j
             JOIN journey_checkpoint c ON c.journey_id = j.id
             JOIN settlement s ON s.owner_id = j.player_id
            WHERE s.id = $1 AND j.status = 'active'`,
          [v.seat.settlementId],
        );
        return row?.cell ?? null;
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toEqual(east);

  // skupina přejde na sousední mapu (cestu přes celou mapu nahradí zápis do bodu výpravy)
  const entry = { x: -half + 40, z: 0 };
  await expect
    .poll(
      async () => {
        await placeJourney(v.seat.settlementId, east, entry);
        const view = await page.evaluate(async () => {
          const r = await fetch('/api/journey', { cache: 'no-store' });
          return (await r.json()) as {
            views?: { parties: { groups: { cell: { x: number; y: number } }[] }[] }[];
          };
        });
        const g = view.views?.[0]?.parties[0]?.groups[0]?.cell;
        return g?.x === east.x && g?.y === east.y;
      },
      { timeout: 180_000, intervals: [2000] },
    )
    .toBe(true);

  // scéna jde za skupinou (portrét vojvody v liště), Sesednout: jezdci vedou koně za uzdu
  // (worker mezitím ukládá svůj stav – zápis polohy se opakuje, dokud scéna cizí mapu neukáže)
  await expect
    .poll(
      async () => {
        await placeJourney(v.seat.settlementId, east, entry);
        await page.getByTestId('lord-away-badge').click();
        return page
          .getByTestId('foreign-scene')
          .getAttribute('data-cell', { timeout: 1000 })
          .catch(() => null);
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toBe(`${east.x},${east.y}`);
  await expect(readyScene(page)).toBeVisible({ timeout: 150_000 });
  await page.getByTestId('expedition-dismount').click();
  await expect
    .poll(
      async () => {
        const own = (await journeyScene(page)).riders.filter((r) => r.own);
        return own.length === 2 && own.every((r) => !r.mounted && r.led);
      },
      { timeout: 120_000, intervals: [2000] },
    )
    .toBe(true);

  // Domů: skupina (zápisem do bodu) na domovské mapě, upozornění o návratu, kůň je zpět v ohradě;
  // místo, odkud cesta domů vede (návrat se domů nepřenese – Martin 17. 11. 2026), je spočtené
  // předem – zápis přijde hned po rozkazu, dřív než skupina sama přejde okraj (`placeReturning`)
  const back = homeSpot(
    {
      cell: cellHome!,
      landscape: v.seat.landscape,
      state: await villageState(v.seat.settlementId),
    },
    v.dwelling,
    130,
    170,
  );
  await page.getByTestId('expedition-home').click();
  await expect
    .poll(
      async () => {
        await placeReturning(v.seat.settlementId, cellHome!, back);
        return page.getByText('Bořivoj se vrátil.').isVisible();
      },
      { timeout: 300_000, intervals: [1000] },
    )
    .toBe(true);
  await expect
    .poll(async () => (await journeyScene(page)).awayHorses, { timeout: 120_000 })
    .toEqual([]);
  const home = await villageState(v.seat.settlementId);
  expect(home.pens![0]!.horses!.map((h) => h.id).sort()).toEqual(v.horseIds);
  // výprava je hotová (`away` ve vsi zmizí s dalším dopočtem vsi – ve zpomaleném světě e2e později)
  const [done] = await query<{ status: string }>(
    `SELECT j.status FROM journey j JOIN settlement s ON s.owner_id = j.player_id WHERE s.id = $1`,
    [v.seat.settlementId],
  );
  expect(done?.status).toBe('done');
  await ctx.close();
});

// Výpravy ve scéně vsi (journey.md – Scéna vsi): dvě skupiny naráz jinam, jezdci jedou, praporek
// stojí v cíli jen u vybrané skupiny (praporek ve vodě hlídají unit testy, `journey.test.ts` – na
// náhodné krajině byl e2e nestabilní), cizí výprava u vsi – hostitel ji vidí a klikem pozná vojvodu
// a rod. Kreslení ověřuje háček scény `journeyScene`.

test('výpravy ve scéně: dvě skupiny naráz, praporek vybrané a cizí vojvoda u vsi', async ({
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
  // druhá skupina naráz jinam: syn Ctibor (výběr nahradí vojvodu) na opačnou stranu; jezdci obou
  // skupin jsou venku a praporek ukazuje cíl vybrané (druhé) skupiny
  const [sonId] = (await villageState(A.seat.settlementId)).people
    .filter((p) => p.name === 'Ctibor')
    .map((p) => p.id);
  await selectPeople(a, [sonId!]);
  const goal2 = { x: A.dwelling.x - 45, z: A.dwelling.z };
  await sendSelected(a, goal2);
  await expect
    .poll(
      async () =>
        new Set((await journeyScene(a)).riders.filter((r) => r.own).map((r) => r.journeyId)).size,
      { timeout: 60_000 },
    )
    .toBe(2);
  await expect
    .poll(
      async () => {
        const banner = (await journeyScene(a)).banner;
        return banner ? Math.hypot(banner.x - goal2.x, banner.z - goal2.z) : Infinity;
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

  // na místě čeká: praporek cíle zůstává, hodiny nad skupinou nejsou (Martin 14. 11. 2026)
  await expect.poll(async () => (await journeyScene(a)).banner, { timeout: 10_000 }).not.toBeNull();
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

  await Promise.all(ctxs.map((ctx) => ctx.close()));
});

test('známá mapa z domova: oko u rodu otevře šerou mapu se známými stavbami, ⌂ vrátí ves, další klik další mapu', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const ctxs = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const ctx of ctxs) await useUniqueClientIp(ctx);
  const [a, b, c] = (await Promise.all(ctxs.map((ctx) => ctx.newPage()))) as [Page, Page, Page];
  // A kreslí modely jen pro snímek (KNOWN_MAP_SCREENSHOT)
  for (const page of process.env.KNOWN_MAP_SCREENSHOT ? [b, c] : [a, b, c]) {
    await page.route('**/models/**', (route) => route.abort());
  }
  const { seat: sa } = await newPlayer(a, 'znamaa');
  await found(a, villageSpots(sa.landscape).dwelling);
  const { seat: sb } = await newPlayer(b, 'znamab');
  await registerAndEnterGame(c, 'znamac');
  await ctxs[1]!.close();
  await ctxs[2]!.close();

  const houseOf = async (settlementId: string): Promise<string> => {
    const [row] = await query<{ id: string }>(
      `SELECT h.id FROM house h JOIN settlement s ON s.owner_id = h.player_id
        WHERE s.id = $1 AND h.ended_at IS NULL`,
      [settlementId],
    );
    return row!.id;
  };
  const houseA = await houseOf(sa.settlementId);
  const houseB = await houseOf(sb.settlementId);

  // rod B má dvě vsi: sídelní a druhou na volném sousedním políčku
  const cells = await query<{ x: number; y: number }>(
    'SELECT grid_x AS x, grid_y AS y FROM settlement WHERE archived_at IS NULL AND grid_x IS NOT NULL',
    [],
  );
  const [b1] = await query<{ x: number; y: number }>(
    'SELECT grid_x AS x, grid_y AS y FROM settlement WHERE id = $1',
    [sb.settlementId],
  );
  const free = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ].find((d) => !cells.some((cl) => cl.x === b1!.x + d.x && cl.y === b1!.y + d.y))!;
  const cellB1 = { x: b1!.x, y: b1!.y };
  const cellB2 = { x: b1!.x + free.x, y: b1!.y + free.y };
  const [secondB] = await query<{ id: string }>(
    `INSERT INTO settlement (owner_id, is_seat, landscape_seed, layer_versions, grid_x, grid_y)
       SELECT owner_id, false, landscape_seed + 1, layer_versions, $2, $3
         FROM settlement WHERE id = $1 RETURNING id`,
    [sb.settlementId, cellB2.x, cellB2.y],
  );

  const panel = a.getByRole('dialog', { name: 'Rod a vazalové' });
  const openPanel = async (): Promise<void> => {
    if (!(await panel.isVisible())) await a.getByRole('button', { name: 'Rod a vazalové' }).click();
    await expect(panel).toBeVisible();
  };
  const eyeOf = (houseId: string): ReturnType<Page['locator']> =>
    panel.locator(`[data-testid="known-map-eye"][data-house-id="${houseId}"]`);

  // rod nic neví: oko u rodu B je zašedlé a vysvětlí proč
  await openPanel();
  await expect(eyeOf(houseB)).toHaveAttribute('data-known', 'no');
  await expect(eyeOf(houseB)).toHaveAttribute('aria-label', 'Tu mapu rod nezná.');

  // znalost rodu A o obou mapách B: dům v první, jiný dům v druhé (zapsáno rovnou do databáze)
  const dwellingAt = (id: number, at: { x: number; z: number }): object => ({
    key: `dwelling:${id}`,
    pos: { x: at.x, z: at.z },
    day: 5,
    data: {
      kind: 'dwelling',
      id,
      type: 'zemnice',
      position: { x: at.x, z: at.z, rotation: 0 },
      condition: 1,
    },
  });
  const spot = villageSpots(sb.landscape).dwelling;
  const seenOf = (id: number, villageId: string): object => ({
    villageId,
    trail: [[spot.x, spot.z]],
    parts: [dwellingAt(id, spot)],
  });
  // rod viděl ves současného držitele (id vsi, ne sídla), jinak by mapa k rodu nepatřila
  // hráč B ves nezaložil – obě sídla rodu B dostanou ves zkopírovanou ze vsi A (jen id se počítá)
  const villageOn = async (settlementId: string, name: string): Promise<string> => {
    const [row] = await query<{ id: string }>(
      `INSERT INTO village (settlement_id, name, ${VILLAGE_STATE_SQL_COLUMNS})
         SELECT $2, $3, ${VILLAGE_STATE_SQL_COLUMNS} FROM village WHERE settlement_id = $1
       RETURNING id`,
      [sa.settlementId, settlementId, name],
    );
    return row!.id;
  };
  const villageB1 = await villageOn(sb.settlementId, 'Ves B1');
  const villageB2 = await villageOn(secondB!.id, 'Ves B2');
  for (const [cell, id, villageId] of [
    [cellB1, 701, villageB1],
    [cellB2, 702, villageB2],
  ] as const) {
    await query(
      'INSERT INTO house_knowledge (house_id, grid_x, grid_y, state) VALUES ($1, $2, $3, $4)',
      [houseA, cell.x, cell.y, seenOf(id, villageId)],
    );
  }
  await a.reload();
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  await openPanel();
  await expect(eyeOf(houseB)).toHaveAttribute('data-known', 'yes', { timeout: 30_000 });
  // rod C, o jehož mapě A nic neví, má oko dál zašedlé
  const houseC = (
    await panel
      .getByTestId('house-other')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-house-id')))
  ).find((id) => id !== null && id !== houseB)!;
  await expect(eyeOf(houseC)).toHaveAttribute('data-known', 'no');

  const shown = (): Promise<number[]> =>
    a.evaluate(() =>
      (window.__bohemiaE2E?.foreignVillage?.() ?? { dwellings: [] }).dwellings.map((d) => d.id),
    );
  const scene = a.getByTestId('known-scene');

  // první klik: první známá mapa rodu B, šeré odkryté místo a známý dům
  await eyeOf(houseB).click();
  await expect(scene).toHaveAttribute('data-cell', `${cellB1.x},${cellB1.y}`, { timeout: 30_000 });
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  await expect.poll(shown, { timeout: 30_000 }).toEqual([701]);
  await expect
    .poll(() =>
      a.evaluate(([x, z]) => window.__bohemiaE2E?.journeyFog?.(x!, z!) ?? null, [spot.x, spot.z]),
    )
    .toBe('explored');
  // nic živého: žádní jezdci
  expect((await journeyScene(a)).riders).toHaveLength(0);

  // ⌂ vrátí ves; další klik otevře další mapu téhož rodu a třetí zase první
  await a.getByTestId('foreign-back').click();
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  await expect(scene).toHaveCount(0);
  await openPanel();
  await eyeOf(houseB).click();
  await expect(scene).toHaveAttribute('data-cell', `${cellB2.x},${cellB2.y}`, { timeout: 30_000 });
  await expect.poll(shown, { timeout: 30_000 }).toEqual([702]);
  await a.getByTestId('foreign-back').click();
  await expect(readyScene(a)).toBeVisible({ timeout: 150_000 });
  await openPanel();
  await eyeOf(houseB).click();
  await expect(scene).toHaveAttribute('data-cell', `${cellB1.x},${cellB1.y}`, { timeout: 30_000 });

  // neznámá mapa a cizí znalost: server odpoví 404
  const status = await a.evaluate(
    async (cell) => {
      const known = await fetch(`/api/journey?known=${cell}`, { cache: 'no-store' });
      return known.status;
    },
    `${cellB2.x + 7},${cellB2.y + 7}`,
  );
  expect(status).toBe(404);

  await knownMapShot(a);
  await ctxs[0]!.close();
});

/** Snímek známé mapy do `KNOWN_MAP_SCREENSHOT`, je-li nastavené. */
async function knownMapShot(page: Page): Promise<void> {
  const shot = process.env.KNOWN_MAP_SCREENSHOT;
  if (!shot) return;
  await page.waitForTimeout(3000);
  await page.screenshot({ path: shot, clip: { x: 160, y: 80, width: 640, height: 400 } });
}
