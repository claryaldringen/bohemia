import { describe, expect, it } from 'vitest';
import type { NewVillageEvent } from '../../village/core/inbox';
import { sameCell, type GridCell } from '../../village/people/world-grid';
import { HUNT_FIGHT } from '../../village/rules/rules-wildlife';
import type { HuntResult, QuarryKind, VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { beatersAt, type HuntStart } from '../hunt-beaters';
import { journeyFinished, newJourney, stepJourney, type NewJourney } from '../journey';
import { quarryOut } from '../journey-hunt';
import { strikeRefusal } from '../journey-parties';
import type {
  JourneyGroup,
  JourneyIntent,
  JourneyIntentBody,
  JourneyMember,
  JourneyOrder,
  JourneyParty,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
} from '../journey-types';
import { MarchGridMemo, type Pos } from '../march-grid';
import { JOURNEY, WAR } from '../rules-war';
import { dayOfTick, hoursPerTick, msOfTick, TICKS_PER_SECOND } from '../ticks';
import { LAUNCH, MEADOW, SUMMER, world as clock } from './campaign-fixtures';

// Lov ve výpravě (plán 2026-11-22-hunting – Úloha 6; Rozhodnutí 1, 4, 6): vyhlášení (nová výprava
// jen s lovem, nebo příkaz `hunt` běžící výpravě), honci ke dveřím lesa, vyběhnutí zvířete, útěk
// po nečinnosti, výsledek do vsi a konec výpravy, až nemá skupiny ani lov. Přípravky jako
// `journey.test.ts`: Lhota na políčku (0, 0), rovné louky.

const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
const EAST: GridCell = { x: 1, y: 0 };
/** Dveře lesa 100 m západně od dvorce a výběh 40 m od nich ke dvorci. */
const DOOR: Pos = { x: -95, z: 5 };
const OUT: Pos = { x: -95 + HUNT_FIGHT.emergeM, z: 5 };
/** Takty chůze honců mezi dvorcem a dveřmi. */
const WALK = Math.ceil(100 / (WAR.pace.metersPerSecond / TICKS_PER_SECOND));
const IDLE = HUNT_FIGHT.idleS * TICKS_PER_SECOND;
/** Cesta skupiny na sousední mapu (jako `TRIP` v `journey.test.ts`) – venku déle než lov. */
const FAR: Pos = { x: -655, z: 5 };

function start(quarry: QuarryKind = 'stag'): HuntStart {
  return { quarry, day: SUMMER, door: DOOR, out: OUT, dogs: 2 };
}

function intent(tick: number, seq: number, body: JourneyIntentBody): JourneyIntent {
  return { tick, seq, byPlayer: 'p1', body };
}

const TRIP: JourneyIntent[] = [
  intent(LAUNCH + 300, 1, { kind: 'cross', cell: EAST }),
  intent(LAUNCH + 1000, 2, { kind: 'go', pos: FAR }),
];

function homeVillage(): VillageState {
  return village([1, 2, 3, 4, 5, 6, 7].map((id) => kin({ id, age: 30, sex: 'male' })));
}

/** Svět v paměti: rovné louky, Lhota bez ohledu na den; `villages` {} – Lhota zanikla. */
function worldOf(
  spec: {
    villages?: Record<string, VillageState>;
    mapOf?: (c: GridCell) => CampaignMap | null;
  } = {},
): CampaignWorld {
  const villages = spec.villages ?? { lhota: homeVillage() };
  return {
    clock,
    landscapeOf: spec.mapOf ?? ((): CampaignMap => MEADOW),
    villageAt: (villageId): VillageState | null => villages[villageId] ?? null,
    villageGone: (villageId) => !(villageId in villages),
    grids: new MarchGridMemo(),
  };
}

function recruit(personId: number): JourneyRecruit {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    strength: 1,
    fight: 50,
    ...(personId === 1 ? { name: 'Bořivoj' } : {}),
  };
}

/** Vyslání z Lhoty v taktu `LAUNCH`. */
function input(overrides: Partial<NewJourney>): NewJourney {
  return {
    id: 'j1',
    seed: 42,
    playerId: 'p1',
    houseId: 'h1',
    home: HOME,
    recruits: [],
    startMs: msOfTick(LAUNCH, clock),
    ...overrides,
  };
}

/** Vyhlášený lov bez běžící výpravy – výprava bez lidí jen s lovem. */
function journey(hunt: HuntStart = start()): JourneyState {
  return newJourney(input({ hunt }), clock);
}

/**
 * Výprava dvou jezdců 300 m na východ bez lovu – lov přijde příkazem. Jedou na koni jako ve
 * `journey.test.ts` (stav po osedlání), takže cesta `TRIP` má stejné takty.
 */
