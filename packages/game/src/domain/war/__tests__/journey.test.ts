import { describe, expect, it } from 'vitest';
import { dayIndexOf, realTimeOf } from '../../calendar';
import { surfaceAt, tileOfWorldPoint, type StreamPoint } from '../../landscape';
import { addGate, areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import { sameCell, type GridCell } from '../../village/people/world-grid';
import type { TileCell, VillageState } from '../../village/types';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { journeyFinished, newJourney, stepJourney, type NewJourney } from '../journey';
import type {
  JourneyIntent,
  JourneyMember,
  JourneyOrder,
  JourneyPhase,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
} from '../journey-types';
import type { Pos } from '../march-grid';
import { JOURNEY, WAR } from '../rules-war';
import { mergeKnowledge, type SeenCell } from '../seen';
import { dayOfTick, hoursPerTick, msOfTick, TICKS_PER_SECOND } from '../ticks';
import { flat, LAUNCH, MEADOW, SUMMER, world as clock } from './campaign-fixtures';

// Výjezd vojvody po taktech (lord-control.md – Rozkazy, Na místě a návrat, Pohyb, Zásoby a zima;
// plán 2026-11-13 – Úloha 1): rozkazy, čekání a návrat, tempo, člen zemře doma, domovská ves
// zanikne, po kouscích = vcelku. Od výprav (plán 2026-11-14 – Úloha 1) jde o jednu skupinu 0 – fázi
// a čekání čte `phaseOf` / `arrivedOf`, hlouček po návratu domů ze stavu zmizí.

/** Domov – Lhota na políčku (0, 0); místo ve středu buňky mřížky pochodu (rovné úseky cesty). */
const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
const EAST: GridCell = { x: 1, y: 0 };
/** První cíl výjezdu – 300 m na východ od domova. */
const NEAR: Pos = { x: 305, z: 5 };
/** Čekání na místě v taktech (3 herní dny). */
const WAIT = Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
const WINTER_DATE = { year: 501, month: 12, day: 1 };
const WINTER = dayIndexOf(WINTER_DATE);
/** První celý takt zimního dne. */
const WINTER_LAUNCH = Math.ceil((realTimeOf(WINTER_DATE, clock) - clock.startMs) / 250);

/** Muž výjezdu – osoba 1 je vojvoda Bořivoj; všichni na koni, není-li řečeno jinak. */
function man(personId: number, extra: Partial<JourneyMember> = {}): JourneyMember {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    mounted: true,
    strength: 2,
    fight: 50,
    health: 100,
    wounded: false,
    status: 'active',
    group: 0,
    ...(personId === 1 ? { name: 'Bořivoj' } : {}),
    ...extra,
  };
}

/** Fáze jako před výpravami: konec, jinak fáze (jediné) skupiny. */
function phaseOf(state: JourneyState): JourneyPhase {
  return state.phase === 'done' ? 'done' : state.parties[0]!.phase;
}

/** Takt dojetí (jediné) skupiny; skupina jde nebo už není – null. */
function arrivedOf(state: JourneyState): number | null {
  return state.parties[0]?.arrivedTick ?? null;
}

/** Domovská ves s muži `ids`. */
function homeVillage(ids: readonly number[] = [1, 2, 3]): VillageState {
  return village(ids.map((id) => kin({ id, age: 30, sex: 'male' })));
}

interface WorldSpec {
  /** Vsi světa (výchozí jen Lhota); ves, která tu chybí, neexistuje. */
  villages?: Record<string, VillageState>;
  mapOf?: (cell: GridCell) => CampaignMap | null;
  villageAt?: CampaignWorld['villageAt'];
  extra?: Partial<CampaignWorld>;
}

/** Svět v paměti: rovné louky, stav vsí bez ohledu na den, zaniklou ves pozná. */
function worldOf(spec: WorldSpec = {}): CampaignWorld {
  const villages = spec.villages ?? { lhota: homeVillage() };
  return {
    clock,
    landscapeOf: spec.mapOf ?? ((): CampaignMap => MEADOW),
    villageAt: spec.villageAt ?? ((villageId): VillageState | null => villages[villageId] ?? null),
    villageGone: (villageId) => !(villageId in villages),
    ...spec.extra,
  };
}

/**
 * Výjezd vojvody (1) s jedním mužem (2) na koních, první rozkaz 300 m na východ. Lidé `members`
 * přijdou do `newJourney` jako nováčci; stav na cestě, který nováček nemít nemůže (raněný, padlý),
 * se do výchozího stavu přepíše z nich.
 */
function journey(
  overrides: Partial<Omit<NewJourney, 'recruits'>> & { members?: JourneyMember[] } = {},
): JourneyState {
  const { members = [man(1), man(2)], ...rest } = overrides;
  const state = newJourney(
    {
      id: 'j1',
      seed: 42,
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      recruits: members.map(recruitOf),
      startMs: msOfTick(LAUNCH, clock),
      order: { kind: 'go', pos: NEAR },
      ...rest,
    },
    clock,
  );
  state.members.forEach((m, n) => {
    const { health, wounded, woundedDay, status } = members[n]!;
    Object.assign(m, { health, wounded, status }, woundedDay === undefined ? {} : { woundedDay });
  });
  return state;
}

/** Nováček výpravy z muže výjezdu. */
function recruitOf(m: JourneyMember): JourneyRecruit {
  return {
    ref: { ...m.ref },
    lord: m.lord,
    strength: m.strength,
    fight: m.fight,
    ...(m.name === undefined ? {} : { name: m.name }),
    ...(m.mounted ? { mounted: true as const } : {}),
  };
}

/**
 * Stav o takt dřív, než výprava doma skončí (hlouček je ve stavu naposled), a takt konce – po
 * návratu hlouček ze stavu zmizí.
 */
function lastStand(
  start: JourneyState,
  toTick: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): { last: JourneyState; end: number } {
  const end = stepJourney(start, toTick, intents, world).state;
  expect(end.phase).toBe('done');
  return { last: stepJourney(start, end.tick - 1, intents, world).state, end: end.tick };
}

