/**
 * Měření otevření hry a akce po nepřítomnosti hráče s workerem i bez něj
 * (docs/superpowers/plans/2026-10-31-worker.md – 7. Měření). Rod má `--villages` vsí (kopie
 * zdrojové vsi, každá na vlastním sídle se stejnou krajinou), svět se posune o `--days` dní a
 * měří se serverové funkce webu (`villageViewForPlayer`, `renameVillageForPlayer`) nad skutečnou
 * databází. Hodiny (`Date.now`) jsou řízené skriptem – nic se nečeká.
 *
 *   A – bez workeru: otevření dopočte všechny vsi (dnešní chování).
 *   B – s workerem: `advanceWorldStep` dožene rod, pak se světu přidá 1 den a měří se otevření
 *       a akce (zobrazená ves 1 den, ostatní nejvýš 1 den pozadu = web je nechá).
 *   C – otevření během dohánění: worker doběhl polovinu kol, web dopočte zbytek sám.
 *
 * Databáze: vlastní `bohemia_measure` (vytvoří a zmigruje se; nikdy ne vývojová `bohemia` pro
 * zápis). Zdroj vsi se jen čte z vývojové `bohemia`.
 *
 *   NODE_OPTIONS=--conditions=react-server nice npx tsx apps/web/scripts/measure-absence.ts \
 *     [--villages 1,5,20] [--days 1000] [--village <id>] [--scenarios A,B,C]
 */
import { Session } from 'node:inspector/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '@bohemia/db';
import {
  TOTAL_GAME_DAYS,
  advanceWorldStep,
  type LandscapeSource,
  type WorldStepDeps,
} from '@bohemia/game';
import {
  WORKER_LOCK_POOL_SIZE,
  cachedLandscapes,
  createGameDeps,
  createPlayerLocks,
  currentWorld,
  worldDayOf,
} from '@bohemia/server';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const SOURCE_URL = 'postgres://postgres@127.0.0.1:5432/bohemia';
const ADMIN_URL = 'postgres://postgres@127.0.0.1:5432/postgres';
/** Databáze měření (`--db`, jen `bohemia_measure*`); souběžné běhy potřebují každý svou. */
const MEASURE_DB = arg('db', 'bohemia_measure');
if (!/^bohemia_measure[a-z0-9_]*$/.test(MEASURE_DB))
  throw new Error('--db musí být bohemia_measure*.');
const MEASURE_URL = `postgres://postgres@127.0.0.1:5432/${MEASURE_DB}`;
const PLAYER = 'measure-absence-player';
/** Cíl (plán workeru – Rozhodnutí Martina 3): otevření do 2 s, akce do 0,5 s pro rod do 20 vsí. */
const GOAL_OPEN_MS = 2000;
const GOAL_ACTION_MS = 500;
const GOAL_MAX_VILLAGES = 20;
const STEP_DAYS = 10;
const STEP_LIMIT = 50;
const DAY_MS_OF_WORLD = 365 * 86_400_000;

interface Source {
  name: string;
  state: string;
  settlement: { landscape_seed: number; layer_versions: unknown; weather_seed: number };
}

/** Zdrojová ves z vývojové databáze (jen čtení): zadaná, jinak největší ves (Vlkov). */
async function loadSource(villageId: string | null): Promise<Source> {
  const client = new Client({ connectionString: SOURCE_URL });
  await client.connect();
  try {
    const found = await client.query(
      `select v.name, v.state::text as state, s.landscape_seed, s.layer_versions, s.weather_seed
       from village v join settlement s on s.id = v.settlement_id
       where ($1::uuid is null or v.id = $1) and s.archived_at is null
       order by length(v.state::text) desc limit 1`,
      [villageId],
    );
    const row = found.rows[0];
    if (!row) throw new Error('Zdrojová ves nenalezena.');
    return {
      name: row.name,
      state: row.state,
      settlement: {
        landscape_seed: row.landscape_seed,
        layer_versions: row.layer_versions,
        weather_seed: row.weather_seed,
      },
    };
  } finally {
    await client.end();
  }
}

/** Vytvoří (když chybí) a zmigruje databázi měření. */
async function ensureDatabase(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [MEASURE_DB]);
  if (exists.rowCount === 0) await admin.query(`create database ${MEASURE_DB}`);
  await admin.end();
  const db = createDatabase(MEASURE_URL);
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url)),
  });
  await db.$client.end();
}

