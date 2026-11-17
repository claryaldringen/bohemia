import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent, VillageEventBody } from '../../village/core/inbox';
import { guestFoodNeed } from '../../village/people/people';
import { applyRefugeDepart } from '../../village/fortification/state/refugees';
import type { FlightMode, Person, RefugeePerson, VillageState } from '../../village/types';
import type { GridCell } from '../../village/people/world-grid';
import type { AlarmFlight } from '../alarm-types';
import { stepCampaign } from '../campaign';
import type {
  CampaignIntent,
  CampaignMap,
  CampaignNotice,
  CampaignState,
  CampaignWorld,
} from '../campaign-types';
import { alarmTaken } from '../evacuation';
import { nearestForestDoor } from '../forest-doors';
import { marchCellAt, marchGrid, MarchGridMemo } from '../march-grid';
import { dayOfTick } from '../ticks';
import { land, palisade } from './battle-fixtures';
import { campaign, intent, MEADOW, member, stepInChunks, SUMMER, world } from './campaign-fixtures';

// Evakuace v tažení (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 – Úloha 8,
// Otevřené 7, 8, Review Focus 2, 3). Ves A (políčko 1, 0) má dům u východního okraje mapy
// (x = 800 m) a hájek 35 m severně od něj; hradiště C (2, 0) s palisádou je soused na východě.
// Vojsko vyjde ze západního okraje mapy A (x = −900 m) – ves ho viděla tam.

const A: GridCell = { x: 1, y: 0 };
const C: GridCell = { x: 2, y: 0 };
/**
 * Hráč p2 je ve vsi – vojvoda (muž rodu 2) doma, ves se zeptá na přítomnost a bez odpovědi čeká na
 * jeho pokyny (war.md – Hráč ve vsi a mimo ni).
 */
const OWNER = { playerId: 'p2', npc: false, houseId: 'h2', lordId: 2 };
const HOME = { x: 800, z: 0 };
const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };
/** Nesou: 4 dospělí × 25 kg + dítě 10 let 10 kg (batole nic). */
const CARRIED = 110;
const STORES = 300;

/** Hájek 4 × 4 políčka krajiny (x 750–810 m, z 30–90 m). */
const grove = (tx: number, ty: number): boolean => tx >= 114 && tx <= 117 && ty >= 66 && ty <= 69;

function villageA(people?: Person[]): VillageState {
  return village(
    people ?? [
      kin({ id: 1, age: 30, sex: 'male' }, SUMMER),
      { ...kin({ id: 2, age: 35, sex: 'male' }, SUMMER), line: true },
      kin({ id: 3, age: 30, sex: 'female' }, SUMMER),
      kin({ id: 4, age: 28, sex: 'female' }, SUMMER),
      kin({ id: 5, age: 10, sex: 'male' }, SUMMER),
      kin({ id: 6, age: 3, sex: 'female' }, SUMMER),
    ],
    [{ ...dwelling(1), position: { ...HOME, rotation: 0 } }],
    {
      lastDay: SUMMER - 1,
      storesKg: STORES,
      livestock: { herds: { ...NO_HERD, sheep: 10, cow: 2 }, young: { ...NO_HERD } },
    },
  );
}

/** Týž stav vsi A pro každý den (svět „ze včerejška“) – týž objekt, ať se mřížka pochodu nestaví znovu. */
const A0 = villageA();
const sameA = (): VillageState => A0;

const villageC = village([kin({ id: 1, age: 40, sex: 'male' }, SUMMER)], [], {
  lastDay: SUMMER - 1,
  fortifications: [palisade(true)],
});

const mapOf = (villageIds: string[], forest?: typeof grove): CampaignMap => ({
  landscape: land(forest),
  obstacles: null,
  villageIds,
});
const MAPS: Record<string, CampaignMap> = { '1,0': mapOf(['a'], grove), '2,0': mapOf(['c']) };
const NAMES: Record<string, string> = { a: 'Vlkov', c: 'Hradec' };

