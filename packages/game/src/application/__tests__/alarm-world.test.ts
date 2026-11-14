import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import type { VillageState } from '../../domain/village/types';
import type { GridCell } from '../../domain/village/people/world-grid';
import {
  absentTicks,
  alarmVillage,
  MarchGridMemo,
  msOfTick,
  stepCampaign,
  type AlarmOwner,
  type CampaignIntent,
  type CampaignMap,
  type CampaignState,
  type CampaignWorld,
} from '../../domain/war';
import { land, palisade } from '../../domain/war/__tests__/battle-fixtures';
import { campaign, MEADOW, SUMMER, world } from '../../domain/war/__tests__/campaign-fixtures';
import type { AlarmOwnerPort, CampaignCells, VillageCell } from '../campaigns';
import { newCampaignMemory, stepCampaigns, type StepCampaignsDeps } from '../step-campaigns';
import { InMemoryCampaignLock, InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPresence } from './in-memory-presence';
import { InMemoryVillages } from './in-memory-villages';

// Svět varování ve smyčce tažení (plán 2026-11-09 – Úloha 6, Krok 2): `stepCampaigns` dodá tažení
// vlastníka vsi, kandidáty hradišť a doménu hradiště z portu `AlarmOwnerPort`. Takt, který na
// nenačtenou odpověď čeká, se po načtení spočte stejně jako se vším předem.

const A: GridCell = { x: 1, y: 0 };
const B: GridCell = { x: 2, y: 0 };
const C: GridCell = { x: 3, y: 0 };
const E: GridCell = { x: 2, y: 1 };
/** Vsi jsou dopočtené dál, než tažení běží (tažení čte jejich stav ke dni – bariéra). */
const LAST = SUMMER + 30;

const STATES: Record<string, VillageState> = {
  a: village(
    [
      kin({ id: 1, age: 20, sex: 'male' }, SUMMER),
      { ...kin({ id: 2, age: 30, sex: 'male' }, SUMMER), line: true },
    ],
    [dwelling(1)],
    { lastDay: LAST, defense: { stance: 'defend' } },
  ),
  b: village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)], { lastDay: LAST }),
  c: village([kin({ id: 1, age: 25, sex: 'male' }, SUMMER)], [dwelling(1)], {
    lastDay: LAST,
    fortifications: [palisade(true)],
  }),
  e: village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)], { lastDay: LAST }),
};
const CELLS: Record<string, GridCell> = { a: A, b: B, c: C, e: E };
const mapOf = (id: string): CampaignMap => ({
  landscape: land(),
  obstacles: null,
  villageIds: [id],
});
const MAPS = new Map(Object.entries(CELLS).map(([id, c]) => [`${c.x},${c.y}`, mapOf(id)]));
const landscapeOf = (c: GridCell): CampaignMap => MAPS.get(`${c.x},${c.y}`) ?? MEADOW;

/**
 * A patří hráči p2 s vojvodou (muž rodu 2) doma – bez odpovědi na přítomnost čeká na jeho pokyn
 * (war.md – Hráč ve vsi a mimo ni); hradiště C spravuje NPC rod (rozešle posly do domény sám), B
 * svět nezná.
 */
const OWNERS: Record<string, AlarmOwner> = {
  a: { playerId: 'p2', npc: false, houseId: 'h2', lordId: 2 },
  c: { playerId: 'p2', npc: true, houseId: 'h2' },
  e: { playerId: 'p2', npc: false, houseId: 'h2' },
};
const at = (...ids: string[]): VillageCell[] =>
  ids.map((villageId) => ({ villageId, cell: CELLS[villageId]! }));
const HOSTS: Record<string, VillageCell[]> = { a: at('c', 'e') };
const DOMAIN: Record<string, VillageCell[]> = { c: at('c', 'a', 'e') };

/** Port v paměti – počítá dotazy. */
function port(): AlarmOwnerPort & { asks: string[] } {
  const asks: string[] = [];
  return {
    asks,
    ownerOf: (id) => {
      asks.push(`owner:${id}`);
      return Promise.resolve(OWNERS[id] ?? null);
    },
    refugeHostsOf: (id) => {
      asks.push(`hosts:${id}`);
      return Promise.resolve(HOSTS[id] ?? []);
    },
    domainOf: (id) => {
      asks.push(`domain:${id}`);
      return Promise.resolve(DOMAIN[id] ?? []);
    },
  };
}

