// Souběh web × worker (docs/superpowers/plans/2026-10-31-worker.md – 6. Testy): dva „procesy“
// s vlastními pooly (hlavní i pool zámků – advisory zámky patří spojení) nad stejnými hráči
// v `bohemia_test`. Worker točí `advanceWorldStep`, web současně dotazy (`dynastyForVillage`)
// a akce (pole, přejmenování), hodiny jdou o den za takt. Ověřuje se, že žádný den vsi se
// nespočítal dvakrát, žádná akce se neztratila a výsledek = dopočet jedním procesem v paměti.
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createSettlementRepository,
  createVillageRepository,
  createWorldQueue,
  schema,
} from '@bohemia/db';
import {
  CURRENT_LAYER_VERSIONS,
  advanceWorldStep,
  dayIndexOf,
  dynastyForVillage,
  foundVillageForSettlement,
  loadVillage,
  placeField,
  renameVillage,
  type LandscapeSource,
  type PlayerLock,
  type TileCell,
  type VillageRepository,
  type VillageState,
  type WorldStepDeps,
} from '@bohemia/game';
import { InMemoryVillages } from '../../../game/src/application/__tests__/in-memory-villages';
import {
  block,
  makeLandscape,
} from '../../../game/src/domain/village/__tests__/placement-fixtures';
import { createPlayerLocks, seeds } from '../deps';
import { cachedVillages, withVillageCache } from '../village-cache';

const URL = 'postgres://postgres@127.0.0.1:5432/bohemia_test';
const START = dayIndexOf({ year: 520, month: 3, day: 1 });
const DAYS = 200;
const END = START + DAYS;
/** Takt hodin – den světa (ms). */
const TICK_MS = 12;
const landscape = makeLandscape();
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
/** Hráči a kolik vsí mají (každá na vlastní mapě – ves samotná na mapě). */
const PLAYERS: [string, number][] = [
  ['hrac-a', 1],
  ['hrac-b', 2],
  ['hrac-c', 1],
];
/**
 * Pole, která web postupně zakládá – nejmenší pole má 5 čtverců (políčka 15 m; první pole a zemnice
 * zabírají střed). Když se pole nevejde, akce se odmítne a stav vsi nezmění.
 */
const FIELDS: TileCell[][] = [
  block(10, 6, 2, 3),
  block(6, 10, 3, 2),
  block(12, 12, 3, 2),
  block(1, 12, 3, 2),
  block(12, 1, 3, 2),
  block(1, 1, 3, 2),
];
const NAMES = ['Lhota', 'Kouřim', 'Žatec', 'Budeč', 'Libice'];

const setup = createDatabase(URL);

/** Pokus o uložení vsi – úsek dnů `from` → `to`; `ok: false` = konflikt verze. */
interface SaveAttempt {
  process: 'web' | 'worker';
  villageId: string;
  from: number;
  to: number;
  ok: boolean;
}

/** Úložiště vsí obou procesů zapisuje každý pokus o uložení (den před → po) do `log`. */
class SaveLog {
  readonly attempts: SaveAttempt[] = [];
  /** Den, do kterého byla ves dopočítaná v každé uložené verzi. */
  private readonly days = new Map<string, Map<number, number>>();

  remember(villageId: string, version: number, lastDay: number): void {
    const days = this.days.get(villageId) ?? new Map<number, number>();
    days.set(version, lastDay);
    this.days.set(villageId, days);
  }

  wrap(inner: VillageRepository, process: SaveAttempt['process']): VillageRepository {
    return {
      ...inner,
      find: (id) => inner.find(id),
      listBySettlement: (id) => inner.listBySettlement(id),
      create: (...args) => inner.create(...args),
      findByOrigin: (origin) => inner.findByOrigin(origin),
      addOnce: (...args) => inner.addOnce(...args),
      rename: (id, name) => inner.rename(id, name),
      stampsOf: (ids) => inner.stampsOf(ids),
      weatherSeedOf: (id) => inner.weatherSeedOf(id),
      save: async (villageId, state, expectedVersion) => {
        const from = this.days.get(villageId)?.get(expectedVersion);
        if (from === undefined) throw new Error(`Neznámá verze ${expectedVersion} vsi.`);
        const saved = await inner.save(villageId, state, expectedVersion);
        this.attempts.push({ process, villageId, from, to: state.lastDay, ok: saved !== null });
        if (saved) this.remember(villageId, saved.version, state.lastDay);
        return saved;
      },
    };
  }
}