function withPeople(): JourneyState {
  const s = newJourney(
    input({ recruits: [recruit(1), recruit(2)], order: { kind: 'go', pos: { x: 305, z: 5 } } }),
    clock,
  );
  for (const m of s.members) Object.assign(m, { mounted: true, horse: 'ridden' as const });
  return s;
}

function results(events: readonly NewVillageEvent[]): NewVillageEvent[] {
  return events.filter((e) => e.body.kind === 'hunt-result');
}

/** Spočte výpravu po kouscích `chunk` taktů; mezi kousky JSON (kontrolní bod). */
function inChunks(
  state: JourneyState,
  toTick: number,
  chunk: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): JourneyStep {
  let current = state;
  const all: JourneyStep = { state, villageEvents: [], notices: [], waiting: null };
  while (current.tick < toTick && !journeyFinished(current)) {
    const step = stepJourney(current, Math.min(toTick, current.tick + chunk), intents, world);
    expect(step.waiting).toBeNull();
    all.villageEvents.push(...step.villageEvents);
    all.notices.push(...step.notices);
    current = JSON.parse(JSON.stringify(step.state)) as JourneyState;
  }
  return { ...all, state: current };
}

describe('lov ve výpravě (plán 2026-11-22-hunting, Úloha 6)', () => {
  it('výprava jen s lovem: zvíře vyběhne v arriveTick, nikdo nejde → po idleS uteče, hunt-result jednou (killed false), honci doma → done', () => {
    const world = worldOf();
    const s0 = journey();
    expect(s0).toMatchObject({ tick: LAUNCH, phase: 'out', groups: [], parties: [], members: [] });
    const arrive = LAUNCH + WALK;
    expect(s0.hunt).toMatchObject({
      id: 1,
      day: SUMMER,
      dogs: 2,
      out: OUT,
      beaters: { from: HOME.pos, door: DOOR, startTick: LAUNCH, arriveTick: arrive, end: null },
      fight: { tick: LAUNCH, outcome: 'ongoing', quarry: { kind: 'stag', state: 'hidden' } },
    });
    expect(s0.nextId).toBe(2);
    expect(stepJourney(s0, arrive - 1, [], world).state.hunt?.fight.quarry.state).toBe('hidden');
    const out = stepJourney(s0, arrive, [], world).state;
    expect(out.hunt?.fight).toMatchObject({ tick: arrive, activeTick: arrive });
    expect(out.hunt?.fight.quarry.state).toBe('flee');

    // zvíře uteklo (nikdo nešel), honci jdou ode dveří domů – výprava běží, dokud nedojdou
    const fled = stepJourney(s0, arrive + IDLE + 100, [], world);
    const hunt = fled.state.hunt!;
    expect(hunt.fight.outcome).toBe('escaped');
    const end = hunt.beaters.end!;
    expect(end.carry).toBe(false);
    expect(end.tick).toBeGreaterThanOrEqual(arrive + IDLE);
    expect(hunt.beaters.homeTick).toBe(end.tick + WALK);
    expect(hunt.reported).toBe(true);
    expect(fled.state.phase).toBe('out');
    expect(results(fled.villageEvents)).toEqual([
      {
        villageId: 'lhota',
        day: dayOfTick(end.tick, clock),
        ref: 'journey:j1:hunt:1',
        body: {
          kind: 'hunt-result',
          journeyId: 'j1',
          huntId: 1,
          result: {
            quarry: 'stag',
            killed: false,
            names: [],
            trained: [],
            casualties: [],
            horsesLost: [],
          },
        },
      },
    ]);

    const home = hunt.beaters.homeTick!;
    const last = stepJourney(s0, home - 1, [], world).state;
    expect(last.phase).toBe('out');
    expect(last.hunt).toBeDefined();
    const done = stepJourney(s0, home + 500, [], world);
    expect(done.state).toMatchObject({ tick: home, phase: 'done' });
    expect(done.state.hunt).toBeUndefined();
    expect(journeyFinished(done.state)).toBe(true);
    // výsledek jednou za celý lov; konec výpravy jako vždy `away-ends` bez lidí
    expect(results(done.villageEvents)).toHaveLength(1);
    expect(done.villageEvents.filter((e) => e.body.kind === 'away-ends')).toEqual([
      expect.objectContaining({
        body: { kind: 'away-ends', refId: 'j1', untilDay: done.state.day + 1 },
      }),
    ]);
    // dopočet z bodu po konci lovu výsledek znovu nevydá
    expect(results(stepJourney(fled.state, home + 500, [], world).villageEvents)).toEqual([]);
  });

  it('výprava se skupinou na sousední mapě: konec lovu ji neukončí, skupina jde dál beze změny', () => {
    const world = worldOf();
    const s0 = withPeople();
    const declared = LAUNCH + 1100;
    const hunting = [...TRIP, intent(declared, 3, { kind: 'hunt', start: start() })];
    const nextId = stepJourney(s0, declared - 1, hunting, world).state.nextId;
    const before = stepJourney(s0, declared, hunting, world).state;
    expect(before.groups.every((g) => sameCell(g.cell, EAST))).toBe(true);
    expect(before.hunt).toMatchObject({ id: nextId, beaters: { startTick: declared } });
    expect(before.hunt?.beaters.from).toEqual(HOME.pos);
    expect(before.nextId).toBe(nextId + 1);

    const after = declared + WALK + IDLE + 200 + WALK;
    const a = stepJourney(s0, after, hunting, world);
    const b = stepJourney(s0, after, TRIP, world);
    expect(a.state.hunt).toBeUndefined();
    expect(results(a.villageEvents)).toHaveLength(1);
    expect(a.state.phase).toBe('out');
    // lov po sobě ve stavu nic nenechá – jen id spotřebované z řady
    const { nextId: idA, ...restA } = a.state;
    const { nextId: idB, ...restB } = b.state;
    expect(restA).toStrictEqual(restB);
    expect(idA).toBe(idB + 1);
    expect(a.villageEvents.filter((e) => e.body.kind !== 'hunt-result')).toEqual(b.villageEvents);
    expect(a.notices).toEqual(b.notices);
    // skupina se vrátí a výprava skončí v témž taktu jako bez lovu
    const endA = stepJourney(s0, LAUNCH + 4000, hunting, world).state;
    const endB = stepJourney(s0, LAUNCH + 4000, TRIP, world).state;
    expect(endB.phase).toBe('done');
    expect(endA).toMatchObject({ phase: 'done', tick: endB.tick });
  });

  it('druhé „hunt“ při běžícím lovu se zahodí', () => {
    const world = worldOf();
    const s0 = journey();
    const other: HuntStart = {
      quarry: 'boar',
      day: SUMMER,
      door: { x: 105, z: 5 },
      out: { x: 65, z: 5 },
      dogs: 0,
    };
    const second = [intent(LAUNCH + 10, 1, { kind: 'hunt', start: other })];
    const step = stepJourney(s0, LAUNCH + 20, second, world).state;
    expect(step.hunt).toMatchObject({ id: 1, dogs: 2, beaters: { door: DOOR } });
    expect(step.hunt?.fight.quarry.kind).toBe('stag');
    expect(step.nextId).toBe(s0.nextId);
    expect(step).toEqual(stepJourney(s0, LAUNCH + 20, [], world).state);
  });

  it('ref výsledku je journey:<id>:hunt:<huntId>, dva lovy po sobě mají různá huntId', () => {
    const world = worldOf();
    const s0 = withPeople();
    const first = intent(LAUNCH + 10, 3, { kind: 'hunt', start: start() });
    const firstEnd = LAUNCH + 10 + WALK + IDLE + 200 + WALK;
    expect(stepJourney(s0, firstEnd, [...TRIP, first], world).state.hunt).toBeUndefined();
    const second = intent(firstEnd + 10, 4, { kind: 'hunt', start: start('hind') });
    const run = stepJourney(s0, firstEnd + 1000, [...TRIP, first, second], world);
    const [one, two] = results(run.villageEvents);
    expect(results(run.villageEvents)).toHaveLength(2);
    for (const [e, quarry] of [
      [one, 'stag'],
      [two, 'hind'],
    ] as const) {
      if (e?.body.kind !== 'hunt-result') throw new Error('Chybí výsledek lovu');
      expect(e.ref).toBe(`journey:j1:hunt:${e.body.huntId}`);
      expect(e.body).toMatchObject({ journeyId: 'j1', result: { quarry, killed: false } });
    }
    expect(one?.ref).not.toBe(two?.ref);
  });

  it('stepJourney po 1 / 7 / 40 taktech přes JSON = vcelku (lov)', () => {
    const world = worldOf();
    const people = withPeople();
    const intents = [...TRIP, intent(LAUNCH + 5, 3, { kind: 'hunt', start: start('boar') })];
    const to = LAUNCH + 5 + WALK + IDLE + 200 + WALK;
    for (const [s0, list] of [
      [journey(), []],
      [people, intents],
    ] as const) {
      const whole = stepJourney(s0, to, list, world);
      expect(whole.waiting).toBeNull();
      expect(results(whole.villageEvents)).toHaveLength(1);
      for (const chunk of [1, 7, 40]) {
        const parts = inChunks(s0, to, chunk, list, world);
        expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
        expect(parts.villageEvents).toEqual(whole.villageEvents);
        expect(parts.notices).toEqual(whole.notices);
      }
    }
  });

  it('lov potřebuje mapu domovského políčka – chybí-li, krok čeká i bez skupin', () => {
    const world = worldOf({ mapOf: (c) => (sameCell(c, HOME.cell) ? null : MEADOW) });
    const s0 = journey();
    const step = stepJourney(s0, LAUNCH + 10, [], world);
    expect(step.waiting).toEqual({ cells: [HOME.cell], villageIds: [] });
    expect(step.state.tick).toBe(LAUNCH);
  });

  it('zaniklá domovská ves ukončí výpravu i s lovem – výsledek nemá komu jít', () => {
    // les 500 m od dvorce – honci k němu do začátku dalšího dne nedojdou
    const s0 = journey({ ...start(), door: { x: -495, z: 5 }, out: { x: -455, z: 5 } });
    const end = stepJourney(s0, LAUNCH + 3000, [], worldOf({ villages: {} }));
    expect(end.waiting).toBeNull();
    expect(end.state.phase).toBe('done');
    expect(end.state.hunt).toBeUndefined();
    expect(end.villageEvents).toEqual([]);
  });
});