/** Totéž předem v synchronním světě. */
const preloaded: CampaignWorld = {
  clock: world,
  landscapeOf,
  villageAt: (id) => STATES[id] ?? null,
  watcherOf: () => null,
  harmless: () => false,
  alarmOf: (id) => OWNERS[id] ?? { playerId: null, npc: true, houseId: null },
  refugeHostsOf: (id) => HOSTS[id] ?? [],
  domainOf: (id) => DOMAIN[id] ?? [],
  grids: new MarchGridMemo(),
};

/** Vojsko 140 m západně od domů A táhne na západ – A ho spatří hned (jako `messenger.test.ts`). */
function passing(): CampaignState {
  const far = { cell: { x: -3, y: 0 }, pos: { x: 0, z: 0 } };
  const s = campaign({ liveCommand: false, foodKg: 200, target: { villageId: 'knezice', ...far } });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...A };
    g.pos = { x: -140, z: 0 };
    g.goal = structuredClone(far);
    g.route = [0, -1, -2, -3].map((x) => ({ x, y: 0 }));
    g.arrived = false;
  }
  return s;
}

function setup(alarmOwners: AlarmOwnerPort): {
  deps: StepCampaignsDeps;
  campaigns: InMemoryCampaigns;
  villages: InMemoryVillages;
} {
  const campaigns = new InMemoryCampaigns();
  const villages = new InMemoryVillages();
  for (const [id, state] of Object.entries(STATES)) {
    villages.records.set(id, { id, settlementId: `s-${id}`, name: id, state, version: 1 });
  }
  const cells: CampaignCells = { mapOf: (cell) => Promise.resolve(landscapeOf(cell)) };
  const deps: StepCampaignsDeps = {
    campaigns,
    campaignLock: new InMemoryCampaignLock(),
    cells,
    villages,
    notices: new InMemoryNotices(),
    world,
    alarmOwners,
    memory: newCampaignMemory(),
  };
  return { deps, campaigns, villages };
}

describe('svět varování ve smyčce tažení (Úloha 6)', () => {
  it(
    'port dodá vlastníka, hradiště i doménu; takt čeká na načtení a výsledek je jako vcelku',
    {
      timeout: 60_000,
    },
    async () => {
      const start = passing();
      const send = { tick: start.tick + 40, byPlayer: 'p2' } as const;
      const body = { kind: 'alarm-messenger', village: 'a' } as const;
      const end = start.tick + 4000;
      // A (vojvoda doma) se v taktu varování zeptá na přítomnost – worker odpoví na takt dotazu
      // + 2, že hráč byl u hry naposled v taktu startu (kolo končí dotazem – drobný 1)
      const answer = {
        tick: start.tick + 3,
        byPlayer: 'p2',
        body: { kind: 'alarm-presence', village: 'a', seenTick: start.tick },
      } as const;
      const whole = stepCampaign(
        start,
        end,
        [
          { ...send, seq: 1, body },
          { ...answer, seq: 2 },
        ],
        preloaded,
      );
      // posel A doběhl do C, NPC hradiště poslalo posla do E (A už ví) a ten E varoval
      const [own, toE] = whole.state.alarm!.messengers;
      expect(own).toMatchObject({ fromVillageId: 'a', toVillageId: 'c', status: 'arrived' });
      expect(toE).toMatchObject({ fromVillageId: 'c', toVillageId: 'e', status: 'arrived' });
      expect(alarmVillage(whole.state, 'a')).toMatchObject({ owner: OWNERS.a, hosts: ['c', 'e'] });
      expect(alarmVillage(whole.state, 'b')!.owner).toEqual({
        playerId: null,
        npc: true,
        houseId: null,
      });
      expect(alarmVillage(whole.state, 'c')!.domain).toEqual([toE!.refId]);
      expect(alarmVillage(whole.state, 'e')).toMatchObject({ by: 'messenger', hosts: [] });

      const alarms = port();
      const { deps, campaigns, villages } = setup(alarms);
      const presence = new InMemoryPresence();
      await presence.note('p2', new Date(msOfTick(start.tick, world)));
      deps.presence = presence;
      await campaigns.create(start);
      await campaigns.addIntent('c1', { ...send, body });
      const outcomes: string[] = [];
      for (let tick = start.tick + 40; tick <= end; tick += 40) {
        for (const r of await stepCampaigns(deps, { nowMs: msOfTick(tick, world) })) {
          outcomes.push(r.outcome);
        }
      }
      expect(outcomes.every((o) => o === 'saved' || o === 'waiting')).toBe(true);
      const stored = (await campaigns.checkpoint('c1'))!.state;
      expect(stored.tick).toBe(end);
      expect(JSON.stringify(stored)).toBe(JSON.stringify(whole.state));
      // (schránka v paměti posune den události za dopočtený den vsi – porovnává se ves a tělo)
      expect(villages.inbox.events.map((e) => [e.villageId, e.body])).toEqual(
        whole.villageEvents.map((e) => [e.villageId, e.body]),
      );
      // na každou odpověď se smyčka ptá, jen když na ni takt čeká
      expect(alarms.asks.filter((a) => a.startsWith('domain:'))).toEqual(['domain:c']);
      expect(new Set(alarms.asks)).toEqual(
        new Set([
          'owner:a',
          'hosts:a',
          'owner:b',
          'hosts:b',
          'owner:c',
          'hosts:c',
          'domain:c',
          'owner:e',
          'hosts:e',
        ]),
      );
    },
  );

  it('bez portu rod vsi neznámý a hradiště žádné – posel nevyběhne', async () => {
    const start = passing();
    const { deps, campaigns } = setup(port());
    delete deps.alarmOwners;
    await campaigns.create(start);
    await campaigns.addIntent('c1', {
      tick: start.tick + 40,
      byPlayer: 'p2',
      body: { kind: 'alarm-messenger', village: 'a' },
    });
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 80, world) });
    const state = (await campaigns.checkpoint('c1'))!.state;
    const a = alarmVillage(state, 'a')!;
    expect(a.owner).toEqual({ playerId: null, npc: true, houseId: null });
    expect(a.hosts).toBeUndefined();
    // záměr hráče neplatí – za ves s neznámým rodem rozhoduje pravidlo (Úloha 11)
    expect(state.alarm!.messengers).toEqual([]);
  });
});