function worldWith(a: () => VillageState, overrides: Partial<CampaignWorld> = {}): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => MAPS[`${cell.x},${cell.y}`] ?? MEADOW,
    villageAt: (id) => (id === 'a' ? a() : id === 'c' ? villageC : null),
    watcherOf: (id) => (id === 'a' ? { playerId: 'p2', name: 'Vlkov' } : null),
    alarmOf: (id) => (id === 'a' ? OWNER : { playerId: null, npc: true, houseId: `h-${id}` }),
    refugeHostsOf: (id) => (id === 'a' ? [{ villageId: 'c', cell: C }] : []),
    villageNameOf: (id) => NAMES[id] ?? null,
    grids: new MarchGridMemo(),
    ...overrides,
  };
}

/**
 * Vojsko (30 mužů) stojí u západního okraje mapy A (`fromX`) a táhne k vsi A (nebo daleko na
 * západ – `away`); ves ho tam viděla a ví o něm.
 */
function approaching(fromX = -900, away = false): CampaignState {
  const target = away
    ? { villageId: 'knezice', cell: { x: -3, y: 0 }, pos: { x: 0, z: 0 } }
    : { villageId: 'a', cell: { ...A }, pos: { x: 700, z: 0 } };
  const members = [member(1, 0, true)];
  for (let i = 2; i <= 30; i++) members.push(member(i, 1, false));
  // jídla na cestu tam i zpět (NPC velitel se jinak obrátí) a nosnost na kořist
  const s = campaign({ liveCommand: false, foodKg: 400, members, target });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...A };
    g.pos = { x: fromX, z: 0 };
    g.goal = structuredClone(target);
    g.route = away ? [0, -1, -2, -3].map((x) => ({ x, y: 0 })) : [];
    g.arrived = false;
  }
  s.alarm = {
    villages: [
      {
        villageId: 'a',
        owner: OWNER,
        seenTick: s.tick,
        seenAt: { cell: { ...A }, pos: { x: fromX, z: 0 } },
        warnTick: s.tick,
        by: 'villager',
        hosts: ['c'],
      },
    ],
    messengers: [],
    flights: [],
    nextRef: 0,
  };
  return s;
}

const flee = (tick: number, mode: FlightMode, byPlayer = 'p2'): CampaignIntent =>
  intent(tick, 1, { kind: 'alarm-flee', village: 'a', mode }, byPlayer);

const of = (events: readonly NewVillageEvent[], villageId: string): string[] =>
  events.filter((e) => e.villageId === villageId).map((e) => `${e.body.kind}@${e.day}`);

const bodyOf = <K extends VillageEventBody['kind']>(
  events: readonly NewVillageEvent[],
  kind: K,
): Extract<VillageEventBody, { kind: K }> => {
  const e = events.find((x) => x.body.kind === kind);
  if (!e) throw new Error(`chybí ${kind}`);
  return e.body as Extract<VillageEventBody, { kind: K }>;
};

/** Poslední takt herního dne, do kterého patří takt `tick`. */
function dayEnd(tick: number): number {
  const day = dayOfTick(tick, world);
  let t = tick;
  while (dayOfTick(t + 1, world) === day) t++;
  return t;
}

interface Run {
  state: CampaignState;
  events: NewVillageEvent[];
  notices: CampaignNotice[];
  /** Ves A, jak ji dopočetl svět (s odchodem skupiny). */
  a: VillageState;
}

/**
 * Tažení po herních dnech jako u workeru (bariéra Ú6.7): ves A dopočte den, až ho tažení dokončí –
 * odchod skupiny (`refuge-depart` na týž den) zná stav vsi až ode dne nato.
 */
function live(
  start: CampaignState,
  end: number,
  intents: readonly CampaignIntent[],
  overrides: Partial<CampaignWorld> = {},
): Run {
  let a = villageA();
  const w = worldWith(() => a, overrides);
  const events: NewVillageEvent[] = [];
  const notices: CampaignNotice[] = [];
  let s = start;
  while (s.tick < end && s.phase !== 'done') {
    const step = stepCampaign(s, Math.min(end, dayEnd(s.tick + 1)), intents, w);
    expect(step.waiting).toBeNull();
    events.push(...step.villageEvents);
    notices.push(...step.notices);
    s = step.state;
    const next = structuredClone(a);
    for (const e of step.villageEvents) {
      if (e.villageId === 'a' && e.body.kind === 'refuge-depart' && e.day <= s.day) {
        applyRefugeDepart(next, e.day, e.body);
      }
    }
    a = next;
  }
  return { state: s, events, notices, a };
}

