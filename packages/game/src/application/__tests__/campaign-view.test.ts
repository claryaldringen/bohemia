import { describe, expect, it } from 'vitest';
import type { StreamPoint } from '../../domain/landscape';
import type { CampaignMap, CampaignState, SeenCell, SeenData, SeenPart } from '../../domain/war';
import { tickOfMs } from '../../domain/war';
import type { Dwelling } from '../../domain/village/types';
import { attacker, battle, defender, land } from '../../domain/war/__tests__/battle-fixtures';
import { campaign, member, world } from '../../domain/war/__tests__/campaign-fixtures';
import {
  campaignsOf,
  campaignViewFor,
  commandCampaign as commandCampaignResult,
  type CampaignCommand,
  type TargetDwelling,
} from '../campaign-view';
import type { House } from '../houses';
import type { Settlement } from '../settlements';
import type { VillageRecord, VillageStamp } from '../villages';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryKnowledge } from './in-memory-knowledge';

// Živé vedení a pohled na tažení (plán 2026-11-03 – Úloha 6.14, Review Focus 4): podvržený záměr
// server odmítne a pohled neprozradí nic mimo dohled vlastních mužů.

/** Les na mapě cíle severně od bojiště (z ≈ 80–130 m). */
const forest = (tx: number, ty: number): boolean => tx >= 58 && tx <= 70 && ty >= 69 && ty <= 72;
const TARGET_MAP: CampaignMap = { landscape: land(forest), obstacles: null, villageIds: [] };

const house = (id: number, x: number, z: number): Dwelling =>
  ({ id, type: 'zemnice', position: { x, z, rotation: 0 } }) as unknown as Dwelling;

/** Tažení na mapě cíle: p1 vede živě (muži 0 a 1), vazal p2 má muže 2; tři obránci. */
function raiding(overrides: Partial<CampaignState> = {}): CampaignState {
  const base = campaign({
    members: [member(1, 0, true), member(2, 0, false), { ...member(11, 0, false), playerId: 'p2' }],
  });
  return {
    ...base,
    phase: 'raiding',
    groups: base.groups.map((g) => ({ ...g, cell: { ...base.target.cell }, pos: { x: 0, z: 0 } })),
    battle: battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, mounted: true }),
        attacker(1, { x: 5, z: 0 }),
        attacker(2, { x: -5, z: 0 }),
      ],
      defenders: [
        // v otevřené krajině v dohledu
        defender(101, { x: 100, z: 0 }),
        // v lese 100 m od mužů – les zkrátí dohled na 50 m
        defender(102, { x: 0, z: 100 }),
        // daleko
        defender(103, { x: 400, z: 0 }),
      ],
      commander: 0,
      live: true,
    }),
    discovered: [7],
    ...overrides,
  };
}

/** Pokyn zapsán (true), nebo odmítnut (false) – důvod odmítnutí ověřují testy `unreachable`. */
async function commandCampaign(
  ...args: Parameters<typeof commandCampaignResult>
): Promise<boolean> {
  return (await commandCampaignResult(...args)).queued;
}

async function setup(
  state: CampaignState = raiding(),
  map: CampaignMap = TARGET_MAP,
): Promise<{
  deps: Parameters<typeof commandCampaign>[0];
  campaigns: InMemoryCampaigns;
  nowMs: number;
}> {
  const campaigns = new InMemoryCampaigns();
  await campaigns.create(state);
  const target = {
    id: state.target.villageId,
    state: { dwellings: [house(7, 300, 0), house(8, -500, 0)] },
  } as unknown as VillageRecord;
  const deps = {
    campaigns,
    cells: { mapOf: (): Promise<CampaignMap> => Promise.resolve(map) },
    villages: {
      find: (id: string): Promise<VillageRecord | null> =>
        Promise.resolve(id === target.id ? target : null),
    },
    world,
  };
  return { deps, campaigns, nowMs: world.startMs + state.tick * 250 + 10 };
}