/** 1 herní den v taktech – hráč bez přítomnosti déle je pryč. */
const ABSENT = absentTicks(world);
const LAUNCH_TICK = passing().tick;

/**
 * Smyčka workeru s přítomností (plán 2026-11-14 – Úloha 6): tažení `passing` (ves A hráče p2
 * s vojvodou doma), kola po 40 taktech do `to`; před kolem v taktu `t` web zapíše přítomnost p2,
 * je-li `present(t)`. `intents` = záměry hráče předem. Vrací uložený stav tažení.
 */
async function presenceLoop(opts: {
  to: number;
  present: (tick: number) => boolean;
  intents?: Omit<CampaignIntent, 'seq'>[];
}): Promise<CampaignState> {
  const presence = new InMemoryPresence();
  const { deps, campaigns } = setup(port());
  deps.presence = presence;
  await campaigns.create(passing());
  for (const i of opts.intents ?? []) await campaigns.addIntent('c1', i);
  for (let tick = LAUNCH_TICK + 40; tick <= opts.to; tick += 40) {
    if (opts.present(tick)) await presence.note('p2', new Date(msOfTick(tick, world)));
    await stepCampaigns(deps, { nowMs: msOfTick(tick, world) });
  }
  return (await campaigns.checkpoint('c1'))!.state;
}

