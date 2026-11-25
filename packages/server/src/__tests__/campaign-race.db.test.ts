// Souběh vsí a tažení – bariéra dopočtu (plán 2026-11-03 – Úloha 6.7, rozhodnutí 13): worker vsí
// (`advanceWorldStep`), smyčka tažení (`stepCampaigns`) a web (`loadVillage`) běží současně nad
// `bohemia_test` s vlastními pooly, hodiny jdou po taktech. Konečné stavy vsí i tažení = tentýž
// scénář jedním procesem po sobě; vše doběhne do pár sekund (žádný cyklus čekání); ves s cizím
// vojskem na mapě dostane dny nájezdu, cíl posla; ves daleko od tažení se dopočítá jako dřív.
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCampaignLock,
  createCampaignRepository,
  createDatabase,
  createHouseRepository,
  createJourneyRepository,
  createLockPool,
  createNoticeRepository,
  createSettlementRepository,
  createVillageRepository,
  createWarRepository,
  createWorldQueue,
  schema,
} from '@bohemia/db';
import { testDatabaseUrl } from '@bohemia/db/test-database';
import {
  CURRENT_LAYER_VERSIONS,
  advanceWorldStep,
  dayOfTick,
  foundVillageForSettlement,
  loadVillage,
  newCampaign,
  newJourney,
  realTimeOf,
  newCampaignMemory,
  stepCampaigns,
  tickOfMs,
  villageWatchers,
  type CampaignState,
  type JourneyState,
  type LandscapeSource,
  type StepCampaignsDeps,
  type VillageState,
  type WorldStepDeps,
} from '@bohemia/game';
import {
  block,
  makeLandscape,
} from '../../../game/src/domain/village/__tests__/placement-fixtures';
import { createCampaignCells } from '../campaign-cells';
import { createPlayerLocks } from '../deps';
import { currentWorld, worldSeed } from '../world';
import { cachedVillages } from '../village-cache';

const URL = testDatabaseUrl();
const world = currentWorld();
const DATE = { year: 520, month: 6, day: 1 };
/** První takt scénáře – kousek po začátku dne `D0`. */
const T0 = tickOfMs(realTimeOf(DATE, world) + 10_000, world);
const D0 = dayOfTick(T0, world);
/** Délka scénáře v taktech (≈ 4 herní dny) a krok hodin. */
const TICKS = 1400;
const STEP = 40;
const landscape = makeLandscape();
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const NOW = new Date('2026-11-07T12:00:00Z');
const CAMPAIGN_ID = '00000000-0000-4000-8000-00000000c0c0';

/** Vsi scénáře: útočník (Brod), obránce se dvěma vsemi vedle sebe, třetí hráč daleko. */
const PLACES = [
  { label: 'brod', owner: 'a', cell: { x: 0, y: 0 }, seed: 11 },
  { label: 'vlkov', owner: 'd', cell: { x: 1, y: 0 }, seed: 12 },
  { label: 'knezice', owner: 'd', cell: { x: 2, y: 0 }, seed: 13 },
  { label: 'daleko', owner: 'c', cell: { x: 9, y: 9 }, seed: 14 },
] as const;
type Label = (typeof PLACES)[number]['label'];

const setup = createDatabase(URL);

beforeAll(async () => {
  await migrate(setup, { migrationsFolder: path.join(import.meta.dirname, '../../../db/drizzle') });
});

afterAll(async () => {
  await setup.$client.end();
});