describe('campaignViewFor', () => {
  it('vlastní muži celí, vazal jen poloha, cizí jen v dohledu, stavby jen objevené', async () => {
    const { deps } = await setup();
    const view = await campaignViewFor(deps, { playerId: 'p1', campaignId: 'c1', sinceTick: 0 });
    expect(view).not.toBeNull();
    expect(view!.men.map((m) => m.member)).toEqual([0, 1]);
    expect(view!.men[0]).toMatchObject({ commander: true, health: 100, line: true });
    expect(view!.allies.map((m) => m.member)).toEqual([2]);
    expect(view!.allies[0]).not.toHaveProperty('health');
    // obránce v lese ani daleko pohled nenese
    expect(view!.foreign.map((f) => f.id)).toEqual(['d:101']);
    expect(view!.discovered).toEqual([{ id: 7, type: 'zemnice', pos: { x: 300, z: 0 } }]);
    expect(view!.liveCommand).toBe(true);
    expect(view!.fresh).toBe(true);
    const again = await campaignViewFor(deps, {
      playerId: 'p1',
      campaignId: 'c1',
      sinceTick: view!.tick,
    });
    expect(again!.fresh).toBe(false);
  });

  it('vazal vidí svým mužem a živě nevede; cizí hráč a neznámé tažení = null', async () => {
    const { deps } = await setup();
    const vassal = await campaignViewFor(deps, { playerId: 'p2', campaignId: 'c1', sinceTick: 0 });
    expect(vassal!.men.map((m) => m.member)).toEqual([2]);
    expect(vassal!.liveCommand).toBe(false);
    expect(await campaignViewFor(deps, { playerId: 'p3', campaignId: 'c1', sinceTick: 0 })).toBe(
      null,
    );
    expect(await campaignViewFor(deps, { playerId: 'p1', campaignId: 'xx', sinceTick: 0 })).toBe(
      null,
    );
  });
});