describe('worker odpovídá na přítomnost obránce (plán 2026-11-14 – Úloha 6)', () => {
  it(
    'přítomný hráč (zápis každých 40 taktů) – ves nerozhodne 700 taktů',
    { timeout: 60_000 },
    async () => {
      const state = await presenceLoop({ to: LAUNCH_TICK + 720, present: () => true });
      expect(state.tick).toBe(LAUNCH_TICK + 720);
      const a = alarmVillage(state, 'a')!;
      expect(a.decided).toBeUndefined();
      expect(a.askedTick).toBeUndefined();
      // worker přítomnost obnovuje – je mladší než 1 herní den
      expect(state.tick - a.presenceTick!).toBeLessThan(ABSENT);
      expect(state.alarm!.messengers).toEqual([]);
    },
  );

  it('nepřítomný hráč – správce v taktu dotazu + 2 (dotaz kolo ukončí)', async () => {
    const first = await presenceLoop({ to: LAUNCH_TICK + 40, present: () => false });
    // kolo skončilo v taktu dotazu (bod), ne na konci kola (drobný 1)
    expect(first.tick).toBe(LAUNCH_TICK + 1);
    const asked = alarmVillage(first, 'a')!;
    expect(asked).toMatchObject({ warnTick: LAUNCH_TICK + 1, askedTick: LAUNCH_TICK + 1 });
    expect(asked.decided).toBeUndefined();

    const state = await presenceLoop({ to: LAUNCH_TICK + 80, present: () => false });
    // odpověď (u hry nebyl) na takt dotazu + 2 – správce pošle posla v témž taktu
    expect(alarmVillage(state, 'a')).toMatchObject({ decided: 'steward', presenceTick: null });
    expect(state.alarm!.messengers).toMatchObject([
      { fromVillageId: 'a', departTick: LAUNCH_TICK + 3 },
    ]);
  });

  it('hráč odejde – správce po absentTicks od posledního zápisu', { timeout: 60_000 }, async () => {
    const last = LAUNCH_TICK + 200;
    const state = await presenceLoop({ to: LAUNCH_TICK + 640, present: (tick) => tick <= last });
    expect(alarmVillage(state, 'a')).toMatchObject({ decided: 'steward', presenceTick: last });
    expect(state.alarm!.messengers).toMatchObject([
      { fromVillageId: 'a', departTick: last + ABSENT + 1 },
    ]);
  });

  it(
    'hráč u hry po své volbě dál hraje – o ves nepřijde po 1 herním dni',
    { timeout: 60_000 },
    async () => {
      const state = await presenceLoop({
        to: LAUNCH_TICK + 800,
        present: () => true,
        intents: [
          {
            tick: LAUNCH_TICK + 40,
            byPlayer: 'p2',
            body: { kind: 'alarm-messenger', village: 'a' },
          },
        ],
      });
      expect(state.tick).toBe(LAUNCH_TICK + 800);
      const a = alarmVillage(state, 'a')!;
      expect(a.decided).toBe('player');
      expect(state.tick - a.presenceTick!).toBeLessThan(ABSENT);
      expect(state.alarm!.messengers).toMatchObject([
        { fromVillageId: 'a', departTick: LAUNCH_TICK + 40 },
      ]);
    },
  );

  it('záměr za state.tick paměť kola nezneplatní', { timeout: 60_000 }, async () => {
    const start = passing();
    const presence = new InMemoryPresence();
    const { deps, campaigns } = setup(port());
    deps.presence = presence;
    const memory = deps.memory!;
    await campaigns.create(start);
    // hráč byl u hry naposled před vstupem vojska; kolo 1 skončí dotazem A (bod v taktu varování)
    // a odpoví, kolo 1b dopočte za odpověď a uloží bod (40 taktů)
    await presence.note('p2', new Date(msOfTick(start.tick - 50, world)));
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 40, world) });
    expect((await campaigns.checkpoint('c1'))!.state.tick).toBe(start.tick + 1);
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 41, world) });
    expect((await campaigns.checkpoint('c1'))!.state.tick).toBe(start.tick + 41);
    expect(memory.states.has('c1')).toBe(false);
    // kolo 2 zůstane v paměti (méně než 40 taktů od bodu); přítomnost je starší než obnova
    await presence.note('p2', new Date(msOfTick(start.tick + 79, world)));
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 79, world) });
    const memo = memory.states.get('c1')!;
    expect(memo.state.tick).toBe(start.tick + 79);
    expect(alarmVillage(memo.state, 'a')!.presenceTick).toBe(start.tick - 50);
    expect((await campaigns.intentsAfter('c1', start.tick + 41)).at(-1)).toMatchObject({
      tick: start.tick + 81,
      byPlayer: 'p2',
      body: { kind: 'alarm-presence', village: 'a', seenTick: start.tick + 79 },
    });
    // značka v zapamatovaném stavu – kolo 3 pokračuje od paměti, ne od bodu
    memory.states.set('c1', { ...memo, state: { ...memo.state, leaderName: 'Z paměti' } });
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 84, world) });
    const saved = (await campaigns.checkpoint('c1'))!.state;
    expect(saved.tick).toBe(start.tick + 84);
    expect(saved.leaderName).toBe('Z paměti');
    expect(alarmVillage(saved, 'a')!.presenceTick).toBe(start.tick + 79);
  });
});