/** Rod `count` vsí (kopií zdroje) na sídlech v řadě mřížky; vymaže předchozí rod. */
async function seedDynasty(client: Client, source: Source, count: number): Promise<void> {
  await client.query('delete from "user" where id = $1', [PLAYER]);
  await client.query(
    `insert into "user" (id, name, email) values ($1, 'Měření', 'measure-absence@example.test')
     on conflict do nothing`,
    [PLAYER],
  );
  for (let i = 0; i < count; i++) {
    const settlement = await client.query(
      `insert into settlement (owner_id, is_seat, landscape_seed, layer_versions, weather_seed,
         grid_x, grid_y) values ($1, $2, $3, $4, $5, $6, 0) returning id`,
      [
        PLAYER,
        i === 0,
        source.settlement.landscape_seed,
        JSON.stringify(source.settlement.layer_versions),
        source.settlement.weather_seed,
        i,
      ],
    );
    const state = JSON.parse(source.state) as Record<string, unknown>;
    delete state.origin;
    await client.query(
      `insert into village (settlement_id, name, state, created_at)
       values ($1, $2, $3::jsonb, now() + ($4 || ' seconds')::interval)`,
      [settlement.rows[0].id, `${source.name} ${i + 1}`, JSON.stringify(state), String(i)],
    );
  }
}

/** Řízené hodiny: `Date.now()` vrací okamžik, který odpovídá zadanému dni světa. */
function setWorldDay(day: number): void {
  const start = Date.UTC(2026, 0, 1);
  const instant = start + ((day + 0.5) * DAY_MS_OF_WORLD) / TOTAL_GAME_DAYS;
  Date.now = (): number => instant;
  const check = worldDayOf(instant, currentWorld());
  if (!check.ok || check.day !== day) throw new Error(`Hodiny neodpovídají dni ${day}.`);
}

/** Profil CPU (`--profile`) jen měřených volání: nejdražší funkce podle vlastního času. */
const profile = process.argv.includes('--profile') ? new Session() : null;
profile?.connect();
const profileSelf = new Map<string, number>();

async function profiled<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!profile) return run();
  await profile.post('Profiler.enable');
  await profile.post('Profiler.start');
  try {
    return await run();
  } finally {
    const { profile: result } = await profile.post('Profiler.stop');
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const deltas = result.timeDeltas ?? [];
    (result.samples ?? []).forEach((id, i) => {
      const node = byId.get(id);
      if (!node) return;
      const file = node.callFrame.url.split('/').slice(-2).join('/');
      const key = `${label}: ${node.callFrame.functionName || '(anonymní)'} ${file}:${node.callFrame.lineNumber + 1}`;
      profileSelf.set(key, (profileSelf.get(key) ?? 0) + (deltas[i] ?? 0) / 1000);
    });
  }
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await run();
  return { ms: performance.now() - started, value };
}

interface Row {
  scenario: string;
  villages: number;
  days: number;
  workerMs: number | null;
  openMs: number;
  actionMs: number | null;
  note: string;
}

