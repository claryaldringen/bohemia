import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import {
  applyInboxDay,
  type NewVillageEvent,
  type VillageEventBody,
} from '../../village/core/inbox';
import type { Person, VillageState } from '../../village/types';
import type { GridCell } from '../../village/people/world-grid';
import { alarmVillage } from '../alarm';
import type { AlarmMessenger, AlarmOwner, AlarmVillage } from '../alarm-types';
import { stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignState,
  CampaignStep,
  CampaignWorld,
} from '../campaign-types';
import { MarchGridMemo } from '../march-grid';
import { alarmTaken, withoutTaken } from '../messenger';
import { guardPrisonerKey } from '../raid-apply';
import { dayOfTick } from '../ticks';
import { land, palisade } from './battle-fixtures';
import { campaign, intent, MEADOW, SUMMER, world } from './campaign-fixtures';

// Posel z vsi do hradiště (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 5, Otevřené 4, Review Focus 2, 3, 4; Martin 9. 11. 2026: „Posel jde pěšky“, „Kdo je
// poslem, volí hráč“). Tři mapy v řadě: ves A (políčko 1, 0), ves B (2, 0), hradiště C (3, 0)
// s palisádou. Vojsko stojí u domů A a táhne na západ – posel běží na východ.

const A: GridCell = { x: 1, y: 0 };
const B: GridCell = { x: 2, y: 0 };
const C: GridCell = { x: 3, y: 0 };
const OWNER = { playerId: 'p2', npc: false, houseId: 'h2' };
/** Vesničan 20 let a muž rodu 30 let s jezdeckým koněm. */
const VILLAGER = 1;
const LORD = 2;

function villageA(people?: Person[]): VillageState {
  return village(
    people ?? [
      kin({ id: VILLAGER, age: 20, sex: 'male' }, SUMMER),
      { ...kin({ id: LORD, age: 30, sex: 'male' }, SUMMER), line: true },
    ],
    [dwelling(1)],
    {
      lastDay: SUMMER - 1,
      looseHorses: [
        { id: 1, bornDay: SUMMER - 6 * 365, sex: 'male', training: 100, riderId: LORD },
      ],
      defense: { stance: 'defend' },
    },
  );
}

const villageB = village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)], {
  lastDay: SUMMER - 1,
});
const villageC = village([kin({ id: 1, age: 40, sex: 'male' }, SUMMER)], [], {
  lastDay: SUMMER - 1,
  fortifications: [palisade(true)],
});

const mapOf = (villageIds: string[]): CampaignMap => ({
  landscape: land(),
  obstacles: null,
  villageIds,
});
const MAPS: Record<string, CampaignMap> = {
  '1,0': mapOf(['a']),
  '2,0': mapOf(['b']),
  '3,0': mapOf(['c']),
};

function worldWith(
  overrides: Partial<CampaignWorld> = {},
  a: VillageState = villageA(),
): CampaignWorld {
  const states: Record<string, VillageState> = { a, b: villageB, c: villageC };
  return {
    clock: world,
    landscapeOf: (cell) => MAPS[`${cell.x},${cell.y}`] ?? MEADOW,
    villageAt: (id) => states[id] ?? null,
    watcherOf: (id) => (id === 'a' ? { playerId: 'p2', name: 'Vlkov' } : null),
    alarmOf: (id) => (id === 'a' ? OWNER : { playerId: null, npc: true, houseId: `h-${id}` }),
    refugeHostsOf: (id) => (id === 'a' ? [{ villageId: 'c', cell: C }] : []),
    grids: new MarchGridMemo(),
    ...overrides,
  };
}

/**
 * Vojsko 140 m západně od domů A táhne na západ (políčko 0, 0) – A ho spatří v prvním taktu; posel
 * vyběhne (`T0`), až jsou jezdci z dohledu.
 */
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

const send = (tick: number, personId?: number, byPlayer = 'p2'): CampaignIntent =>
  intent(
    tick,
    1,
    { kind: 'alarm-messenger', village: 'a', ...(personId === undefined ? {} : { personId }) },
    byPlayer,
  );