describe('znalost rodu v pohledu na tažení (plán 2026-11-13 – Úloha 11)', () => {
  const part = (key: string, x: number, z: number): SeenPart => ({
    key,
    pos: { x, z },
    day: 3,
    data: { kind: key.split(':')[0] } as SeenData,
  });
  const TARGET_CELL = { x: 1, y: 0 };

  /** Porty se znalostí rodu: vůdce p1 je rod h1 (ve stavu tažení), vazal p2 rod h2. */
  async function withKnowledge(
    state: CampaignState,
    cells: Record<string, SeenCell>,
  ): Promise<Awaited<ReturnType<typeof setup>> & { all: Parameters<typeof commandCampaign>[0] }> {
    const base = await setup(state);
    const knowledge = new InMemoryKnowledge();
    for (const [houseId, seen] of Object.entries(cells)) {
      await knowledge.merge(houseId, TARGET_CELL, seen);
    }
    const houses = {
      activeOf: (playerId: string): Promise<House | null> =>
        Promise.resolve({ id: playerId === 'p2' ? 'h2' : 'h1' } as House),
    };
    return { ...base, all: { ...base.deps, knowledge, houses } };
  }

  it('tažení vidí známé domy dřív, než je kdo z vojska spatří, a rozkaz k nim projde', async () => {
    const known: SeenCell = {
      villageId: 'knezice',
      trail: [[-880, 20]],
      parts: [part('dwelling:8', -500, 0), part('fortification:1', 0, 300)],
    };
    const state = raiding({ discovered: [], houseId: 'h1' });
    const { deps, all, campaigns, nowMs } = await withKnowledge(state, { h1: known });
    const view = await campaignViewFor(all, { playerId: 'p1', campaignId: 'c1', sinceTick: 0 });
    expect(view!.discovered).toEqual([]);
    // stopa k odkrytí mlhy a stavby, jak je rod viděl; opevnění cíle vidí útočník jako dřív
    expect(view!.known).toEqual({ ...known, parts: [known.parts[0]] });
    // bez úložiště znalosti pohled jako dřív – pole chybí
    const blind = await campaignViewFor(deps, { playerId: 'p1', campaignId: 'c1', sinceTick: 0 });
    expect(blind).not.toHaveProperty('known');

    const lead = (id: number): Parameters<typeof commandCampaign>[1] => ({
      playerId: 'p1',
      campaignId: 'c1',
      command: { kind: 'lead', target: { kind: 'building', id } },
      nowMs,
    });
    expect(await commandCampaign(all, lead(8))).toBe(true);
    expect(campaigns.intents.at(-1)!.body).toEqual({
      kind: 'march',
      to: { cell: TARGET_CELL, pos: { x: -500, z: 0 } },
    });
    // dům, který rod nezná, a známý dům bez úložiště znalosti – odmítnuto
    expect(await commandCampaign(all, lead(9))).toBe(false);
    expect(await commandCampaign(deps, lead(8))).toBe(false);
  });

  it('dům viděný kdysi, který už nestojí, zůstane v pohledu, dokud na jeho místo muži nedohlédnou', async () => {
    // dům 5 už ve vsi není, dům 7 tažení objevilo (pohled ho nese živě), dům 8 stojí
    const cells = {
      h1: {
        villageId: 'knezice',
        trail: [],
        parts: [
          part('dwelling:5', 200, 0),
          part('dwelling:7', 300, 0),
          part('dwelling:8', -500, 0),
        ],
      },
      h2: { trail: [[0, 600]], parts: [part('pen:2', 0, 600)] },
    } satisfies Record<string, SeenCell>;
    const before = await withKnowledge(raiding({ houseId: 'h1' }), cells);
    const old = await campaignViewFor(before.all, {
      playerId: 'p1',
      campaignId: 'c1',
      sinceTick: 0,
    });
    expect(old!.known!.parts.map((p) => p.key)).toEqual(['dwelling:5', 'dwelling:8']);
    // muži tažení stáli 60 m od místa domu 5 (stopa) – dům tam není, z pohledu zmizí; dům 8 stojí
    const looked = raiding({
      houseId: 'h1',
      seen: {
        '1,0': {
          trail: [
            [-480, 0],
            [140, 0],
          ],
          parts: [],
        },
      },
    });
    const after = await withKnowledge(looked, cells);
    const view = await campaignViewFor(after.all, {
      playerId: 'p1',
      campaignId: 'c1',
      sinceTick: 0,
    });
    expect(view!.known!.parts.map((p) => p.key)).toEqual(['dwelling:8']);
    expect(view!.known!.trail).toEqual([
      [-480, 0],
      [140, 0],
    ]);
    // vazal ve službě vidí znalost svého rodu (stopa tažení k ní), ne rodu vůdce
    const vassal = await campaignViewFor(after.all, {
      playerId: 'p2',
      campaignId: 'c1',
      sinceTick: 0,
    });
    expect(vassal!.known!.parts.map((p) => p.key)).toEqual(['pen:2']);
  });

  it('obydlí cílové vsi z mezipaměti po dnech – stav vsi se nečte při každém dotazu', async () => {
    const state = raiding({
      discovered: [7],
      houseId: 'h1',
      seen: { '1,0': { villageId: 'knezice', trail: [[140, 0]], parts: [] } },
    });
    const { deps } = await setup(state);
    let loads = 0;
    const villages = {
      find: (id: string): Promise<VillageRecord | null> => {
        loads++;
        return deps.villages.find(id);
      },
    };
    const targets = new Map<string, readonly TargetDwelling[]>();
    const query = { playerId: 'p1', campaignId: 'c1', sinceTick: 0 };
    const first = await campaignViewFor({ ...deps, villages, targets }, query);
    for (let i = 0; i < 3; i++) await campaignViewFor({ ...deps, villages, targets }, query);
    expect(loads).toBe(1);
    expect([...targets.keys()]).toEqual([`knezice@${state.day}`]);
    expect(first!.discovered.map((b) => b.id)).toEqual([7]);
    // výsledek na mezipaměti nezávisí
    expect(await campaignViewFor({ ...deps, villages }, query)).toEqual(first);
    expect(loads).toBe(2);
  });
});