// --- Útok na zvíře (plán 2026-11-22-hunting – Úloha 7) ------------------------------------------

/** Zvíře venku – honci výpravy vyslané v taktu `LAUNCH` došli ke dveřím. */
const ARRIVE = LAUNCH + WALK;
const YEAR_DAYS = 365.25;
/** Čekání skupiny na místě v taktech (3 herní dny). */
const WAIT = Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));

/** Den narození na věk `years` v letní den lovu. */
function bornAt(years: number): number {
  return SUMMER - Math.ceil((years + 0.5) * YEAR_DAYS);
}

/** Muž ze vsi na lov: 1 je vojvoda Bořivoj (muž rodu), ostatní vesničané; 30 let, pěšky. */
function hunter(personId: number, extra: Partial<JourneyRecruit> = {}): JourneyRecruit {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    strength: 2,
    fight: 50,
    bornDay: bornAt(30),
    ...(personId === 1 ? { name: 'Bořivoj', line: true as const } : {}),
    ...extra,
  };
}

/** Povel na zvíře v taktu `tick` lidem výpravy `people` a novým lidem `recruits`. */
function strikeOf(
  tick: number,
  seq: number,
  people?: number[],
  recruits?: JourneyRecruit[],
): JourneyIntent {
  return intent(tick, seq, {
    kind: 'strike',
    ...(people ? { people } : {}),
    ...(recruits ? { recruits } : {}),
  });
}

