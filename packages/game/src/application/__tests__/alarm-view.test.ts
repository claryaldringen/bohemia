import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { dwelling, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import { applyRefugeDepart } from '../../domain/village/fortification/state/refugees';
import type { VillageState } from '../../domain/village/types';
import type { GridCell } from '../../domain/village/people/world-grid';
import { msOfTick, tickOfMs, WAR, type AlarmVillage, type CampaignState } from '../../domain/war';
import { land, palisade } from '../../domain/war/__tests__/battle-fixtures';
import { campaign, member, SUMMER, world } from '../../domain/war/__tests__/campaign-fixtures';
import {
  ALARM_BLOCKED,
  commandAlarm,
  villageAlarmView,
  type AlarmCommand,
  type CommandAlarmDeps,
} from '../alarm-view';
import { REFUGE_RETURN_REASONS } from '../refuge-return';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Pohled na varování a příkazy obránce (war.md – Varování, poslové a útěk do hradiště; plán
// 2026-11-09 – Úloha 12). Ves A hráče p2 (políčko 1, 0) má dům u východního okraje mapy
// (x = 800 m) a hájek severně od něj; hradiště C pána p3 (2, 0) s palisádou, ves D (2, 1) v doméně
// C. Vojsko p1 viděli na mapě A – daleko na západě (stihnou), nebo u domu (nestihnou).

const A: GridCell = { x: 1, y: 0 };
const C: GridCell = { x: 2, y: 0 };
const D: GridCell = { x: 2, y: 1 };
const HOME = { x: 800, z: 0 };
const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
const grove = (tx: number, ty: number): boolean => tx >= 114 && tx <= 117 && ty >= 66 && ty <= 69;

/** Ves A: vesničan 30 let (výchozí posel), muž rodu Bořek, ženy a děti, zásoby a stádo. */
function villageA(): VillageState {
  return village(
    [
      kin({ id: 1, age: 30, sex: 'male' }, SUMMER),
      { ...kin({ id: 2, age: 35, sex: 'male' }, SUMMER), line: true, name: 'Bořek' },
      kin({ id: 3, age: 30, sex: 'female' }, SUMMER),
      kin({ id: 4, age: 10, sex: 'male' }, SUMMER),
    ],
    [{ ...dwelling(1), position: { ...HOME, rotation: 0 } }],
    {
      lastDay: SUMMER - 1,
      storesKg: 300,
      livestock: { herds: { ...NO_HERD, sheep: 10 }, young: { ...NO_HERD } },
    },
  );
}

const villageC = (): VillageState =>
  village(
    [kin({ id: 1, age: 20, sex: 'male' }, SUMMER), kin({ id: 2, age: 25, sex: 'male' }, SUMMER)],
    [dwelling(1)],
    { lastDay: SUMMER - 1, fortifications: [palisade(true)] },
  );

interface World {
  deps: CommandAlarmDeps;
  campaigns: InMemoryCampaigns;
  villages: InMemoryVillages;
  a: string;
  c: string;
  d: string;
}

interface Setup {
  /** Kde vojsko viděli (x na mapě A). */
  seenX?: number;
  /** Kandidáti hradišť zapsaní tažením (bez – žádné). */
  hosts?: boolean;
  /** Ves A o vojsku ví (jinak vesničan ještě běží). */
  warned?: boolean;
  /** Stav A navíc (útěk). */
  a?: (state: VillageState) => VillageState;
  /** Bez tažení (skončilo). */
  noCampaign?: boolean;
  /** Úprava stavu tažení (posel do hradiště). */
  tweak?: (s: CampaignState, w: Pick<World, 'a' | 'c' | 'd'>) => void;
}

async function setup(o: Setup = {}): Promise<World> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const campaigns = new InMemoryCampaigns();
  for (const playerId of ['p1', 'p2', 'p3', 'p7']) {
    await houses.create({ playerId, kind: 'player', createdAt: new Date(0) });
  }
  const seat = async (ownerId: string, cell: GridCell): Promise<string> =>
    (await settlements.create({
      ownerId,
      landscapeSeed: 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: cell,
    }))!.id;
  const stateA = (o.a ?? ((s: VillageState) => s))(villageA());
  const a = (await villages.add(await seat('p2', A), 'Vlkov', stateA)).id;
  const c = (await villages.add(await seat('p3', C), 'Hradec', villageC())).id;
  const d = (
    await villages.add(
      await seat('p3', D),
      'Dub',
      village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)]),
    )
  ).id;
  const maps: Record<string, string[]> = { '1,0': [a], '2,0': [c], '2,1': [d] };
  const s = campaign({
    members: [member(1, 0, true), member(2, 1, false)],
    target: { villageId: a, cell: { ...A }, pos: { x: 700, z: 0 } },
  });
  s.phase = 'marching';
  const seenX = o.seenX ?? -900;
  const alarmA: AlarmVillage = {
    villageId: a,
    owner: { playerId: 'p2', npc: false, houseId: 'h2' },
    seenTick: s.tick,
    seenAt: { cell: { ...A }, pos: { x: seenX, z: 0 } },
    warnTick: o.warned === false ? s.tick + 50 : s.tick,
    by: 'villager',
    hosts: o.hosts === false ? [] : [c],
  };
  s.alarm = { villages: [alarmA], messengers: [], flights: [], nextRef: 0 };
  o.tweak?.(s, { a, c, d });
  if (!o.noCampaign) await campaigns.create(s);
  const deps: CommandAlarmDeps = {
    houses,
    settlements,
    villages,
    campaigns,
    cells: {
      mapOf: (cell) =>
        Promise.resolve({
          landscape: land(cell.x === A.x && cell.y === A.y ? grove : undefined),
          obstacles: null,
          villageIds: maps[`${cell.x},${cell.y}`] ?? [],
        }),
    },
    world,
    alarmOwners: {
      domainOf: (villageId) => Promise.resolve(villageId === c ? [{ villageId: d, cell: D }] : []),
    },
  };
  return { deps, campaigns, villages, a, c, d };
}

