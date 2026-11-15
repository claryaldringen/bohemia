import { describe, expect, it } from 'vitest';
import { SURFACE_CODES } from '../../landscape';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { GridCell } from '../../village/people/world-grid';
import type { VillageState } from '../../village/types';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { journeyFinished, newJourney, stepJourney } from '../journey';
import { partyLeader } from '../journey-parties';
import { predatorDay } from '../journey-predators';
import type {
  JourneyGroup,
  JourneyIntent,
  JourneyMember,
  JourneyOrder,
  JourneyParty,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
} from '../journey-types';
import type { Pos } from '../march-grid';
import { JOURNEY, WAR } from '../rules-war';
import { dayOfTick, hoursPerTick, msOfTick, TICKS_PER_SECOND } from '../ticks';
import { flat, LAUNCH, MEADOW, SUMMER, world as clock } from './campaign-fixtures';

// Skupiny výpravy (expeditions.md – Výběr a skupina, Rozkazy; plán 2026-11-14 – Úloha 1): rozkazy
// na lidi, dělení a spojení skupin, nový člověk ze vsi, návrat po hloučcích, vůdce, upozornění,
// šelmy po hloučcích, odvolání a vcelku = po kouscích. Svět v paměti jako `journey.test.ts`.

/** Domov – Lhota na políčku (0, 0); místa ve středech buněk mřížky pochodu (rovné úseky cesty). */
const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
const EAST: GridCell = { x: 1, y: 0 };
const A: Pos = { x: 105, z: 5 };
const B: Pos = { x: -145, z: 5 };
const C: Pos = { x: 305, z: 5 };
/** Čekání na místě v taktech (3 herní dny). */
const WAIT = Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
/** Krok pěšího za takt. */
const FOOT = WAR.pace.metersPerSecond / TICKS_PER_SECOND;

/** Člověk ze vsi – 1 je vojvoda Bořivoj; pěšky, není-li řečeno jinak. */
function person(personId: number, extra: Partial<JourneyRecruit> = {}): JourneyRecruit {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    strength: 2,
    fight: 50,
    ...(personId === 1 ? { name: 'Bořivoj' } : {}),
    ...extra,
  };
}

/** Výprava s lidmi `recruits` ve skupině 0 doma; bez rozkazu stojí. */
/** Osobu `personId` posadí na koně (stav, ve kterém výprava po osedlání jede). */
function ridden(s: JourneyState, personId: number): void {
  const m = s.members.find((x) => x.ref.personId === personId)!;
  m.mounted = true;
  m.horse = 'ridden';
}

function start(recruits: JourneyRecruit[], order?: JourneyOrder): JourneyState {
  return newJourney(
    {
      id: 'j1',
      seed: 42,
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      recruits,
      startMs: msOfTick(LAUNCH, clock),
      ...(order ? { order } : {}),
    },
    clock,
  );
}

const go = (pos: Pos): JourneyOrder => ({ kind: 'go', pos });

/** Rozkaz lidem `people` (chybí = všem) v taktu `tick`. */
function order(
  tick: number,
  seq: number,
  body: JourneyOrder,
  people?: number[],
  recruits?: JourneyRecruit[],
): JourneyIntent {
  return {
    tick,
    seq,
    byPlayer: 'p1',
    body: {
      kind: 'order',
      order: body,
      ...(people ? { people } : {}),
      ...(recruits ? { recruits } : {}),
    },
  };
}

/** Lhota s lidmi 1–7 (dospělí muži), od dne `deathDay` bez lidí `dead`. */
function worldOf(
  map: CampaignMap = MEADOW,
  dead: readonly number[] = [],
  deathDay = Infinity,
): CampaignWorld {
  const all = [1, 2, 3, 4, 5, 6, 7];
  const full = village(all.map((id) => kin({ id, age: 30, sex: 'male' })));
  const rest = village(
    all.filter((id) => !dead.includes(id)).map((id) => kin({ id, age: 30, sex: 'male' })),
  );
  return {
    clock,
    landscapeOf: () => map,
    villageAt: (id, day): VillageState | null =>
      id !== 'lhota' ? null : day >= deathDay ? rest : full,
    villageGone: (id) => id !== 'lhota',
  };
}

function memberOf(s: JourneyState, personId: number): JourneyMember {
  return s.members.find((m) => m.ref.personId === personId)!;
}
function groupOf(s: JourneyState, personId: number): JourneyGroup {
  return s.groups.find((g) => g.id === memberOf(s, personId).group)!;
}
function partyOf(s: JourneyState, personId: number): JourneyParty {
  return s.parties.find((p) => p.id === groupOf(s, personId).party)!;
}

