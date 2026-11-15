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

// Události ze serveru (docs/code/server-events.md – Spojení /api/events; plán 2026-11-15 – Úloha 2):
// kouř nad produkčním buildem. Hráč s vsí otevře v prohlížeči `EventSource` na svou ves – přijde
// `sync`, změna vsi zapsaná přímo SQL (trigger → NOTIFY → LISTEN rozbočovače) dorazí jako `village`
// do 2 s (komprese Next.js by ji bez `no-transform` držela v bufferu), cizí ves 403, bez
// přihlášení 401.

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
