import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD, TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { applyInboxDay, type VillageEvent } from '../../domain/village/core/inbox';
import {
  applyRefugeArrive,
  applyRefugeDepart,
  departRefuge,
} from '../../domain/village/fortification/state/refugees';
import type { VillageState } from '../../domain/village/types';
import { dwelling, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import type { CampaignState } from '../../domain/war';
import { campaign } from '../../domain/war/__tests__/campaign-fixtures';
import { NOT_PLAYER_VILLAGE } from '../player-villages';
import {
  REFUGE_RETURN_REASONS,
  returnFromRefuge,
  returnStewardRefugees,
  type StewardRefugeDeps,
} from '../refuge-return';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';

// Návrat uprchlíků domů (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Úloha
// 10, Review Focus 5): odmítnutí, dokud vojsko stojí na mapě vsi; z hradiště zbylé zásoby a celé
// stádo za odhad cesty, z lesa týž den; opakování = jedna událost; právo `war`; správce.

const TODAY = 200_000;
const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
const HERD = { ...NO_HERD, sheep: 4, cow: 1 };
const landscape = makeLandscape();
const HOME_CELL = { x: 1, y: 0 };

/** Domov: tři lidé odešli (do hradiště `hostId`, nebo do lesa) se 300 kg a stádem. */
function homeState(hostId: string | null, extra: Partial<VillageState> = {}): VillageState {
  const v = village(
    [
      kin({ id: 1, age: 30, sex: 'male' }),
      kin({ id: 2, age: 28, sex: 'female' }),
      kin({ id: 3, age: 8, sex: 'female' }),
      kin({ id: 4, age: 50, sex: 'male' }),
    ],
    [dwelling(1)],
    {
      storesKg: 1000,
      livestock: { herds: { ...HERD }, young: { ...NO_HERD } },
      lastDay: TODAY - 1,
      ...extra,
    },
  );
  applyRefugeDepart(v, TODAY - 3, {
    kind: 'refuge-depart',
    campaignId: 'c1',
    refId: 'c1:a1',
    mode: hostId === null ? 'forest' : 'all',
    hostVillageId: hostId,
    people: [1, 2, 3],
    carriedKg: 300,
    herd: { ...HERD },
  });
  if (hostId === null) v.refuge!.hidden = { foodKg: 300, herd: { ...HERD } };
  return v;
}

/** Hradiště: dva domácí, 500 kg; uprchlíci z domova `homeId` došli se 280 kg a stádem. */
function hostState(homeId: string, arrived = true): VillageState {
  const v = village(
    [kin({ id: 1, age: 35, sex: 'male' }), kin({ id: 2, age: 33, sex: 'female' })],
    [dwelling(1)],
    { storesKg: 500, lastDay: TODAY },
  );
  if (arrived) {
    applyRefugeArrive(v, TODAY - 2, {
      kind: 'refuge-arrive',
      campaignId: 'c1',
      refId: 'c1:a1',
      fromVillageId: homeId,
      fromName: 'Kněžice',
      people: [
        { id: 1, bornDay: TODAY - 30 * 365, man: true, line: false },
        { id: 2, bornDay: TODAY - 28 * 365, man: false, line: false },
        { id: 3, bornDay: TODAY - 8 * 365, man: false, line: false },
      ],
      foodKg: 280,
      herd: { ...HERD },
    });
  }
  return v;
}

/** Tažení c1 proti domovu; skupiny na políčku `cell`. */
function army(homeId: string, cell = HOME_CELL, phase: CampaignState['phase'] = 'raiding') {
  const base = campaign();
  return {
    ...base,
    phase,
    target: { ...base.target, villageId: homeId, cell: { ...HOME_CELL } },
    groups: base.groups.map((g) => ({ ...g, cell: { ...cell } })),
  };
}

interface World {
  deps: StewardRefugeDeps;
  houses: InMemoryHouses;
  campaigns: InMemoryCampaigns;
  villages: InMemoryVillages;
  stewardships: InMemoryStewardships;
  homeId: string;
  hostId: string;
}

async function setup(
  o: { forest?: boolean; arrived?: boolean; home?: Partial<VillageState> } = {},
): Promise<World> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const campaigns = new InMemoryCampaigns();
  const stewardships = new InMemoryStewardships();
  await houses.create({ playerId: 'p9', kind: 'player', createdAt: new Date(0) });
  await houses.create({ playerId: 'p5', kind: 'player', createdAt: new Date(0) });
  const seat = await settlements.create({
    ownerId: 'p9',
    landscapeSeed: 9,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: HOME_CELL,
  });
  const lordSeat = await settlements.create({
    ownerId: 'p5',
    landscapeSeed: 5,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 4, y: 0 },
  });
  const host = await villages.add(lordSeat!.id, 'Hradiště', village([], [dwelling(1)]));
  const home = await villages.add(
    seat!.id,
    'Kněžice',
    homeState(o.forest ? null : host.id, o.home),
  );
  await villages.save(host.id, hostState(home.id, o.arrived ?? true), host.version);
  await campaigns.create(army(home.id));
  const deps: StewardRefugeDeps = {
    houses,
    settlements,
    villages,
    campaigns,
    stewardships,
    refugees: {
      awayVillages: async () => {
        const v = await villages.find(home.id);
        const r = v?.state.refuge;
        return r
          ? [{ villageId: home.id, refId: r.refId, hostVillageId: r.hostVillageId ?? null }]
          : [];
      },
    },
    locks: new InMemoryPlayerLock(),
    landscapes: { landscapeOf: () => landscape },
    world: OFFICIAL_WORLD,
  };
  return { deps, houses, campaigns, villages, stewardships, homeId: home.id, hostId: host.id };
}

