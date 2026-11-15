import { expect, test, type Page } from '@playwright/test';
import { registerAndEnterGame, useUniqueClientIp } from './helpers';
import {
  changeVillageStateById,
  found,
  newPlayer,
  query,
  villageIdOf,
  villageSpots,
} from './village-helpers';

// Události ze serveru (docs/code/server-events.md – Spojení /api/events, Klient; plán 2026-11-15 –
// Úlohy 2 a 3): kouř nad produkčním buildem. Hráč s vsí otevře v prohlížeči `EventSource` na svou
// ves – přijde `sync`, změna vsi zapsaná přímo SQL (trigger → NOTIFY → LISTEN rozbočovače) dorazí
// jako `village` do 2 s (komprese Next.js by ji bez `no-transform` držela v bufferu), cizí ves 403,
// bez přihlášení 401. Hra sama (klient a `useVillageSync`): jméno vsi a upozornění zapsané do
// databáze se ukážou bez háčku `pollVillage`, po výpadku se spojení obnoví.

test.beforeEach(async ({ context, page }) => {
  await useUniqueClientIp(context);
  // Bez modelů stromů naběhne softwarově kreslená scéna rychleji (viz landscape.spec.ts).
  await page.route('**/models/**', (route) => route.abort());
});

test.describe.configure({ timeout: 240_000 });

interface Received {
  name: string;
  data: { villageId?: string; version?: number; protocol?: number };
}

type EventsWindow = Window & { received?: Received[] };

/** Otevře `EventSource` v prohlížeči a sbírá signály do `window.received`. */
async function openEvents(page: Page, url: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as EventsWindow;
    w.received = [];
    const source = new EventSource(target);
    for (const name of ['sync', 'village', 'notices', 'alarm']) {
      source.addEventListener(name, (event) => {
        w.received?.push({ name, data: JSON.parse((event as MessageEvent<string>).data) });
      });
    }
  }, url);
}

async function received(page: Page): Promise<Received[]> {
  return page.evaluate(() => (window as EventsWindow).received ?? []);
}

/**
 * LISTEN procesu webu na testovací databázi už běží – posluchač se připojí až s prvním spojením
 * (`serverEventsHub`), změna zapsaná dřív by se neoznámila.
 */
async function listening(): Promise<boolean> {
  const [row] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'bohemia-change-listener'
        AND state = 'idle' AND query ILIKE 'LISTEN%'`,
    [],
  );
  return (row?.n ?? 0) > 0;
}

test('události ze serveru: sync, změna vsi do 2 s, no-transform, cizí ves 403, bez přihlášení 401', async ({
  page,
  browser,
  request,
}) => {
  const { seat } = await newPlayer(page, 'events');
  await found(page, villageSpots(seat.landscape).dwelling);
  const villageId = await villageIdOf(seat.settlementId);
  const url = `/api/events?village=${villageId}`;

  // lehká stránka téhož původu (s cookie session) – scéna hry by brzdila hlavní vlákno
  await page.goto('/api/journey');
  await openEvents(page, url);
  await expect
    .poll(async () => (await received(page)).find((e) => e.name === 'sync')?.data, {
      timeout: 2_000,
    })
    .toEqual({ protocol: 1 });
  await expect.poll(listening, { timeout: 10_000 }).toBe(true);

  // zápis stavu přímo SQL (verze + 1) – oznámí ho trigger, ne kód webu
  await changeVillageStateById(villageId, (s) => s);
  const [row] = await query<{ version: number }>('SELECT version FROM village WHERE id = $1', [
    villageId,
  ]);
  await expect
    .poll(
      async () =>
        (await received(page)).find((e) => e.name === 'village' && e.data.version === row?.version)
          ?.data,
      { timeout: 2_000 },
    )
    .toEqual({ villageId, version: row?.version });

  // hlavičky proudu: bez komprese a bufferování
  const headers = await page.evaluate(async (target) => {
    const controller = new AbortController();
    const response = await fetch(target, { signal: controller.signal });
    const result = {
      status: response.status,
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      contentEncoding: response.headers.get('content-encoding'),
      accelBuffering: response.headers.get('x-accel-buffering'),
    };
    controller.abort();
    return result;
  }, url);
  expect(headers).toEqual({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    cacheControl: 'no-cache, no-transform',
    contentEncoding: null,
    accelBuffering: 'no',
  });
  // vadný dotaz
  expect((await page.request.get('/api/events?village=../a')).status()).toBe(400);

  // cizí hráč na tuto ves nesmí – 403 (nic se neprozradí)
  const otherContext = await browser.newContext();
  await useUniqueClientIp(otherContext);
  const other = await otherContext.newPage();
  await other.route('**/models/**', (route) => route.abort());
  await registerAndEnterGame(other, 'events-cizi');
  expect((await other.request.get(url)).status()).toBe(403);
  await otherContext.close();

  // bez přihlášení 401
  const anonymous = await request.get(url);
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toEqual({ error: 'Nejsi přihlášený.' });
});

interface ConnectionState {
  status: 'open' | 'connecting' | 'off';
  received: number;
}

/** Stav spojení událostí hry (e2e háček `serverEvents`). */
async function connection(page: Page): Promise<ConnectionState> {
  return page.evaluate(() => window.__bohemiaE2E!.serverEvents!());
}

test('hra z událostí: jméno vsi a upozornění bez háčku, výpadek spojení se obnoví', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/events') requests.push(r.url());
  });
  const { seat } = await newPlayer(page, 'events-game');
  await found(page, villageSpots(seat.landscape).dwelling);
  const villageId = await villageIdOf(seat.settlementId);
  // po založení vsi se rozsah spojení vymění (ves) – otevřené zůstává
  await expect.poll(async () => (await connection(page)).status, { timeout: 10_000 }).toBe('open');
  await expect.poll(() => requests.at(-1) ?? '', { timeout: 10_000 }).toContain(villageId);
  await expect.poll(listening, { timeout: 10_000 }).toBe(true);

  await test.step('jméno vsi změněné v databázi se ukáže bez háčku', async () => {
    const before = (await connection(page)).received;
    // Samotné jméno verzi nemění a událost se známou verzí prohlížeč zahodí (Rozhodnutí 5) –
    // zápis „jako server“ proto zvedne i verzi.
    await query(`UPDATE village SET name = $2, version = version + 1 WHERE id = $1`, [
      villageId,
      'Událostice',
    ]);
    await expect(page.getByTestId('village-name')).toHaveText('Událostice', { timeout: 5_000 });
    expect((await connection(page)).received).toBeGreaterThan(before);
  });

  await test.step('upozornění se ukáže samo', async () => {
    const [owner] = await query<{ owner_id: string }>(
      'SELECT owner_id FROM settlement WHERE id = $1',
      [seat.settlementId],
    );
    await query(
      `INSERT INTO player_notice (player_id, kind, payload, game_day)
       VALUES ($1, 'levy-pending', '{"lordName":"Pán","years":1,"loan":true}'::jsonb, 0)`,
      [owner!.owner_id],
    );
    await expect(page.getByTestId('village-notice').filter({ hasText: 'splátky' })).toBeVisible({
      timeout: 5_000,
    });
  });

  await test.step('výpadek spojení: connecting, do 5 s znovu open s dalším požadavkem', async () => {
    const before = requests.length;
    await page.evaluate(() => window.__bohemiaE2E!.dropServerEvents!());
    expect((await connection(page)).status).toBe('connecting');
    await expect.poll(async () => (await connection(page)).status, { timeout: 5_000 }).toBe('open');
    expect(requests.length).toBe(before + 1);
  });
});