/** Web s vypnutým zámkem hráče v DB (pojistka verzí) – fronta v procesu zůstává. */
const NO_LOCK: PlayerLock = {
  run: (_playerId, run) => run(),
  tryRun: async (_playerId, run) => ({ ran: true, value: await run() }),
};

/** Jeden „proces“: vlastní pool dotazů i zámků, úložiště vsí s pamětí na požadavek a záznamem. */
function processDeps(
  log: SaveLog,
  process: SaveAttempt['process'],
  options: { lockPool: number; lock: boolean },
): { deps: WorldStepDeps; close: () => Promise<void> } {
  const db = createDatabase(URL);
  const locks = createPlayerLocks(URL, options.lockPool);
  const deps: WorldStepDeps = {
    settlements: createSettlementRepository(db),
    villages: cachedVillages(log.wrap(createVillageRepository(db), process)),
    landscapes,
    seeds: seeds(),
    locks: options.lock ? locks.locks : NO_LOCK,
    queue: createWorldQueue(db),
  };
  return {
    deps,
    close: async () => {
      await locks.close();
      await db.$client.end();
    },
  };
}

/** Fronta operací hráče v procesu webu (`exclusive` v `apps/web/lib/exclusive.ts`). */
function inProcessQueue(): <T>(playerId: string, run: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(playerId: string, run: () => Promise<T>): Promise<T> => {
    const result = (tails.get(playerId) ?? Promise.resolve()).then(run);
    tails.set(
      playerId,
      result.catch(() => undefined),
    );
    return result;
  };
}

/** Náhoda testu ze seedu (mulberry32) – stejné rozhodování webu při každém běhu. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** JSON se seřazenými klíči – `jsonb` v Postgresu pořadí klíčů mění. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sort(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))));
}

/** Založená ves hráče v DB (stav, jak ho uložila databáze) – výchozí bod obou dopočtů. */
interface Seeded {
  playerId: string;
  villageId: string;
  state: VillageState;
}

async function seedPlayers(log: SaveLog): Promise<Seeded[]> {
  const settlements = createSettlementRepository(setup);
  const villages = createVillageRepository(setup);
  const seeded: Seeded[] = [];
  for (const [playerId, count] of PLAYERS) {
    for (let i = 0; i < count; i++) {
      const place = {
        ownerId: playerId,
        landscapeSeed: 11 + i,
        layerVersions: CURRENT_LAYER_VERSIONS,
      };
      const settlement =
        i === 0
          ? await settlements.createSeat(place)
          : await settlements.create({ ...place, worldCell: { x: i, y: 0 } });
      let seed = 4242 + seeded.length;
      const founded = await foundVillageForSettlement(
        { villages, seeds: { nextSeed: () => seed++ } },
        {
          settlementId: settlement!.id,
          landscape,
          today: START,
          name: NAMES[seeded.length]!,
          dwelling: { x: -50, z: -50, rotation: 0 },
          fieldCells: block(6, 6, 4, 4),
        },
      );
      if (!founded.ok) throw new Error(founded.reason);
      const record = (await villages.find(founded.village.id))!;
      log.remember(record.id, record.version, record.state.lastDay);
      seeded.push({ playerId, villageId: record.id, state: record.state });
    }
  }
  return seeded;
}

/** Akce webu, která prošla – den, do kterého byla ves při akci dopočítaná. */
type Action =
  | { villageId: string; day: number; kind: 'field'; cells: TileCell[] }
  | { villageId: string; day: number; kind: 'rename'; name: string };

interface RaceResult {
  seeded: Seeded[];
  log: SaveLog;
  actions: Action[];
  views: number;
  busy: number;
  failed: string[];
  final: Map<string, { name: string; state: VillageState }>;
}