const of = (events: readonly NewVillageEvent[], villageId: string): string[] =>
  events.filter((e) => e.villageId === villageId).map((e) => `${e.body.kind}@${e.day}`);

function warned(step: CampaignStep, id: string): AlarmVillage {
  const v = alarmVillage(step.state, id);
  if (!v) throw new Error(`${id} o vojsku neví`);
  return v;
}

const END = 3000;
/** Posel vyběhne 40 taktů po spatření – jezdci jsou ≈ 190 m od vsi. */
const T0 = 40;

describe('posel do hradiště (Úloha 5)', () => {
  it('(a) záměr majitele A – posel běží pěšky, B varovaná na své mapě, C při příchodu, návrat domů', () => {
    const start = passing();
    const t0 = start.tick + T0;
    const step = stepCampaign(start, start.tick + END, [send(t0)], worldWith());
    expect(step.waiting).toBeNull();
    const [m] = step.state.alarm!.messengers;
    expect(m).toMatchObject({
      refId: 'c1:a0',
      fromVillageId: 'a',
      personId: VILLAGER,
      toVillageId: 'c',
      mounted: false,
      status: 'arrived',
      departTick: t0,
    });
    const a = warned(step, 'a');
    expect(a).toMatchObject({ messenger: 'c1:a0', decided: 'player', hosts: ['c'] });
    const b = warned(step, 'b');
    const c = warned(step, 'c');
    expect(b).toMatchObject({ by: 'messenger', cell: B, seenTick: a.seenTick, seenAt: a.seenAt });
    expect(c).toMatchObject({ by: 'messenger', cell: C, warnTick: m!.doneTick });
    expect(b.warnTick).toBeGreaterThan(t0);
    expect(b.warnTick).toBeLessThan(c.warnTick);
    expect(b.owner).toEqual({ playerId: null, npc: true, houseId: 'h-b' });
    // 2 mapy ≈ 3840 m během 7 m/s ≈ 2200 taktů
    expect(m!.doneTick! - t0).toBeGreaterThan(1900);
    const day = start.day;
    // domů za tolik, kolik běžel
    const back = dayOfTick(m!.doneTick! + (m!.doneTick! - t0), world);
    const events = of(step.villageEvents, 'a');
    expect(events[0]).toBe(`threat-signal@${day}`);
    expect(events).toContain(`messenger-out@${day}`);
    expect(events.filter((e) => e.startsWith('messenger-'))).toEqual([
      `messenger-out@${day}`,
      `messenger-back@${back}`,
    ]);
    // vsi daleko od vojska – signál hrozby den nato (rozhodnutí 13)
    const next = (tick: number): number => dayOfTick(tick, world) + 1;
    expect(of(step.villageEvents, 'b')).toEqual([`threat-signal@${next(b.warnTick)}`]);
    expect(of(step.villageEvents, 'c')).toEqual([`threat-signal@${next(c.warnTick)}`]);
    const out = step.villageEvents.find((e) => e.body.kind === 'messenger-out')!;
    expect(out.body).toEqual({
      kind: 'messenger-out',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: VILLAGER,
      toVillageId: 'c',
      mounted: false,
    });
  });

  it('(b) záměr cizího hráče ani vůdce tažení neplatí; podruhé posla nepošle', () => {
    const start = passing();
    const t0 = start.tick + T0;
    for (const by of ['p9', 'p1']) {
      const step = stepCampaign(start, start.tick + 50, [send(t0, undefined, by)], worldWith());
      expect(step.state.alarm!.messengers).toEqual([]);
      expect(of(step.villageEvents, 'a')).not.toContain(`messenger-out@${start.day}`);
    }
    const twice = stepCampaign(
      start,
      start.tick + 50,
      [send(t0), intent(t0 + 3, 2, { kind: 'alarm-messenger', village: 'a' }, 'p2')],
      worldWith(),
    );
    expect(twice.state.alarm!.messengers).toHaveLength(1);
  });

  it('(c) ves vazala rodu útočníka (neškodné vojsko) posel nevaruje', () => {
    const start = passing();
    const step = stepCampaign(
      start,
      start.tick + END,
      [send(start.tick + T0)],
      worldWith({ harmless: (id) => id === 'b' }),
    );
    expect(alarmVillage(step.state, 'b')).toBeNull();
    expect(alarmVillage(step.state, 'c')).not.toBeNull();
  });

  it('(e) muž rodu, kterého vybral hráč, jede na svém koni – rychleji', () => {
    const start = passing();
    const t0 = start.tick + T0;
    const foot = stepCampaign(start, start.tick + END, [send(t0)], worldWith());
    const rider = stepCampaign(start, start.tick + END, [send(t0, LORD)], worldWith());
    const [m] = rider.state.alarm!.messengers;
    expect(m).toMatchObject({ personId: LORD, mounted: true, status: 'arrived' });
    expect(m!.doneTick! - t0).toBeLessThan(foot.state.alarm!.messengers[0]!.doneTick! - t0);
    // vybraný vesničan jde pěšky
    const chosen = stepCampaign(start, start.tick + 50, [send(t0, VILLAGER)], worldWith());
    expect(chosen.state.alarm!.messengers[0]).toMatchObject({ personId: 1, mounted: false });
  });

  it('(f) bez muže posla nepošle; bez hradiště také ne', () => {
    const start = passing();
    const t0 = start.tick + T0;
    const women = villageA([kin({ id: 5, age: 30, sex: 'female' }, SUMMER)]);
    const none = stepCampaign(start, start.tick + 50, [send(t0)], worldWith({}, women));
    expect(none.state.alarm!.messengers).toEqual([]);
    expect(alarmVillage(none.state, 'a')!.messenger).toBeUndefined();
    const noHost = stepCampaign(
      start,
      start.tick + 50,
      [send(t0)],
      worldWith({ refugeHostsOf: () => [] }),
    );
    expect(noHost.state.alarm!.messengers).toEqual([]);
  });

  it('(g) po 1, 7 a 40 taktech a přes JSON = vcelku', { timeout: 120_000 }, () => {
    const start = passing();
    const end = start.tick + 2600;
    const intents = [send(start.tick + T0)];
    const whole = stepCampaign(start, end, intents, worldWith());
    expect(whole.state.alarm!.messengers[0]!.status).toBe('arrived');
    for (const chunk of [1, 7, 40]) {
      const w = worldWith();
      const events: NewVillageEvent[] = [];
      const notices: CampaignStep['notices'] = [];
      let s = start;
      while (s.tick < end) {
        const next = stepCampaign(s, Math.min(end, s.tick + chunk), intents, w);
        expect(next.waiting).toBeNull();
        events.push(...next.villageEvents);
        notices.push(...next.notices);
        s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
      }
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(events).toEqual(whole.villageEvents);
      expect(notices).toEqual(whole.notices);
    }
  });
});