/** Čerstvý svět: hráči, rody, válka a/d, sídla se vsemi (den `D0 − 1`) a tažení na mapě Vlkova. */
async function seedWorld(): Promise<Map<Label, string>> {
  await setup.execute(sql`TRUNCATE "user" CASCADE`);
  await setup
    .insert(schema.user)
    .values(['a', 'd', 'c'].map((id) => ({ id, name: '', email: `${id}@example.com` })));
  const houses = createHouseRepository(setup);
  const a = await houses.create({ playerId: 'a', kind: 'player', createdAt: NOW });
  const d = await houses.create({ playerId: 'd', kind: 'player', createdAt: NOW });
  await houses.create({ playerId: 'c', kind: 'player', createdAt: NOW });
  const war = await createWarRepository(setup).start({
    houses: [a.id, d.id],
    startedAt: NOW,
    startedDay: D0 - 10,
    how: 'declared',
  });
  const settlements = createSettlementRepository(setup);
  const villages = createVillageRepository(setup, worldSeed());
  const ids = new Map<Label, string>();
  let seed = 4242;
  for (const place of PLACES) {
    const settlement =
      place.owner === 'd' && place.label === 'knezice'
        ? await settlements.create({
            ownerId: place.owner,
            landscapeSeed: place.seed,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: place.cell,
          })
        : await settlements.createSeat({
            ownerId: place.owner,
            landscapeSeed: place.seed,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: place.cell,
          });
    // seed počasí kraje je v DB náhodný (`random()`) – oba světy scénáře ho musí mít stejný
    await setup.execute(
      sql`UPDATE settlement SET weather_seed = ${place.seed * 7919} WHERE id = ${settlement!.id}`,
    );
    const founded = await foundVillageForSettlement(
      { villages, seeds: { nextSeed: () => seed++ } },
      {
        settlementId: settlement!.id,
        landscape,
        today: D0 - 1,
        name: place.label,
        dwelling: { x: -50, z: -50, rotation: 0 },
        fieldCells: block(6, 6, 4, 4),
      },
    );
    if (!founded.ok) throw new Error(founded.reason);
    ids.set(place.label, founded.village.id);
  }
  const brod = (await villages.find(ids.get('brod')!))!.state;
  const men = brod.people.filter((p) => p.sex === 'male').slice(0, 2);
  const state = newCampaign(
    {
      id: CAMPAIGN_ID,
      warId: war.war.id,
      seed: 99,
      tick: T0,
      playerId: 'a',
      leaderName: 'Bořivoj',
      commander: { villageId: ids.get('brod')!, personId: men[0]!.id },
      deputy: null,
      assembly: { villageId: ids.get('brod')!, cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } },
      target: { villageId: ids.get('knezice')!, cell: { x: 2, y: 0 }, pos: { x: -700, z: 0 } },
      members: men.map((p) => ({
        ref: { villageId: ids.get('brod')!, personId: p.id },
        playerId: 'a',
        line: false,
        mounted: false,
        forced: false,
        strength: 0.4,
        health: 100,
        vigor: 1,
        wounded: false,
        group: 0,
        status: 'active' as const,
      })),
      foodKg: 200,
      liveCommand: false,
    },
    world,
  );
  // vojsko už táhne – stojí na mapě Vlkova na dohled domů (dům −50, −50), míří na Kněžice;
  // war.md – Varování, 9. 11. 2026: dny nájezdu až od varování – vesničan ho spatří hned
  const marching: CampaignState = { ...state, phase: 'marching' };
  for (const g of marching.groups) {
    g.cell = { x: 1, y: 0 };
    g.pos = { x: 60, z: 0 };
    g.goal = { cell: { x: 2, y: 0 }, pos: { x: -700, z: 0 } };
    g.route = [{ x: 2, y: 0 }];
  }
  await createCampaignRepository(setup).create(marching, NOW);
  return ids;
}

/** Porty jednoho „procesu“ – vlastní pool dotazů a zámků. */
function processDeps(): {
  world: WorldStepDeps;
  campaigns: Omit<StepCampaignsDeps, 'world'>;
  close: () => Promise<void>;
} {
  const db = createDatabase(URL);
  const locks = createPlayerLocks(URL, 2);
  const lockPool = createLockPool(URL, 2);
  const settlements = createSettlementRepository(db);
  const villages = cachedVillages(createVillageRepository(db, worldSeed()));
  const plain = createVillageRepository(db, worldSeed());
  const deps: WorldStepDeps = {
    settlements,
    villages,
    landscapes,
    worldSeed: worldSeed(),
    locks: locks.locks,
    queue: createWorldQueue(db),
  };
  const campaigns: Omit<StepCampaignsDeps, 'world'> = {
    campaigns: createCampaignRepository(db),
    campaignLock: createCampaignLock(lockPool),
    cells: createCampaignCells({
      settlements,
      villages: plain,
      landscapes,
      worldSeed: worldSeed(),
    }),
    villages: plain,
    notices: createNoticeRepository(db),
    watchers: villageWatchers({
      villages: plain,
      settlements,
      houses: createHouseRepository(db),
      vassalages: { edgesNear: async () => [] },
    }),
    // jako worker: poslední spočtený stav a mřížky pochodu napříč koly (worker.md – Výkon)
    memory: newCampaignMemory(),
  };
  return {
    world: deps,
    campaigns,
    close: async () => {
      await locks.close();
      await lockPool.end();
      await db.$client.end();
    },
  };
}

const msOf = (tick: number): number => world.startMs + tick * 250 + 1;
const dayAt = (tick: number): number => dayOfTick(tick, world);

