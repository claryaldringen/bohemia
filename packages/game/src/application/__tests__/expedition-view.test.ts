import { describe, expect, it } from 'vitest';
import {
  addHunters,
  dropHunters,
  msOfTick,
  newJourney,
  releaseQuarry,
  type HuntStart,
  type JourneyRecruit,
  type JourneyState,
  type NewHunter,
} from '../../domain/war';
import { LAUNCH, world } from '../../domain/war/__tests__/campaign-fixtures';
import { expeditionViewsFor, huntRunning } from '../expedition-view';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemoryKnowledge } from './in-memory-knowledge';

// Pohled hráče na výpravy (plán 2026-11-14 – Úloha 6): jeden pohled na výpravu domovské vsi,
// skupiny, hloučky a lidé s koňmi a silou.

const bornDay = (age: number): number => Math.floor(400 * 365 - age * 365) + 400 * 365 * 0;

function person(personId: number, extra: Partial<JourneyRecruit> = {}): JourneyRecruit {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    strength: 2,
    fight: 50,
    bornDay: bornDay(30),
    ...(personId === 1 ? { name: 'Bořivoj' } : {}),
    ...extra,
  };
}

function expedition(
  id: string,
  villageId: string,
  recruits: JourneyRecruit[],
  playerId = 'pa',
): JourneyState {
  return newJourney(
    {
      id,
      seed: 5,
      playerId,
      houseId: `h-${playerId}`,
      home: { villageId, name: villageId, cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } },
      recruits,
      startMs: msOfTick(LAUNCH, world),
      order: { kind: 'go', pos: { x: 305, z: 5 } },
    },
    world,
  );
}

function deps(journeys: InMemoryJourneys, knowledge?: InMemoryKnowledge) {
  return { journeys, world, ...(knowledge ? { knowledge } : {}) };
}

describe('expeditionViewsFor', () => {
  it('dvě výpravy hráče (dvě vsi) = dva pohledy; cizí hráč a hráč bez výprav prázdno', async () => {
    const journeys = new InMemoryJourneys();
    await journeys.create(expedition('j1', 'lhota', [person(1), person(2)]));
    await journeys.create(expedition('j2', 'brod', [person(3, { lord: true })]));
    const views = await expeditionViewsFor(deps(journeys), { playerId: 'pa' });
    expect(views.map((v) => [v.journeyId, v.villageId])).toEqual([
      ['j1', 'lhota'],
      ['j2', 'brod'],
    ]);
    expect(views[0]).toMatchObject({ home: { x: 0, y: 0 }, homePos: { x: 5, z: 5 } });
    expect(views[0]!.parties).toHaveLength(1);
    expect(views[0]!.parties[0]).toMatchObject({
      phase: 'out',
      controllable: true,
      leaderId: 1,
      horseWork: null,
    });
    expect(await expeditionViewsFor(deps(journeys), { playerId: 'pb' })).toEqual([]);
    expect(await expeditionViewsFor(deps(journeys), { playerId: 'nikdo' })).toEqual([]);
  });

  it('skupina se dvěma hloučky – groups 2, lidé nesou hlouček', async () => {
    const journeys = new InMemoryJourneys();
    const state = expedition('j1', 'lhota', [person(1), person(2)]);
    const second = structuredClone(state.groups[0]!);
    second.id = 7;
    second.pos = { x: 90, z: 9 };
    state.groups.push(second);
    state.members[1]!.group = 7;
    await journeys.create(state);
    const [view] = await expeditionViewsFor(deps(journeys), { playerId: 'pa' });
    const party = view!.parties[0]!;
    expect(party.groups.map((g) => g.id)).toEqual([state.groups[0]!.id, 7]);
    expect(party.people.map((p) => [p.personId, p.group])).toEqual([
      [1, state.groups[0]!.id],
      [2, 7],
    ]);
  });

  it('jezdec na koni má sílu na koni; pěšky základní; dítě a žena příznaky', async () => {
    const journeys = new InMemoryJourneys();
    const state = expedition('j1', 'lhota', [
      person(1, { horseId: 4, strengthMounted: 5 }),
      person(2, { horseId: 6, strengthMounted: 5 }),
      person(3, { female: true, strength: 0, bornDay: bornDay(12) }),
    ]);
    // osoba 1 už sedí na koni (po osedlání), osoba 2 jde pěšky
    Object.assign(state.members[0]!, { mounted: true, horse: 'ridden' as const });
    await journeys.create(state);
    const [view] = await expeditionViewsFor(deps(journeys), { playerId: 'pa' });
    const [rider, walker, girl] = view!.parties[0]!.people;
    expect(rider).toMatchObject({
      mounted: true,
      rider: true,
      horse: 'ridden',
      horseId: 4,
      strength: 5,
    });
    expect(walker).toMatchObject({ mounted: false, rider: true, horse: null, strength: 2 });
    expect(girl).toMatchObject({ female: true, child: true, rider: false, strength: 0 });
  });

  it('seen – znalost rodu sloučená s výpravou na cizí mapě hloučku; domovská mapa nic', async () => {
    const journeys = new InMemoryJourneys();
    const knowledge = new InMemoryKnowledge();
    const state = expedition('j1', 'lhota', [person(1), person(2)]);
    const second = structuredClone(state.groups[0]!);
    second.id = 7;
    second.cell = { x: 2, y: 0 };
    state.groups[0]!.cell = { x: 1, y: 0 };
    state.groups.push(second);
    state.members[1]!.group = 7;
    state.seen = { '1,0': { trail: [[-900, 0]], parts: [] } };
    await journeys.create(state);
    await knowledge.merge(state.houseId, { x: 1, y: 0 }, { trail: [[-940, 0]], parts: [] });
    await knowledge.merge(state.houseId, { x: 2, y: 0 }, { trail: [[0, 7]], parts: [] });
    await knowledge.merge(state.houseId, { x: 3, y: 0 }, { trail: [[0, 9]], parts: [] });
    const [view] = await expeditionViewsFor(deps(journeys, knowledge), { playerId: 'pa' });
    expect(Object.keys(view!.seen).sort()).toEqual(['1,0', '2,0']);
    expect(view!.seen['1,0']!.trail).toEqual([
      [-940, 0],
      [-900, 0],
    ]);
    expect(view!.seen['2,0']!.trail).toEqual([[0, 7]]);
    // výprava bez cizích map
    const home = expedition('j2', 'brod', [person(3, { lord: true })]);
    await journeys.create(home);
    const views = await expeditionViewsFor(deps(journeys, knowledge), { playerId: 'pa' });
    expect(views[1]!.seen).toEqual({});
  });
});

