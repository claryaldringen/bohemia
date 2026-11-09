import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createAlarmOwners,
  createCampaignRepository,
  createDatabase,
  createHouseRepository,
  createSettlementRepository,
  createStewardshipRepository,
  createVillageRepository,
} from '@bohemia/db';
import {
  dateOfDayIndex,
  MarchGridMemo,
  newCampaign,
  OFFICIAL_WORLD,
  realTimeOf,
  villageAlarmView,
  type AlarmViewDeps,
  type CampaignMember,
  type CampaignState,
  type LayerVersions,
  type VillageState,
} from '@bohemia/game';
import {
  cachedLandscapes,
  cachedVillages,
  createCampaignCells,
  VillageMemory,
  withVillageCache,
  withVillageMemory,
} from '@bohemia/server';

// Cena pohledu na varování (plán 2026-11-09 – Úloha 12 riziko, Úloha 15; docs/code/worker.md –
// Výkon – Pohled na varování): panel vsi se při varování ptá každé 2 s (`use-alarm.ts`) a server
// pokaždé spočte `villageAlarmView` – přístup k vsi, Vrátit se, tažení s varováním (kontrolní bod),
// kandidáti hradišť, mapy políček a volby (`alarmChoices`). Skutečná databáze `bohemia_measure_alarm`
// (nikdy `bohemia` pro zápis; zdroj = největší ves `bohemia`, jen čtení): ves hráče a jeho hradiště
// (kopie zdroje), tažení 60 mužů na mapě vsi s varováním. Měří se čas dotazu a jeho části –
// „před“ = paměť vsí jen na jeden dotaz (`withVillageCache`, stav do 9. 11. 2026), „po“ = paměť vsí
// přes dotazy (`VillageMemory`) a mřížek pochodu (`MarchGridMemo`) jako `apps/web/lib/alarm.ts`.
//
//   nice npx tsx apps/worker/scripts/measure-alarm-view.ts [--rounds 20] [--village <id>]

const { values: args } = parseArgs({
  options: {
    rounds: { type: 'string', default: '20' },
    village: { type: 'string' },
    db: { type: 'string', default: 'bohemia_measure_alarm' },
  },
});
const ROUNDS = Number(args.rounds);
const MEASURE_DB = args.db;
if (!/^bohemia_measure[a-z0-9_]*$/.test(MEASURE_DB)) {
  throw new Error('--db musí být bohemia_measure*.');
}
const SOURCE_URL = 'postgres://postgres@127.0.0.1:5432/bohemia';
const ADMIN_URL = 'postgres://postgres@127.0.0.1:5432/postgres';
const MEASURE_URL = `postgres://postgres@127.0.0.1:5432/${MEASURE_DB}`;
const PLAYER = 'measure-alarm-view-player';
const ARMY = 'measure-alarm-view-army';
const GRID_Y = 300;
const world = OFFICIAL_WORLD;

interface Source {
  state: string;
  seed: number;
  versions: LayerVersions;
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

/** Vytvoří (když chybí) a zmigruje databázi měření; vyprázdní hráče měření. */
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
  const client = new Client({ connectionString: MEASURE_URL });
  await client.connect();
  await client.query('delete from campaign');
  await client.query('delete from war');
  await client.query('delete from "user" where id = any($1)', [[PLAYER, ARMY]]);
  for (const id of [PLAYER, ARMY]) {
    await client.query(`insert into "user" (id, name, email) values ($1, 'Měření', $2)`, [
      id,
      `${id}@example.test`,
    ]);
  }
  await client.end();
}

const ms = (n: number): string => `${n.toFixed(1)} ms`;
const median = (list: number[]): number => [...list].sort((a, b) => a - b)[list.length >> 1] ?? 0;

/** Měřič částí – čas a počet volání metody repozitáře. */
class Parts {
  readonly time = new Map<string, number>();
  readonly calls = new Map<string, number>();
  wrap<T extends object>(name: string, repo: T): T {
    return new Proxy(repo, {
      get: (target, key, receiver) => {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') return value;
        const label = `${name}.${String(key)}`;
        return async (...a: unknown[]) => {
          const t = performance.now();
          try {
            return await (value as (...x: unknown[]) => Promise<unknown>).apply(target, a);
          } finally {
            this.time.set(label, (this.time.get(label) ?? 0) + performance.now() - t);
            this.calls.set(label, (this.calls.get(label) ?? 0) + 1);
          }
        };
      },
    });
  }
}