/** Hlouček jde domů a v dalším taktu tam dojde (zbývá méně než takt cesty jezdců). */
function arrivingHome(state: JourneyState): void {
  const g = state.groups[0]!;
  expect(g).toMatchObject({ cell: HOME.cell, goal: { cell: HOME.cell, pos: HOME.pos } });
  const step = (1.5 * WAR.pace.metersPerSecond) / TICKS_PER_SECOND;
  expect(Math.abs(g.pos.x - HOME.pos.x) + Math.abs(g.pos.z - HOME.pos.z)).toBeLessThan(2 * step);
}

function intent(tick: number, seq: number, body: JourneyOrder, byPlayer = 'p1'): JourneyIntent {
  return { tick, seq, byPlayer, body };
}

/** První takt herního dne `day` (od letního dne vyslání). */
function firstTickOf(day: number): number {
  let tick = LAUNCH;
  while (dayOfTick(tick, clock) < day) tick++;
  return tick;
}

/** Spočte výjezd po kouscích `chunk` taktů; mezi kousky JSON (kontrolní bod). */
function inChunks(
  state: JourneyState,
  toTick: number,
  chunk: number,
  intents: readonly JourneyIntent[],
  world: CampaignWorld,
): JourneyStep {
  let current = state;
  const all: JourneyStep = { state, villageEvents: [], notices: [], waiting: null };
  const knowledge: NonNullable<JourneyStep['knowledge']> = [];
  while (current.tick < toTick && !journeyFinished(current)) {
    const step = stepJourney(current, Math.min(toTick, current.tick + chunk), intents, world);
    expect(step.waiting).toBeNull();
    all.villageEvents.push(...step.villageEvents);
    all.notices.push(...step.notices);
    knowledge.push(...(step.knowledge ?? []));
    current = JSON.parse(JSON.stringify(step.state)) as JourneyState;
  }
  return { ...all, ...(knowledge.length > 0 ? { knowledge } : {}), state: current };
}

/** Zmrazí hodnotu do hloubky – zápis do ní v taktu spadne (moduly jsou ve striktním režimu). */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
  return value;
}

/**
 * Cesta na sousední mapu a zpět: přes východní okraj (rozkaz v taktu +300), na sousední mapě
 * o 300 m dál (+1000), tam 3 dny čekání a sama domů (≈ +3220).
 */
const FAR: Pos = { x: -655, z: 5 };
const TRIP: JourneyIntent[] = [
  intent(LAUNCH + 300, 1, { kind: 'cross', cell: EAST }),
  intent(LAUNCH + 1000, 2, { kind: 'go', pos: FAR }),
];
const TRIP_END = LAUNCH + 3600;

/** Kněžice na východní mapě: dům 7 u cesty k FAR, dům 8 daleko na druhém konci mapy. */
function passingWorld(): CampaignWorld {
  const knezice = village(
    [kin({ id: 1, age: 30, sex: 'male' })],
    [
      { ...dwelling(7), position: { x: -700, z: 80, rotation: 0 } },
      { ...dwelling(8), position: { x: 300, z: 300, rotation: 0 } },
    ],
  );
  const foreign: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
  return worldOf({
    villages: { lhota: homeVillage(), knezice },
    mapOf: (cell) => (cell.x === 1 ? foreign : MEADOW),
  });
}

describe('newJourney', () => {
  it('výchozí stav: jedna skupina doma s prvním rozkazem, takt a den vyslání', () => {
    const start = journey();
    expect(start).toMatchObject({
      kind: 'journey',
      id: 'j1',
      seed: 42,
      tick: LAUNCH,
      day: SUMMER,
      throughDay: SUMMER - 1,
      phase: 'out',
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      parties: [{ id: 0, phase: 'out', arrivedTick: null }],
      nextId: 1,
    });
    expect(start.members).toEqual([man(1), man(2)]);
    expect(start.groups).toHaveLength(1);
    expect(start.groups[0]).toMatchObject({
      party: 0,
      cell: HOME.cell,
      pos: HOME.pos,
      goal: { cell: HOME.cell, pos: NEAR },
      route: [],
      arrived: false,
    });
    expect(journeyFinished(start)).toBe(false);
  });

  it('první rozkaz přes okraj nebo domů; vstup se nesdílí se stavem', () => {
    const members = [man(1)];
    const across = journey({ members, order: { kind: 'cross', cell: EAST } });
    expect(phaseOf(across)).toBe('out');
    expect(across.groups[0]!.route).toEqual([EAST]);
    expect(across.groups[0]!.goal!.cell).toEqual(EAST);
    expect(across.members[0]!.ref).not.toBe(members[0]!.ref);
    expect(across.home).not.toBe(HOME);
    expect(phaseOf(journey({ order: { kind: 'home' } }))).toBe('returning');
  });
});