/** Jedno kolo smyčky tažení a workeru vsí do taktu `tick`. */
async function round(
  p: ReturnType<typeof processDeps>,
  tick: number,
): Promise<{ moved: number; outcomes: string[] }> {
  const results = await stepCampaigns({ ...p.campaigns, world }, { nowMs: msOf(tick) });
  const step = await advanceWorldStep(p.world, {
    worldDay: dayAt(tick),
    stepDays: 10,
    limit: 10,
  });
  return { moved: step.days, outcomes: results.map((r) => r.outcome) };
}

/** Kola, dokud se nic nehne (tažení i vsi doběhly, co smějí). */
async function settle(p: ReturnType<typeof processDeps>, tick: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const r = await round(p, tick);
    if (r.moved === 0 && r.outcomes.every((o) => o === 'idle' || o === 'waiting')) {
      const again = await round(p, tick);
      if (again.moved === 0 && again.outcomes.every((o) => o === 'idle')) return;
    }
  }
  throw new Error('Scénář se neustálil – cyklus čekání?');
}

/** Konečný stav světa: vsi a tažení s id nahrazenými jmenovkami (JSON se seřazenými klíči). */
async function snapshot(ids: Map<Label, string>): Promise<{
  villages: Record<Label, string>;
  states: Record<Label, VillageState>;
  campaign: string;
  inbox: { label: Label; day: number; kind: string }[];
}> {
  const villages = createVillageRepository(setup, worldSeed());
  const relabel = (text: string): string => {
    let out = text;
    for (const [label, id] of ids) out = out.split(id).join(label);
    return out;
  };
  const canonical = (value: unknown): string => {
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
    return relabel(JSON.stringify(sort(JSON.parse(JSON.stringify(value)))));
  };
  const states = {} as Record<Label, VillageState>;
  const out = {} as Record<Label, string>;
  for (const [label, id] of ids) {
    const state = (await villages.find(id))!.state;
    states[label] = state;
    out[label] = canonical(state);
  }
  const checkpoint = await createCampaignRepository(setup).checkpoint(CAMPAIGN_ID);
  const rows = await setup.execute<{ village_id: string; day: number; kind: string }>(
    sql`SELECT village_id, day, body->>'kind' AS kind FROM village_inbox ORDER BY village_id, day, seq`,
  );
  const labelOf = new Map([...ids].map(([l, id]) => [id, l]));
  return {
    villages: out,
    states,
    // id války se v každém běhu liší (náhodné uuid)
    campaign: canonical({ ...checkpoint?.state, warId: 'war' }),
    // id vsí jsou náhodná uuid – pořadí podle jmenovky, uvnitř vsi podle dne a pořadí doručení
    inbox: rows.rows
      .map((r) => ({ label: labelOf.get(r.village_id)!, day: r.day, kind: r.kind }))
      .sort(
        (x, y) =>
          PLACES.findIndex((p) => p.label === x.label) -
          PLACES.findIndex((p) => p.label === y.label),
      ),
  };
}

