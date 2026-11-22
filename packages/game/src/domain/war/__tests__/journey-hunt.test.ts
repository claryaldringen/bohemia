import { describe, expect, it } from 'vitest';
import type { NewVillageEvent } from '../../village/core/inbox';
import { sameCell, type GridCell } from '../../village/people/world-grid';
import { HUNT_FIGHT } from '../../village/rules/rules-wildlife';
import type { QuarryKind, VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import type { HuntStart } from '../hunt-beaters';
import { journeyFinished, newJourney, stepJourney, type NewJourney } from '../journey';
import type {
  JourneyIntent,
  JourneyIntentBody,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
} from '../journey-types';
import { MarchGridMemo, type Pos } from '../march-grid';
import { WAR } from '../rules-war';
import { dayOfTick, msOfTick, TICKS_PER_SECOND } from '../ticks';
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
  return village([1, 2, 3].map((id) => kin({ id, age: 30, sex: 'male' })));
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