const view = (w: World, playerId = 'p2', villageId = w.a) =>
  villageAlarmView(w.deps, { playerId, villageId, today: SUMMER });

/** Skutečný čas v taktu kontrolního bodu tažení c1. */
function nowOf(w: World): number {
  const s = JSON.parse(w.campaigns.rows.get('c1')!.state) as CampaignState;
  return msOfTick(s.tick, world) + 10;
}

const command = (w: World, cmd: AlarmCommand, playerId = 'p2', villageId = w.a) =>
  commandAlarm(w.deps, { playerId, villageId, command: cmd, today: SUMMER, nowMs: nowOf(w) });

describe('villageAlarmView (Úloha 12)', () => {
  it('(a) nevarovaná ves – warned false, volby zašedlé, tažení se neprozradí', async () => {
    const w = await setup({ warned: false });
    const v = (await view(w))!;
    expect(v).toMatchObject({ campaignId: null, warned: false, armyEtaDays: null, ret: null });
    for (const option of Object.values(v.options)) expect(option.blocked).toBe('unwarned');
  });

  it('varovaná ves – volby jdou, odhady ve dnech, posli, lhůta hráče', async () => {
    const w = await setup();
    const v = (await view(w))!;
    expect(v).toMatchObject({ campaignId: 'c1', warned: true, decided: null });
    expect(v.host).toEqual({ villageId: w.c, name: 'Hradec' });
    expect(v.options.messenger.blocked).toBeNull();
    expect(v.options.forest.blocked).toBeNull();
    expect(v.options.people.blocked).toBeNull();
    expect(v.options.all.blocked).toBeNull();
    // se stádem pomaleji než jen lidé; vojsko je daleko
    expect(v.options.all.etaDays!).toBeGreaterThan(v.options.people.etaDays!);
    expect(v.armyEtaDays!).toBeGreaterThan(v.options.people.leaveDays!);
    // výchozí posel vesničan pěšky, pak muž rodu
    expect(v.runners.map((r) => [r.personId, r.name, r.line, r.mounted])).toEqual([
      [1, null, false, false],
      [2, 'Bořek', true, false],
    ]);
    expect(v.runners[0]!.etaDays!).toBeGreaterThan(0);
    // lhůta hráče zmizela (plán 2026-11-14 – Úloha 8); ves bez vojvody vzdání nenabízí
    expect(v).not.toHaveProperty('graceDays');
    expect(v.yieldLord).toBeNull();
    expect(v.messenger).toBeNull();
    expect(v.flight).toBeNull();
    expect(v.domain).toBeUndefined();
  });

  it('(b) varovaná bez hradiště – „Pán nemá hradiště“, les jde', async () => {
    const v = (await view(await setup({ hosts: false })))!;
    expect(v.options.messenger.blocked).toBe('no-hillfort');
    expect(v.options.people.blocked).toBe('no-hillfort');
    expect(v.options.all.blocked).toBe('no-hillfort');
    expect(v.options.forest.blocked).toBeNull();
    expect(v.host).toBeNull();
    expect(ALARM_BLOCKED['no-hillfort']).toBe('Pán nemá hradiště.');
  });

  it('(c) vojsko u domu – „Nestihnou to“ s odhady (vojsko dřív, než opustí mapu)', async () => {
    const v = (await view(await setup({ seenX: 700 })))!;
    for (const mode of ['people', 'all'] as const) {
      const o = v.options[mode];
      expect(o.blocked).toBe('too-late');
      expect(o.leaveDays!).toBeGreaterThanOrEqual(v.armyEtaDays!);
      expect(o.etaDays!).toBeGreaterThan(0);
    }
    expect(v.armyEtaDays!).toBeGreaterThan(0);
  });

  it('(d) cizí hráč – null; pán vsi A ji nevidí', async () => {
    const w = await setup();
    expect(await view(w, 'p7')).toBeNull();
    expect(await view(w, 'p3')).toBeNull();
  });

  it('posel běží a skupina jde – stav, odhad cesty, zašedlé volby', async () => {
    const w = await setup();
    expect(await command(w, { kind: 'messenger' })).toEqual({ ok: true, campaignId: 'c1' });
    const row = w.campaigns.rows.get('c1')!;
    const s = JSON.parse(row.state) as CampaignState;
    const av = s.alarm!.villages[0]!;
    av.messenger = 'c1:a0';
    av.flight = 'c1:a1';
    av.decided = 'player';
    const mover = { cell: { ...A }, pos: { ...HOME }, route: [{ ...C }], leg: null };
    const target = { cell: { ...C }, pos: { x: 0, z: 0 } };
    s.alarm!.messengers.push({
      ...mover,
      target,
      refId: 'c1:a0',
      fromVillageId: w.a,
      personId: 1,
      toVillageId: w.c,
      mounted: false,
      status: 'running',
      departTick: s.tick,
    });
    s.alarm!.flights.push({
      ...mover,
      target,
      refId: 'c1:a1',
      villageId: w.a,
      mode: 'people',
      hostVillageId: w.c,
      people: [{ id: 3, bornDay: SUMMER - 30 * 365, man: false, line: false }],
      foodKg: 0,
      herd: { ...NO_HERD },
      carts: 0,
      status: 'marching',
      departTick: s.tick,
    });
    row.state = JSON.stringify(s);
    const v = (await view(w))!;
    expect(v.decided).toBe('player');
    expect(v.messenger).toEqual({ status: 'running', mounted: false });
    expect(v.flight).toMatchObject({ mode: 'people', status: 'marching' });
    expect(v.flight!.etaDays!).toBeGreaterThan(0);
    expect(v.options.messenger.blocked).toBe('sent');
    expect(v.options.people.blocked).toBe('gone');
    expect(v.options.forest.blocked).toBe('gone');
  });

  it('hradiště hráče – vsi domény, výběr posly (alarm-domain)', async () => {
    const w = await setup({
      tweak: (s, ids) => {
        const target = { cell: { ...C }, pos: { x: 0, z: 0 } };
        s.alarm!.villages[0]!.messenger = 'c1:a0';
        s.alarm!.messengers.push({
          cell: { ...C },
          pos: { x: 0, z: 0 },
          route: [],
          leg: null,
          target,
          refId: 'c1:a0',
          fromVillageId: ids.a,
          personId: 1,
          toVillageId: ids.c,
          mounted: false,
          status: 'arrived',
          departTick: s.tick - 100,
          doneTick: s.tick - 5,
        });
        s.alarm!.villages.push({
          villageId: ids.c,
          owner: { playerId: 'p3', npc: false, houseId: 'h3' },
          seenTick: s.tick - 100,
          seenAt: { cell: { ...A }, pos: { x: -900, z: 0 } },
          warnTick: s.tick - 5,
          by: 'messenger',
          cell: { ...C },
        });
        s.alarm!.villages.sort((x, y) => (x.villageId < y.villageId ? -1 : 1));
      },
    });
    const v = (await view(w, 'p3', w.c))!;
    expect(v.domain).toEqual([{ villageId: w.d, name: 'Dub', warned: false }]);
    expect(v.domainLeft).toBe(WAR.alarm.hillfortMessengers);
    // ves A hradištěm není – doménu nenabízí
    expect((await view(w))!.domain).toBeUndefined();
    expect(await command(w, { kind: 'domain', to: [w.a] }, 'p3', w.c)).toEqual({
      ok: false,
      reason: ALARM_BLOCKED['no-domain'],
    });
    expect(await command(w, { kind: 'domain', to: [w.d] }, 'p3', w.c)).toEqual({
      ok: true,
      campaignId: 'c1',
    });
    expect(w.campaigns.intents.at(-1)!.body).toEqual({
      kind: 'alarm-domain',
      village: w.c,
      to: [w.d],
    });
  });
});