describe('campaignsOf', () => {
  it('vazal ve službě vidí tažení se svými muži v seznamu, vést smí jen vůdce', async () => {
    const { deps, campaigns } = await setup();
    await campaigns.create({ ...raiding(), id: 'c2', playerId: 'p3', members: [] });
    const lord = await campaignsOf({ campaigns }, { playerId: 'p1' });
    expect(lord).toEqual([
      { id: 'c1', targetName: null, phase: 'raiding', liveCommand: true, leads: true },
    ]);
    const vassal = await campaignsOf({ campaigns }, { playerId: 'p2' });
    expect(vassal).toEqual([
      { id: 'c1', targetName: null, phase: 'raiding', liveCommand: false, leads: false },
    ]);
    // pohled vazala: vlastní muž, vést nesmí
    const view = await campaignViewFor(deps, { playerId: 'p2', campaignId: 'c1', sinceTick: 0 });
    expect(view!.liveCommand).toBe(false);
    const nowMs = world.startMs + raiding().tick * 250 + 10;
    const order: CampaignCommand = { kind: 'order', group: 0, order: 'attack-all' };
    const input = { campaignId: 'c1', command: order, nowMs };
    expect(await commandCampaign(deps, { ...input, playerId: 'p2' })).toBe(false);
    expect(await commandCampaign(deps, { ...input, playerId: 'p1' })).toBe(true);
    // skončené tažení zmizí ze seznamu vůdci i vazalovi
    campaigns.rows.get('c1')!.status = 'done';
    expect(await campaignsOf({ campaigns }, { playerId: 'p2' })).toEqual([]);
    expect(await campaignsOf({ campaigns }, { playerId: 'p1' })).toEqual([]);
  });

  it('staré vojsko – tažení rodu, který skončil (Začít znovu), nová hra vůdce v panelu nevidí', async () => {
    const campaigns = new InMemoryCampaigns();
    const houses = new InMemoryHouses();
    const old = await houses.create({ playerId: 'p1', kind: 'player', createdAt: new Date(0) });
    await campaigns.create({ ...raiding(), houseId: old.id });
    const ids = async (playerId: string): Promise<string[]> =>
      (await campaignsOf({ campaigns, houses }, { playerId })).map((c) => c.id);
    expect(await ids('p1')).toEqual(['c1']);
    await houses.end(old.id, new Date(1), 0);
    await houses.create({ playerId: 'p1', kind: 'player', createdAt: new Date(2) });
    expect(await ids('p1')).toEqual([]);
    // vazal ve službě své muže vidí dál – rod vůdce se ho netýká
    expect(await ids('p2')).toEqual(['c1']);
  });
});

describe('staré vojsko po Začít znovu – pohled i pokyny (war.md – Začít znovu během nájezdu)', () => {
  /**
   * Rod h-old skončil, hráč p1 má nový rod; vazal p2 má muže z vsi `brod` na mapě `m-brod`, kterou
   * drží, dokud `held` (archiv i vzdání mapu vezmou – `listActive` ji nevrátí).
   */
  async function restarted(held = true) {
    const { deps, campaigns, nowMs } = await setup({ ...raiding(), houseId: 'h-old' });
    const houses = new InMemoryHouses();
    const old = await houses.create({ playerId: 'p1', kind: 'player', createdAt: new Date(0) });
    await houses.end(old.id, new Date(1), 0);
    const fresh = await houses.create({ playerId: 'p1', kind: 'player', createdAt: new Date(2) });
    const villages = {
      ...deps.villages,
      stampsOfVillages: (ids: readonly string[]): Promise<VillageStamp[]> =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            settlementId: `m-${id}`,
            name: id,
            version: 1,
            lastDay: 0,
            asleep: false,
          })),
        ),
    };
    const settlements = {
      listActive: (ownerId: string): Promise<Settlement[]> =>
        Promise.resolve(held && ownerId === 'p2' ? [{ id: 'm-brod' } as Settlement] : []),
    };
    return { all: { ...deps, houses, villages, settlements }, campaigns, nowMs, fresh };
  }

  it('vůdce staré hry tažení nevidí a nic do něj nezadá', async () => {
    const w = await restarted();
    const view = { playerId: 'p1', campaignId: 'c1', sinceTick: 0 };
    expect(await campaignViewFor(w.all, view)).toBeNull();
    const order: CampaignCommand = { kind: 'order', group: 0, order: 'attack-all' };
    const input = { playerId: 'p1', campaignId: 'c1', nowMs: w.nowMs };
    expect((await commandCampaignResult(w.all, { ...input, command: order })).queued).toBe(false);
    expect(
      (await commandCampaignResult(w.all, { ...input, command: { kind: 'presence' } })).queued,
    ).toBe(false);
    const choice: CampaignCommand = { kind: 'surrendered', group: 0, choice: 'leave' };
    expect((await commandCampaignResult(w.all, { ...input, command: choice })).queued).toBe(false);
    expect(w.campaigns.intents).toEqual([]);
  });

  it('nová hra vidí a řídí jen vlastní tažení', async () => {
    const w = await restarted();
    await w.campaigns.create({ ...raiding(), id: 'c2', houseId: w.fresh.id });
    const view = (campaignId: string) =>
      campaignViewFor(w.all, { playerId: 'p1', campaignId, sinceTick: 0 });
    expect(await view('c1')).toBeNull();
    expect(await view('c2')).not.toBeNull();
    const order: CampaignCommand = { kind: 'order', group: 0, order: 'attack-all' };
    const queued = await commandCampaignResult(w.all, {
      playerId: 'p1',
      campaignId: 'c2',
      command: order,
      nowMs: w.nowMs,
    });
    expect(queued.queued).toBe(true);
  });

  it('muži vazala ze vsi, kterou už nedrží (archiv i vzdaná ves mimo archiv), v cizím tažení nevidí; jinak ano', async () => {
    const live = await restarted();
    expect(
      await campaignViewFor(live.all, { playerId: 'p2', campaignId: 'c1', sinceTick: 0 }),
    ).not.toBeNull();
    const gone = await restarted(false);
    expect(
      await campaignViewFor(gone.all, { playerId: 'p2', campaignId: 'c1', sinceTick: 0 }),
    ).toBeNull();
    const list = await campaignsOf(
      {
        campaigns: gone.campaigns,
        houses: gone.all.houses,
        villages: gone.all.villages,
        settlements: gone.all.settlements,
      },
      { playerId: 'p2' },
    );
    expect(list).toEqual([]);
  });
});