async function race(webLock: boolean): Promise<RaceResult> {
  const log = new SaveLog();
  const seeded = await seedPlayers(log);
  const worker = processDeps(log, 'worker', { lockPool: 2, lock: true });
  const web = processDeps(log, 'web', { lockPool: 20, lock: webLock });
  const clock = { day: START };
  const actions: Action[] = [];
  const failed: string[] = [];
  const nextField = new Map<string, number>();
  let views = 0;
  let busy = 0;
  let running = true;

  const workerLoop = async (): Promise<void> => {
    while (running) {
      const step = await advanceWorldStep(worker.deps, {
        worldDay: clock.day,
        stepDays: 5,
        limit: 10,
      });
      for (const p of step.players) {
        if (p.outcome === 'busy') busy++;
        if (p.outcome === 'failed') failed.push(`worker ${p.playerId}: ${String(p.error?.cause)}`);
      }
      await sleep(step.idle ? 3 : 0);
    }
  };

  const queue = inProcessQueue();
  const request = async (rnd: () => number): Promise<void> => {
    const village = seeded[Math.floor(rnd() * seeded.length)]!;
    const roll = rnd();
    const { playerId, villageId } = village;
    await queue(playerId, () =>
      web.deps.locks.run(playerId, () =>
        withVillageCache(async () => {
          // den se čte až pod zámkem jako ve webu (`guardedAction` → `context`)
          const today = clock.day;
          const status = await dynastyForVillage(web.deps, { playerId, villageId, today });
          if (status.gameOver) throw new Error(`Konec rodu ${playerId}.`);
          if (roll < 0.6) {
            views++;
          } else if (roll < 0.8) {
            const name = NAMES[Math.floor(rnd() * NAMES.length)]!;
            const done = await renameVillage(web.deps, { villageId, today, name, landscape });
            if (done.ok)
              actions.push({ villageId, day: done.village.state.lastDay, kind: 'rename', name });
          } else {
            const index = nextField.get(villageId) ?? 0;
            const cells = FIELDS[index % FIELDS.length]!;
            nextField.set(villageId, index + 1);
            const done = await placeField(web.deps, { villageId, today, landscape, cells });
            if (done.ok)
              actions.push({ villageId, day: done.village.state.lastDay, kind: 'field', cells });
          }
        }),
      ),
    );
  };
  const webLoop = async (seed: number): Promise<void> => {
    const rnd = random(seed);
    while (running) {
      await request(rnd).catch((error: unknown) => failed.push(`web: ${String(error)}`));
      await sleep(Math.floor(rnd() * 8));
    }
  };

  const loops = [workerLoop(), webLoop(1), webLoop(2), webLoop(3)];
  for (let day = 1; day <= DAYS; day++) {
    await sleep(TICK_MS);
    clock.day = START + day;
  }
  running = false;
  await Promise.all(loops);
  // dorovnání: worker dožene všechny vsi do posledního dne
  for (let round = 0; round < 100; round++) {
    const step = await advanceWorldStep(worker.deps, { worldDay: END, stepDays: 50, limit: 10 });
    if (step.idle) break;
  }
  const final = new Map<string, { name: string; state: VillageState }>();
  for (const { villageId } of seeded) {
    const record = (await worker.deps.villages.find(villageId))!;
    final.set(villageId, { name: record.name, state: record.state });
  }
  await Promise.all([worker.close(), web.close()]);
  return { seeded, log, actions, views, busy, failed, final };
}