describe('chycení posla (Otevřené 4)', () => {
  /** Ves A ví a její posel `personId` běží po mapě B (x = 0); skupiny vojska na mapě B. */
  function running(personId: number, groups: { pos: { x: number; z: number } }[]): CampaignState {
    const s = campaign({ liveCommand: false, foodKg: 200 });
    s.phase = 'marching';
    s.groups.forEach((g, i) => {
      const at = groups[i];
      g.cell = at ? { ...B } : { x: 9, y: 9 };
      g.pos = at ? { ...at.pos } : { x: 0, z: 0 };
      g.goal = { cell: { ...g.cell }, pos: { ...g.pos } };
      g.route = [];
      g.arrived = true;
    });
    const seen = { cell: { ...A }, pos: { x: 100, z: 100 } };
    const m: AlarmMessenger = {
      refId: 'c1:a0',
      fromVillageId: 'a',
      personId,
      toVillageId: 'c',
      mounted: false,
      status: 'running',
      departTick: s.tick - 400,
      cell: { ...B },
      pos: { x: 0, z: 0 },
      route: [{ ...C }],
      leg: null,
      target: { cell: { ...C }, pos: { x: 0, z: 0 } },
    };
    s.alarm = {
      villages: [
        {
          villageId: 'a',
          owner: OWNER,
          seenTick: s.tick - 500,
          seenAt: seen,
          warnTick: s.tick - 500,
          by: 'villager',
          messenger: 'c1:a0',
        },
        {
          villageId: 'b',
          owner: { playerId: null, npc: true, houseId: 'h-b' },
          seenTick: s.tick - 500,
          seenAt: seen,
          warnTick: s.tick - 10,
          by: 'messenger',
          cell: { ...B },
        },
      ],
      messengers: [m],
      flights: [],
      nextRef: 1,
    };
    return s;
  }

  it('(d) do 30 m chycen – odvést = vesničan do kořisti, pobít = padne', () => {
    // skupina pěších (1) 20 m od posla, jezdec (skupina 0) daleko
    const start = running(VILLAGER, [{ pos: { x: 0, z: 1900 } }, { pos: { x: 0, z: 20 } }]);
    start.groups[0]!.cell = { x: 9, y: 9 };
    const led = stepCampaign(start, start.tick + 1, [], worldWith());
    const [m] = led.state.alarm!.messengers;
    expect(m).toMatchObject({ status: 'caught', doneTick: start.tick + 1 });
    expect(led.state.loot.people?.map((p) => p.id)).toEqual([VILLAGER]);
    expect(led.state.captives).toEqual([{ villageId: 'a', personId: VILLAGER }]);
    const home = led.villageEvents.filter((e) => e.villageId === 'a');
    expect(home.map((e) => [e.villageId, e.day, e.body])).toEqual([
      [
        'a',
        start.day + 1,
        {
          kind: 'messenger-caught',
          campaignId: 'c1',
          refId: 'c1:a0',
          personId: VILLAGER,
          fate: 'led',
        },
      ],
    ]);
    expect(led.notices).toEqual([
      {
        playerId: 'p2',
        kind: 'messenger-caught',
        payload: { villageId: 'a', name: 'Vlkov', campaignId: 'c1', fate: 'led' },
        gameDay: start.day,
      },
    ]);
    const killer = { ...start, surrendered: 'kill' as const };
    const killed = stepCampaign(killer, start.tick + 1, [], worldWith());
    expect(killed.villageEvents.find((e) => e.villageId === 'a')!.body).toMatchObject({
      fate: 'killed',
    });
    expect(killed.state.loot.people).toBeUndefined();
    // nechat – běží dál
    const leave = stepCampaign(
      { ...start, surrendered: 'leave' as const },
      start.tick + 1,
      [],
      worldWith(),
    );
    expect(leave.state.alarm!.messengers[0]!.status).toBe('running');
  });

  it('(d) jezdec ho vidí na 120 m – chycen; pěší na 120 m ne', () => {
    const riders = running(VILLAGER, [{ pos: { x: 0, z: 120 } }]);
    const seen = stepCampaign(riders, riders.tick + 1, [], worldWith());
    expect(seen.state.alarm!.messengers[0]!.status).toBe('caught');
    const walkers = running(VILLAGER, [{ pos: { x: 0, z: 1900 } }, { pos: { x: 0, z: 120 } }]);
    walkers.groups[0]!.cell = { x: 9, y: 9 };
    const free = stepCampaign(walkers, walkers.tick + 1, [], worldWith());
    expect(free.state.alarm!.messengers[0]!.status).toBe('running');
  });

  it('muže rodu NPC velitel zajme – do zajetí ve vsi shromaždiště', () => {
    const start = running(LORD, [{ pos: { x: 0, z: 20 } }]);
    const step = stepCampaign(start, start.tick + 1, [], worldWith());
    // klíč zajetí s vsí posla (nález z Úlohy 8 – `<tažení>:<osoba>` by se mohl potkat s lidmi
    // napadené vsi; jako u uprchlíků `guardPrisonerKey`)
    const key = guardPrisonerKey('c1', { villageId: 'a', personId: LORD });
    expect(key).toBe('c1:a:2');
    const event = step.villageEvents.find((e) => e.villageId === 'a')!;
    expect(event.body).toEqual({
      kind: 'messenger-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      personId: LORD,
      fate: 'captured',
      captorVillageId: 'lhota',
      prisonerId: key,
    });
    expect(step.state.loot.prisoners).toEqual([
      { id: key, ref: { villageId: 'a', personId: LORD }, sinceDay: start.day + 1 },
    ]);
    expect(step.state.loot.people).toBeUndefined();
    // domov posla: zajetí pod týmž klíčem, jaký nese vězeň v kořisti
    const home = villageA();
    const lord = home.people.find((p) => p.id === LORD)!;
    lord.away = { kind: 'messenger', hostVillageId: 'c', refId: 'c1:a0' };
    applyInboxDay(home, event.day, [{ id: 'e1', seq: 1, ...event }]);
    expect(lord.away).toEqual({ kind: 'captive', hostVillageId: 'lhota', refId: key });
    // starší událost bez klíče – zajetí jako dřív (`<tažení>:<osoba>`)
    const old = villageA();
    const oldLord = old.people.find((p) => p.id === LORD)!;
    oldLord.away = { kind: 'messenger', hostVillageId: 'c', refId: 'c1:a0' };
    const body = { ...event.body } as Extract<VillageEventBody, { kind: 'messenger-caught' }>;
    delete body.prisonerId;
    applyInboxDay(old, event.day, [{ ...event, id: 'e1', seq: 1, body }]);
    expect(oldLord.away).toEqual({ kind: 'captive', hostVillageId: 'lhota', refId: 'c1:2' });
  });
});