describe('commandCampaign', () => {
  const lead = (target: Extract<CampaignCommand, { kind: 'lead' }>['target']): CampaignCommand => ({
    kind: 'lead',
    target,
  });
  const place = lead({ kind: 'place', place: { cell: { x: 1, y: 0 }, pos: { x: 50, z: -20 } } });

  it('vlastní velitel jde na místo – záměr na takt teď + 2', async () => {
    const { deps, campaigns, nowMs } = await setup();
    const input = { playerId: 'p1', campaignId: 'c1', nowMs };
    expect(await commandCampaign(deps, { ...input, command: place })).toBe(true);
    expect(campaigns.intents).toHaveLength(1);
    expect(campaigns.intents[0]).toMatchObject({
      tick: tickOfMs(nowMs, world) + 2,
      byPlayer: 'p1',
      body: { kind: 'march', to: { cell: { x: 1, y: 0 }, pos: { x: 50, z: -20 } } },
    });
    expect(
      await commandCampaign(deps, { ...input, command: lead({ kind: 'fighter', id: 'd:101' }) }),
    ).toBe(true);
    expect(
      await commandCampaign(deps, { ...input, command: lead({ kind: 'building', id: 7 }) }),
    ).toBe(true);
    expect(await commandCampaign(deps, { ...input, command: { kind: 'presence' } })).toBe(true);
    expect(
      await commandCampaign(deps, {
        ...input,
        command: { kind: 'order', group: 0, order: 'hold-place', at: { x: 10, z: 10 } },
      }),
    ).toBe(true);
    expect(
      await commandCampaign(deps, {
        ...input,
        command: { kind: 'surrendered', group: 0, choice: 'lead' },
      }),
    ).toBe(true);
    expect(campaigns.intents.map((i) => i.body.kind)).toEqual([
      'march',
      'strike',
      'march',
      'presence',
      'set-order',
      'choose-surrendered',
    ]);
  });

  it('záměr za cizího muže, za mrtvého a na neznámý cíl server odmítne', async () => {
    const { deps, campaigns, nowMs } = await setup();
    const as = (playerId: string, command: CampaignCommand): Promise<boolean> =>
      commandCampaign(deps, { playerId, campaignId: 'c1', command, nowMs });
    // vazal ve službě ani cizí hráč tažení nevede
    expect(await as('p2', place)).toBe(false);
    expect(await as('p2', { kind: 'presence' })).toBe(false);
    expect(await as('p3', place)).toBe(false);
    // obránce v lese mimo dohled, neobjevená stavba, neznámý muž, místo mimo dosah a mimo mapu
    expect(await as('p1', lead({ kind: 'fighter', id: 'd:102' }))).toBe(false);
    expect(await as('p1', lead({ kind: 'fighter', id: 'd:103' }))).toBe(false);
    expect(await as('p1', lead({ kind: 'building', id: 8 }))).toBe(false);
    expect(await as('p1', lead({ kind: 'building', id: 99 }))).toBe(false);
    const far = { cell: { x: 5, y: 5 }, pos: { x: 0, z: 0 } };
    expect(await as('p1', lead({ kind: 'place', place: far }))).toBe(false);
    const off = { cell: { x: 1, y: 0 }, pos: { x: 5000, z: 0 } };
    expect(await as('p1', lead({ kind: 'place', place: off }))).toBe(false);
    expect(await as('p1', { kind: 'order', group: 9, order: 'attack-all' })).toBe(false);
    expect(campaigns.intents).toHaveLength(0);
  });

  describe('místo ve vodě (war.md – Pohyb – Cíl v neprůchodné buňce)', () => {
    // řeka bez brodu od severu k jihu ve sloupci políček 80 (svět x ≈ 247,5 m), 30 m široká
    const river: StreamPoint[] = Array.from({ length: 128 }, (_, y) => ({
      x: 80,
      y: 127 - y,
      halfWidthLeft: 1,
      halfWidthRight: 1,
      level: 5 - y / 127,
      shallow: false,
      bankLeft: 0,
      bankRight: 0,
    }));
    const RIVER_MAP: CampaignMap = {
      landscape: { ...land(() => false), rivers: [river] },
      obstacles: null,
      villageIds: [],
    };
    /** Tažení na pochodu, skupiny velitele stojí v `pos` na mapě (0, 0). */
    const marching = (pos: { x: number; z: number }): CampaignState => {
      const base = campaign();
      return {
        ...base,
        phase: 'marching',
        groups: base.groups.map((g) => ({ ...g, cell: { x: 0, y: 0 }, pos: { ...pos } })),
      };
    };
    const water = lead({ kind: 'place', place: { cell: { x: 0, y: 0 }, pos: { x: 247.5, z: 0 } } });

    it('ze břehu záměr přijme s místem kliku a vrátí takt záměru – cíl posune tažení', async () => {
      const { deps, campaigns, nowMs } = await setup(marching({ x: 0, z: 0 }), RIVER_MAP);
      const input = { playerId: 'p1', campaignId: 'c1', nowMs };
      const result = await commandCampaignResult(deps, { ...input, command: water });
      expect(result).toEqual({ queued: true, tick: tickOfMs(nowMs, world) + 2 });
      expect(campaigns.intents[0]!.body).toEqual({
        kind: 'march',
        to: { cell: { x: 0, y: 0 }, pos: { x: 247.5, z: 0 } },
      });
    });

    it('skupina ve vodě unikne na nejbližší břeh – záměr projde (Rozhodnutí 7)', async () => {
      // plán 2026-11-16-dense-forest, Úloha 2: start v neprůchodné buňce vede rovně do nejbližší
      // průchodné – „Tam vojsko nedojde.“ zbude jen pro mapu bez průchodné buňky (dřív i pro
      // skupinu sevřenou ve vodě)
      const { deps, campaigns, nowMs } = await setup(marching({ x: 245, z: 0 }), RIVER_MAP);
      const input = { playerId: 'p1', campaignId: 'c1', nowMs };
      const deep = lead({
        kind: 'place',
        place: { cell: { x: 0, y: 0 }, pos: { x: 245, z: 200 } },
      });
      expect(await commandCampaignResult(deps, { ...input, command: deep })).toMatchObject({
        queued: true,
      });
      expect(campaigns.intents).toHaveLength(1);
    });
  });

  it('padlý nebo zajatý velitel a tažení vedené jiným mužem – žádný pokyn', async () => {
    const base = raiding();
    const fallen = raiding({
      members: base.members.map((m, i) => (i === 0 ? { ...m, status: 'fallen' as const } : m)),
    });
    for (const state of [fallen, raiding({ liveCommand: false })]) {
      const { deps, campaigns, nowMs } = await setup(state);
      const input = { playerId: 'p1', campaignId: 'c1', nowMs };
      expect(await commandCampaign(deps, { ...input, command: place })).toBe(false);
      expect(
        await commandCampaign(deps, {
          ...input,
          command: { kind: 'surrendered', group: 0, choice: 'kill' },
        }),
      ).toBe(false);
      expect(campaigns.intents).toHaveLength(0);
    }
  });
});