describe('rozkaz go', () => {
  it('skupina dojde na místo na své mapě a stojí; arrivedTick je takt dojetí', () => {
    const start = journey();
    const there = stepJourney(start, LAUNCH + 400, [], worldOf());
    expect(there.waiting).toBeNull();
    expect(there.state.tick).toBe(LAUNCH + 400);
    expect(there.state.throughDay).toBe(dayOfTick(LAUNCH + 401, clock) - 1);
    expect(phaseOf(there.state)).toBe('out');
    expect(there.state.groups[0]).toMatchObject({ cell: HOME.cell, pos: NEAR, arrived: true });
    const at = arrivedOf(there.state)!;
    expect(at).toBeGreaterThan(LAUNCH + 200);
    expect(at).toBeLessThan(LAUNCH + 260);
    const before = stepJourney(start, at - 1, [], worldOf()).state;
    expect(before.groups[0]!.arrived).toBe(false);
    expect(arrivedOf(before)).toBeNull();
    const exactly = stepJourney(start, at, [], worldOf()).state;
    expect(exactly.groups[0]!.arrived).toBe(true);
    expect(arrivedOf(exactly)).toBe(at);
    expect(there.villageEvents).toEqual([]);
    expect(there.notices).toEqual([]);
  });

  it('cíl ve vodě se posune na nejbližší dosažitelné místo', () => {
    // řeka kostry bez brodu od severu k jihu ve sloupci políček 80 (svět x ≈ 247,5 m), 30 m široká
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
    const map: CampaignMap = {
      landscape: { ...flat(), rivers: [river] },
      obstacles: null,
      villageIds: [],
    };
    const world = worldOf({ mapOf: () => map });
    const start = journey({ order: { kind: 'go', pos: { x: 247.5, z: 5 } } });
    // západní břeh, ze kterého skupina přichází; pohled ukáže posunutý cíl ze stavu
    const moving = stepJourney(start, LAUNCH + 1, [], world).state.groups[0]!;
    expect(moving.goal!.pos.x).toBeGreaterThan(200);
    expect(moving.goal!.pos.x).toBeLessThan(247.5);
    expect(moving.arrived).toBe(false);
    const there = stepJourney(start, LAUNCH + 400, [], world).state.groups[0]!;
    expect(there.arrived).toBe(true);
    expect(there.pos).toEqual(moving.goal!.pos);
    // praporek ve scéně stojí na `group.goal` (journeyMarks) – posunutý cíl je na souši, ne ve
    // vodě (náhrada nestabilního e2e praporku ve vodě – závěrečná recenze)
    const tile = tileOfWorldPoint(map.landscape, moving.goal!.pos.x, moving.goal!.pos.z)!;
    expect(surfaceAt(map.landscape, tile.x, tile.y)).not.toBe('water');
    expect(Math.abs(moving.goal!.pos.x - 247.5)).toBeGreaterThan(0.5);
  });
});

describe('rozkaz cross', () => {
  it('skupina přejde okraj, na sousední mapě stojí u jejího okraje a čeká', () => {
    const start = journey({ order: { kind: 'cross', cell: EAST } });
    const there = stepJourney(start, LAUNCH + 900, [], worldOf());
    expect(there.waiting).toBeNull();
    expect(phaseOf(there.state)).toBe('out');
    // východním okrajem (x = 955) na západní okraj sousední mapy
    expect(there.state.groups[0]).toMatchObject({
      cell: EAST,
      pos: { x: -955, z: 5 },
      route: [],
      arrived: true,
    });
    const at = arrivedOf(there.state)!;
    expect(at).toBeGreaterThan(LAUNCH + 700);
    const before = stepJourney(start, at - 1, [], worldOf()).state;
    expect(before.groups[0]!.cell).toEqual(HOME.cell);
    expect(arrivedOf(before)).toBeNull();
    // stojí – další takty polohu nemění, lhůta čekání běží od přechodu
    const later = stepJourney(there.state, at + WAIT, [], worldOf()).state;
    expect(later.groups[0]!.pos).toEqual({ x: -955, z: 5 });
    expect(phaseOf(later)).toBe('out');
    expect(phaseOf(stepJourney(later, at + WAIT + 1, [], worldOf()).state)).toBe('returning');
  });

  it('cross na nesousední políčko (ani na vlastní) stav nezmění – za jízdy ani při čekání', () => {
    const start = journey();
    for (const tick of [LAUNCH + 50, LAUNCH + 300]) {
      const plain = stepJourney(start, tick + 10, [], worldOf());
      for (const cell of [
        { x: 2, y: 0 },
        { x: 0, y: 0 },
        { x: -1, y: 2 },
      ]) {
        const tried = stepJourney(
          start,
          tick + 10,
          [intent(tick, 1, { kind: 'cross', cell })],
          worldOf(),
        );
        expect(JSON.stringify(tried.state)).toBe(JSON.stringify(plain.state));
      }
    }
  });
});