describe('commandAlarm (Úloha 12)', () => {
  it('(e) příkaz – záměr na takt teď + 2; zablokovaný – důvod, žádný záměr', async () => {
    const w = await setup();
    const now = nowOf(w);
    expect(await command(w, { kind: 'flee', mode: 'all' })).toEqual({ ok: true, campaignId: 'c1' });
    expect(w.campaigns.intents).toEqual([
      expect.objectContaining({
        campaignId: 'c1',
        tick: tickOfMs(now, world) + 2,
        byPlayer: 'p2',
        body: { kind: 'alarm-flee', village: w.a, mode: 'all' },
      }),
    ]);
    expect(await command(w, { kind: 'messenger', personId: 2 })).toEqual({
      ok: true,
      campaignId: 'c1',
    });
    expect(w.campaigns.intents.at(-1)!.body).toEqual({
      kind: 'alarm-messenger',
      village: w.a,
      personId: 2,
    });

    const late = await setup({ hosts: false });
    expect(await command(late, { kind: 'flee', mode: 'people' })).toEqual({
      ok: false,
      reason: 'Pán nemá hradiště.',
    });
    // žena posla nedělá
    expect(await command(late, { kind: 'messenger', personId: 3 })).toEqual({
      ok: false,
      reason: 'Pán nemá hradiště.',
    });
    expect(await command(w, { kind: 'messenger', personId: 3 })).toEqual({
      ok: false,
      reason: ALARM_BLOCKED['no-runner'],
    });
    expect(late.campaigns.intents).toEqual([]);
  });

  it('cizí hráč a pán vsi bez práva `war`; nevarovaná ves', async () => {
    const w = await setup();
    expect((await command(w, { kind: 'flee', mode: 'forest' }, 'p7')).ok).toBe(false);
    expect((await command(w, { kind: 'flee', mode: 'forest' }, 'p3')).ok).toBe(false);
    const quiet = await setup({ warned: false });
    expect(await command(quiet, { kind: 'flee', mode: 'forest' })).toEqual({
      ok: false,
      reason: ALARM_BLOCKED.unwarned,
    });
    expect([...w.campaigns.intents, ...quiet.campaigns.intents]).toEqual([]);
  });
});