/** Vojsko odtáhne – skupiny na jiném políčku, tažení se vrací. */
function armyLeaves(w: World): void {
  const row = w.campaigns.rows.get('c1')!;
  row.state = JSON.stringify(army(w.homeId, { x: 0, y: 0 }, 'returning'));
}

async function inboxOf(w: World, villageId: string): Promise<VillageEvent[]> {
  return w.villages.inbox.pending(villageId, -1, TOTAL_GAME_DAYS);
}

const ask = (w: World, playerId = 'p9') =>
  returnFromRefuge(w.deps, { playerId, villageId: w.homeId, today: TODAY });

describe('returnFromRefuge – hradiště', () => {
  it('(a) vojsko na mapě – odmítnuto; po odtažení zbylé zásoby a celé stádo, bilance stojí', async () => {
    const w = await setup();
    expect(await ask(w)).toEqual({ ok: false, reason: REFUGE_RETURN_REASONS.army });
    expect(await inboxOf(w, w.homeId)).toEqual([]);
    armyLeaves(w);
    const homeBefore = (await w.villages.find(w.homeId))!.state;
    const hostBefore = (await w.villages.find(w.hostId))!.state;
    const total = homeBefore.storesKg + hostBefore.storesKg + hostBefore.refugeStays![0]!.foodKg;
    const result = await ask(w);
    expect(result.ok).toBe(true);
    const arrivesDay = (result as { arrivesDay: number }).arrivesDay;
    expect(arrivesDay).toBeGreaterThan(TODAY);
    const host = (await w.villages.find(w.hostId))!.state;
    expect(host.refugeStays).toBeUndefined();
    expect(host.refugeLeaving).toBeUndefined();
    expect(host.guests ?? []).toEqual([]);
    const events = await inboxOf(w, w.homeId);
    expect(events.map((e) => [e.day, e.body])).toEqual([
      [arrivesDay, { kind: 'refuge-back', refId: 'c1:a1', foodKg: 280, herd: HERD }],
    ]);
    const home = structuredClone(homeBefore);
    applyInboxDay(home, arrivesDay, events);
    expect(home.storesKg + host.storesKg).toBe(total);
    expect(home.livestock!.herds).toEqual(HERD);
    expect(home.people.every((p) => p.away === undefined)).toBe(true);
    expect(home.refuge).toBeUndefined();
  });

  it('(c) opakované volání – jedna událost, týž den příchodu', async () => {
    const w = await setup();
    armyLeaves(w);
    const first = await ask(w);
    const again = await ask(w);
    expect(again).toEqual(first);
    expect(await inboxOf(w, w.homeId)).toHaveLength(1);
  });

  it('souběh hráče a správce – jedna událost, oba týž den příchodu', async () => {
    const w = await setup();
    armyLeaves(w);
    const [a, b] = await Promise.all([ask(w), ask(w)]);
    expect(a.ok).toBe(true);
    expect(b).toEqual(a);
    expect(await inboxOf(w, w.homeId)).toHaveLength(1);
  });

  it('lidé ještě nedorazili – odmítnuto; ves bez útěku – odmítnuto', async () => {
    const w = await setup({ arrived: false });
    armyLeaves(w);
    expect(await ask(w)).toEqual({ ok: false, reason: REFUGE_RETURN_REASONS.notArrived });
    const home = (await w.villages.find(w.homeId))!;
    const plain = structuredClone(home.state);
    delete plain.refuge;
    await w.villages.save(w.homeId, plain, home.version);
    expect(await ask(w)).toEqual({ ok: false, reason: REFUGE_RETURN_REASONS.none });
  });

  it('pád mezi uložením hradiště a zápisem – opakování dopíše událost ze záznamu', async () => {
    const w = await setup();
    const host = (await w.villages.find(w.hostId))!;
    const crashed = structuredClone(host.state);
    departRefuge(crashed, 'c1:a1', w.homeId, TODAY + 2);
    await w.villages.save(w.hostId, crashed, host.version);
    // vojsko mezitím přitáhlo zpět – rozhodnuto už bylo, událost se dopíše
    const result = await ask(w);
    expect(result).toEqual({ ok: true, arrivesDay: TODAY + 2 });
    const events = await inboxOf(w, w.homeId);
    expect(events.map((e) => e.body)).toEqual([
      { kind: 'refuge-back', refId: 'c1:a1', foodKg: 280, herd: HERD },
    ]);
    expect((await w.villages.find(w.hostId))!.state.refugeLeaving).toBeUndefined();
  });
});

