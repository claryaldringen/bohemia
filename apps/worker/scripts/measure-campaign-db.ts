import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client, type PoolClient } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createAlarmOwners,
  createDatabase,
  createHouseRepository,
  createSettlementRepository,
  createVassalageRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  dateOfDayIndex,
  msOfTick,
  newCampaign,
  newCampaignMemory,
  OFFICIAL_WORLD,
  realTimeOf,
  stepCampaigns,
  villageWatchers,
  type CampaignMember,
  type CampaignOutbox,
  type CampaignRepository,
  type CampaignState,
  type StepCampaignsDeps,
} from '@bohemia/game';
import { cachedLandscapes, createCampaignCells } from '@bohemia/server';

// Měření smyčky tažení nad skutečnou databází (docs/code/worker.md – Výkon – Tažení): `--campaigns`
// tažení (výchozí 20) stojí každé u vlastní vsi s velkým stavem (kopie největší vsi vývojové
// `bohemia` – jen čtení) a smyčka je worker: `stepCampaigns` jednou za sekundu (4 takty) s pamětí
// workeru, vsemi, sídly, rody a vazalstvím z DB (`bohemia_measure`, nikdy `bohemia` pro zápis).
// Tažení a jejich body jsou v paměti (JSON jako jsonb) – měří se načítání vsí a map políček. Za kolo
// se měří skutečný čas a bajty přečtené ze spojení s databází (socket poolu). „Otisk“ = uložené body
// – před i po zrychlení musí být tentýž.
//
// Ves `bohemia` mezitím dopočítává worker – pro srovnání před / po stejný zdroj `--source <soubor>`
// (první běh ho zapíše).
//
//   nice npx tsx apps/worker/scripts/measure-campaign-db.ts [--campaigns 20] [--rounds 30] \
//     [--village <id>] [--source <soubor.json>]

const { values: args } = parseArgs({
  options: {
    campaigns: { type: 'string', default: '20' },
    rounds: { type: 'string', default: '30' },
    village: { type: 'string' },
    /** Zdroj vsi v souboru – první běh ho zapíše, další ho čtou (vývojová ves se mezitím mění). */
    source: { type: 'string' },
    db: { type: 'string', default: 'bohemia_measure' },
  },
});
const CAMPAIGNS = Number(args.campaigns);
const ROUNDS = Number(args.rounds);
const MEASURE_DB = args.db;
if (!/^bohemia_measure[a-z0-9_]*$/.test(MEASURE_DB)) {
  throw new Error('--db musí být bohemia_measure*.');
}
const SOURCE_URL = 'postgres://postgres@127.0.0.1:5432/bohemia';
const ADMIN_URL = 'postgres://postgres@127.0.0.1:5432/postgres';
const MEASURE_URL = `postgres://postgres@127.0.0.1:5432/${MEASURE_DB}`;
const PLAYER = 'measure-campaign-db-player';
const ARMY = 'measure-campaign-db-army';
/** Řádek mřížky světa měřených vsí (jiný než `measure-absence`, sdílí databázi). */
const GRID_Y = 100;
const MEN = 60;
const TICKS_PER_ROUND = 4;
const world = OFFICIAL_WORLD;

interface Source {
  state: string;
  seed: number;
  versions: unknown;
}

/** Zdroj ze souboru `--source`, jinak z databáze (a do souboru, je-li zadaný). */
async function loadSource(): Promise<Source> {
  if (args.source && existsSync(args.source)) {
    return JSON.parse(readFileSync(args.source, 'utf8')) as Source;
  }
  const source = await querySource();
  if (args.source) writeFileSync(args.source, JSON.stringify(source));
  return source;
}