describe('vlastníci vsí v kole smyčky (závěrečná recenze D1)', () => {
  /** 12 vsí na mapě A, domy 1,3 km od vojska (nespatří ho) – jejich vlastníky takt potřebuje. */
  const MANY = Array.from({ length: 12 }, (_, i) => `v${String(i + 1).padStart(2, '0')}`);
  const FAR = { x: 900, z: 900, rotation: 0 };

  function crowded(): {
    deps: StepCampaignsDeps;
    campaigns: InMemoryCampaigns;
    asks: string[];
  } {
    const campaigns = new InMemoryCampaigns();
    const villages = new InMemoryVillages();
    for (const id of MANY) {
      const state = village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [], {
        lastDay: LAST,
      });
      state.dwellings = [{ ...dwelling(1), position: { ...FAR } }];
      villages.records.set(id, { id, settlementId: `s-${id}`, name: id, state, version: 1 });
    }
    const map: CampaignMap = { landscape: land(), obstacles: null, villageIds: MANY };
    const cells: CampaignCells = {
      mapOf: (c) => Promise.resolve(c.x === A.x && c.y === A.y ? map : MEADOW),
    };
    const asks: string[] = [];
    const owners: AlarmOwnerPort = {
      ownerOf: (id) => {
        asks.push(`owner:${id}`);
        return Promise.resolve({ playerId: 'p2', npc: false, houseId: 'h2' });
      },
      refugeHostsOf: (id) => {
        asks.push(`hosts:${id}`);
        return Promise.resolve([]);
      },
      domainOf: () => Promise.resolve([]),
    };
    const deps: StepCampaignsDeps = {
      campaigns,
      campaignLock: new InMemoryCampaignLock(),
      cells,
      villages,
      notices: new InMemoryNotices(),
      world,
      alarmOwners: owners,
      memory: newCampaignMemory(),
    };
    return { deps, campaigns, asks };
  }

  it('takt s 12 neznámými vlastníky se dopočítá v jednom kole', async () => {
    const start = passing();
    const { deps, campaigns, asks } = crowded();
    await campaigns.create(start);
    // dřív jeden průchod = jeden vlastník a kolo má nejvýš 9 průchodů – takt by stál navždy
    const [first] = await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 40, world) });
    expect(first!.outcome).toBe('saved');
    expect((await campaigns.checkpoint('c1'))!.state.tick).toBe(start.tick + 40);
    expect(asks.filter((a) => a.startsWith('owner:')).sort()).toEqual(
      MANY.map((id) => `owner:${id}`),
    );
    // kandidáti hradišť jen u vsi, která do varování vstupuje – žádná
    expect(asks.filter((a) => a.startsWith('hosts:'))).toEqual([]);
    // další kolo vezme vlastníky z paměti workeru (mladší než OWNER_KEEP_TICKS)
    asks.length = 0;
    await stepCampaigns(deps, { nowMs: msOfTick(start.tick + 80, world) });
    expect((await campaigns.checkpoint('c1'))!.state.tick).toBe(start.tick + 80);
    expect(asks).toEqual([]);
  });

  it('ves už ve varování – na vlastníka se kolo neptá', async () => {
    const start = passing();
    // A ví o vojsku od svého vesničana, který ještě běží domů (vlastník zapsaný při spatření)
    start.alarm = {
      villages: [
        {
          villageId: 'a',
          owner: { playerId: 'p2', npc: false, houseId: 'h2' },
          seenTick: start.tick,
          seenAt: { cell: { ...A }, pos: { x: -140, z: 0 } },
          warnTick: start.tick + 1000,
          by: 'villager',
          hosts: [],
        },
      ],
      messengers: [],
      flights: [],
      nextRef: 0,
    };
    const alarms = port();
    const { deps, campaigns } = setup(alarms);
    await campaigns.create(start);
    for (const tick of [start.tick + 40, start.tick + 80]) {
      await stepCampaigns(deps, { nowMs: msOfTick(tick, world) });
    }
    expect((await campaigns.checkpoint('c1'))!.state.tick).toBe(start.tick + 80);
    expect(alarms.asks.filter((a) => a === 'owner:a')).toEqual([]);
  });
});