/** Jeden proces v paměti: tytéž vsi, tytéž akce v tytéž dny, pak dopočet do posledního dne. */
async function reference(
  result: RaceResult,
): Promise<Map<string, { name: string; state: VillageState }>> {
  const villages = new InMemoryVillages();
  const deps = { villages };
  const ids = new Map<string, string>();
  for (const [i, s] of result.seeded.entries()) {
    ids.set(s.villageId, (await villages.add(`mapa-${i}`, NAMES[i]!, s.state)).id);
  }
  const names = new Map<string, string>();
  for (const action of result.actions) {
    const villageId = ids.get(action.villageId)!;
    const input = { villageId, today: action.day, landscape };
    const done =
      action.kind === 'field'
        ? await placeField(deps, { ...input, cells: action.cells })
        : await renameVillage(deps, { ...input, name: action.name });
    expect(done.ok).toBe(true);
    if (action.kind === 'rename') names.set(action.villageId, action.name);
  }
  const final = new Map<string, { name: string; state: VillageState }>();
  for (const [i, s] of result.seeded.entries()) {
    const record = await loadVillage(deps, {
      villageId: ids.get(s.villageId)!,
      today: END,
      landscape,
    });
    final.set(s.villageId, { name: names.get(s.villageId) ?? NAMES[i]!, state: record!.state });
  }
  return final;
}

/** Spočítané dny každé vsi (všechny pokusy o uložení) a uložené úseky, které na sebe navazují. */
function checkSegments(result: RaceResult): Map<string, number> {
  const computed = new Map<string, number>();
  for (const { villageId } of result.seeded) {
    const attempts = result.log.attempts.filter((a) => a.villageId === villageId);
    let day = START;
    for (const saved of attempts.filter((a) => a.ok)) {
      // uložené úseky navazují: každý začíná, kde skončil předchozí, a nikdy nejde zpět
      expect(saved.from).toBe(day);
      expect(saved.to).toBeGreaterThanOrEqual(saved.from);
      day = saved.to;
    }
    expect(day).toBe(END);
    computed.set(
      villageId,
      attempts.reduce((sum, a) => sum + (a.to - a.from), 0),
    );
  }
  return computed;
}

beforeAll(async () => {
  await migrate(setup, {
    migrationsFolder: path.join(import.meta.dirname, '../../../db/drizzle'),
  });
});

beforeEach(async () => {
  await setup.execute(sql`TRUNCATE "user" CASCADE`);
  await setup
    .insert(schema.user)
    .values(PLAYERS.map(([id]) => ({ id, name: '', email: `${id}@example.com` })));
});

afterAll(async () => {
  await setup.$client.end();
});

describe('souběh web × worker nad bohemia_test', () => {
  it('se zámkem hráče: nic dvakrát, žádný konflikt verze, výsledek = jeden proces', async () => {
    const result = await race(true);
    expect(result.failed).toEqual([]);
    // oba procesy opravdu pracovaly souběžně
    expect(result.log.attempts.some((a) => a.process === 'worker' && a.to > a.from)).toBe(true);
    expect(result.log.attempts.some((a) => a.process === 'web' && a.to > a.from)).toBe(true);
    expect(result.views).toBeGreaterThan(10);
    // worker narazil na zámek, který držel web, a hráče přeskočil (nikdy nečeká)
    expect(result.busy).toBeGreaterThan(0);
    expect(result.actions.some((a) => a.kind === 'field')).toBe(true);
    // zámek řadí: žádné uložení nenarazilo na verzi, každý den vsi se spočítal jednou
    expect(result.log.attempts.filter((a) => !a.ok)).toEqual([]);
    for (const days of checkSegments(result).values()) expect(days).toBe(DAYS);
    const expected = await reference(result);
    for (const [villageId, village] of result.final) {
      const want = expected.get(villageId)!;
      expect(village.name).toBe(want.name);
      expect(canonical(village.state)).toBe(canonical(want.state));
    }
  });

  it('bez zámku webu chrání ves verze: konflikty smí být, nic se neztratí ani nerozbije', async () => {
    const result = await race(false);
    expect(result.failed).toEqual([]);
    const computed = checkSegments(result);
    // bez zámku se může počítat dvakrát (konflikt verze → `updateVillage` zopakuje), nikdy méně
    for (const days of computed.values()) expect(days).toBeGreaterThanOrEqual(DAYS);
    const expected = await reference(result);
    for (const [villageId, village] of result.final) {
      const want = expected.get(villageId)!;
      expect(village.name).toBe(want.name);
      expect(canonical(village.state)).toBe(canonical(want.state));
    }
  });
});