/** Rozkaz lidem `people` v taktu `tick`. */
function orderOf(tick: number, seq: number, order: JourneyOrder, people: number[]): JourneyIntent {
  return intent(tick, seq, { kind: 'order', order, people });
}

/** Výprava s lidmi `recruits` doma (skupina 0) a lovem vyhlášeným v taktu vyslání. */
function withHunt(recruits: JourneyRecruit[], quarry: QuarryKind = 'stag'): JourneyState {
  return newJourney(input({ recruits, hunt: start(quarry) }), clock);
}

function member(s: JourneyState, personId: number): JourneyMember | undefined {
  return s.members.find((m) => m.ref.personId === personId);
}

/** Posadí člověka na koně (stav po osedlání). */
function ride(s: JourneyState, personId: number): void {
  Object.assign(member(s, personId)!, { mounted: true, horse: 'ridden' as const });
}

function groupOf(s: JourneyState, personId: number): JourneyGroup {
  const id = member(s, personId)!.group;
  return s.groups.find((g) => g.id === id)!;
}

function partyOf(s: JourneyState, personId: number): JourneyParty {
  const id = groupOf(s, personId).party;
  return s.parties.find((p) => p.id === id)!;
}

/** Takt konce souboje (zabití nebo útěk) – dopočet po 25 taktech, nejvýš `limit` taktů. */
function fightEnd(
  s0: JourneyState,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
  limit = 6000,
): number {
  let s = s0;
  while (s.tick < s0.tick + limit) {
    s = stepJourney(s, s.tick + 25, intents, world).state;
    const end = s.hunt?.beaters.end;
    if (end) return end.tick;
  }
  throw new Error('Lov neskončil');
}

/** Výsledek lovu z událostí (právě jeden). */
function resultOf(events: readonly NewVillageEvent[]): HuntResult {
  const [e, ...rest] = results(events);
  if (e?.body.kind !== 'hunt-result' || rest.length > 0) throw new Error('Chybí výsledek lovu');
  return e.body.result;
}