function flightOf(state: CampaignState): AlarmFlight {
  const f = state.alarm?.flights[0];
  if (!f) throw new Error('skupina neodešla');
  return f;
}

const flightHidden = (s: CampaignState): boolean => s.alarm?.flights[0]?.status === 'hidden';

/** Jídlo skupiny od dne odchodu do dne příchodu (každý den podle věku – jako host). */
function eatenOnTheWay(people: readonly RefugeePerson[], fromDay: number, toDay: number): number {
  let kg = 0;
  for (let day = fromDay; day <= toDay; day++) {
    for (const p of people) kg += guestFoodNeed(p, day);
  }
  return kg;
}

const END = 3200;

describe('evakuace do hradiště (Úloha 8)', () => {
  it('(a, h) „Do hradiště – se vším“ – skupina dojde se zásobami po jídle na cestě, vojsko najde prázdnou ves', () => {
    const start = approaching();
    const t0 = start.tick + 1;
    const run = live(start, start.tick + END, [flee(t0, 'all'), flee(t0 + 5, 'people')]);
    const f = flightOf(run.state);
    expect(run.state.alarm!.flights).toHaveLength(1);
    expect(f).toMatchObject({
      refId: 'c1:a0',
      villageId: 'a',
      mode: 'all',
      hostVillageId: 'c',
      status: 'arrived',
      departTick: t0,
      carried: { foodKg: CARRIED, herd: { ...NO_HERD, sheep: 10, cow: 2 } },
    });
    expect(run.state.alarm!.villages[0]).toMatchObject({ flight: 'c1:a0', decided: 'player' });
    const day0 = start.day;
    const arrivedDay = dayOfTick(f.doneTick!, world);
    expect(of(run.events, 'a')).toContain(`refuge-depart@${day0}`);
    const depart = bodyOf(run.events, 'refuge-depart');
    expect(depart).toEqual({
      kind: 'refuge-depart',
      campaignId: 'c1',
      refId: 'c1:a0',
      mode: 'all',
      hostVillageId: 'c',
      people: [1, 2, 3, 4, 5, 6],
      carriedKg: CARRIED,
      herd: { ...NO_HERD, sheep: 10, cow: 2 },
      hostName: 'Hradec',
    });
    // hradiště dostane uprchlíky den nato, se zásobami po jídle na cestě (h – bilance obilí)
    expect(of(run.events, 'c')).toContain(`refuge-arrive@${arrivedDay + 1}`);
    const arrive = bodyOf(run.events, 'refuge-arrive');
    expect(arrive).toMatchObject({
      refId: 'c1:a0',
      fromVillageId: 'a',
      fromName: 'Vlkov',
      herd: { ...NO_HERD, sheep: 10, cow: 2 },
    });
    expect(arrive.people.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
    const eaten = eatenOnTheWay(arrive.people, day0, arrivedDay);
    expect(eaten).toBeGreaterThan(0);
    expect(arrive.foodKg + eaten).toBeCloseTo(CARRIED, 6);
    expect(run.notices).toContainEqual({
      playerId: 'p2',
      kind: 'refuge-arrived',
      payload: {
        villageId: 'a',
        name: 'Vlkov',
        campaignId: 'c1',
        hostVillageId: 'c',
        hostName: 'Hradec',
      },
      gameDay: arrivedDay,
      ref: expect.any(String),
    });
    // prázdná ves: obránci žádní, kořist = zásoby mimo nesené, dobytek odešel celý
    expect(run.a.storesKg + depart.carriedKg).toBeCloseTo(STORES, 6);
    expect(run.state.raidDay).toBeDefined();
    expect(run.state.raidDay!).toBeGreaterThan(day0);
    expect(run.state.battle!.fighters.filter((x) => x.side === 'defend')).toEqual([]);
    const loot = run.state.loot.detail!;
    expect(loot.grainKg).toBeCloseTo(STORES - CARRIED, 6);
    expect(loot.livestock).toEqual(NO_HERD);
    // bilance obilí: ves + skupina (snědla + donesla) + kořist = zásoby před odchodem
    expect(run.a.storesKg - loot.grainKg + loot.grainKg + arrive.foodKg + eaten).toBeCloseTo(
      STORES,
      6,
    );
  });

  it('Začít znovu útočníka (war.md) = „Domů“ – vojsko odtáhne, skupina dojde a varování skončí', () => {
    const start = approaching();
    start.liveCommand = true;
    const t0 = start.tick + 1;
    const run = (back: CampaignIntent['body']): Run =>
      live(start, start.tick + END, [flee(t0, 'all'), intent(t0 + 40, 9, back, 'p1')]);
    const restart = run({ kind: 'turn-back', restart: true });
    expect(restart).toEqual(run({ kind: 'turn-back' }));
    expect(restart.state.phase).toBe('done');
    expect(restart.state.battle).toBeUndefined();
    expect(flightOf(restart.state).status).toBe('arrived');
    // vojsko na mapě vsi nestálo – žádné dny nájezdu ani kořist
    expect(restart.events.filter((e) => e.body.kind === 'raid-result')).toEqual([]);
  });

  it('cesta do hradiště nevede – průvod nevyrazí a při nájezdu lidé utečou do lesa i s dobytkem (Martin 17. 11. 2026)', () => {
    // hradiště C od západu odřízne hustý les (pás 600 m) – z vsi A k němu cesta nevede
    const cut = mapOf(['c'], (tx) => tx < 40);
    const landscapeOf = (cell: GridCell): CampaignMap =>
      cell.x === C.x && cell.y === C.y ? cut : (MAPS[`${cell.x},${cell.y}`] ?? MEADOW);
    const start = approaching();
    const t0 = start.tick + 1;
    const run = live(start, start.tick + END, [flee(t0, 'all'), flee(t0 + 5, 'people')], {
      landscapeOf,
    });
    expect(run.state.alarm!.flights).toEqual([]);
    expect(run.state.alarm!.villages[0]!.flight).toBeUndefined();
    expect(run.events.filter((e) => e.body.kind.startsWith('refuge-'))).toEqual([]);
    // ves zůstala doma a zachovala se jako bez varování: lidé utekli do hustého lesa i se stádem
    const shelter = run.state.battle!.shelter!;
    expect(shelter.forest.length).toBeGreaterThan(0);
    expect(run.state.loot.detail?.livestock ?? NO_HERD).toEqual(NO_HERD);
  });

  it('(b) „jen lidé“ – rychleji, stádo a zásoby zůstanou a útočník je vezme', () => {
    const start = approaching();
    const t0 = start.tick + 1;
    const all = flightOf(live(start, start.tick + END, [flee(t0, 'all')]).state);
    const run = live(start, start.tick + END, [flee(t0, 'people')]);
    const f = flightOf(run.state);
    expect(f).toMatchObject({ mode: 'people', status: 'arrived', foodKg: 0, herd: NO_HERD });
    expect(f.doneTick! - t0).toBeLessThan(all.doneTick! - t0);
    expect(bodyOf(run.events, 'refuge-depart')).toMatchObject({ carriedKg: 0, herd: NO_HERD });
    expect(bodyOf(run.events, 'refuge-arrive')).toMatchObject({ foodKg: 0, herd: NO_HERD });
    const loot = run.state.loot.detail!;
    expect(loot.grainKg).toBeCloseTo(STORES, 6);
    expect(loot.livestock).toEqual({ ...NO_HERD, sheep: 10, cow: 2 });
  });

  it('(c2) „Ukrýt v lese“ – skupina nikdy nestojí v neprůchodné buňce a ukryje se u dveří lesa', () => {
    const start = approaching();
    const grid = marchGrid(MAPS['1,0']!.landscape, null, A0, { day: start.day });
    const w = worldWith(sameA);
    let s = start;
    const intents = [flee(start.tick + 1, 'forest')];
    for (let k = 0; k < 400 && flightHidden(s) === false; k++) {
      s = stepInChunks(s, s.tick + 20, { chunk: 20, world: w, intents }).state;
      const f = s.alarm?.flights[0];
      if (f) expect(grid.pace[marchCellAt(grid, f.pos)]!).toBeGreaterThan(0);
    }
    const f = flightOf(s);
    expect(f.status).toBe('hidden');
    const door = nearestForestDoor(grid, f.pos)!;
    expect(Math.hypot(door.x - f.pos.x, door.z - f.pos.z)).toBeLessThan(2);
  });

  it('(c) „Ukrýt v lese“ – skupina se ukryje týž den, v boji nikdo z nich, kořist bez jejich zásob', () => {
    const start = approaching();
    const t0 = start.tick + 1;
    const run = live(start, start.tick + END, [flee(t0, 'forest')]);
    const f = flightOf(run.state);
    expect(f).toMatchObject({ mode: 'forest', hostVillageId: null, status: 'hidden' });
    expect(dayOfTick(f.doneTick!, world)).toBe(start.day);
    expect(of(run.events, 'a').filter((e) => e.startsWith('refuge-'))).toEqual([
      `refuge-depart@${start.day}`,
      `refuge-hidden@${start.day}`,
    ]);
    // les jí doma (Úloha 7) – nesené zásoby se cestou nejedí
    expect(bodyOf(run.events, 'refuge-hidden')).toEqual({
      kind: 'refuge-hidden',
      campaignId: 'c1',
      refId: 'c1:a0',
      foodKg: CARRIED,
      herd: { ...NO_HERD, sheep: 10, cow: 2 },
    });
    expect(bodyOf(run.events, 'refuge-depart')).toMatchObject({ hostVillageId: null });
    expect(bodyOf(run.events, 'refuge-depart').hostName).toBeUndefined();
    expect(run.state.battle!.fighters.filter((x) => x.side === 'defend')).toEqual([]);
    expect(run.state.loot.detail!.grainKg).toBeCloseTo(STORES - CARRIED, 6);
    expect(run.state.loot.detail!.livestock).toEqual(NO_HERD);
  });

  it('(f) volba, kterou `refugeOptions` blokuje (Nestihnou to), i cizí záměr se zahodí', () => {
    // vojsko viděli 150 m od domu – do hradiště to nestihnou ani jen lidé
    const near = approaching(650);
    for (const mode of ['all', 'people'] as const) {
      const step = stepCampaign(near, near.tick + 5, [flee(near.tick + 1, mode)], worldWith(sameA));
      expect(step.state.alarm!.flights).toEqual([]);
      expect(step.state.alarm!.villages[0]!.flight).toBeUndefined();
    }
    const start = approaching();
    for (const by of ['p9', 'p1']) {
      const step = stepCampaign(
        start,
        start.tick + 5,
        [flee(start.tick + 1, 'all', by)],
        worldWith(sameA),
      );
      expect(step.state.alarm!.flights).toEqual([]);
    }
    // bez hradiště jde jen les
    const noHost = worldWith(sameA, { refugeHostsOf: () => [] });
    const none = stepCampaign(start, start.tick + 5, [flee(start.tick + 1, 'all')], noHost);
    expect(none.state.alarm!.flights).toEqual([]);
    const forest = stepCampaign(start, start.tick + 5, [flee(start.tick + 1, 'forest')], noHost);
    expect(forest.state.alarm!.flights).toHaveLength(1);
  });

  it('(g) po 1, 7, 40 a 400 taktech a přes JSON = vcelku', { timeout: 180_000 }, () => {
    // vojsko táhne na západ, skupina na východ do hradiště
    const start = approaching(-900, true);
    const end = start.tick + 3000;
    const intents = [flee(start.tick + 1, 'all')];
    const whole = stepCampaign(start, end, intents, worldWith(sameA));
    expect(whole.waiting).toBeNull();
    expect(flightOf(whole.state).status).toBe('arrived');
    for (const chunk of [1, 7, 40, 400]) {
      const w = worldWith(sameA);
      const {
        state: s,
        villageEvents: events,
        notices,
      } = stepInChunks(start, end, { chunk, world: w, intents });
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(events).toEqual(whole.villageEvents);
      expect(notices).toEqual(whole.notices);
    }
  });
});

describe('dostižení skupiny (Otevřené 8)', () => {
  /**
   * Skupina uprchlíků z A (všech šest, se vším) jde po mapě A (x = 0) k hradišti C; skupiny vojska
   * na mapě A – jezdec (skupina 0) a dva pěší (skupina 1); `null` = skupina daleko.
   */
  function crossing(
    rider: { x: number; z: number } | null,
    walkers: { x: number; z: number } | null,
    people: Person[] = villageA().people,
  ): CampaignState {
    const s = campaign({ liveCommand: false, foodKg: 20 });
    s.phase = 'marching';
    s.groups.forEach((g, i) => {
      const at = i === 0 ? rider : walkers;
      g.cell = at ? { ...A } : { x: 9, y: 9 };
      g.pos = at ? { ...at } : { x: 0, z: 0 };
      g.goal = { cell: { ...g.cell }, pos: { ...g.pos } };
      g.route = [];
      g.arrived = true;
    });
    const refugees: RefugeePerson[] = people.map((p) => ({
      id: p.id,
      bornDay: p.bornDay,
      man: p.sex === 'male' && SUMMER - p.bornDay >= 16 * 365,
      line: p.line === true && p.sex === 'male',
    }));
    const herd = { ...NO_HERD, sheep: 10, cow: 2 };
    s.alarm = {
      villages: [
        {
          villageId: 'a',
          owner: OWNER,
          seenTick: s.tick - 500,
          seenAt: { cell: { ...A }, pos: { x: -900, z: 0 } },
          warnTick: s.tick - 500,
          by: 'villager',
          flight: 'c1:a0',
        },
      ],
      messengers: [],
      flights: [
        {
          refId: 'c1:a0',
          villageId: 'a',
          mode: 'all',
          hostVillageId: 'c',
          people: refugees,
          foodKg: CARRIED,
          herd,
          carts: 0,
          carried: { foodKg: CARRIED, herd: { ...herd } },
          status: 'marching',
          departTick: s.tick - 400,
          cell: { ...A },
          pos: { x: 0, z: 0 },
          route: [{ ...C }],
          leg: null,
          target: { cell: { ...C }, pos: { x: 0, z: 0 } },
        },
      ],
      nextRef: 1,
    };
    return s;
  }

  it('(d) přesila do 30 m – vzdají se: vesničané do kořisti, zásoby do nosnosti, stádo celé; poslední muž rodu jde dál', () => {
    const start = crossing({ x: 0, z: 20 }, { x: 0, z: -20 });
    const step = stepCampaign(start, start.tick + 1, [], worldWith(sameA));
    const f = flightOf(step.state);
    expect(f).toMatchObject({
      status: 'marching',
      caughtTick: start.tick + 1,
      lost: [1, 3, 4, 5, 6],
      foodKg: 0,
      herd: NO_HERD,
    });
    // nosnost: 3 muži × 25 kg − 20 kg zásob vojska
    expect(step.state.loot).toMatchObject({ foodKg: 55, herd: 12 });
    expect(step.state.loot.detail).toMatchObject({
      grainKg: 55,
      livestock: { ...NO_HERD, sheep: 10, cow: 2 },
    });
    expect(step.state.loot.people?.map((p) => p.id)).toEqual([1, 3, 4, 5, 6]);
    expect(step.state.captives).toHaveLength(5);
    const refugeEvents = step.villageEvents.filter((e) => e.body.kind.startsWith('refuge-'));
    expect(refugeEvents.map((e) => [e.villageId, e.day, e.body])).toEqual([
      [
        'a',
        start.day + 1,
        {
          kind: 'refuge-caught',
          campaignId: 'c1',
          refId: 'c1:a0',
          killed: [],
          led: [1, 3, 4, 5, 6],
        },
      ],
    ]);
    expect(step.notices).toEqual([
      {
        playerId: 'p2',
        kind: 'refuge-caught',
        payload: {
          villageId: 'a',
          name: 'Vlkov',
          campaignId: 'c1',
          killed: 0,
          led: 5,
          captured: 0,
        },
        gameDay: start.day,
        ref: expect.any(String),
      },
    ]);
    // jen jednou – další takt nic
    const later = stepCampaign(step.state, step.state.tick + 1, [], worldWith(sameA));
    expect(later.villageEvents.filter((e) => e.body.kind === 'refuge-caught')).toEqual([]);
    expect(later.state.loot.foodKg).toBe(55);
  });

  it('(d) bez přesily jde skupina dál; pobít – padnou; muže rodu zajmou', () => {
    // dva pěší proti dvěma mužům uprchlíků – bez přesily
    const even = crossing(null, { x: 0, z: -20 });
    const free = stepCampaign(even, even.tick + 1, [], worldWith(sameA));
    expect(flightOf(free.state)).toMatchObject({ status: 'marching', foodKg: CARRIED });
    expect(flightOf(free.state).caughtTick).toBeUndefined();
    expect(free.villageEvents.filter((e) => e.body.kind.startsWith('refuge-'))).toEqual([]);
    // pobít – vesničané padnou, poslední muž rodu uteče
    const killer = { ...crossing({ x: 0, z: 20 }, { x: 0, z: -20 }), surrendered: 'kill' as const };
    const killed = stepCampaign(killer, killer.tick + 1, [], worldWith(sameA));
    expect(bodyOf(killed.villageEvents, 'refuge-caught')).toMatchObject({
      killed: [1, 3, 4, 5, 6],
      led: [],
    });
    expect(killed.state.loot.people).toBeUndefined();
    // dva muži rodu – NPC velitel je zajme (jako posla), ostatní odvede; nikdo nejde dál
    const two: Person[] = villageA().people.map((p) =>
      p.id === 1 ? { ...p, line: true as const } : p,
    );
    const lords = crossing({ x: 0, z: 20 }, { x: 0, z: -20 }, two);
    const lordsA = villageA(two);
    const world2 = worldWith(() => lordsA);
    const taken = stepCampaign(lords, lords.tick + 1, [], world2);
    expect(bodyOf(taken.villageEvents, 'refuge-caught')).toEqual({
      kind: 'refuge-caught',
      campaignId: 'c1',
      refId: 'c1:a0',
      killed: [],
      led: [3, 4, 5, 6],
      captured: [
        { personId: 1, prisonerId: 'c1:a:1' },
        { personId: 2, prisonerId: 'c1:a:2' },
      ],
      captorVillageId: 'lhota',
    });
    expect(taken.state.loot.prisoners?.map((p) => p.id)).toEqual(['c1:a:1', 'c1:a:2']);
    expect(flightOf(taken.state)).toMatchObject({ status: 'caught', doneTick: lords.tick + 1 });
  });

  it('konec tažení – skupina na cestě dojde, kam šla – vojsko odtáhlo (návrh Clauda)', () => {
    const s = crossing(null, null);
    s.phase = 'returning';
    const step = stepCampaign(s, s.tick + 1, [], worldWith(sameA));
    expect(step.state.phase).toBe('done');
    expect(flightOf(step.state)).toMatchObject({ status: 'arrived', doneTick: s.tick + 1 });
    expect(of(step.villageEvents, 'c')).toEqual([`refuge-arrive@${s.day + 1}`]);
    expect(bodyOf(step.villageEvents, 'refuge-arrive')).toMatchObject({
      foodKg: CARRIED,
      fromName: 'Vlkov',
    });
  });
});

describe('den odchodu (Review Focus 2)', () => {
  it('(e) skupina odešla dnes, boj téhož dne – odešlí v boji nejsou, kořist nebere jejich zásoby ani stádo', () => {
    // vojsko 300 m od domu – dojde týž den; ves zná jen stav ze včerejška (statický svět)
    const start = approaching(500);
    // ves se brání (postoj) – bez útěku stojí lidé v boji
    const defended: VillageState = { ...villageA(), defense: { stance: 'defend' } };
    const defending = (): VillageState => defended;
    const w = worldWith(defending);
    const without = stepCampaign(start, start.tick + 340, [], w);
    expect(without.state.battle).toBeDefined();
    expect(
      without.state.battle!.fighters.filter((x) => x.side === 'defend').length,
    ).toBeGreaterThan(0);
    const run = stepCampaign(start, start.tick + 340, [flee(start.tick + 1, 'forest')], w);
    expect(run.waiting).toBeNull();
    const b = run.state.battle!;
    expect(dayOfTick(b.openTick!, world)).toBe(start.day);
    expect(b.fighters.filter((x) => x.side === 'defend')).toEqual([]);
    expect(run.state.raidDay).toBe(start.day);
    expect(run.state.loot.detail!.grainKg).toBeCloseTo(STORES - CARRIED, 6);
    expect(run.state.loot.detail!.livestock).toEqual(NO_HERD);
    // co tažení z vsi dnes odvedlo – zítřejší stav vsi už odchod zná
    const today = alarmTaken(run.state, 'a', start.day, world);
    expect([...today.people].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(today.foodKg).toBe(CARRIED);
    expect(today.herd).toEqual({ ...NO_HERD, sheep: 10, cow: 2 });
    const tomorrow = alarmTaken(run.state, 'a', start.day + 1, world);
    expect(tomorrow.people.size).toBe(0);
    expect(tomorrow.foodKg).toBe(0);
  });
});