describe('čekání na místě', () => {
  const start = journey();
  const arrived = stepJourney(start, LAUNCH + 400, [], worldOf()).state;
  const at = arrivedOf(arrived)!;

  it('3 herní dny po dojetí bez rozkazu jede skupina domů sama', () => {
    expect(JOURNEY.waitDays).toBe(3);
    expect((WAIT * hoursPerTick(clock)) / 24).toBeCloseTo(3, 2);
    const still = stepJourney(arrived, at + WAIT, [], worldOf()).state;
    expect(phaseOf(still)).toBe('out');
    expect(still.groups[0]).toMatchObject({ pos: NEAR, arrived: true });
    expect(arrivedOf(still)).toBe(at);
    const turned = stepJourney(arrived, at + WAIT + 1, [], worldOf()).state;
    expect(phaseOf(turned)).toBe('returning');
    expect(turned.groups[0]!.goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
    expect(turned.groups[0]!.arrived).toBe(false);
    expect(arrivedOf(turned)).toBeNull();
  });

  it('rozkaz během čekání lhůtu zruší; po dalším dojetí běží znovu', () => {
    const again = [intent(at + 500, 1, { kind: 'go', pos: { x: 5, z: 305 } })];
    const moving = stepJourney(arrived, at + 500, again, worldOf()).state;
    expect(arrivedOf(moving)).toBeNull();
    expect(moving.groups[0]!.arrived).toBe(false);
    // původní lhůta uplynula – skupina stojí na novém místě a domů nejede
    const second = stepJourney(arrived, at + WAIT + 1, again, worldOf()).state;
    expect(phaseOf(second)).toBe('out');
    expect(second.groups[0]).toMatchObject({ pos: { x: 5, z: 305 }, arrived: true });
    const at2 = arrivedOf(second)!;
    expect(at2).toBeGreaterThan(at + 500);
    expect(phaseOf(stepJourney(arrived, at2 + WAIT, again, worldOf()).state)).toBe('out');
    expect(phaseOf(stepJourney(arrived, at2 + WAIT + 1, again, worldOf()).state)).toBe('returning');
  });

  it('rozkaz go během návratu vrátí fázi out', () => {
    const turned = stepJourney(arrived, at + WAIT + 50, [], worldOf()).state;
    expect(phaseOf(turned)).toBe('returning');
    const back = stepJourney(
      turned,
      at + WAIT + 60,
      [intent(at + WAIT + 60, 1, { kind: 'go', pos: NEAR })],
      worldOf(),
    ).state;
    expect(phaseOf(back)).toBe('out');
    expect(back.groups[0]!.goal).toEqual({ cell: HOME.cell, pos: NEAR });
    expect(arrivedOf(back)).toBeNull();
    // po dojetí zase čeká a pak jede domů
    const there = stepJourney(back, at + WAIT + 200, [], worldOf()).state;
    expect(there.groups[0]).toMatchObject({ pos: NEAR, arrived: true });
    expect(phaseOf(there)).toBe('out');
  });
});

describe('návrat', () => {
  const HOMEWARD = [intent(LAUNCH + 300, 1, { kind: 'home' })];

  it('po dojetí domů done, právě jedna událost away-ends do domovské vsi a upozornění hráči', () => {
    const start = journey();
    const turned = stepJourney(start, LAUNCH + 300, HOMEWARD, worldOf());
    expect(phaseOf(turned.state)).toBe('returning');
    expect(arrivedOf(turned.state)).toBeNull();
    expect(turned.villageEvents).toEqual([]);
    const done = stepJourney(start, LAUNCH + 700, HOMEWARD, worldOf());
    expect(done.waiting).toBeNull();
    expect(done.state.phase).toBe('done');
    expect(journeyFinished(done.state)).toBe(true);
    // hlouček, který došel domů, ze stavu zmizí i s lidmi
    expect(done.state.groups).toEqual([]);
    expect(done.state.members).toEqual([]);
    // výjezd končí taktem dojetí; muži jsou doma od začátku dalšího dne (schránka den nato)
    const tick = done.state.tick;
    const day = done.state.day;
    expect(tick).toBeLessThan(LAUNCH + 700);
    const { last, end } = lastStand(start, LAUNCH + 700, HOMEWARD, worldOf());
    expect(end).toBe(tick);
    arrivingHome(last);
    expect(day).toBe(dayOfTick(tick, clock));
    expect(done.villageEvents).toEqual([
      {
        villageId: 'lhota',
        day: day + 1,
        ref: `journey:j1:${tick}:0`,
        body: { kind: 'away-ends', refId: 'j1', untilDay: day + 1, personIds: [1, 2] },
      },
    ]);
    expect(done.notices).toEqual([
      {
        playerId: 'p1',
        kind: 'journey-returned',
        payload: { journeyId: 'j1', leader: 'Bořivoj' },
        gameDay: day,
        ref: expect.any(String),
      },
    ]);
  });

  it('skončený výjezd se už nepočítá ani nepřijímá rozkazy', () => {
    const done = stepJourney(journey(), LAUNCH + 700, HOMEWARD, worldOf()).state;
    const after = stepJourney(
      done,
      LAUNCH + 900,
      [intent(LAUNCH + 800, 2, { kind: 'go', pos: NEAR })],
      worldOf(),
    );
    expect(after.state).toBe(done);
    expect(after.villageEvents).toEqual([]);
    expect(after.notices).toEqual([]);
    expect(after.waiting).toBeNull();
  });
});

describe('rozkazy hráče', () => {
  const there: Pos = { x: 5, z: 305 };
  const go = intent(LAUNCH + 40, 1, { kind: 'go', pos: there });

  it('rozkaz platí přesně ve svém taktu a nahradí starý', () => {
    const start = journey();
    const before = stepJourney(start, LAUNCH + 39, [go], worldOf()).state;
    expect(before.groups[0]!.goal!.pos).toEqual(NEAR);
    const at = stepJourney(start, LAUNCH + 40, [go], worldOf()).state;
    expect(at.groups[0]!.goal!.pos).toEqual(there);
    const done = stepJourney(start, LAUNCH + 400, [go], worldOf()).state;
    expect(done.groups[0]).toMatchObject({ pos: there, arrived: true });
  });

  it('v jednom taktu platí pořadí seq – poslední rozkaz vyhrává', () => {
    const both = [
      intent(LAUNCH + 40, 2, { kind: 'home' }),
      intent(LAUNCH + 40, 1, { kind: 'go', pos: there }),
    ];
    const at = stepJourney(journey(), LAUNCH + 40, both, worldOf()).state;
    expect(phaseOf(at)).toBe('returning');
    expect(at.groups[0]!.goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
  });

  it('rozkaz v minulosti a cizí rozkaz se zahodí', () => {
    const start = journey();
    const plain = JSON.stringify(stepJourney(start, LAUNCH + 60, [], worldOf()).state);
    const foreign = [intent(LAUNCH + 40, 1, { kind: 'go', pos: there }, 'p2')];
    expect(JSON.stringify(stepJourney(start, LAUNCH + 60, foreign, worldOf()).state)).toBe(plain);
    const mid = stepJourney(start, LAUNCH + 50, [], worldOf()).state;
    expect(JSON.stringify(stepJourney(mid, LAUNCH + 60, [go], worldOf()).state)).toBe(plain);
  });
});

describe('tempo', () => {
  const EDGE: JourneyOrder = { kind: 'go', pos: { x: 905, z: 5 } };
  /** Metry, které skupina ujde na východ za 200 taktů. */
  const walked = (members: JourneyMember[], launch = LAUNCH): number => {
    const start = journey({ members, order: EDGE, startMs: msOfTick(launch, clock) });
    const step = stepJourney(start, launch + 200, [], worldOf());
    expect(step.waiting).toBeNull();
    return step.state.groups[0]!.pos.x - HOME.pos.x;
  };
  const onFoot = (personId: number): JourneyMember => man(personId, { mounted: false });

  it('jen jezdci 1,5× dál než pěší; s jedním pěším tempem pěšího; v zimě × 0,75', () => {
    const foot = walked([onFoot(1), onFoot(2)]);
    expect(foot).toBeCloseTo((200 * WAR.pace.metersPerSecond) / TICKS_PER_SECOND, 6);
    expect(walked([man(1), man(2)])).toBeCloseTo(1.5 * foot, 6);
    expect(walked([man(1), onFoot(2)])).toBeCloseTo(foot, 6);
    expect(walked([man(1), man(2)], WINTER_LAUNCH)).toBeCloseTo(0.75 * 1.5 * foot, 6);
    expect(walked([onFoot(1), onFoot(2)], WINTER_LAUNCH)).toBeCloseTo(0.75 * foot, 6);
  });

  it('pěší raněný skupinu zpomalí jako u vojska; padlý muž tempo neurčuje', () => {
    const foot = walked([onFoot(1)]);
    expect(walked([onFoot(1), man(2, { mounted: false, wounded: true })])).toBeCloseTo(
      WAR.pace.wounded * foot,
      6,
    );
    expect(walked([man(1), man(2, { mounted: false, status: 'fallen' })])).toBeCloseTo(
      1.5 * foot,
      6,
    );
  });
});

describe('bez zásob a mrazu', () => {
  it('po 30 zimních dnech venku mají muži zdraví 100 a výjezd se sám neobrátí dřív než po čekání', () => {
    const near: Pos = { x: 105, z: 5 };
    const start = journey({
      members: [man(1, { mounted: false }), man(2, { mounted: false })],
      startMs: msOfTick(WINTER_LAUNCH, clock),
    });
    // hráč pošle skupinu každé 2 dny jinam – čekání (3 dny) nikdy neuplyne
    const every = Math.round((2 * 24) / hoursPerTick(clock));
    const end = WINTER_LAUNCH + Math.ceil((30 * 24) / hoursPerTick(clock));
    const orders: JourneyIntent[] = [];
    for (let k = 1; WINTER_LAUNCH + k * every < end; k++) {
      orders.push(
        intent(WINTER_LAUNCH + k * every, k, { kind: 'go', pos: k % 2 === 1 ? near : NEAR }),
      );
    }
    const out = stepJourney(start, end, orders, worldOf());
    expect(out.waiting).toBeNull();
    expect(out.state.day - WINTER).toBe(30);
    expect(phaseOf(out.state)).toBe('out');
    expect(out.state.members.map((m) => [m.health, m.wounded, m.status])).toEqual([
      [100, false, 'active'],
      [100, false, 'active'],
    ]);
    expect(out.villageEvents).toEqual([]);
    expect(out.notices).toEqual([]);
    // bez dalšího rozkazu se obrátí až po čekání od posledního dojetí
    const last = arrivedOf(stepJourney(out.state, end + 400, [], worldOf()).state)!;
    expect(last).toBeGreaterThan(orders[orders.length - 1]!.tick);
    expect(phaseOf(stepJourney(out.state, last + WAIT, [], worldOf()).state)).toBe('out');
    const turned = stepJourney(out.state, last + WAIT + 1, [], worldOf()).state;
    expect(phaseOf(turned)).toBe('returning');
    expect(turned.members.every((m) => m.health === 100 && m.status === 'active')).toBe(true);
  });
});

describe('brána', () => {
  /** Palisáda 4 × 4 políčka kolem středu mapy (svět −30…30 m), postavená měsíc před výjezdem. */
  function fort(gate: boolean): Fortification {
    const cells: TileCell[] = [];
    for (let y = 62; y < 66; y++) for (let x = 62; x < 66; x++) cells.push({ x, y });
    const area = fortificationArea(cells, null, { size: 128, cellSizeM: 15 });
    if ('error' in area) throw new Error(area.error);
    const outline = areaOutline(area, 'palisade');
    const gates = gate ? addGate(outline, [], { x: 0, z: -30 }) : [];
    if (!Array.isArray(gates)) throw new Error(gates.error);
    return {
      id: 1,
      grid: null,
      cells,
      kind: 'palisade',
      segments: fortSegments(outline).map((s) => ({
        index: s.index,
        builtDay: SUMMER - 30,
        state: 1,
      })),
      gates,
    };
  }
  /** Svět, kde Lhota stojí na své mapě opevněná; domov je uvnitř obvodu. */
  const fortified = (gate: boolean): CampaignWorld => {
    const lhota = village(
      [1, 2].map((id) => kin({ id, age: 30, sex: 'male' })),
      [],
      { fortifications: [fort(gate)] },
    );
    const map: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['lhota'] };
    return worldOf({ villages: { lhota }, mapOf: () => map });
  };
  const OUTSIDE: Pos = { x: 5, z: -195 };
  const start = journey({ order: { kind: 'go', pos: OUTSIDE } });

  it('v míru projede otevřenou branou opevněné vsi – ven i zpět domů dovnitř obvodu', () => {
    const out = stepJourney(start, LAUNCH + 300, [], fortified(true)).state;
    expect(out.groups[0]).toMatchObject({ pos: OUTSIDE, arrived: true });
    const home = stepJourney(
      out,
      LAUNCH + 700,
      [intent(LAUNCH + 301, 1, { kind: 'home' })],
      fortified(true),
    );
    expect(home.state.phase).toBe('done');
    arrivingHome(
      lastStand(out, LAUNCH + 700, [intent(LAUNCH + 301, 1, { kind: 'home' })], fortified(true))
        .last,
    );
    expect(home.villageEvents.map((e) => e.body.kind)).toEqual(['away-ends']);
  });

  it('kontrola: bez brány hradbou neprojde – cíl se posune dovnitř obvodu', () => {
    const closed = stepJourney(start, LAUNCH + 300, [], fortified(false)).state.groups[0]!;
    expect(closed.arrived).toBe(true);
    expect(Math.abs(closed.pos.x)).toBeLessThan(30);
    expect(Math.abs(closed.pos.z)).toBeLessThan(30);
  });
});

describe('bez vedlejších účinků', () => {
  it('průjezd mapou s cizí vsí nevydá událost do její schránky ani upozornění jejímu hráči', () => {
    const knezice = village([kin({ id: 1, age: 30, sex: 'male' })], [dwelling(1)]);
    const foreign: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
    const world = worldOf({
      villages: { lhota: homeVillage(), knezice },
      mapOf: (cell) => (cell.x === 1 ? foreign : MEADOW),
      extra: {
        watcherOf: () => ({ playerId: 'p2', name: 'Kněžice' }),
        harmless: () => false,
      },
    });
    // tři dny stojí na mapě cizí vsi – nikdo se nic nedozví
    const standing = stepJourney(journey(), LAUNCH + 2000, TRIP, world);
    expect(standing.state.groups[0]).toMatchObject({ cell: EAST, pos: FAR, arrived: true });
    expect(standing.villageEvents).toEqual([]);
    expect(standing.notices).toEqual([]);
    const whole = stepJourney(journey(), TRIP_END, TRIP, world);
    expect(whole.state.phase).toBe('done');
    expect(whole.villageEvents.map((e) => [e.villageId, e.body.kind])).toEqual([
      ['lhota', 'away-ends'],
    ]);
    expect(whole.notices.map((n) => [n.playerId, n.kind])).toEqual([['p1', 'journey-returned']]);
  });
});

describe('objevování za jízdy (Úloha 6)', () => {
  it('po průjezdu kolem vsi má výjezd seen jejího políčka – dům u cesty a stopu; domov ne', () => {
    const step = stepJourney(journey(), TRIP_END, TRIP, passingWorld());
    expect(step.state.phase).toBe('done');
    const seen = step.state.seen!;
    expect(Object.keys(seen)).toEqual(['1,0']);
    const east = seen['1,0']!;
    expect(east.villageId).toBe('knezice');
    expect(east.parts.map((p) => [p.key, p.data.kind])).toEqual([['dwelling:7', 'dwelling']]);
    // stopa po 20 m od okraje mapy k FAR (−655, 5) – body se neopakují
    expect(east.trail).toContainEqual([-660, 0]);
    expect(east.trail.length).toBeGreaterThan(10);
    expect(new Set(east.trail.map(([x, z]) => `${x},${z}`)).size).toBe(east.trail.length);
  });

  it('jiná ves na mapě než dřív – stavby staré vsi se zahodí, stopa zůstane', () => {
    // skupina stojí u Kněžic; rod si z dřívějška pamatuje dům 8 vsi, která na mapě stála předtím
    const standing = stepJourney(journey(), LAUNCH + 2000, TRIP, passingWorld()).state;
    const old: SeenCell = {
      villageId: 'stara',
      trail: [[900, 900]],
      parts: [
        {
          key: 'dwelling:8',
          pos: { x: 300, z: 300 },
          day: 10,
          data: {
            kind: 'dwelling',
            id: 8,
            type: 'zemnice',
            position: { x: 300, z: 300, rotation: 0 },
            condition: 1,
          },
        },
      ],
    };
    const next = stepJourney(
      { ...standing, seen: { '1,0': old } },
      standing.tick + 1,
      [],
      passingWorld(),
    ).state.seen!['1,0']!;
    expect(next.villageId).toBe('knezice');
    expect(next.parts.map((p) => p.key)).toEqual(['dwelling:7']);
    expect(next.trail).toContainEqual([900, 900]);
  });

  it('mapa bez vsi – jen stopa', () => {
    const east = stepJourney(journey(), TRIP_END, TRIP, worldOf()).state.seen?.['1,0'];
    expect(east?.parts).toEqual([]);
    expect(east?.trail.length).toBeGreaterThan(10);
    expect(east && 'villageId' in east).toBe(false);
  });
});

describe('znalost do úložiště rodu (Úloha 10)', () => {
  it('po přechodu okrajem a dojetí vydá znalost mapy, na které skupina stojí', () => {
    const start = journey({ order: { kind: 'cross', cell: EAST } });
    const step = stepJourney(start, LAUNCH + 900, [], passingWorld());
    expect(arrivedOf(step.state)).not.toBeNull();
    expect(step.knowledge).toHaveLength(1);
    expect(step.knowledge![0]!.cell).toEqual(EAST);
    expect(step.knowledge![0]!.seen).toEqual(step.state.seen!['1,0']);
    expect(step.knowledge![0]!.seen.villageId).toBe('knezice');
  });

  it('při odchodu z mapy vydá znalost mapy, kterou skupina opouští; domovská mapa nikdy', () => {
    const step = stepJourney(journey(), TRIP_END, TRIP, passingWorld());
    expect(step.state.phase).toBe('done');
    const out = step.knowledge!;
    // přechod do východní mapy, dojetí k FAR a odchod domů – všechno znalost téže mapy
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.every((k) => sameCell(k.cell, EAST))).toBe(true);
    // slučováním všeho vydaného vznikne znalost stavu výjezdu (poslední vydání je úplné)
    let merged: SeenCell | null = null;
    for (const k of out) merged = mergeKnowledge(merged, k.seen);
    expect(merged).toEqual(step.state.seen!['1,0']);
    expect(out[out.length - 1]!.seen).toEqual(step.state.seen!['1,0']);
  });

  it('jízda jen po domovské mapě znalost nevydá', () => {
    const start = journey({ order: { kind: 'go', pos: NEAR } });
    const step = stepJourney(start, LAUNCH + 900, [], passingWorld());
    expect(step.knowledge).toBeUndefined();
  });
});