describe('Vrátit se v pohledu (f)', () => {
  /** Lidé 3 a 4 odešli do lesa (ukrytí – `hidden`). */
  const fled =
    (hidden: boolean) =>
    (v: VillageState): VillageState => {
      applyRefugeDepart(v, SUMMER - 2, {
        kind: 'refuge-depart',
        campaignId: 'c1',
        refId: 'c1:a1',
        mode: 'forest',
        hostVillageId: null,
        people: [3, 4],
        carriedKg: 0,
        herd: { ...NO_HERD },
      });
      if (hidden) v.refuge!.hidden = { foodKg: 0, herd: { ...NO_HERD } };
      return v;
    };

  it('po skončeném tažení – návrat jde, dokud lidé nedorazili, ne', async () => {
    const back = (await view(await setup({ noCampaign: true, a: fled(true) })))!;
    expect(back).toMatchObject({ warned: false, campaignId: null, ret: { blocked: null } });
    const walking = (await view(await setup({ noCampaign: true, a: fled(false) })))!;
    expect(walking.ret).toEqual({ blocked: REFUGE_RETURN_REASONS.notArrived });
  });

  it('rozhodnutý návrat – „Lidé se už vracejí.“ a za kolik dní budou doma', async () => {
    const w = await setup({ noCampaign: true, a: fled(true) });
    await w.villages.inbox.post({
      villageId: w.a,
      day: SUMMER + 2,
      ref: 'refuge-back:c1:a1',
      body: { kind: 'refuge-back', refId: 'c1:a1', foodKg: 0, herd: { ...NO_HERD } },
    });
    expect((await view(w))!.ret).toEqual({
      blocked: REFUGE_RETURN_REASONS.returning,
      backInDays: 2,
    });
  });

  it('vojsko na mapě vsi – „Vojsko je ještě na mapě.“', async () => {
    const w = await setup({
      a: fled(true),
      tweak: (s) => {
        for (const g of s.groups) g.cell = { ...A };
      },
    });
    expect((await view(w))!.ret).toEqual({ blocked: REFUGE_RETURN_REASONS.army });
  });
});