/** Největší ves vývojové databáze (jen čtení), nebo zadaná `--village`. */
async function querySource(): Promise<Source> {
  const client = new Client({ connectionString: SOURCE_URL });
  await client.connect();
  try {
    const found = await client.query(
      `select v.state::text as state, s.landscape_seed, s.layer_versions
       from village v join settlement s on s.id = v.settlement_id
       where ($1::uuid is null or v.id = $1) and s.archived_at is null
       order by length(v.state::text) desc limit 1`,
      [args.village ?? null],
    );
    const row = found.rows[0];
    if (!row) throw new Error('Zdrojová ves nenalezena.');
    return { state: row.state, seed: row.landscape_seed, versions: row.layer_versions };
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

/** `count` vsí (kopií zdroje) na sídlech v řadě mřížky – id vsí a jejich políčka. */
async function seed(source: Source, count: number): Promise<{ id: string; x: number }[]> {
  const client = new Client({ connectionString: MEASURE_URL });
  await client.connect();
  try {
    await client.query('delete from "user" where id = any($1)', [[PLAYER, ARMY]]);
    for (const id of [PLAYER, ARMY]) {
      await client.query(`insert into "user" (id, name, email) values ($1, 'Měření', $2)`, [
        id,
        `${id}@example.test`,
      ]);
    }
    const out: { id: string; x: number }[] = [];
    // klíč založení je unikátní – kopie ho nesmí nést
    const state = JSON.parse(source.state) as Record<string, unknown>;
    delete state.origin;
    const json = JSON.stringify(state);
    for (let i = 0; i < count; i++) {
      const settlement = await client.query(
        `insert into settlement (owner_id, is_seat, landscape_seed, layer_versions, weather_seed,
           grid_x, grid_y) values ($1, $2, $3, $4, 1, $5, $6) returning id`,
        [PLAYER, i === 0, source.seed, JSON.stringify(source.versions), 2 * i, GRID_Y],
      );
      const village = await client.query(
        `insert into village (settlement_id, name, state, created_at)
         values ($1, $2, $3::jsonb, now()) returning id`,
        [settlement.rows[0].id, `Měřená ${i + 1}`, json],
      );
      out.push({ id: village.rows[0].id, x: 2 * i });
    }
    return out;
  } finally {
    await client.end();
  }
}

function members(k: number): CampaignMember[] {
  return Array.from({ length: MEN }, (_, i) => ({
    ref: { villageId: `home${k}`, personId: i + 1 },
    playerId: ARMY,
    line: i === 0,
    mounted: false,
    forced: false,
    strength: i === 0 ? 2 : 0.4,
    health: 100,
    vigor: 1,
    wounded: false,
    group: i % 3,
    status: 'active' as const,
  }));
}

/** Tažení stojí 150 m od jádra vsi na jejím políčku – nájezd hned v prvním taktu. */
function besieging(k: number, villageId: string, x: number, tick: number): CampaignState {
  const cell = { x, y: GRID_Y };
  const at = { x: 150, z: 0 };
  const base = newCampaign(
    {
      id: `c${k}`,
      warId: 'w',
      seed: 100 + k,
      tick,
      playerId: ARMY,
      leaderName: 'Bořivoj',
      commander: { villageId: `home${k}`, personId: 1 },
      deputy: { villageId: `home${k}`, personId: 2 },
      assembly: { villageId: `home${k}`, cell: { x: x + 1, y: GRID_Y }, pos: { x: 0, z: 0 } },
      target: { villageId, cell, pos: at },
      members: members(k),
      foodKg: 600,
      liveCommand: false,
    },
    world,
  );
  return {
    ...base,
    phase: 'marching',
    groups: base.groups.map((g) => ({
      ...g,
      cell: { ...cell },
      pos: { ...at },
      goal: { cell: { ...cell }, pos: { ...at } },
      arrived: true,
    })),
  };
}

interface Row {
  state: string;
  tick: number;
  outbox: string | null;
  done: boolean;
  /** Verze bodu – roste s každým zápisem (v DB `xmin` řádku). */
  version: number;
}

/** Úložiště tažení v paměti – bod jako JSON (jako jsonb), bez záměrů. */
function memoryCampaigns(rows: Map<string, Row>, saves: { n: number }): CampaignRepository {
  const none = (): never => {
    throw new Error('v měření se nepoužívá');
  };
  return {
    create: none,
    activeOf: none,
    activeAgainst: none,
    activeAlarming: none,
    addIntent: none,
    active: () =>
      Promise.resolve([...rows].filter(([, r]) => !r.done || r.outbox).map(([id]) => id)),
    checkpoint: (id) => {
      const row = rows.get(id)!;
      return Promise.resolve({
        state: JSON.parse(row.state) as CampaignState,
        outbox: row.outbox === null ? null : (JSON.parse(row.outbox) as CampaignOutbox),
        version: String(row.version),
      });
    },
    checkpointVersion: (id) => Promise.resolve(String(rows.get(id)!.version)),
    intentsAfter: () => Promise.resolve([]),
    saveCheckpoint: (id, input) => {
      const row = rows.get(id)!;
      if (row.tick !== input.fromTick) return Promise.resolve('stale');
      saves.n++;
      row.version++;
      row.tick = input.state.tick;
      row.state = JSON.stringify(input.state);
      row.outbox = input.outbox ? JSON.stringify(input.outbox) : null;
      row.done = input.state.phase === 'done';
      return Promise.resolve('saved');
    },
    clearOutbox: (id, tick) => {
      const row = rows.get(id)!;
      if (row.tick === tick) {
        row.outbox = null;
        row.version++;
      }
      return Promise.resolve();
    },
  };
}

/** Bajty přečtené ze spojení poolu (node-postgres – socket spojení klienta). */
function socketBytes(clients: ReadonlySet<PoolClient>): number {
  let total = 0;
  for (const client of clients) {
    total += (client as unknown as { connection: { stream: { bytesRead: number } } }).connection
      .stream.bytesRead;
  }
  return total;
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2).replace('.', ',')} MB`;
const ms = (value: number): string => `${value.toFixed(0)} ms`;

async function main(): Promise<void> {
  const source = await loadSource();
  await ensureDatabase();
  const villages = await seed(source, CAMPAIGNS);
  const lastDay = (JSON.parse(source.state) as { lastDay: number }).lastDay;
  // poledne posledního spočteného dne vsi – bariéra (Ú6.7) tažení nezastaví
  const start = Math.ceil((realTimeOf(dateOfDayIndex(lastDay), world) - world.startMs) / 250) + 100;

  const db = createDatabase(MEASURE_URL);
  const clients = new Set<PoolClient>();
  db.$client.on('connect', (client) => clients.add(client));
  const villageRepo = createVillageRepository(db);
  const settlements = createSettlementRepository(db);
  const rows = new Map<string, Row>();
  for (const [k, v] of villages.entries()) {
    const state = besieging(k, v.id, v.x, start);
    rows.set(state.id, {
      state: JSON.stringify(state),
      tick: start,
      outbox: null,
      done: false,
      version: 0,
    });
  }
  const saves = { n: 0 };
  const deps: StepCampaignsDeps = {
    campaigns: memoryCampaigns(rows, saves),
    campaignLock: { tryRun: async (_id, task) => ({ ran: true, value: await task() }) },
    cells: createCampaignCells({
      settlements,
      villages: villageRepo,
      landscapes: cachedLandscapes(4),
      worldSeed: 1,
    }),
    villages: villageRepo,
    notices: { post: () => Promise.resolve() },
    watchers: villageWatchers({
      villages: villageRepo,
      settlements,
      houses: createHouseRepository(db),
      vassalages: createVassalageRepository(db),
    }),
    alarmOwners: createAlarmOwners(db),
    world,
    memory: newCampaignMemory(),
  };

  const times: number[] = [];
  const bytes: number[] = [];
  const outcomes = new Map<string, number>();
  for (let round = 1; round <= ROUNDS; round++) {
    const bytesBefore = socketBytes(clients);
    const started = performance.now();
    const results = await stepCampaigns(deps, {
      nowMs: msOfTick(start + round * TICKS_PER_ROUND, world),
    });
    times.push(performance.now() - started);
    bytes.push(socketBytes(clients) - bytesBefore);
    for (const r of results) {
      if (r.outcome === 'failed') throw r.error;
      outcomes.set(r.outcome, (outcomes.get(r.outcome) ?? 0) + 1);
    }
  }
  await db.$client.end();

  const hash = createHash('sha1');
  const phases = new Map<string, number>();
  for (const row of rows.values()) {
    // id vsí jsou v každém běhu nová (UUID) – otisk je bez nich, ať jde porovnat před a po
    let text = row.state;
    for (const [k, v] of villages.entries()) text = text.replaceAll(v.id, `ves${k}`);
    hash.update(text);
    const s = JSON.parse(row.state) as CampaignState;
    phases.set(s.phase, (phases.get(s.phase) ?? 0) + 1);
  }
  const steady = (list: number[]): number =>
    list.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, list.length - 1);
  console.log(
    `ves ${mb(source.state.length)} × ${CAMPAIGNS} tažení, ${ROUNDS} kol po ${TICKS_PER_ROUND} taktech`,
  );
  console.log(`1. kolo: ${ms(times[0] ?? 0)}, ${mb(bytes[0] ?? 0)}`);
  console.log(`další kola (průměr): ${ms(steady(times))}, ${mb(steady(bytes))} za kolo`);
  console.log(
    `výsledky kol: ${[...outcomes].map(([k, n]) => `${n}× ${k}`).join(', ')}; uložení ${saves.n}`,
  );
  console.log(
    `fáze: ${[...phases].map(([k, n]) => `${n}× ${k}`).join(', ')}; otisk ${hash.digest('hex').slice(0, 8)}`,
  );
}

await main();