/** První takt herního dne `day`. */
function firstTickOf(day: number): number {
  let tick = LAUNCH;
  while (dayOfTick(tick, clock) < day) tick++;
  return tick;
}

describe('dvě skupiny', () => {
  it('každá jde jinam, má vlastní lhůtu a po 3 dnech jde domů sama', () => {
    const intents = [order(LAUNCH + 1, 1, go(A), [1]), order(LAUNCH + 1, 2, go(B), [2])];
    const there = stepJourney(start([person(1), person(2)]), LAUNCH + 200, intents, worldOf());
    const s = there.state;
    expect(s.parties).toHaveLength(2);
    expect(groupOf(s, 1)).toMatchObject({ pos: A, arrived: true });
    expect(groupOf(s, 2)).toMatchObject({ pos: B, arrived: true });
    const [atA, atB] = [partyOf(s, 1).arrivedTick!, partyOf(s, 2).arrivedTick!];
    expect(atA).toBeLessThan(atB);
    const firstHome = stepJourney(s, atA + WAIT + 1, intents, worldOf()).state;
    expect(partyOf(firstHome, 1).phase).toBe('returning');
    expect(partyOf(firstHome, 2)).toMatchObject({ phase: 'out', arrivedTick: atB });
    const both = stepJourney(s, atB + WAIT + 1, intents, worldOf()).state;
    expect(partyOf(both, 2).phase).toBe('returning');
  });
});

describe('dělení', () => {
  it('rozkaz části skupiny: zbytek stojí, kde byl, a jeho lhůta začíná tímto taktem', () => {
    const begin = start([person(1), person(2), person(3)], go(C));
    const T = LAUNCH + 40;
    const was = stepJourney(begin, T - 1, [], worldOf()).state.groups[0]!.pos;
    const s = stepJourney(begin, T, [order(T, 1, go(B), [3])], worldOf()).state;
    expect(groupOf(s, 1)).toBe(groupOf(s, 2));
    expect(groupOf(s, 1)).toMatchObject({ pos: was, arrived: true, goal: null, route: [] });
    expect(partyOf(s, 1)).toEqual({ id: 0, phase: 'out', arrivedTick: T });
    expect(partyOf(s, 3)).toMatchObject({ phase: 'out', arrivedTick: null });
    expect(partyOf(s, 3).id).not.toBe(0);
    expect(groupOf(s, 3)).toMatchObject({ goal: { cell: HOME.cell, pos: B }, arrived: false });
    expect(groupOf(s, 3).pos.x).toBeCloseTo(was.x - FOOT, 6);
    // zbytek jde domů po lhůtě od taktu dělení
    expect(partyOf(stepJourney(s, T + WAIT, [], worldOf()).state, 1).phase).toBe('out');
    expect(partyOf(stepJourney(s, T + WAIT + 1, [], worldOf()).state, 1).phase).toBe('returning');
  });
});

describe('spojení', () => {
  it('společný rozkaz: jedna skupina, dva hloučky tempem pěšího; v cíli jeden hlouček', () => {
    const T = LAUNCH + 300;
    const intents = [
      order(LAUNCH + 1, 1, go(A), [1]),
      order(LAUNCH + 1, 2, go(B), [2]),
      order(T, 3, go(C), [1, 2]),
    ];
    const begin = start([person(1), person(2)]);
    ridden(begin, 1);
    const before = stepJourney(begin, T - 1, intents, worldOf()).state;
    const joined = stepJourney(begin, T, intents, worldOf()).state;
    expect(joined.parties).toHaveLength(1);
    expect(joined.groups).toHaveLength(2);
    expect(partyOf(joined, 1)).toBe(partyOf(joined, 2));
    // jezdec jde tempem pěšího – nejpomalejšího ze skupiny
    for (const id of [1, 2]) {
      expect(groupOf(joined, id).pos.x - groupOf(before, id).pos.x).toBeCloseTo(FOOT, 6);
    }
    const there = stepJourney(begin, LAUNCH + 1000, intents, worldOf()).state;
    expect(there.groups).toHaveLength(1);
    expect(there.groups[0]).toMatchObject({ pos: C, arrived: true });
    expect(groupOf(there, 1)).toBe(groupOf(there, 2));
  });
});