describe('returnFromRefuge – les a práva', () => {
  it('(b) z lesa týž den, tělo nese 0 – ukryté si ves vrátí sama', async () => {
    const w = await setup({ forest: true });
    expect(await ask(w)).toEqual({ ok: false, reason: REFUGE_RETURN_REASONS.army });
    armyLeaves(w);
    expect(await ask(w)).toEqual({ ok: true, arrivesDay: TODAY });
    const events = await inboxOf(w, w.homeId);
    expect(events.map((e) => [e.day, e.body])).toEqual([
      [TODAY, { kind: 'refuge-back', refId: 'c1:a1', foodKg: 0, herd: NO_HERD }],
    ]);
    const home = structuredClone((await w.villages.find(w.homeId))!.state);
    const stores = home.storesKg;
    applyInboxDay(home, TODAY, events);
    expect(home.storesKg).toBe(stores + 300);
    expect(home.livestock!.herds).toEqual(HERD);
  });

  it('(d) cizí hráč a správce cizí vsi bez práva `war` – odmítnuti, nic se nezapíše', async () => {
    const w = await setup();
    armyLeaves(w);
    expect(await ask(w, 'p5')).toEqual({ ok: false, reason: NOT_PLAYER_VILLAGE });
    const stewardHouse = await w.deps.houses.activeOf('p5');
    const holderHouse = await w.deps.houses.activeOf('p9');
    await w.stewardships.start({
      villageId: w.homeId,
      stewardHouseId: stewardHouse!.id,
      holderHouseId: holderHouse!.id,
      kind: 'player',
      vassalageId: null,
      since: new Date(0),
    });
    const steward = await ask(w, 'p5');
    expect(steward.ok).toBe(false);
    expect(await inboxOf(w, w.homeId)).toEqual([]);
  });
});