describe('determinismus (Review Focus 4)', () => {
  const whole = stepJourney(journey(), TRIP_END, TRIP, worldOf());
  /** Louky a průjezd kolem cizí vsi – výjezd si za jízdy pamatuje viděné (Úloha 6). */
  const worlds = [(): CampaignWorld => worldOf(), passingWorld];

  it('cesta na sousední mapu a zpět skončí doma', () => {
    expect(whole.waiting).toBeNull();
    expect(whole.state.phase).toBe('done');
    arrivingHome(lastStand(journey(), TRIP_END, TRIP, worldOf()).last);
    expect(whole.villageEvents).toHaveLength(1);
    expect(whole.notices).toHaveLength(1);
  });

  it('krok vcelku = po 7 taktech s JSON mezi kousky (stav, události i upozornění)', () => {
    for (const worldFn of worlds) {
      const all = stepJourney(journey(), TRIP_END, TRIP, worldFn());
      for (const chunk of [7, 400]) {
        const parts = inChunks(journey(), TRIP_END, chunk, TRIP, worldFn());
        expect(JSON.stringify(parts.state)).toBe(JSON.stringify(all.state));
        expect(parts.villageEvents).toEqual(all.villageEvents);
        expect(parts.notices).toEqual(all.notices);
        expect(parts.knowledge).toEqual(all.knowledge);
      }
    }
  });

  it('restart z kontrolního bodu uprostřed cesty i čekání = bez restartu', () => {
    for (const worldFn of worlds) {
      const all = stepJourney(journey(), TRIP_END, TRIP, worldFn());
      for (const tick of [LAUNCH + 120, LAUNCH + 1700, LAUNCH + 2600]) {
        const half = stepJourney(journey(), tick, TRIP, worldFn());
        // zmražený bod – co výjezd viděl, další takt na místě nemění
        const checkpoint = deepFreeze(JSON.parse(JSON.stringify(half.state)) as JourneyState);
        const rest = stepJourney(checkpoint, TRIP_END, TRIP, worldFn());
        expect(JSON.stringify(rest.state)).toBe(JSON.stringify(all.state));
        expect([...half.villageEvents, ...rest.villageEvents]).toEqual(all.villageEvents);
        expect([...half.notices, ...rest.notices]).toEqual(all.notices);
      }
    }
  });

  it('zmražený vstupní stav a rozkazy: stejný výsledek, vstup se nemění', () => {
    const start = deepFreeze(journey());
    const step = stepJourney(start, TRIP_END, deepFreeze(structuredClone(TRIP)), worldOf());
    expect(JSON.stringify(step.state)).toBe(JSON.stringify(whole.state));
    expect(step.villageEvents).toEqual(whole.villageEvents);
  });
});