async function main(): Promise<void> {
  const villageCounts = arg('villages', '1,5,20').split(',').map(Number);
  const days = Number(arg('days', '1000'));
  const scenarios = arg('scenarios', 'A,B,C').split(',');
  const sourceId = arg('village', '');

  process.env.DATABASE_URL = MEASURE_URL;
  process.env.WORLD_START = new Date(Date.UTC(2026, 0, 1)).toISOString();
  process.env.WORLD_END = new Date(Date.UTC(2026, 0, 1) + DAY_MS_OF_WORLD).toISOString();
  await ensureDatabase();
  const source = await loadSource(sourceId || null);
  const sourceDay = (JSON.parse(source.state) as { lastDay: number }).lastDay;
  console.log(
    `zdroj ${source.name}: ${(source.state.length / 1e6).toFixed(1)} MB, den ${sourceDay}, nepřítomnost ${days} dní`,
  );

  const client = new Client({ connectionString: MEASURE_URL });
  await client.connect();

  // web = skutečné serverové funkce aplikace (až po nastavení prostředí)
  const web = await import('../lib/village');

  const rows: Row[] = [];
  const workerDb = createDatabase(MEASURE_URL);
  const locks = createPlayerLocks(MEASURE_URL, WORKER_LOCK_POOL_SIZE);
  let landscapeMs = 0;
  const base = cachedLandscapes(128);
  const landscapes: LandscapeSource = {
    landscapeOf: (seed, versions) => {
      const started = performance.now();
      const landscape = base.landscapeOf(seed, versions);
      landscapeMs += performance.now() - started;
      return landscape;
    },
  };
  const workerDeps = (): WorldStepDeps => ({
    ...createGameDeps(workerDb, { landscapes, pause: () => null, locks: locks.locks }),
    now: () => performance.now(),
  });

  /** Kola workeru do dne `day`; `maxRounds` omezí počet (scénář C). Vrací čas a počet kol. */
  async function runWorker(
    day: number,
    maxRounds: number,
  ): Promise<{ ms: number; rounds: number; done: boolean }> {
    const deps = workerDeps();
    landscapeMs = 0;
    const started = performance.now();
    let rounds = 0;
    for (;;) {
      if (rounds >= maxRounds) return { ms: performance.now() - started, rounds, done: false };
      const step = await advanceWorldStep(deps, {
        worldDay: day,
        stepDays: STEP_DAYS,
        limit: STEP_LIMIT,
      });
      if (step.idle) return { ms: performance.now() - started, rounds, done: true };
      rounds++;
    }
  }

  async function firstVillageId(): Promise<string> {
    const found = await client.query(
      `select v.id from village v join settlement s on s.id = v.settlement_id
       where s.owner_id = $1 order by s.is_seat desc, v.created_at limit 1`,
      [PLAYER],
    );
    return found.rows[0].id as string;
  }

  async function open(): Promise<number> {
    const id = await firstVillageId();
    const { ms, value } = await timed(() =>
      profiled('otevření', () => web.villageViewForPlayer(PLAYER, id)),
    );
    if (value === null || 'error' in value)
      throw new Error(`Otevření selhalo: ${JSON.stringify(value)}`);
    return ms;
  }

  async function action(): Promise<number> {
    const id = await firstVillageId();
    const { ms, value } = await timed(() =>
      profiled('akce', () =>
        web.renameVillageForPlayer(PLAYER, id, { name: `Měřená ${Date.now() % 1000}` }),
      ),
    );
    if ('error' in value) throw new Error(`Akce selhala: ${value.error}`);
    return ms;
  }

  for (const count of villageCounts) {
    const target = sourceDay + days;
    if (scenarios.includes('A')) {
      await seedDynasty(client, source, count);
      setWorldDay(target);
      const openMs = await open();
      const actionMs = await action();
      rows.push({
        scenario: 'A bez workeru',
        villages: count,
        days,
        workerMs: null,
        openMs,
        actionMs,
        note: '',
      });
      console.log(rows[rows.length - 1]);
    }
    let bRounds = 0;
    if (scenarios.includes('B') || scenarios.includes('C')) {
      await seedDynasty(client, source, count);
      setWorldDay(target);
      const worker = await runWorker(target, Infinity);
      bRounds = worker.rounds;
      const landscapeShare = Math.round((100 * landscapeMs) / worker.ms);
      if (scenarios.includes('B')) {
        // první pohled po startu serveru generuje krajinu a vrstvu překážek zobrazené vsi
        // (mezipaměť webu je studená) – měří se zvlášť, ostatní otevření už jedou z mezipaměti
        setWorldDay(target);
        const coldMs = await open();
        setWorldDay(target + 1);
        const openMs = await open();
        const actionMs = await action();
        const rate = (count * days) / (worker.ms / 1000);
        rows.push({
          scenario: 'B s workerem',
          villages: count,
          days,
          workerMs: worker.ms,
          openMs,
          actionMs,
          note:
            `studená mezipaměť ${(coldMs / 1000).toFixed(2)} s, ${worker.rounds} kol, ${(worker.ms / (count * days)).toFixed(1)} ms na den vsi, ` +
            `kapacita jádra ≈ ${Math.round(rate * 86.4)} vsí, krajiny ${landscapeShare} %`,
        });
        console.log(rows[rows.length - 1]);
      }
    }
    if (scenarios.includes('C') && bRounds > 1) {
      await seedDynasty(client, source, count);
      setWorldDay(target);
      const half = await runWorker(target, Math.floor(bRounds / 2));
      const openMs = await open();
      rows.push({
        scenario: 'C během dohánění',
        villages: count,
        days,
        workerMs: half.ms,
        openMs,
        actionMs: null,
        note: `worker po ${half.rounds} z ${bRounds} kol`,
      });
      console.log(rows[rows.length - 1]);
    }
  }

  const fmt = (ms: number | null): string => (ms === null ? '–' : `${(ms / 1000).toFixed(2)} s`);
  const verdict = (ms: number | null, goal: number, villages: number, applies: boolean): string =>
    ms === null || !applies || villages > GOAL_MAX_VILLAGES ? '' : ms <= goal ? ' OK' : ' MIMO';
  console.log('\n| scénář | vsí | dní | worker | otevření | akce | poznámka |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    const goalApplies = r.scenario.startsWith('B');
    console.log(
      `| ${r.scenario} | ${r.villages} | ${r.days} | ${fmt(r.workerMs)} | ` +
        `${fmt(r.openMs)}${verdict(r.openMs, GOAL_OPEN_MS, r.villages, goalApplies)} | ` +
        `${fmt(r.actionMs)}${verdict(r.actionMs, GOAL_ACTION_MS, r.villages, goalApplies)} | ${r.note} |`,
    );
  }

  if (profile) {
    console.log('\nProfil (vlastní čas, ms):');
    [...profileSelf]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .forEach(([key, ms]) => {
        console.log(`${ms.toFixed(0).padStart(7)}  ${key}`);
      });
  }
  await client.query('delete from "user" where id = $1', [PLAYER]);
  await client.end();
  await locks.close();
  await workerDb.$client.end();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