async function main(): Promise<void> {
  const source = await querySource();
  await ensureDatabase();
  const db = createDatabase(MEASURE_URL);
  const houses = createHouseRepository(db);
  const settlements = createSettlementRepository(db);
  const villages = createVillageRepository(db);
  const campaigns = createCampaignRepository(db);
  const now = new Date();
  const [hp, ha] = [
    await houses.create({ playerId: PLAYER, kind: 'player', createdAt: now }),
    await houses.create({ playerId: ARMY, kind: 'player', createdAt: now }),
  ];
  const state = JSON.parse(source.state) as VillageState & { origin?: unknown };
  delete state.origin;
  const place = async (x: number, name: string): Promise<string> => {
    const s = await settlements.create({
      ownerId: PLAYER,
      landscapeSeed: source.seed,
      layerVersions: source.versions,
      worldCell: { x, y: GRID_Y },
    });
    const v = await villages.create(s!.id, name, state);
    return v!.id;
  };
  // ves hráče a jeho hradiště – kopie zdroje (hradiště je ves vlastního rodu s opevněním)
  const villageId = await place(0, 'Měřená');
  const hillfortId = await place(1, 'Hradiště');
  const home = { villageId: 'army-home', cell: { x: -1, y: GRID_Y }, pos: { x: 0, z: 0 } };
  const [war] = (
    await db.$client.query<{ id: string }>(
      `insert into war (house_low, house_high, how, started_at, started_day, last_clash_day)
       values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'ambush', now(), $3, $3)
       returning id`,
      [hp.id, ha.id, state.lastDay],
    )
  ).rows;
  // poledne dne po posledním spočteném dni vsi
  const tick =
    Math.ceil((realTimeOf(dateOfDayIndex(state.lastDay + 1), world) - world.startMs) / 250) + 100;
  const member = (personId: number): CampaignMember => ({
    ref: { villageId: home.villageId, personId },
    playerId: ARMY,
    line: personId === 1,
    mounted: false,
    forced: false,
    strength: 1,
    health: 100,
    vigor: 1,
    wounded: false,
    group: Math.floor((personId - 1) / 20),
    status: 'active',
  });
  const base = newCampaign(
    {
      id: crypto.randomUUID(),
      warId: war!.id,
      seed: 7,
      tick,
      playerId: ARMY,
      leaderName: 'Bořivoj',
      commander: { villageId: home.villageId, personId: 1 },
      deputy: { villageId: home.villageId, personId: 2 },
      assembly: home,
      target: { villageId, cell: { x: 0, y: GRID_Y }, pos: { x: 0, z: 0 } },
      members: Array.from({ length: 60 }, (_, i) => member(i + 1)),
      foodKg: 600,
      liveCommand: false,
    },
    world,
  );
  const at = { x: -900, z: 0 };
  const campaign: CampaignState = {
    ...base,
    phase: 'marching',
    groups: base.groups.map((g) => ({
      ...g,
      cell: { x: 0, y: GRID_Y },
      pos: { ...at },
      goal: { cell: { x: 0, y: GRID_Y }, pos: { x: 0, z: 0 } },
      route: [],
      arrived: false,
    })),
    alarm: {
      villages: [
        {
          villageId,
          owner: { playerId: PLAYER, npc: false, houseId: hp.id },
          seenTick: tick - 10,
          seenAt: { cell: { x: 0, y: GRID_Y }, pos: { ...at } },
          warnTick: tick - 5,
          by: 'villager',
          hosts: [hillfortId],
        },
      ],
      messengers: [],
      flights: [],
      nextRef: 0,
    },
  };
  await campaigns.create(campaign, now);

  const cells = createCampaignCells({
    settlements,
    villages,
    landscapes: cachedLandscapes(4),
    worldSeed: 1,
  });
  const input = { playerId: PLAYER, villageId, today: state.lastDay + 1 };
  console.log(`ves ${(source.state.length / 1e6).toFixed(2)} MB, ${ROUNDS} dotazů`);
  const variants: [string, boolean][] = [
    ['před (paměť na dotaz)', false],
    ['po (paměť přes dotazy)', true],
  ];
  for (const [name, memo] of variants) {
    const parts = new Parts();
    const deps: AlarmViewDeps = {
      houses: parts.wrap('houses', houses),
      settlements: parts.wrap('settlements', settlements),
      villages: cachedVillages(parts.wrap('villages', villages)),
      stewardships: parts.wrap('stewardships', createStewardshipRepository(db)),
      campaigns: parts.wrap('campaigns', campaigns),
      cells: parts.wrap('cells', cells),
      world,
      alarmOwners: parts.wrap('alarmOwners', createAlarmOwners(db)),
      ...(memo ? { grids: new MarchGridMemo() } : {}),
    };
    const memory = new VillageMemory(8);
    const query = (): ReturnType<typeof villageAlarmView> =>
      memo
        ? withVillageMemory(memory, () => villageAlarmView(deps, input))
        : withVillageCache(() => villageAlarmView(deps, input));
    const times: number[] = [];
    let first = '';
    for (let round = 0; round <= ROUNDS; round++) {
      if (round === 1) {
        parts.time.clear();
        parts.calls.clear();
      }
      const t = performance.now();
      const view = await query();
      const dt = performance.now() - t;
      if (round === 0) {
        first = `1. dotaz ${ms(dt)}, varovaná: ${view?.warned}, hradiště: ${view?.host?.name ?? '–'}`;
      } else times.push(dt);
    }
    const io = [...parts.time.values()].reduce((a, b) => a + b, 0) / ROUNDS;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`${name}: ${first}`);
    console.log(`  další dotazy: průměr ${ms(avg)}, medián ${ms(median(times))}`);
    console.log(`  z toho úložiště ${ms(io)}, výpočet ${ms(avg - io)}`);
    for (const [label, total] of [...parts.time].sort((a, b) => b[1] - a[1])) {
      const n = (parts.calls.get(label) ?? 0) / ROUNDS;
      console.log(`  ${label.padEnd(30)} ${ms(total / ROUNDS).padStart(9)}  (${n}× za dotaz)`);
    }
  }
  await db.$client.end();
}

await main();
