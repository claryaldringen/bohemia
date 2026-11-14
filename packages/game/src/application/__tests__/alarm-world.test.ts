import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import type { VillageState } from '../../domain/village/types';
import type { GridCell } from '../../domain/village/people/world-grid';
import {
  alarmVillage,
  MarchGridMemo,
  msOfTick,
  stepCampaign,
  type AlarmOwner,
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
      const whole = stepCampaign(start, end, [{ ...send, seq: 1, body }], preloaded);
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
      await campaigns.create(start);
      await campaigns.addIntent('c1', { ...send, body });
      const outcomes: string[] = [];
      for (let tick = start.tick + 40; tick <= end; tick += 40) {
        for (const r of await stepCampaigns(deps, { nowMs: msOfTick(tick, world) })) {
          outcomes.push(r.outcome);
        }
      }
      expect(outcomes.every((o) => o === 'saved')).toBe(true);
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