/** Stav po JSON s úpravou `edit` (souboj přichystaný testem). */
function edited(s: JourneyState, edit: (s: JourneyState) => void): JourneyState {
  const copy = JSON.parse(JSON.stringify(s)) as JourneyState;
  edit(copy);
  return copy;
}

describe('útok na zvíře – povel strike (plán 2026-11-22-hunting, Úloha 7)', () => {
  it('strike: vybraný muž dostane vlastní hlouček, jeho poloha je poloha bojovníka', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1), hunter(2), hunter(3)]);
    const intents = [strikeOf(ARRIVE + 1, 1, [1, 2], [hunter(4)])];
    const s = stepJourney(s0, ARRIVE + 1, intents, world).state;
    const party = partyOf(s, 1);
    expect(party).toMatchObject({ phase: 'out', hunting: true });
    for (const id of [2, 4]) expect(partyOf(s, id)).toBe(party);
    const groups = [1, 2, 4].map((id) => groupOf(s, id));
    expect(new Set(groups.map((g) => g.id)).size).toBe(3);
    for (const g of groups) {
      expect(g).toMatchObject({ cell: HOME.cell, arrived: true, goal: null });
    }
    // zbytek skupiny 0 stojí doma a neloví
    expect(partyOf(s, 3)).toMatchObject({ id: 0, phase: 'out', arrivedTick: ARRIVE + 1 });
    expect(partyOf(s, 3).hunting).toBeUndefined();
    // takt povelu je už taktem souboje – každý udělal první krok ke zvířeti (jako rozkaz)
    const step = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
    expect(s.hunt?.fight.hunters.map((h) => [h.personId, h.state])).toEqual([
      [1, 'chase'],
      [2, 'chase'],
      [4, 'chase'],
    ]);
    for (const h of s.hunt!.fight.hunters) {
      expect(groupOf(s, h.personId).pos).toEqual(h.pos);
      expect(h.pos.x).toBeCloseTo(HOME.pos.x - step, 6);
    }
    // ves počítá jako útočníka jen nového člověka ze vsi; kdo byl ve výpravě, je pryč jako dosud
    expect(member(s, 4)?.huntId).toBe(s.hunt?.id);
    expect(member(s, 1)?.huntId).toBeUndefined();

    const later = stepJourney(s0, ARRIVE + 40, intents, world).state;
    for (const h of later.hunt!.fight.hunters) {
      expect(groupOf(later, h.personId).pos).toEqual(h.pos);
      expect(h.pos).not.toEqual(HOME.pos);
    }
    expect(groupOf(later, 3).pos).toEqual(HOME.pos);
  });

  it('žena, chlapec 13 let a raněný ze strike vypadnou a stojí dál, muž 14 let jde', () => {
    const world = worldOf();
    const s0 = withHunt([
      hunter(4, { female: true, name: 'Dobrava' }),
      hunter(5, { bornDay: bornAt(13) }),
      hunter(6, { bornDay: bornAt(14) }),
      hunter(7),
    ]);
    Object.assign(member(s0, 7)!, { wounded: true, woundedDay: SUMMER - 1 });
    expect([4, 5, 6, 7].map((id) => strikeRefusal(s0, member(s0, id)!))).toEqual([
      'woman',
      'young',
      null,
      'wounded',
    ]);
    // na sousední mapě – souboj běží na domovské
    const east = stepJourney(withPeople(), LAUNCH + 1100, TRIP, world).state;
    expect(strikeRefusal(east, member(east, 1)!)).toBe('away');
    const s = stepJourney(s0, ARRIVE + 1, [strikeOf(ARRIVE + 1, 1, [4, 5, 6, 7])], world).state;
    expect(s.hunt?.fight.hunters.map((h) => h.personId)).toEqual([6]);
    expect(partyOf(s, 6).hunting).toBe(true);
    for (const id of [4, 5, 7]) {
      expect(groupOf(s, id)).toMatchObject({ id: 0, party: 0, pos: HOME.pos, arrived: true });
    }
    expect(partyOf(s, 4).hunting).toBeUndefined();
  });

  it('strike bez lovu, na skryté a na mrtvé zvíře se zahodí; noví lidé ze vsi jdou hned domů', () => {
    const world = worldOf();
    // bez lovu
    const trip = withPeople();
    const noHunt = [...TRIP, strikeOf(LAUNCH + 50, 9, [1, 2])];
    expect(stepJourney(trip, LAUNCH + 60, noHunt, world).state).toEqual(
      stepJourney(trip, LAUNCH + 60, TRIP, world).state,
    );
    // skryté zvíře (honci ještě nedošli)
    const s0 = withHunt([hunter(1), hunter(2)]);
    expect(quarryOut(s0.hunt!)).toBe(false);
    expect(quarryOut(stepJourney(s0, ARRIVE, [], world).state.hunt!)).toBe(true);
    const hidden = [strikeOf(LAUNCH + 10, 1, [1, 2])];
    expect(stepJourney(s0, LAUNCH + 20, hidden, world).state).toEqual(
      stepJourney(s0, LAUNCH + 20, [], world).state,
    );
    // mrtvé zvíře
    const dead = edited(stepJourney(s0, ARRIVE + 5, [], world).state, (s) => {
      s.hunt!.fight.quarry.state = 'dead';
    });
    expect(quarryOut(dead.hunt!)).toBe(false);
    const late = [strikeOf(ARRIVE + 6, 1, [1, 2])];
    expect(stepJourney(dead, ARRIVE + 10, late, world).state).toEqual(
      stepJourney(dead, ARRIVE + 10, [], world).state,
    );
    // noví lidé ze vsi už odešli – vrátí se hned (away-ends s nimi), lov beze změny
    const fresh = stepJourney(s0, LAUNCH + 10, [strikeOf(LAUNCH + 10, 1, [], [hunter(3)])], world);
    expect(member(fresh.state, 3)).toBeUndefined();
    expect(fresh.villageEvents).toEqual([
      expect.objectContaining({
        day: SUMMER + 1,
        body: { kind: 'away-ends', refId: 'j1', untilDay: SUMMER + 1, personIds: [3] },
      }),
    ]);
    expect(fresh.state.hunt?.fight.hunters).toEqual([]);
  });

  it('osedlaný jezdec útočí na koni se strengthMounted, kůň v ohradě – pěšky', () => {
    const world = worldOf();
    const s0 = withHunt([
      hunter(1, { horseId: 77, strengthMounted: 3, riding: 60, bow: 40 }),
      hunter(2, { horseId: 78, strengthMounted: 2.5 }),
    ]);
    ride(s0, 1);
    const s = stepJourney(s0, ARRIVE + 1, [strikeOf(ARRIVE + 1, 1, [1, 2])], world).state;
    const [rider, walker] = s.hunt!.fight.hunters;
    expect(rider).toMatchObject({
      personId: 1,
      mounted: true,
      strength: 3,
      footStrength: 2,
      skills: { bow: 40, combat: 50, riding: 60 },
      lineMan: true,
      health: WAR.combat.health,
      horseHealth: HUNT_FIGHT.horseHealth,
    });
    expect(walker).toMatchObject({
      personId: 2,
      mounted: false,
      strength: 2,
      footStrength: 2,
      skills: { bow: 0, combat: 50, riding: 0 },
      lineMan: false,
      horseHealth: null,
    });
    expect(s.hunt?.strikers).toEqual([
      { personId: 1, name: 'Bořivoj', horseId: 77 },
      { personId: 2, horseId: 78 },
    ]);
  });

  it('zabitý jelen: hunt-result killed, names[0] = kdo složil, trained s jízdou; útočníci jdou domů s honci, dva nesou úlovek, výprava skončí, až jsou doma všichni', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1, { strengthMounted: 3, riding: 60 }), hunter(2)]);
    ride(s0, 1);
    const intents = [strikeOf(ARRIVE + 1, 1, [1])];
    const end = fightEnd(s0, intents, world);
    const atEnd = stepJourney(s0, end, intents, world);
    const result = resultOf(atEnd.villageEvents);
    expect(result).toMatchObject({ quarry: 'stag', killed: true, names: ['Bořivoj'] });
    expect(result.trained).toEqual([
      { personId: 1, hours: expect.objectContaining({ riding: expect.any(Number) }) },
    ]);
    expect(result.trained[0]!.hours.riding).toBeGreaterThan(0);
    // lov skončil – útočníci jdou domů s honci (bez lovu a bez čekání)
    const s = atEnd.state;
    expect(partyOf(s, 1).hunting).toBeUndefined();
    expect(partyOf(s, 1).phase).toBe('returning');
    expect(groupOf(s, 1).goal?.pos).toEqual(HOME.pos);
    const beaters = s.hunt!.beaters;
    expect(beaters.end).toMatchObject({ tick: end, carry: true });
    // honci 0 a 1 dojdou k úlovku a nesou ho na tyči, ostatní jdou rovnou domů
    let pole = end;
    while (beatersAt(beaters, pole, 0)?.carrying !== true) pole++;
    // (honec bez úlovku může být už doma – null)
    expect([0, 1, 2].map((i) => beatersAt(beaters, pole + 1, i)?.carrying === true)).toEqual([
      true,
      true,
      false,
    ]);
    // jezdec je doma dřív než honci s úlovkem; výprava skončí s posledním honcem
    const home = beaters.homeTick!;
    const before = stepJourney(s0, home - 1, intents, world);
    expect(before.state).toMatchObject({ phase: 'out', parties: [expect.anything()] });
    expect(member(before.state, 1)).toBeUndefined();
    expect(before.villageEvents).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({ kind: 'away-ends', personIds: [1] }),
      }),
    );
    const all = stepJourney(s0, home + WAIT * 2, intents, world);
    expect(results(all.villageEvents)).toHaveLength(1);
    // skupina 0 (2) stojí doma a čeká – výprava běží, dokud nepůjde domů
    expect(all.state.phase).toBe('done');
    expect(all.state.tick).toBeGreaterThanOrEqual(home);
    const lone = withHunt([hunter(1, { strengthMounted: 3, riding: 60 })]);
    ride(lone, 1);
    const done = stepJourney(lone, home + 500, intents, world);
    expect(done.state).toMatchObject({ phase: 'done', tick: home });
  });

  it('kanec srazí nováčka: člen padl nebo je raněný, casualties ve výsledku i se jménem', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(2, { fight: 10, strength: 1, name: 'Kojata' })], 'boar');
    const intents = [strikeOf(ARRIVE + 1, 1, [2])];
    const end = fightEnd(s0, intents, world);
    const step = stepJourney(s0, end, intents, world);
    const result = resultOf(step.villageEvents);
    expect(result).toMatchObject({ quarry: 'boar', killed: false, names: ['Kojata'] });
    const [casualty] = result.casualties;
    expect(casualty?.personId).toBe(2);
    const m = member(step.state, 2);
    if (casualty?.outcome === 'dead') {
      expect(m).toBeUndefined();
    } else {
      expect(casualty?.outcome).toBe('wounded');
      expect(m).toMatchObject({ status: 'active', wounded: true, health: 0 });
      expect(m?.woundedDay).toBeGreaterThanOrEqual(SUMMER);
    }
  });

  it('padlý vojvoda → skupina bez vůdce domů (afterLosses); jméno a kůň padlého zůstanou pro výsledek', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1, { horseId: 77, strengthMounted: 3 }), hunter(2)], 'boar');
    ride(s0, 1);
    const intents = [strikeOf(ARRIVE + 1, 1, [1, 2])];
    // souboj přichystaný: vojvodovi padl kůň a sám padl mrtev
    const fell = edited(stepJourney(s0, ARRIVE + 3, intents, world).state, (s) => {
      const h = s.hunt!.fight.hunters.find((x) => x.personId === 1)!;
      Object.assign(h, { horseLost: true, horseHealth: 0, mounted: false, state: 'down' });
      Object.assign(h, { killed: true, health: 0 });
    });
    const next = stepJourney(fell, ARRIVE + 4, intents, world).state;
    expect(member(next, 1)).toBeUndefined();
    const party = partyOf(next, 2);
    expect(party).toMatchObject({ leaderless: true, phase: 'returning' });
    expect(party.hunting).toBeUndefined();
    expect(next.hunt?.fight.hunters.find((h) => h.personId === 2)?.left).toBe(true);
    // nikdo už na kance nejde – uteče; výsledek zná padlého i jeho koně
    const end = fightEnd(fell, intents, world);
    const result = resultOf(stepJourney(fell, end, intents, world).villageEvents);
    expect(result).toMatchObject({
      killed: false,
      names: ['Bořivoj'],
      casualties: [{ personId: 1, outcome: 'dead' }],
      horsesLost: [77],
    });
  });

  it('kůň jezdci padne: člen hned bez koně (mounted, horse, horseId), výsledek s koněm', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1, { horseId: 77, strengthMounted: 3 })], 'boar');
    ride(s0, 1);
    const intents = [strikeOf(ARRIVE + 1, 1, [1])];
    const lost = edited(stepJourney(s0, ARRIVE + 3, intents, world).state, (s) => {
      const h = s.hunt!.fight.hunters[0]!;
      Object.assign(h, { horseLost: true, horseHealth: 0, mounted: false, strength: 2 });
    });
    const m = member(stepJourney(lost, ARRIVE + 4, intents, world).state, 1)!;
    expect(m.mounted).toBe(false);
    expect(m.horse).toBeUndefined();
    expect(m.horseId).toBeUndefined();
    const end = fightEnd(lost, intents, world);
    expect(resultOf(stepJourney(lost, end, intents, world).villageEvents).horsesLost).toEqual([77]);
  });

  it('„Jdi sem“ útočníkovi během lovu → leaveHunt, zvíře po idleS uteče, výprava po návratu všech done', () => {
    const world = worldOf();
    const s0 = journey();
    const go = orderOf(ARRIVE + 20, 2, { kind: 'go', pos: { x: 105, z: 5 } }, [2]);
    const intents = [strikeOf(ARRIVE + 1, 1, [], [hunter(2, { name: 'Kojata' })]), go];
    const left = stepJourney(s0, ARRIVE + 20, intents, world);
    const party = partyOf(left.state, 2);
    expect(party.hunting).toBeUndefined();
    expect(party.phase).toBe('out');
    expect(groupOf(left.state, 2).goal?.pos).toEqual({ x: 105, z: 5 });
    expect(left.state.hunt?.fight.hunters).toEqual([
      expect.objectContaining({ personId: 2, left: true }),
    ]);
    // byl ve vsi útočníkem – teď je běžná výprava a ves ho zase počítá jako pryč
    expect(member(left.state, 2)?.huntId).toBeUndefined();
    expect(left.villageEvents).toEqual([
      {
        villageId: 'lhota',
        day: SUMMER + 1,
        ref: expect.stringMatching(/^journey:j1:/),
        body: { kind: 'hunt-leave', journeyId: 'j1', huntId: 1, personIds: [2] },
      },
    ]);
    const end = fightEnd(s0, intents, world);
    expect(end).toBeGreaterThanOrEqual(ARRIVE + 20 + IDLE);
    const all = stepJourney(s0, ARRIVE + 20 + WAIT + 3000, intents, world);
    expect(resultOf(all.villageEvents)).toMatchObject({ killed: false, names: ['Kojata'] });
    expect(all.state.phase).toBe('done');
    expect(all.state.hunt).toBeUndefined();
  });

  it('rozkaz ven útočníkům ze vsi pošle hunt-leave, Domů ne; kdo byl ve výpravě, značku nemá', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1)]);
    const intents = [
      strikeOf(ARRIVE + 1, 1, [1], [hunter(2), hunter(3)]),
      orderOf(ARRIVE + 10, 2, { kind: 'home' }, [3]),
      orderOf(ARRIVE + 10, 3, { kind: 'go', pos: { x: 105, z: 5 } }, [1, 2]),
    ];
    const s = stepJourney(s0, ARRIVE + 10, intents, world);
    expect(s.villageEvents.filter((e) => e.body.kind === 'hunt-leave')).toEqual([
      expect.objectContaining({
        body: { kind: 'hunt-leave', journeyId: 'j1', huntId: 1, personIds: [2] },
      }),
    ]);
    expect(member(s.state, 2)?.huntId).toBeUndefined();
    expect(member(s.state, 3)?.huntId).toBe(1);
    expect(partyOf(s.state, 3).phase).toBe('returning');
    expect(s.state.parties.some((p) => p.hunting)).toBe(false);
  });

  it('odvolání (recall) útočníky z lovu stáhne domů; Osedlat a Sesednout útočníka nezmění', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1, { strengthMounted: 3 }), hunter(2)]);
    ride(s0, 1);
    const base = [strikeOf(ARRIVE + 1, 1, [1, 2])];
    const horses = [
      ...base,
      intent(ARRIVE + 5, 2, { kind: 'dismount', people: [1] }),
      intent(ARRIVE + 5, 3, { kind: 'saddle', people: [2] }),
    ];
    expect(stepJourney(s0, ARRIVE + 10, horses, world).state).toEqual(
      stepJourney(s0, ARRIVE + 10, base, world).state,
    );
    const recall = intent(ARRIVE + 5, 2, { kind: 'recall', cells: [HOME.cell] });
    const s = stepJourney(s0, ARRIVE + 5, [...base, recall], world).state;
    expect(s.parties.map((p) => [p.phase, p.hunting])).toEqual([['returning', undefined]]);
    expect(s.hunt?.fight.hunters.map((h) => h.left)).toEqual([true, true]);
  });

  it('stepJourney se strike po 1 / 7 / 40 taktech = vcelku', () => {
    const world = worldOf();
    const s0 = withHunt([hunter(1, { strengthMounted: 3, riding: 60 }), hunter(2)], 'boar');
    ride(s0, 1);
    const intents = [
      strikeOf(ARRIVE + 1, 1, [1], [hunter(3, { fight: 70, name: 'Kojata' })]),
      strikeOf(ARRIVE + 30, 2, [2]),
      orderOf(ARRIVE + 60, 3, { kind: 'go', pos: { x: 45, z: 25 } }, [2]),
    ];
    const to = ARRIVE + IDLE + 900;
    const whole = stepJourney(s0, to, intents, world);
    expect(whole.waiting).toBeNull();
    expect(results(whole.villageEvents)).toHaveLength(1);
    for (const chunk of [1, 7, 40]) {
      const parts = inChunks(s0, to, chunk, intents, world);
      expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
      expect(parts.villageEvents).toEqual(whole.villageEvents);
      expect(parts.notices).toEqual(whole.notices);
    }
  });
});