describe('vzdání vojvody (plán 2026-11-14 – Úloha 8)', () => {
  /** Vojvoda = muž rodu 2 (Bořek) vsi A; vojsko stojí na mapě A (cíl tažení). */
  const lordSetup = (o: Setup = {}): Promise<World> =>
    setup({
      ...o,
      tweak: (s, ids) => {
        s.alarm!.villages[0]!.owner.lordId = 2;
        for (const g of s.groups) g.cell = { ...A };
        o.tweak?.(s, ids);
      },
    });
  const gone = (state: VillageState): VillageState => ({
    ...state,
    people: state.people.map((p) => (p.id === 2 ? { ...p, away: { kind: 'journey' } } : p)),
  });

  /** Varování z c1 o kus starší – nejnovější zůstává c1. */
  const olderAlarm = (w: World): CampaignState['alarm'] => {
    const alarm = (JSON.parse(w.campaigns.rows.get('c1')!.state) as CampaignState).alarm!;
    for (const v of alarm.villages) v.warnTick -= 10;
    return alarm;
  };

  it('vojvoda doma a vojsko na mapě cíle – jde', async () => {
    const v = (await view(await lordSetup()))!;
    expect(v.yieldLord).toEqual({ blocked: null });
  });

  it('vojvoda na výjezdu – lordAway; ves bez hráčova muže – null', async () => {
    const away = (await view(await lordSetup({ a: gone })))!;
    expect(away.yieldLord).toEqual({ blocked: 'lordAway' });
    expect(ALARM_BLOCKED.lordAway).toBe('Vojvoda není doma.');
    expect((await view(await setup()))!.yieldLord).toBeNull();
  });

  it('vojsko ještě nepřišlo na mapu cíle – notRaided', async () => {
    const w = await lordSetup({
      tweak: (s) => {
        for (const g of s.groups) g.cell = { ...C };
      },
    });
    expect((await view(w))!.yieldLord).toEqual({ blocked: 'notRaided' });
    expect(ALARM_BLOCKED.notRaided).toBe('Vojsko ještě nepřišlo.');
    expect(await command(w, { kind: 'yield-lord' })).toEqual({
      ok: false,
      reason: 'Vojsko ještě nepřišlo.',
    });
    expect(w.campaigns.intents).toEqual([]);
  });

  it('příkaz yield-lord – záměr lord-surrender na takt teď + 2', async () => {
    const w = await lordSetup();
    const now = nowOf(w);
    expect(await command(w, { kind: 'yield-lord' })).toEqual({ ok: true, campaignId: 'c1' });
    expect(w.campaigns.intents).toEqual([
      expect.objectContaining({
        campaignId: 'c1',
        tick: tickOfMs(now, world) + 2,
        byPlayer: 'p2',
        body: { kind: 'lord-surrender', village: w.a },
      }),
    ]);
  });

  it('druhé tažení na touž ves – vojvoda se vzdal v prvním → lordAway', async () => {
    const w = await lordSetup();
    // první tažení (c0): vojvoda už zajat bez boje – zajatec s klíčem vojvody
    const first = campaign({
      id: 'c0',
      members: [member(1, 0, true)],
      target: { villageId: w.a, cell: { ...A }, pos: { x: 700, z: 0 } },
    });
    first.alarm = olderAlarm(w);
    first.loot = {
      foodKg: 0,
      herd: 0,
      prisoners: [{ id: 'c0:2', ref: { villageId: w.a, personId: 2 }, sinceDay: SUMMER + 1 }],
    };
    await w.campaigns.create(first);
    expect((await view(w))!.yieldLord).toEqual({ blocked: 'lordAway' });
    expect(await command(w, { kind: 'yield-lord' })).toEqual({
      ok: false,
      reason: 'Vojvoda není doma.',
    });
    expect(w.campaigns.intents).toEqual([]);
  });

  it('druhé tažení – vzdání v boji (battle.lordYielded) prvního → lordAway', async () => {
    const w = await lordSetup();
    const first = campaign({
      id: 'c0',
      members: [member(1, 0, true)],
      target: { villageId: w.a, cell: { ...A }, pos: { x: 700, z: 0 } },
    });
    first.alarm = olderAlarm(w);
    first.battle = { lordYielded: 2 } as CampaignState['battle'];
    await w.campaigns.create(first);
    expect((await view(w))!.yieldLord).toEqual({ blocked: 'lordAway' });
  });

  it('po vzdání (alarmEnded) pohled volby varování nenabízí', async () => {
    const w = await lordSetup({
      tweak: (s) => {
        s.returnReason = 'yielded';
        s.phase = 'returning';
      },
    });
    const v = (await view(w))!;
    expect(v.warned).toBe(false);
    expect(v.yieldLord).toBeNull();
  });

  it('vzdání v novějším tažení neskryje starší tažení, které ves dál ohrožuje', async () => {
    const w = await lordSetup({
      tweak: (s) => {
        s.returnReason = 'yielded';
        s.phase = 'returning';
      },
    });
    const other = campaign({
      id: 'c0',
      members: [member(1, 0, true)],
      target: { villageId: w.a, cell: { ...A }, pos: { x: 700, z: 0 } },
    });
    other.alarm = olderAlarm(w);
    await w.campaigns.create(other);
    expect(await view(w)).toMatchObject({ warned: true, campaignId: 'c0' });
    expect(await command(w, { kind: 'flee', mode: 'forest' })).toEqual({
      ok: true,
      campaignId: 'c0',
    });
  });

  it('ves, na kterou vojsko netáhne – bílá vlajka se nenabízí', async () => {
    const w = await lordSetup({
      tweak: (s) => {
        s.target = { villageId: 'jinam', cell: { x: -3, y: 0 }, pos: { x: 0, z: 0 } };
      },
    });
    const v = (await view(w))!;
    expect(v.warned).toBe(true);
    expect(v.yieldLord).toBeNull();
    expect((await command(w, { kind: 'yield-lord' })).ok).toBe(false);
    expect(w.campaigns.intents).toEqual([]);
  });
});