describe('nový člověk ze vsi', () => {
  it('přibude doma v novém hloučku téže skupiny a jde k cíli', () => {
    const begin = start([person(1)], go(A));
    const T = LAUNCH + 200;
    const intents = [order(T, 1, go(C), [1, 7], [person(7, { name: 'Vítek' })])];
    const s = stepJourney(begin, T, intents, worldOf()).state;
    expect(memberOf(s, 7)).toMatchObject({ name: 'Vítek', status: 'active', health: 100 });
    expect(groupOf(s, 7)).not.toBe(groupOf(s, 1));
    expect(partyOf(s, 7)).toBe(partyOf(s, 1));
    expect(partyOf(s, 7).id).toBe(0);
    expect(groupOf(s, 7)).toMatchObject({ cell: HOME.cell, goal: { cell: HOME.cell, pos: C } });
    expect(groupOf(s, 7).pos.x).toBeCloseTo(HOME.pos.x + FOOT, 6);
    const there = stepJourney(begin, LAUNCH + 800, intents, worldOf()).state;
    expect(groupOf(there, 7)).toBe(groupOf(there, 1));
    expect(groupOf(there, 1)).toMatchObject({ pos: C, arrived: true });
  });

  it('skupina stojí celá doma – nový člověk přejde do jejího hloučku; kdo už jde, nepřibude', () => {
    const begin = start([person(1)]);
    const T = LAUNCH + 5;
    const intents = [order(T, 1, go(A), [1, 7], [person(7), person(1)])];
    const s = stepJourney(begin, T, intents, worldOf()).state;
    expect(s.groups).toHaveLength(1);
    expect(s.members.map((m) => [m.ref.personId, m.group])).toEqual([
      [1, 0],
      [7, 0],
    ]);
  });

  it('„Přes okraj“ na nesousední políčko se zahodí celý – nikdo nepřibude', () => {
    const begin = start([person(1)], go(A));
    const T = LAUNCH + 200;
    const plain = stepJourney(begin, T + 5, [], worldOf()).state;
    const cross: JourneyOrder = { kind: 'cross', cell: { x: 2, y: 0 } };
    const tried = stepJourney(begin, T + 5, [order(T, 1, cross, [1, 7], [person(7)])], worldOf());
    expect(JSON.stringify(tried.state)).toBe(JSON.stringify(plain));
  });
});

describe('Domů části skupiny', () => {
  it('away-ends jen s vybranými po jejich dojetí; zbytek dál stojí', () => {
    const begin = start([person(1), person(2)], go(A));
    const T = LAUNCH + 200;
    const step = stepJourney(begin, LAUNCH + 600, [order(T, 1, { kind: 'home' }, [2])], worldOf());
    const ends = step.villageEvents.filter((e) => e.body.kind === 'away-ends');
    expect(ends.map((e) => e.body)).toEqual([
      { kind: 'away-ends', refId: 'j1', untilDay: ends[0]!.day, personIds: [2] },
    ]);
    // vůdce hloučku je muž 2 bez jména – upozornění bez jména
    expect(step.notices.map((n) => n.payload)).toEqual([{ journeyId: 'j1' }]);
    expect(step.state.phase).toBe('out');
    expect(step.state.members.map((m) => m.ref.personId)).toEqual([1]);
    expect(groupOf(step.state, 1)).toMatchObject({ pos: A, arrived: true });
    expect(partyOf(step.state, 1)).toMatchObject({ phase: 'out', arrivedTick: T });
  });
});

describe('vůdce skupiny', () => {
  const DAY = 40_000;
  const member = (personId: number, extra: Partial<JourneyMember>): JourneyMember => ({
    ref: { villageId: 'lhota', personId },
    lord: false,
    mounted: false,
    strength: 1,
    fight: 0,
    health: 100,
    wounded: false,
    status: 'active',
    group: 0,
    ...extra,
  });

  it('vojvoda, jinak nejstarší muž, jinak nejstarší člen; shoda – nižší id', () => {
    const woman30 = member(1, { female: true, bornDay: DAY - 30 * 365 });
    const man20 = member(2, { bornDay: DAY - 20 * 365 });
    const woman40 = member(3, { female: true, bornDay: DAY - 40 * 365 });
    expect(partyLeader([woman30, man20])).toBe(man20);
    expect(partyLeader([woman30, woman40])).toBe(woman40);
    const lord = member(9, { lord: true, bornDay: DAY - 18 * 365 });
    expect(partyLeader([woman40, man20, lord])).toBe(lord);
    // bez dne narození nejmladší; shoda nižší id
    expect(partyLeader([member(5, {}), member(4, {})])!.ref.personId).toBe(4);
    expect(partyLeader([member(4, {}), member(6, { bornDay: DAY })])!.ref.personId).toBe(6);
    expect(partyLeader([])).toBeUndefined();
  });
});