describe('den odchodu (Review Focus 2)', () => {
  it('(h) posel, který dnes vyběhl, v boji téhož dne mezi obránci není', () => {
    /** Vojsko stojí u A (cíl) – boj se otevře v prvním taktu nájezdu. */
    const raid = (): CampaignState => {
      const s = campaign({
        liveCommand: false,
        foodKg: 200,
        target: { villageId: 'a', cell: { ...A }, pos: { x: 0, z: 0 } },
      });
      s.phase = 'raiding';
      for (const g of s.groups) {
        g.cell = { ...A };
        g.pos = { x: 100, z: 100 };
        g.goal = { cell: { ...A }, pos: { x: 100, z: 100 } };
        g.route = [];
        g.arrived = true;
      }
      s.alarm = {
        villages: [
          {
            villageId: 'a',
            owner: OWNER,
            seenTick: s.tick - 50,
            seenAt: { cell: { ...A }, pos: { x: 100, z: 100 } },
            warnTick: s.tick - 50,
            by: 'villager',
          },
        ],
        messengers: [],
        flights: [],
        nextRef: 0,
      };
      return s;
    };
    const defenders = (step: CampaignStep): number[] =>
      step.state
        .battle!.fighters.filter((f) => f.side === 'defend')
        .map((f) => f.ref)
        .sort((x, y) => x - y);
    const start = raid();
    const without = stepCampaign(start, start.tick + 1, [], worldWith());
    expect(defenders(without)).toEqual([VILLAGER, LORD]);
    const withMessenger = stepCampaign(start, start.tick + 1, [send(start.tick + 1)], worldWith());
    expect(withMessenger.state.alarm!.messengers).toHaveLength(1);
    expect(defenders(withMessenger)).toEqual([LORD]);
    // co tažení z vsi dnes odvedlo
    const taken = alarmTaken(withMessenger.state, 'a', start.day, world);
    expect([...taken.people]).toEqual([VILLAGER]);
    expect(withoutTaken(villageA(), taken).people.map((p) => p.id)).toEqual([LORD]);
    expect(alarmTaken(withMessenger.state, 'b', start.day, world).people.size).toBe(0);
  });
});