describe('souběh vsí a tažení – bariéra (Úloha 6.7)', () => {
  it('worker vsí + smyčka tažení + web = jeden proces; žádný cyklus čekání', async () => {
    // jeden proces po sobě: hodiny po krocích, v každém kroku vše doběhne
    const ids1 = await seedWorld();
    const single = processDeps();
    for (let tick = T0 + STEP; tick <= T0 + TICKS; tick += STEP) await settle(single, tick);
    const reference = await snapshot(ids1);
    await single.close();

    // souběh: hodiny jedou, worker, tažení a web každý ve vlastní smyčce a s vlastním poolem
    const ids2 = await seedWorld();
    const worker = processDeps();
    const campaignProcess = processDeps();
    const web = processDeps();
    let now = T0;
    let running = true;
    const started = Date.now();
    const loops = [
      (async () => {
        while (running) {
          await advanceWorldStep(worker.world, { worldDay: dayAt(now), stepDays: 10, limit: 10 });
          await sleep(1);
        }
      })(),
      (async () => {
        while (running) {
          await stepCampaigns({ ...campaignProcess.campaigns, world }, { nowMs: msOf(now) });
          await sleep(1);
        }
      })(),
      (async () => {
        const order = [...ids2.values()];
        for (let i = 0; running; i++) {
          await loadVillage(web.world, {
            villageId: order[i % order.length]!,
            today: dayAt(now),
            landscape,
          });
          await sleep(2);
        }
      })(),
    ];
    for (let tick = T0 + STEP; tick <= T0 + TICKS; tick += STEP) {
      now = tick;
      await sleep(30);
    }
    running = false;
    await Promise.all(loops);
    await settle(worker, now);
    const raced = await snapshot(ids2);
    const seconds = (Date.now() - started) / 1000;
    await Promise.all([worker.close(), campaignProcess.close(), web.close()]);

    expect(seconds).toBeLessThan(60);
    expect(JSON.parse(raced.campaign)).toEqual(JSON.parse(reference.campaign));
    for (const place of PLACES) {
      expect({ [place.label]: JSON.parse(raced.villages[place.label]) as unknown }).toEqual({
        [place.label]: JSON.parse(reference.villages[place.label]) as unknown,
      });
    }
    expect(raced.inbox).toEqual(reference.inbox);

    // tažení doběhlo do konce hodin; vsi u něj stojí na jeho mezi, ves daleko na dnešku
    const campaign = JSON.parse(raced.campaign) as CampaignState;
    expect(campaign.tick).toBe(T0 + TICKS);
    const end = dayAt(T0 + TICKS);
    expect(raced.states.daleko.lastDay).toBe(end);
    for (const label of ['brod', 'vlkov', 'knezice'] as const) {
      expect(raced.states[label].lastDay).toBe(campaign.throughDay);
    }

    // Vlkov: vesničan vojsko na mapě spatřil – signál hrozby a dny nájezdu (ten den ves nepracuje)
    const vlkov = raced.inbox.filter((e) => e.label === 'vlkov');
    expect(vlkov.slice(0, 2)).toEqual([
      { label: 'vlkov', day: D0, kind: 'threat-signal' },
      { label: 'vlkov', day: D0, kind: 'raid-day' },
    ]);
    // Kněžice: automatický posel z Vlkova zmizel (war.md – Varování, 9. 11. 2026 – posla posílá
    // hráč nebo správce); vojsko k ní nedošlo
    expect(raced.inbox.some((e) => e.label === 'knezice')).toBe(false);
    expect(raced.states.knezice.armySeen).toBeUndefined();
    // ves bez tažení: nic jí nepřišlo a stojí na dnešku jako bez bariéry
    expect(raced.inbox.some((e) => e.label === 'daleko')).toBe(false);
  }, 180_000);
});

// Domovská ves výjezdu vojvody v bariéře (závěrečná recenze – Important 3): výjezd čte domovskou
// ves každý den (`homeDay` – smrt člena doma), takže ves nesmí být napřed před dnem, který má výjezd
// spočtený – jinak by na pořadí smyček workeru záleželo, kdy výjezd smrt pozná.
describe('souběh vsí a výjezdu – domovská ves v bariéře', () => {
  it('worker vsí domovskou ves nedopočte za throughDay výjezdu, ostatní vsi do dneška', async () => {
    const ids = await seedWorld();
    await setup.execute(sql`DELETE FROM campaign`);
    const home = ids.get('daleko')!;
    const village = (await createVillageRepository(setup, worldSeed()).find(home))!.state;
    const lord = village.people.find((p) => p.sex === 'male')!;
    const journey = newJourney(
      {
        id: '00000000-0000-4000-8000-00000000d0d0',
        seed: 7,
        playerId: 'c',
        houseId: (await createHouseRepository(setup).activeOf('c'))!.id,
        home: { villageId: home, name: 'daleko', cell: { x: 9, y: 9 }, pos: { x: -50, z: -50 } },
        recruits: [
          {
            ref: { villageId: home, personId: lord.id },
            lord: true,
            strength: 1,
            fight: 50,
            name: 'Bořivoj',
          },
        ],
        startMs: msOf(T0),
        order: { kind: 'go', pos: { x: 0, z: 0 } },
      },
      world,
    );
    // skupina daleko od domova (ani políčko vedle) – drží jen pravidlo domovské vsi
    const away: JourneyState = {
      ...journey,
      groups: journey.groups.map((g) => ({ ...g, cell: { x: 5, y: 5 } })),
    };
    await createJourneyRepository(setup).create(away, NOW);
    const p = processDeps();
    try {
      await advanceWorldStep(p.world, { worldDay: D0 + 2, stepDays: 10, limit: 10 });
      const lastDay = async (id: string): Promise<number> =>
        (await createVillageRepository(setup, worldSeed()).find(id))!.state.lastDay;
      expect(await lastDay(home)).toBe(D0 - 1);
      expect(away.throughDay ?? away.day - 1).toBe(D0 - 1);
      expect(await lastDay(ids.get('brod')!)).toBeGreaterThan(D0);
    } finally {
      await p.close();
    }
  }, 60_000);
});