describe('upozornění', () => {
  it('hlouček s vojvodou – „Bořivoj“; žena v čele – female', () => {
    const lord = stepJourney(
      start([person(1), person(2)], { kind: 'home' }),
      LAUNCH + 50,
      [],
      worldOf(),
    );
    expect(lord.notices.map((n) => [n.kind, n.payload])).toEqual([
      ['journey-returned', { journeyId: 'j1', leader: 'Bořivoj' }],
    ]);
    const women = [
      person(5, { female: true, name: 'Dobrava', bornDay: 100 }),
      person(6, { female: true }),
    ];
    const step = stepJourney(start(women, { kind: 'home' }), LAUNCH + 50, [], worldOf());
    expect(step.notices.map((n) => n.payload)).toEqual([
      { journeyId: 'j1', leader: 'Dobrava', female: true },
    ]);
  });

  it('vojvoda zemře doma – skupina leaderless jde domů, rozkaz hráče ji nezmění, upozornění chybí', () => {
    const DEATH_DAY = SUMMER + 1;
    const DEATH = firstTickOf(DEATH_DAY);
    const world = worldOf(MEADOW, [1], DEATH_DAY);
    const begin = start([person(1), person(2)], go(C));
    const at = stepJourney(begin, DEATH, [], world).state;
    expect(at.parties[0]).toMatchObject({
      phase: 'returning',
      leaderless: true,
      arrivedTick: null,
    });
    expect(at.groups[0]!.goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
    const orders = [order(DEATH + 5, 1, go(A)), order(DEATH + 9, 2, go(B), [2])];
    const plain = stepJourney(begin, DEATH + 30, [], world).state;
    expect(JSON.stringify(stepJourney(begin, DEATH + 30, orders, world).state)).toBe(
      JSON.stringify(plain),
    );
    const done = stepJourney(begin, DEATH + 600, orders, world);
    expect(done.state.phase).toBe('done');
    // poslední hlouček výjezdu – away-ends bez personIds (domů každý, kdo je ještě pryč)
    expect(done.villageEvents.map((e) => e.body)).toEqual([
      { kind: 'away-ends', refId: 'j1', untilDay: done.villageEvents[0]!.day },
    ]);
    expect(done.notices).toEqual([]);
  });

  it('vojvoda sám v hloučku zemře doma – zbytek skupiny je leaderless, jde domů a rozkaz ho nezmění', () => {
    const DEATH_DAY = SUMMER + 1;
    const DEATH = firstTickOf(DEATH_DAY);
    const world = worldOf(MEADOW, [1], DEATH_DAY);
    const T = LAUNCH + 200;
    const begin = stepJourney(
      start([person(1)], go(A)),
      T,
      [order(T, 1, go(C), [1, 7], [person(7, { name: 'Vítek' })])],
      world,
    ).state;
    expect(groupOf(begin, 1).id).not.toBe(groupOf(begin, 7).id);
    expect(partyOf(begin, 1).id).toBe(partyOf(begin, 7).id);
    const at = stepJourney(begin, DEATH, [], world).state;
    expect(at.members.some((m) => m.ref.personId === 1)).toBe(false);
    expect(partyOf(at, 7)).toMatchObject({ phase: 'returning', leaderless: true });
    expect(groupOf(at, 7).goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
    const orders = [order(DEATH + 5, 1, go(A)), order(DEATH + 9, 2, go(B), [7])];
    const plain = stepJourney(begin, DEATH + 30, [], world).state;
    expect(JSON.stringify(stepJourney(begin, DEATH + 30, orders, world).state)).toBe(
      JSON.stringify(plain),
    );
  });
});

describe('šelmy po hloučcích (Rozhodnutí 9)', () => {
  /** Mapa celá z hustého lesa (domov taky). */
  const forest = (): CampaignMap => {
    const landscape = flat();
    landscape.surface.fill(SURFACE_CODES.forest);
    return { landscape, obstacles: null, villageIds: [] };
  };
  /** Osm dní v taktech. */
  const DAYS = Math.ceil((8 * 86.4) / 0.25);

  it('hlouček 0 losuje proudem jako dřív, jiný hlouček vlastním', () => {
    const members = [0, 1].map((n) => ({
      ...memberOfRecruit(person(n + 1, { fight: 0 })),
    }));
    let differs = false;
    for (let seed = 1; seed <= 2000; seed++) {
      const input = {
        members,
        inForest: true,
        wildlife: { bear: true, wolves: true },
        seed,
        day: 9,
      };
      expect(predatorDay({ ...input, group: 0 })).toEqual(predatorDay(input));
      if (
        JSON.stringify(predatorDay({ ...input, group: 3 })) !== JSON.stringify(predatorDay(input))
      ) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it('hlouček tří v lese nelosuje, oddělený hlouček jednoho ano', { timeout: 120_000 }, () => {
    const four = [1, 2, 3, 4].map((id) => person(id, { fight: 0 }));
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const begin = { ...start(four, go(A)), seed };
      const step = stepJourney(
        begin,
        LAUNCH + DAYS,
        [order(LAUNCH + 40, 1, go(B), [4])],
        worldOf(forest()),
      );
      for (const e of step.villageEvents) {
        if (e.body.kind !== 'journey-casualty') continue;
        expect(e.body.personId).toBe(4);
        hits++;
      }
      const together = stepJourney(
        { ...start(four.slice(0, 3), go(A)), seed },
        LAUNCH + DAYS,
        [],
        worldOf(forest()),
      );
      expect(together.villageEvents.some((e) => e.body.kind === 'journey-casualty')).toBe(false);
    }
    expect(hits).toBeGreaterThan(0);
  });
});

/** Člen výpravy z nováčka (hlouček 0). */
function memberOfRecruit(r: JourneyRecruit): JourneyMember {
  return start([r]).members[0]!;
}

describe('recall', () => {
  it('skupina s hloučkem na políčku jde domů, jiná skupina beze změny', () => {
    const cross: JourneyOrder = { kind: 'cross', cell: EAST };
    const intents = [order(LAUNCH + 1, 1, cross, [2]), order(LAUNCH + 1000, 2, go(A), [1])];
    const across = stepJourney(start([person(1), person(2)]), LAUNCH + 1300, intents, worldOf());
    expect(groupOf(across.state, 2)).toMatchObject({ cell: EAST, arrived: true });
    expect(groupOf(across.state, 1)).toMatchObject({ cell: HOME.cell, pos: A, arrived: true });
    const recall: JourneyIntent = {
      tick: LAUNCH + 1301,
      seq: 2,
      byPlayer: 'p1',
      body: { kind: 'recall', cells: [EAST] },
    };
    const s = stepJourney(across.state, LAUNCH + 1301, [recall], worldOf()).state;
    expect(partyOf(s, 2)).toMatchObject({ phase: 'returning', arrivedTick: null });
    expect(groupOf(s, 2).goal).toEqual({ cell: HOME.cell, pos: HOME.pos });
    expect(partyOf(s, 1)).toEqual(partyOf(across.state, 1));
    expect(groupOf(s, 1)).toEqual(groupOf(across.state, 1));
  });
});

describe('determinismus', () => {
  /** Dvě skupiny, spojení, dělení (Domů části) a návrat všech. */
  const intents = [
    order(LAUNCH + 1, 1, go(A), [1]),
    order(LAUNCH + 1, 2, go(B), [2, 3]),
    order(LAUNCH + 300, 3, go(C), [1, 2, 3]),
    order(LAUNCH + 900, 4, { kind: 'home' }, [3]),
  ];
  const END = LAUNCH + 2600;
  const begin = (): JourneyState => {
    const s = start([person(1), person(2), person(3)]);
    ridden(s, 1);
    return s;
  };

  it('vcelku = po 7 taktech přes JSON (stav, události, upozornění)', () => {
    const whole = stepJourney(begin(), END, intents, worldOf());
    expect(whole.state.phase).toBe('done');
    // poslední hlouček výpravy – bez personIds
    expect(whole.villageEvents.map((e) => e.body.kind === 'away-ends' && e.body.personIds)).toEqual(
      [[3], undefined],
    );
    let current = begin();
    const parts: JourneyStep = { state: current, villageEvents: [], notices: [], waiting: null };
    while (current.tick < END && !journeyFinished(current)) {
      const step = stepJourney(current, Math.min(END, current.tick + 7), intents, worldOf());
      expect(step.waiting).toBeNull();
      parts.villageEvents.push(...step.villageEvents);
      parts.notices.push(...step.notices);
      current = JSON.parse(JSON.stringify(step.state)) as JourneyState;
    }
    expect(JSON.stringify(current)).toBe(JSON.stringify(whole.state));
    expect(parts.villageEvents).toEqual(whole.villageEvents);
    expect(parts.notices).toEqual(whole.notices);
  });
});