describe('hradiště varuje doménu (Úloha 6, Otevřené 5)', () => {
  /**
   * Doména hradiště C (políčko 3, 0): vsi e1–e5 do 3 políček od spatření (A – 1, 0), e6 dál, B už
   * ví. Nejbližší k místu spatření: e1, e2 (√2), e3, e4 (√5), e5 (√10).
   */
  const DOMAIN: Record<string, GridCell> = {
    b: B,
    c: C,
    e1: { x: 2, y: 1 },
    e2: { x: 2, y: -1 },
    e3: { x: 3, y: 1 },
    e4: { x: 3, y: -1 },
    e5: { x: 4, y: 1 },
    e6: { x: 5, y: 0 },
  };
  /** Hradiště s pěti muži 20–24 let – každý posel jiný (nejmladší první). */
  const hillfort = village(
    [20, 21, 22, 23, 24].map((age, i) => kin({ id: i + 1, age, sex: 'male' }, SUMMER)),
    [dwelling(1)],
    { lastDay: SUMMER - 1, fortifications: [palisade(true)] },
  );
  const small = village([kin({ id: 1, age: 40, sex: 'female' }, SUMMER)], [dwelling(1)], {
    lastDay: SUMMER - 1,
  });
  const domainMaps: Record<string, CampaignMap> = { ...MAPS };
  for (const [id, cell] of Object.entries(DOMAIN)) {
    if (id.startsWith('e')) domainMaps[`${cell.x},${cell.y}`] = mapOf([id]);
  }
  const HILLFORT_NPC: AlarmOwner = { playerId: null, npc: true, houseId: 'h-c' };
  const HILLFORT_PLAYER: AlarmOwner = { playerId: 'p3', npc: false, houseId: 'h3' };

  function domainWorld(owner = HILLFORT_NPC): CampaignWorld {
    return worldWith({
      landscapeOf: (cell) => domainMaps[`${cell.x},${cell.y}`] ?? MEADOW,
      villageAt: (id) =>
        id === 'a' ? villageA() : id === 'c' ? hillfort : id in DOMAIN ? small : null,
      alarmOf: (id) =>
        id === 'a' ? OWNER : id === 'c' ? owner : { playerId: null, npc: true, houseId: `h-${id}` },
      domainOf: (id) =>
        id === 'c' ? Object.entries(DOMAIN).map(([villageId, cell]) => ({ villageId, cell })) : [],
    });
  }

  /** Posel A doběhne do hradiště C za pár taktů; B už ví, vojsko je daleko (9, 9). */
  function arriving(): CampaignState {
    const s = campaign({ liveCommand: false, foodKg: 200 });
    s.phase = 'marching';
    for (const g of s.groups) {
      g.cell = { x: 9, y: 9 };
      g.pos = { x: 0, z: 0 };
      g.goal = { cell: { x: 9, y: 9 }, pos: { x: 0, z: 0 } };
      g.route = [];
      g.arrived = true;
    }
    const seen = { cell: { ...A }, pos: { x: 100, z: 100 } };
    const known = (villageId: string, owner: AlarmVillage['owner']): AlarmVillage => ({
      villageId,
      owner,
      seenTick: s.tick - 900,
      seenAt: structuredClone(seen),
      warnTick: s.tick - 900,
      by: 'villager',
    });
    s.alarm = {
      villages: [
        { ...known('a', OWNER), messenger: 'c1:a0' },
        { ...known('b', { playerId: null, npc: true, houseId: 'h-b' }), by: 'messenger', cell: B },
      ],
      messengers: [
        {
          refId: 'c1:a0',
          fromVillageId: 'a',
          personId: VILLAGER,
          toVillageId: 'c',
          mounted: false,
          status: 'running',
          departTick: s.tick - 800,
          cell: { ...C },
          pos: { x: 0, z: -60 },
          route: [],
          leg: null,
          target: { cell: { ...C }, pos: { x: 0, z: 0 } },
        },
      ],
      flights: [],
      nextRef: 1,
    };
    return s;
  }

  const domainOut = (step: CampaignStep): AlarmMessenger[] =>
    step.state.alarm!.messengers.filter((m) => m.fromVillageId === 'c');

  it('(a) posel doběhne do hradiště NPC – nejvýš 4 poslové do nevarovaných vsí domény, nejbližší první', () => {
    const start = arriving();
    const step = stepCampaign(start, start.tick + 50, [], domainWorld());
    expect(step.waiting).toBeNull();
    const c = warned(step, 'c');
    const sent = domainOut(step);
    expect(sent.map((m) => [m.refId, m.toVillageId, m.personId])).toEqual([
      ['c1:a1', 'e1', 1],
      ['c1:a2', 'e2', 2],
      ['c1:a3', 'e3', 3],
      ['c1:a4', 'e4', 4],
    ]);
    expect(c.domain).toEqual(['c1:a1', 'c1:a2', 'c1:a3', 'c1:a4']);
    expect(sent.every((m) => m.departTick === c.warnTick && !m.mounted)).toBe(true);
    // poslové hradiště odešli dnes – domů `messenger-out` na týž den
    expect(
      step.villageEvents
        .filter((e) => e.villageId === 'c' && e.body.kind === 'messenger-out')
        .map((e) => [e.day, (e.body as { toVillageId: string }).toVillageId]),
    ).toEqual(['e1', 'e2', 'e3', 'e4'].map((id) => [start.day, id]));
    // v hradišti zbyl jen pátý muž
    expect([...alarmTaken(step.state, 'c', start.day, world).people]).toEqual([1, 2, 3, 4]);
    // doběhnou a varují; e5 (pátý) ani e6 (dál než 3 políčka) ne
    const later = stepCampaign(step.state, start.tick + 2000, [], domainWorld());
    for (const id of ['e1', 'e2', 'e3', 'e4']) {
      expect(warned(later, id)).toMatchObject({ by: 'messenger', seenAt: c.seenAt });
    }
    expect(alarmVillage(later.state, 'e5')).toBeNull();
    expect(alarmVillage(later.state, 'e6')).toBeNull();
    // posel hradiště, který doběhl, další posly nerozesílá
    expect(later.state.alarm!.messengers).toHaveLength(5);
  });

  it('(b) hradiště hráče – nic, dokud hráč nevybere vsi (`alarm-domain`)', () => {
    const start = arriving();
    const idle = stepCampaign(start, start.tick + 50, [], domainWorld(HILLFORT_PLAYER));
    expect(domainOut(idle)).toEqual([]);
    expect(warned(idle, 'c').domain).toBeUndefined();
    const at = warned(idle, 'c').warnTick + 2;
    const pick = (tick: number, seq: number, to: string[], by = 'p3'): CampaignIntent =>
      intent(tick, seq, { kind: 'alarm-domain', village: 'c', to }, by);
    const step = stepCampaign(
      start,
      start.tick + 50,
      [
        // cizí hráč (majitel A) za hradiště nerozhoduje
        pick(at, 1, ['e1'], 'p2'),
        // e6 je dál než 3 políčka, B už ví, x do domény nepatří, c je hradiště samo
        pick(at, 2, ['e3', 'e1', 'e6', 'b', 'x', 'c']),
        // nejvýš 4 poslové celkem
        pick(at + 1, 3, ['e5', 'e2', 'e4']),
      ],
      domainWorld(HILLFORT_PLAYER),
    );
    expect(domainOut(step).map((m) => [m.toVillageId, m.departTick])).toEqual([
      ['e1', at],
      ['e3', at],
      ['e2', at + 1],
      ['e4', at + 1],
    ]);
    expect(warned(step, 'c').domain).toHaveLength(4);
  });

  it('(c) bez portu domény hradiště nikoho neposílá; nenačtená doména – takt čeká', () => {
    const start = arriving();
    const none = stepCampaign(start, start.tick + 50, [], {
      ...domainWorld(),
      domainOf: undefined,
    });
    expect(domainOut(none)).toEqual([]);
    const waiting = stepCampaign(start, start.tick + 50, [], {
      ...domainWorld(),
      domainOf: () => null,
    });
    expect(waiting.waiting).toEqual({ cells: [], villageIds: ['c'] });
    expect(waiting.state.alarm!.messengers[0]!.status).toBe('running');
  });

  it('(d) po 1, 7 a 40 taktech a přes JSON = vcelku', { timeout: 120_000 }, () => {
    const start = arriving();
    const end = start.tick + 1200;
    const whole = stepCampaign(start, end, [], domainWorld());
    expect(domainOut(whole)).toHaveLength(4);
    for (const chunk of [1, 7, 40]) {
      const w = domainWorld();
      const events: NewVillageEvent[] = [];
      let s = start;
      while (s.tick < end) {
        const next = stepCampaign(s, Math.min(end, s.tick + chunk), [], w);
        expect(next.waiting).toBeNull();
        events.push(...next.villageEvents);
        s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
      }
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(events).toEqual(whole.villageEvents);
    }
  });
});