describe('chybějící mapa', () => {
  const onlyHome = worldOf({ mapOf: (cell) => (cell.x === 0 ? MEADOW : null) });

  it('krok se zastaví: waiting.cells a stav na konci posledního celého taktu', () => {
    const start = deepFreeze(journey());
    const whole = stepJourney(start, TRIP_END, TRIP, worldOf());
    const partial = stepJourney(start, TRIP_END, TRIP, onlyHome);
    expect(partial.waiting).toEqual({ cells: [EAST], villageIds: [] });
    // na sousední mapě se muži hned rozhlédnou (Úloha 6) – mapu čte už takt přechodu okraje,
    // krok skončí taktem před ním u okraje domovské mapy
    expect(partial.state.groups[0]!.cell).toEqual(HOME.cell);
    const crossing = stepJourney(partial.state, partial.state.tick + 1, TRIP, worldOf());
    expect(crossing.state.groups[0]!.cell).toEqual(EAST);
    const upTo = stepJourney(start, partial.state.tick, TRIP, worldOf());
    expect(partial.state).toStrictEqual(upTo.state);
    expect(partial.villageEvents).toEqual(upTo.villageEvents);
    expect(partial.notices).toEqual(upTo.notices);
    // po načtení mapy pokračuje se stejným výsledkem
    const rest = stepJourney(partial.state, TRIP_END, TRIP, worldOf());
    expect(JSON.stringify(rest.state)).toBe(JSON.stringify(whole.state));
    expect([...partial.villageEvents, ...rest.villageEvents]).toEqual(whole.villageEvents);
    expect([...partial.notices, ...rest.notices]).toEqual(whole.notices);
  });

  it('chybí-li mapa skupiny nebo další mapa trasy hned, stav zůstane týž', () => {
    const partial = stepJourney(journey(), TRIP_END, TRIP, onlyHome);
    const again = stepJourney(partial.state, TRIP_END, TRIP, onlyHome);
    expect(again.state).toBe(partial.state);
    expect(again.waiting).toEqual({ cells: [EAST], villageIds: [] });
    const across = journey({ order: { kind: 'cross', cell: EAST } });
    const first = stepJourney(across, LAUNCH + 100, [], onlyHome);
    expect(first.state).toBe(across);
    expect(first.waiting).toEqual({ cells: [EAST], villageIds: [] });
  });
});