describe('pohled na lov (plán 2026-11-22-hunting, Úloha 9)', () => {
  const START: HuntStart = {
    quarry: 'stag',
    day: 7,
    door: { x: -95, z: 5 },
    out: { x: -55, z: 5 },
    dogs: 2,
  };

  function hunting(): JourneyState {
    return newJourney(
      {
        id: 'j1',
        seed: 5,
        playerId: 'pa',
        houseId: 'h-pa',
        home: { villageId: 'lhota', name: 'lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } },
        recruits: [person(1), person(2)],
        startMs: msOfTick(LAUNCH, world),
        hunt: START,
      },
      world,
    );
  }

  function striker(personId: number): NewHunter {
    return {
      personId,
      pos: { x: 5, z: 5 },
      mounted: false,
      strength: 2,
      footStrength: 2,
      skills: { bow: 0, combat: 50, riding: 0 },
      lineMan: false,
      health: 100,
    };
  }

  it('výprava bez lovu – hunt null; zvíře ještě v lese – quarry null, honci a psi', async () => {
    const journeys = new InMemoryJourneys();
    await journeys.create(expedition('j0', 'brod', [person(3, { lord: true })]));
    const state = hunting();
    await journeys.create(state);
    const [plain, view] = await expeditionViewsFor(deps(journeys), { playerId: 'pa' });
    expect(plain!.hunt).toBeNull();
    expect(view!.hunt).toEqual({
      quarry: null,
      beaters: state.hunt!.beaters,
      dogs: 2,
      strikers: [],
      outcome: 'ongoing',
      tick: LAUNCH,
    });
  });

  it('zvíře venku s polohou, směrem, stavem a ranami; útočníci jen ti, kdo v souboji jednají', async () => {
    const journeys = new InMemoryJourneys();
    const state = hunting();
    const f = state.hunt!.fight;
    releaseQuarry(f, state.hunt!.out, LAUNCH + 3);
    f.quarry.pos = { x: -80, z: 5 };
    f.quarry.hits = 1;
    addHunters(f, [striker(1), striker(2)], LAUNCH + 3);
    dropHunters(f, [2]);
    f.tick = LAUNCH + 3;
    await journeys.create(state);
    const [view] = await expeditionViewsFor(deps(journeys), { playerId: 'pa' });
    expect(view!.hunt).toMatchObject({
      quarry: {
        kind: 'stag',
        pos: { x: -80, z: 5 },
        heading: f.quarry.heading,
        state: 'flee',
        hits: 1,
      },
      strikers: [1],
      outcome: 'ongoing',
      tick: LAUNCH + 3,
    });
    // zmizelé zvíře (utekl do lesa) – quarry null, výsledek „escaped“
    f.quarry.state = 'gone';
    f.outcome = 'escaped';
    const gone = new InMemoryJourneys();
    await gone.create(state);
    const [after] = await expeditionViewsFor(deps(gone), { playerId: 'pa' });
    expect(after!.hunt).toMatchObject({ quarry: null, outcome: 'escaped' });
  });

  it('huntRunning – jen běžící výprava s lovem', () => {
    expect(huntRunning(null)).toBe(false);
    expect(huntRunning(expedition('j0', 'brod', [person(3)]))).toBe(false);
    const state = hunting();
    expect(huntRunning(state)).toBe(true);
    expect(huntRunning({ ...state, phase: 'done' })).toBe(false);
  });
});