describe('returnStewardRefugees', () => {
  const stewardOn = { steward: { on: true, sinceDay: 0 } } as Partial<VillageState>;

  it('(e) správce vrátí ves den po posledním dni nájezdu, dřív ani s vojskem na mapě ne', async () => {
    const w = await setup({ home: { ...stewardOn, raidDay: TODAY - 1 } });
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(0);
    armyLeaves(w);
    const raidToday = await setup({ home: { ...stewardOn, raidDay: TODAY } });
    armyLeaves(raidToday);
    expect(await returnStewardRefugees(raidToday.deps, { today: TODAY })).toBe(0);
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(1);
    const events = await inboxOf(w, w.homeId);
    expect(events.map((e) => e.body)).toEqual([
      { kind: 'refuge-back', refId: 'c1:a1', foodKg: 280, herd: HERD, steward: true },
    ]);
    const home = structuredClone((await w.villages.find(w.homeId))!.state);
    const chronicle = applyInboxDay(home, events[0]!.day, events);
    expect(chronicle.at(-1)).toMatchObject({ kind: 'people-back', steward: true });
    // podruhé nic – událost už čeká ve schránce
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(0);
  });

  it('(e) hráčovu ves bez správce nevrátí; NPC ves ano', async () => {
    const w = await setup({ home: { raidDay: TODAY - 1 } });
    armyLeaves(w);
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(0);
    expect(await inboxOf(w, w.homeId)).toEqual([]);
    const npc = await w.houses.create({ playerId: null, kind: 'npc', createdAt: new Date(0) });
    await w.stewardships.start({
      villageId: w.homeId,
      stewardHouseId: npc.id,
      holderHouseId: (await w.deps.houses.activeOf('p9'))!.id,
      kind: 'npc',
      vassalageId: null,
      since: new Date(0),
    });
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(1);
  });

  it('vojsko teprve táhne na ves – správce čeká, i když na mapě nestojí', async () => {
    const w = await setup({ home: stewardOn });
    w.campaigns.rows.get('c1')!.state = JSON.stringify(army(w.homeId, { x: 0, y: 0 }, 'marching'));
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(0);
  });

  it('obnova po pádu i u hráčovy vsi bez správce', async () => {
    const w = await setup();
    const host = (await w.villages.find(w.hostId))!;
    const crashed = structuredClone(host.state);
    departRefuge(crashed, 'c1:a1', w.homeId, TODAY + 2);
    await w.villages.save(w.hostId, crashed, host.version);
    expect(await returnStewardRefugees(w.deps, { today: TODAY })).toBe(0);
    expect((await inboxOf(w, w.homeId)).map((e) => e.day)).toEqual([TODAY + 2]);
  });
});

describe('returnStewardRefugees s posunem času hráče', () => {
  const stewardOn = { steward: { on: true, sinceDay: 0 } } as Partial<VillageState>;

  it('správce rozhoduje a vrací ve dni držitele vsi', async () => {
    const plain = await setup({ home: { ...stewardOn, raidDay: TODAY - 1 } });
    armyLeaves(plain);
    // bez posunu je den světa TODAY − 2 dřív než den po nájezdu
    expect(await returnStewardRefugees(plain.deps, { today: TODAY - 2 })).toBe(0);
    expect(await returnStewardRefugees(plain.deps, { today: TODAY })).toBe(1);
    const w = await setup({ home: { ...stewardOn, raidDay: TODAY - 1 } });
    armyLeaves(w);
    const home = (await w.villages.find(w.homeId))!;
    const owner = (await w.deps.settlements.find(home.settlementId))!.ownerId;
    const offsets = new InMemoryTimeOffsets();
    offsets.offsets.set(owner, 2);
    expect(await returnStewardRefugees({ ...w.deps, offsets }, { today: TODAY - 2 })).toBe(1);
    // příchod domů týž jako bez posunu v den TODAY – cesta začala v den držitele
    const days = async (x: typeof w): Promise<number[]> =>
      (await inboxOf(x, x.homeId)).map((e) => e.day);
    expect(await days(w)).toEqual(await days(plain));
  });
});