describe('člen výjezdu zemře doma (Review Focus 1)', () => {
  const DEATH_DAY = SUMMER + 2;
  const DEATH = firstTickOf(DEATH_DAY);
  /** Svět, ve kterém od dne `DEATH_DAY` v domovské vsi chybí muži `dead`. */
  const dyingWorld = (dead: readonly number[]): CampaignWorld => {
    const full = homeVillage();
    const rest = homeVillage([1, 2, 3].filter((id) => !dead.includes(id)));
    return worldOf({
      villageAt: (villageId, day) =>
        villageId !== 'lhota' ? null : day >= DEATH_DAY ? rest : full,
    });
  };
  const statuses = (state: JourneyState): string[] => state.members.map((m) => m.status);

  it('muž družiny, který ve vsi chybí, je fallen; výjezd jede dál a poslouchá rozkazy', () => {
    const world = dyingWorld([2]);
    const before = stepJourney(journey(), DEATH - 1, [], world).state;
    expect(statuses(before)).toEqual(['active', 'active']);
    const at = stepJourney(journey(), DEATH, [], world);
    expect(statuses(at.state)).toEqual(['active', 'fallen']);
    expect(phaseOf(at.state)).toBe('out');
    expect(at.state.groups[0]).toMatchObject({ pos: NEAR, arrived: true });
    expect(at.villageEvents).toEqual([]);
    expect(at.notices).toEqual([]);
    const there: Pos = { x: 5, z: 305 };
    const ordered = stepJourney(
      at.state,
      DEATH + 10,
      [intent(DEATH + 10, 1, { kind: 'go', pos: there })],
      world,
    ).state;
    expect(ordered.groups[0]!.goal!.pos).toEqual(there);
    expect(phaseOf(ordered)).toBe('out');
  });

  it('zemře-li vojvoda, zbytek se vrací sám a rozkazy hráče se zahodí', () => {
    const world = dyingWorld([1]);
    const at = stepJourney(journey(), DEATH, [], world).state;
    expect(statuses(at)).toEqual(['fallen', 'active']);
    expect(phaseOf(at)).toBe('returning');
    expect(at.groups[0]!.goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
    expect(at.groups[0]!.arrived).toBe(false);
    expect(arrivedOf(at)).toBeNull();
    // rozkaz v taktu úmrtí i po něm se zahodí
    const orders = [
      intent(DEATH, 1, { kind: 'go', pos: { x: 5, z: 305 } }),
      intent(DEATH + 10, 2, { kind: 'cross', cell: EAST }),
      intent(DEATH + 20, 3, { kind: 'go', pos: { x: 5, z: 305 } }),
    ];
    const plain = stepJourney(journey(), DEATH + 30, [], world).state;
    const ordered = stepJourney(journey(), DEATH + 30, orders, world).state;
    expect(JSON.stringify(ordered)).toBe(JSON.stringify(plain));
    expect(phaseOf(ordered)).toBe('returning');
    // družina dojede domů: návrat do vsi ano, upozornění „Bořivoj se vrátil.“ ne – nevrátil se
    const done = stepJourney(journey(), DEATH + 400, orders, world);
    expect(done.state.phase).toBe('done');
    expect(done.villageEvents.map((e) => [e.villageId, e.body.kind])).toEqual([
      ['lhota', 'away-ends'],
    ]);
    expect(done.notices).toEqual([]);
  });

  it('rozkaz před smrtí vojvody platí – zahazují se až od ní', () => {
    const world = dyingWorld([1]);
    const there: Pos = { x: 5, z: 305 };
    const early = [intent(DEATH - 1, 1, { kind: 'go', pos: there })];
    const before = stepJourney(journey(), DEATH - 1, early, world).state;
    expect(before.groups[0]!.goal!.pos).toEqual(there);
    expect(phaseOf(stepJourney(before, DEATH, early, world).state)).toBe('returning');
  });

  it('bez živých členů venku výjezd skončí a vydá znalost mapy, kde stál', () => {
    const start = journey({ members: [man(1)], order: { kind: 'cross', cell: EAST } });
    // muži zemřou o den později než ve zbytku skupiny, až stojí na východní mapě
    const late = firstTickOf(DEATH_DAY + 1);
    const world = worldOf({
      villageAt: (villageId, day) =>
        villageId !== 'lhota' ? null : day >= DEATH_DAY + 1 ? homeVillage([]) : homeVillage(),
    });
    const standing = stepJourney(start, late - 1, [], world);
    expect(standing.state.groups[0]!.cell).toEqual(EAST);
    const done = stepJourney(standing.state, late, [], world);
    expect(done.state.phase).toBe('done');
    expect(done.knowledge).toHaveLength(1);
    expect(done.knowledge![0]!.cell).toEqual(EAST);
    expect(done.knowledge![0]!.seen).toEqual(done.state.seen!['1,0']);
  });

  it('bez živých členů done – bez událostí a upozornění', () => {
    for (const members of [[man(1), man(2)], [man(1)]]) {
      const start = journey({ members });
      const step = stepJourney(start, DEATH + 400, [], dyingWorld([1, 2]));
      expect(step.state.phase).toBe('done');
      expect(step.state.tick).toBe(DEATH);
      expect(step.state.members.every((m) => m.status === 'fallen')).toBe(true);
      expect(step.villageEvents).toEqual([]);
      expect(step.notices).toEqual([]);
      expect(step.waiting).toBeNull();
    }
  });

  it('vcelku = po 7 taktech s JSON mezi kousky', () => {
    const world = dyingWorld([1]);
    const whole = stepJourney(journey(), DEATH + 400, [], world);
    const parts = inChunks(journey(), DEATH + 400, 7, [], world);
    expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
    expect(parts.villageEvents).toEqual(whole.villageEvents);
  });
});

describe('domovská ves (Review Focus 2)', () => {
  const NEXT_DAY = firstTickOf(SUMMER + 1);

  it('ves neexistuje → done bez událostí', () => {
    const world = worldOf({ villages: {} });
    // den vyslání se doma nekontroluje (muže ověřilo vyslání) – až první takt dalšího dne
    expect(phaseOf(stepJourney(journey(), NEXT_DAY - 1, [], world).state)).toBe('out');
    const step = stepJourney(journey(), LAUNCH + 2000, [], world);
    expect(step.state.phase).toBe('done');
    expect(step.state.tick).toBe(NEXT_DAY);
    expect(step.waiting).toBeNull();
    expect(step.villageEvents).toEqual([]);
    expect(step.notices).toEqual([]);
  });

  it('ves ještě nemá den → krok čeká na ves a po jejím dopočtu pokračuje stejně', () => {
    const home = homeVillage();
    const behind = worldOf({
      villageAt: (villageId, day) => (villageId === 'lhota' && day <= SUMMER + 1 ? home : null),
    });
    const step = stepJourney(journey(), LAUNCH + 2000, [], behind);
    expect(step.waiting).toEqual({ cells: [], villageIds: ['lhota'] });
    expect(step.state.tick).toBe(firstTickOf(SUMMER + 2) - 1);
    expect(phaseOf(step.state)).toBe('out');
    expect(step.villageEvents).toEqual([]);
    const whole = stepJourney(journey(), LAUNCH + 2000, [], worldOf());
    const rest = stepJourney(step.state, LAUNCH + 2000, [], worldOf());
    expect(JSON.stringify(rest.state)).toBe(JSON.stringify(whole.state));
  });

  it('svět bez dotazu villageGone neví – krok čeká jako tažení', () => {
    const world: CampaignWorld = { clock, landscapeOf: () => MEADOW, villageAt: () => null };
    const step = stepJourney(journey(), LAUNCH + 2000, [], world);
    expect(step.waiting).toEqual({ cells: [], villageIds: ['lhota'] });
    expect(step.state.tick).toBe(NEXT_DAY - 1);
    expect(phaseOf(step.state)).toBe('out');
  });
});
