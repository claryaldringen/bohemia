import { describe, expect, it } from 'vitest';
import { horse, horsePen } from '../../village/__tests__/horse-fixtures';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import { applyInboxDay, type NewVillageEvent } from '../../village/core/inbox';
import { horsesOut } from '../../village/livestock/horses-out';
import type { GridCell } from '../../village/people/world-grid';
import type { Dwelling, Horse, Person, VillageState } from '../../village/types';
import type { CampaignWorld } from '../campaign-types';
import { journeyFinished, newJourney, stepJourney } from '../journey';
import { horseWorkTicks, pickGroom, riderHorse } from '../journey-horses';
import type {
  JourneyCommand,
  JourneyGroup,
  JourneyIntent,
  JourneyIntentBody,
  JourneyMember,
  JourneyParty,
  JourneyRecruit,
  JourneyState,
  JourneyStep,
} from '../journey-types';
import type { Pos } from '../march-grid';
import { JOURNEY, WAR } from '../rules-war';
import { dayOfTick, hoursPerTick, msOfTick, TICKS_PER_SECOND } from '../ticks';
import { LAUNCH, MEADOW, SUMMER, world as clock } from './campaign-fixtures';

// Koně výpravy (expeditions.md – Koně, Koně mimo ves; plán 2026-11-14 – Úloha 3): vesničan, trvání,
// osedlání doma s vesničanem i bez něj, mimo ves, sesednutí, lhůta od osedlání, kůň zmizelý ze vsi,
// rozdělení během sedlání, noví lidé a vcelku = po kouscích. Ves v paměti s ohradou koní a obydlími.

/** Domov – Lhota na políčku (0, 0); dvorec stojí na místě domova. */
const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
const EAST: GridCell = { x: 1, y: 0 };
const A: Pos = { x: 105, z: 5 };
/** Ohrada koní – 60 m od domova. */
const PEN: Pos = { x: 5, z: 65 };
/** Obydlí vesničana 3 – 40 m od domova; vesnička 4 bydlí 100 m daleko. */
const GROOM_HOME: Pos = { x: 45, z: 5 };
const FAR_HOME: Pos = { x: 5, z: 105 };
const WAIT = Math.round((JOURNEY.waitDays * 24) / hoursPerTick(clock));
/** Krok pěšího a jezdce za takt. */
const FOOT = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
const RIDE = FOOT * WAR.pace.riders;
/** Takt příkazu. */
const T = LAUNCH + 5;
/** Osedlání vesničanem 3: (√5200 + 60) m ÷ 3,5 m/s + 10 s = 47,75 s → 191 taktů. */
const SADDLE_TICKS = 191;

const JOURNEY_AWAY = { kind: 'journey' as const, refId: 'j1' };

function house(id: number, at: Pos): Dwelling {
  return { ...dwelling(id), position: { x: at.x, z: at.z, rotation: 0 } };
}

/** Jezdecký kůň `id` jezdce `riderId` (samec 8 let); bez jezdce, když `riderId` chybí. */
function steed(id: number, riderId?: number): Horse {
  return { ...horse(id, 8, 'male', 0, SUMMER), ...(riderId === undefined ? {} : { riderId }) };
}

/**
 * Lhota: vojvoda 1 a syn 2 (dvorec na domově, oba na výpravě `j1`), koně 50 (vojvody) a 51 (syna)
 * v ohradě, vesničan 3 (obydlí 40 m od domova), vesnička 4 (100 m) a dítě 5. Lidé `without` ve vsi
 * nejsou; `extra` – úprava lidí.
 */
function lhota(
  opts: { without?: number[]; horses?: Horse[]; extra?: Record<number, Partial<Person>> } = {},
): VillageState {
  const people: Person[] = [
    { ...kin({ id: 1, age: 40, sex: 'male', home: 1 }, SUMMER), away: { ...JOURNEY_AWAY } },
    {
      ...kin({ id: 2, age: 18, sex: 'male', home: 1, father: 1 }, SUMMER),
      away: { ...JOURNEY_AWAY },
    },
    kin({ id: 3, age: 30, sex: 'male', home: 2 }, SUMMER),
    kin({ id: 4, age: 30, sex: 'female', home: 3 }, SUMMER),
    kin({ id: 5, age: 8, sex: 'male', home: 2, father: 3 }, SUMMER),
  ]
    .filter((p) => !(opts.without ?? []).includes(p.id))
    .map((p) => ({ ...p, ...opts.extra?.[p.id] }));
  const pen = { ...horsePen(90, opts.horses ?? [steed(50, 1), steed(51, 2)]), ...PEN };
  return village(people, [house(1, HOME.pos), house(2, GROOM_HOME), house(3, FAR_HOME)], {
    pens: [pen],
  });
}

function worldOf(at: (day: number) => VillageState = constant(lhota())): CampaignWorld {
  return {
    clock,
    landscapeOf: () => MEADOW,
    villageAt: (id, day): VillageState | null => (id === 'lhota' ? at(day) : null),
    villageGone: (id) => id !== 'lhota',
  };
}

function constant(v: VillageState): (day: number) => VillageState {
  return () => v;
}

/** Jezdec ze vsi s koněm `horseId` (1 je vojvoda Bořivoj). */
function rider(
  personId: number,
  horseId?: number,
  extra: Partial<JourneyRecruit> = {},
): JourneyRecruit {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    strength: 2,
    fight: 50,
    ...(horseId === undefined ? {} : { horseId, strengthMounted: 3 }),
    ...(personId === 1 ? { name: 'Bořivoj' } : {}),
    ...extra,
  };
}

/** Výprava stojí doma bez rozkazu – vojvoda a syn, oba bez koně u sebe. */
function start(recruits: JourneyRecruit[] = [rider(1, 50), rider(2, 51)]): JourneyState {
  return newJourney(
    {
      id: 'j1',
      seed: 42,
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      recruits,
      startMs: msOfTick(LAUNCH, clock),
    },
    clock,
  );
}

/** Výprava stojí na sousední mapě; kůň každého je `horse` (chybí = v ohradě). */
function abroad(horses: Partial<Record<number, JourneyMember['horse']>>): JourneyState {
  const s = start();
  s.groups[0]!.cell = { ...EAST };
  for (const m of s.members) mount(m, horses[m.ref.personId]);
  return s;
}

function mount(m: JourneyMember, horse: JourneyMember['horse']): void {
  m.mounted = horse === 'ridden';
  if (horse === undefined) delete m.horse;
  else m.horse = horse;
}

function at(tick: number, seq: number, body: JourneyIntentBody): JourneyIntent {
  return { tick, seq, byPlayer: 'p1', body };
}

const SADDLE: JourneyCommand = { kind: 'saddle' };
const DISMOUNT: JourneyCommand = { kind: 'dismount' };
const go = (pos: Pos, people?: number[]): JourneyCommand => ({
  kind: 'order',
  order: { kind: 'go', pos },
  ...(people ? { people } : {}),
});

function memberOf(s: JourneyState, personId: number): JourneyMember {
  return s.members.find((m) => m.ref.personId === personId)!;
}
function groupOf(s: JourneyState, personId: number): JourneyGroup {
  return s.groups.find((g) => g.id === memberOf(s, personId).group)!;
}
function partyOf(s: JourneyState, personId: number): JourneyParty {
  return s.parties.find((p) => p.id === groupOf(s, personId).party)!;
}
const horseEvents = (step: JourneyStep): NewVillageEvent['body'][] =>
  step.villageEvents.map((e) => e.body).filter((b) => b.kind === 'journey-horse');

describe('pickGroom (expeditions.md – Koně: nejbližší dospělý doma)', () => {
  it('dospělý z bližšího obydlí vyhraje; člen výpravy, raněný, dítě a kdo je pryč ne', () => {
    const v = lhota();
    const members = new Set([1, 2]);
    expect(pickGroom(v, SUMMER, HOME.pos, members)).toEqual({ personId: 3, from: GROOM_HOME });
    // k obydlí vesničky 4 je blíž ona
    expect(pickGroom(v, SUMMER, FAR_HOME, members)?.personId).toBe(4);
    // člen výpravy (`skip`) ani dítě 5 nejdou
    expect(pickGroom(v, SUMMER, HOME.pos, new Set([1, 2, 3]))?.personId).toBe(4);
    const hurt = lhota({
      extra: { 3: { woundedUntil: SUMMER + 5 }, 4: { away: { kind: 'service' } } },
    });
    expect(pickGroom(hurt, SUMMER, HOME.pos, members)).toBeNull();
    // vojvoda doma (bez `away`) by šel, kdyby nebyl ve výpravě
    expect(
      pickGroom(lhota({ extra: { 1: { away: undefined } } }), SUMMER, HOME.pos, new Set([2])),
    ).toEqual({ personId: 1, from: HOME.pos });
  });

  it('shoda vzdálenosti – nižší id; nikdo doma → null', () => {
    const v = lhota({ extra: { 4: { dwellingId: 2 } } });
    expect(pickGroom(v, SUMMER, HOME.pos, new Set([1, 2]))?.personId).toBe(3);
    v.people.reverse();
    expect(pickGroom(v, SUMMER, HOME.pos, new Set([1, 2]))?.personId).toBe(3);
    expect(pickGroom(lhota({ without: [3, 4] }), SUMMER, HOME.pos, new Set([1, 2]))).toBeNull();
  });
});

describe('horseWorkTicks a riderHorse', () => {
  it('cesta tempem pěšího + 10 s, nahoru na takty', () => {
    expect(
      horseWorkTicks({
        kind: 'saddle',
        groom: GROOM_HOME,
        pen: PEN,
        riders: HOME.pos,
        day: SUMMER,
      }),
    ).toBe(SADDLE_TICKS);
    // bez vesničana jezdec k ohradě a zpět: 120 m ÷ 3,5 + 10 = 44,29 s → 178
    expect(
      horseWorkTicks({ kind: 'saddle', groom: null, pen: PEN, riders: HOME.pos, day: SUMMER }),
    ).toBe(178);
    // sesednutí: vesničan 40 m k jezdcům + 10 s = 21,43 s → 86
    expect(
      horseWorkTicks({
        kind: 'unsaddle',
        groom: GROOM_HOME,
        pen: PEN,
        riders: HOME.pos,
        day: SUMMER,
      }),
    ).toBe(86);
  });

  it('kůň jezdce v ohradě – jen jeho jezdecký kůň s riderId', () => {
    const v = lhota({
      horses: [steed(50, 1), steed(51), { ...horse(52, 2, 'male', 0, SUMMER), riderId: 2 }],
    });
    expect(riderHorse(v, 1, 50, SUMMER)?.horse.id).toBe(50);
    expect(riderHorse(v, 1, 50, SUMMER)?.pen.id).toBe(90);
    expect(riderHorse(v, 1, undefined, SUMMER)).toBeNull();
    expect(riderHorse(v, 2, 50, SUMMER)).toBeNull();
    expect(riderHorse(v, 2, 51, SUMMER)).toBeNull();
    // hříbě do 3 let není jezdecký kůň
    expect(riderHorse(v, 2, 52, SUMMER)).toBeNull();
  });
});

describe('Osedlat doma (Rozhodnutí 7)', () => {
  const intents = [at(T, 1, SADDLE), at(T + 1, 1, go(A))];

  it('vesničan přivede koně: skupina stojí do untilTick i s rozkazem, pak jede tempem jezdců', () => {
    const begin = start();
    const saddled = stepJourney(begin, T, intents, worldOf());
    const work = saddled.state.parties[0]!.horseWork;
    expect(work).toEqual({
      kind: 'saddle',
      groomId: 3,
      riders: [1, 2],
      fromTick: T,
      untilTick: T + SADDLE_TICKS,
      pen: PEN,
    });
    // ves se o koních venku dozví hned v taktu příkazu
    expect(saddled.villageEvents).toEqual([
      {
        villageId: 'lhota',
        day: SUMMER,
        ref: `journey:j1:${T}:0`,
        body: { kind: 'journey-horse', journeyId: 'j1', personId: 1, horseId: 50 },
      },
      {
        villageId: 'lhota',
        day: SUMMER,
        ref: `journey:j1:${T}:1`,
        body: { kind: 'journey-horse', journeyId: 'j1', personId: 2, horseId: 51 },
      },
    ]);
    const U = work!.untilTick;
    const before = stepJourney(begin, U - 1, intents, worldOf()).state;
    expect(groupOf(before, 1).pos).toEqual(HOME.pos);
    expect(groupOf(before, 1).goal?.pos).toEqual(A);
    expect(before.members.map((m) => [m.mounted, m.horse])).toEqual([
      [false, undefined],
      [false, undefined],
    ]);
    const mounted = stepJourney(begin, U, intents, worldOf()).state;
    expect(mounted.parties[0]!.horseWork).toBeUndefined();
    expect(mounted.members.map((m) => [m.mounted, m.horse])).toEqual([
      [true, 'ridden'],
      [true, 'ridden'],
    ]);
    expect(groupOf(mounted, 1).pos.x - HOME.pos.x).toBeCloseTo(RIDE, 6);
    const later = stepJourney(begin, U + 9, intents, worldOf()).state;
    expect(groupOf(later, 1).pos.x - HOME.pos.x).toBeCloseTo(10 * RIDE, 6);
  });

  it('druhé Osedlat i Sesednout během práce skupina nevidí', () => {
    const more = [at(T, 1, SADDLE), at(T + 2, 1, SADDLE), at(T + 3, 1, DISMOUNT)];
    const step = stepJourney(start(), T + 10, more, worldOf());
    expect(step.state.parties[0]!.horseWork).toMatchObject({
      fromTick: T,
      untilTick: T + SADDLE_TICKS,
    });
    expect(horseEvents(step)).toHaveLength(2);
  });

  it('ves dostane journey-horse až s jezdcem koně – applyJourneyHorse ho vezme (riderId nastavené)', () => {
    // koně 51 ves synovi ještě nepřidělila – syn se nesedlá a ves o něm nic nedostane
    const v = lhota({ horses: [steed(50, 1), steed(51)] });
    const step = stepJourney(start(), T, [at(T, 1, SADDLE)], worldOf(constant(v)));
    expect(step.state.parties[0]!.horseWork?.riders).toEqual([1]);
    expect(horseEvents(step)).toEqual([
      { kind: 'journey-horse', journeyId: 'j1', personId: 1, horseId: 50 },
    ]);
    // doručení události do vsi: kůň 50 je venku
    const home = lhota();
    const events = stepJourney(start(), T, [at(T, 1, SADDLE)], worldOf()).villageEvents;
    applyInboxDay(
      home,
      SUMMER,
      events.map((e, i) => ({
        id: e.ref,
        villageId: e.villageId,
        day: e.day,
        seq: i,
        body: e.body,
      })),
    );
    expect(home.people.find((p) => p.id === 1)!.away?.horseId).toBe(50);
    expect([...horsesOut(home, SUMMER)].sort()).toEqual([50, 51]);
  });

  it('nikdo doma: jezdec dojde pro koně sám – groomId null, trvání z jeho cesty', () => {
    const empty = constant(lhota({ without: [3, 4, 5] }));
    const step = stepJourney(start(), T, [at(T, 1, SADDLE)], worldOf(empty));
    expect(step.state.parties[0]!.horseWork).toMatchObject({
      groomId: null,
      untilTick:
        T +
        horseWorkTicks({ kind: 'saddle', groom: null, pen: PEN, riders: HOME.pos, day: SUMMER }),
    });
    expect(horseEvents(step)).toHaveLength(2);
  });

  it('lhůta běží od osedlání: bez rozkazu po 3 dnech od untilTick domů a away-ends', () => {
    const U = T + SADDLE_TICKS;
    const saddle = [at(T, 1, SADDLE)];
    const still = stepJourney(start(), U + WAIT, saddle, worldOf()).state;
    expect(journeyFinished(still)).toBe(false);
    expect(still.parties[0]).toMatchObject({ phase: 'out', arrivedTick: U });
    const turned = stepJourney(start(), U + WAIT + 1, saddle, worldOf()).state;
    expect(journeyFinished(turned) || turned.parties[0]!.phase === 'returning').toBe(true);
    const done = stepJourney(start(), U + WAIT + 10, saddle, worldOf());
    expect(journeyFinished(done.state)).toBe(true);
    expect(done.villageEvents.at(-1)!.body).toEqual({
      kind: 'away-ends',
      refId: 'j1',
      untilDay: done.state.day + 1,
    });
  });

  it('během sedlání lhůta neběží – skupina, které by čekání skončilo, zůstane', () => {
    // skupina stojí doma od vyslání; Osedlat 5 taktů před koncem čekání
    const late = LAUNCH + WAIT - 5;
    const s = stepJourney(start(), late + SADDLE_TICKS + 10, [at(late, 1, SADDLE)], worldOf());
    expect(journeyFinished(s.state)).toBe(false);
    expect(s.state.parties[0]).toMatchObject({ phase: 'out', arrivedTick: late + SADDLE_TICKS });
    expect(s.state.members.every((m) => m.mounted)).toBe(true);
  });

  it('kůň zmizel ze vsi – jezdec v dalším denním kroku nesedí', () => {
    const U = T + SADDLE_TICKS;
    let next = U;
    while (dayOfTick(next, clock) === dayOfTick(U, clock)) next++;
    const full = lhota();
    const lost = lhota({ horses: [steed(51, 2)] });
    const world = worldOf((day) => (day < dayOfTick(next, clock) ? full : lost));
    const saddle = [at(T, 1, SADDLE)];
    const riding = stepJourney(start(), next - 1, saddle, world).state;
    expect(memberOf(riding, 1)).toMatchObject({ mounted: true, horse: 'ridden' });
    const after = stepJourney(riding, next, [], world).state;
    expect(memberOf(after, 1).mounted).toBe(false);
    expect(memberOf(after, 1).horse).toBeUndefined();
    expect(memberOf(after, 2)).toMatchObject({ mounted: true, horse: 'ridden' });
  });

  it('rozkaz části skupiny během sedlání: jezdci si práci vezmou s sebou, spojení ji neztratí', () => {
    const split = [at(T, 1, SADDLE), at(T + 1, 1, go(A, [2]))];
    const parted = stepJourney(start(), T + 1, split, worldOf()).state;
    expect(partyOf(parted, 1)).not.toBe(partyOf(parted, 2));
    expect(partyOf(parted, 1).horseWork?.riders).toEqual([1]);
    expect(partyOf(parted, 2).horseWork).toMatchObject({
      riders: [2],
      untilTick: T + SADDLE_TICKS,
    });
    const U = T + SADDLE_TICKS;
    const waiting = stepJourney(start(), U - 1, split, worldOf()).state;
    expect(groupOf(waiting, 2).pos).toEqual(HOME.pos);
    const moving = stepJourney(start(), U + 3, split, worldOf()).state;
    expect(memberOf(moving, 2)).toMatchObject({ mounted: true, horse: 'ridden' });
    expect(groupOf(moving, 2).pos.x - HOME.pos.x).toBeCloseTo(4 * RIDE, 6);
    expect(memberOf(moving, 1)).toMatchObject({ mounted: true, horse: 'ridden' });
    expect(groupOf(moving, 1).pos).toEqual(HOME.pos);
    // obě skupiny znovu dohromady: nová skupina čeká na práci a nikdo nepřijde o koně
    const merged = [...split, at(T + 2, 1, go(A, [1, 2]))];
    const joined = stepJourney(start(), T + 2, merged, worldOf()).state;
    expect(joined.parties).toHaveLength(1);
    expect(joined.parties[0]!.horseWork?.riders).toEqual([1, 2]);
    const both = stepJourney(start(), U, merged, worldOf()).state;
    expect(both.members.every((m) => m.mounted && m.horse === 'ridden')).toBe(true);
  });

  it('noví lidé Osedlat stojí doma v nové skupině; ostatní zůstanou ve svých', () => {
    const begin = start([rider(1)]);
    const step = stepJourney(
      begin,
      T,
      [at(T, 1, { kind: 'saddle', people: [], recruits: [rider(2, 51)] })],
      worldOf(),
    );
    const s = step.state;
    expect(s.parties).toHaveLength(2);
    expect(partyOf(s, 1).horseWork).toBeUndefined();
    expect(partyOf(s, 2)).toMatchObject({ phase: 'out', horseWork: { riders: [2], groomId: 3 } });
    expect(groupOf(s, 2)).toMatchObject({ cell: HOME.cell, pos: HOME.pos, arrived: true });
    expect(memberOf(s, 2)).toMatchObject({ horseId: 51, strengthMounted: 3, mounted: false });
    expect(horseEvents(step)).toEqual([
      { kind: 'journey-horse', journeyId: 'j1', personId: 2, horseId: 51 },
    ]);
  });
});

describe('Osedlat a Sesednout mimo ves', () => {
  it('jezdec s koněm u sebe nasedne v taktu příkazu; s koněm v ohradě nic', () => {
    const s = abroad({ 1: 'led' });
    const step = stepJourney(s, T, [at(T, 1, SADDLE)], worldOf());
    expect(memberOf(step.state, 1)).toMatchObject({ mounted: true, horse: 'ridden' });
    expect(memberOf(step.state, 2)).toMatchObject({ mounted: false });
    expect(memberOf(step.state, 2).horse).toBeUndefined();
    expect(step.state.parties[0]!.horseWork).toBeUndefined();
    expect(step.villageEvents).toEqual([]);
  });

  it('Sesednout venku: kůň vedený za uzdu, tempo pěšího', () => {
    const s = abroad({ 1: 'ridden', 2: 'ridden' });
    const intents = [at(T, 1, DISMOUNT), at(T + 1, 1, go(A))];
    const step = stepJourney(s, T + 4, intents, worldOf());
    expect(step.state.members.map((m) => [m.mounted, m.horse])).toEqual([
      [false, 'led'],
      [false, 'led'],
    ]);
    expect(step.state.parties[0]!.horseWork).toBeUndefined();
    expect(groupOf(step.state, 1).pos.x - HOME.pos.x).toBeCloseTo(4 * FOOT, 6);
    expect(step.villageEvents).toEqual([]);
  });
});

describe('Sesednout doma', () => {
  /** Výprava stojí doma, oba jezdci sedí na koni. */
  function riding(): JourneyState {
    const s = start();
    for (const m of s.members) mount(m, 'ridden');
    return s;
  }

  it('s vesničanem: hlouček stojí do untilTick, pak je kůň v ohradě (journey-horse null)', () => {
    const intents = [at(T, 1, DISMOUNT), at(T + 1, 1, go(A))];
    const begun = stepJourney(riding(), T, intents, worldOf());
    expect(begun.state.parties[0]!.horseWork).toEqual({
      kind: 'unsaddle',
      groomId: 3,
      riders: [1, 2],
      fromTick: T,
      untilTick: T + 86,
      pen: PEN,
    });
    expect(begun.villageEvents).toEqual([]);
    const U = T + 86;
    const before = stepJourney(riding(), U - 1, intents, worldOf()).state;
    expect(groupOf(before, 1).pos).toEqual(HOME.pos);
    expect(before.members.every((m) => m.mounted && m.horse === 'ridden')).toBe(true);
    const after = stepJourney(riding(), U, intents, worldOf());
    expect(after.state.members.map((m) => [m.mounted, m.horse])).toEqual([
      [false, undefined],
      [false, undefined],
    ]);
    expect(horseEvents(after)).toEqual([
      { kind: 'journey-horse', journeyId: 'j1', personId: 1, horseId: null },
      { kind: 'journey-horse', journeyId: 'j1', personId: 2, horseId: null },
    ]);
    expect(after.villageEvents.slice(-2).map((e) => e.ref)).toEqual([
      `journey:j1:${U}:0`,
      `journey:j1:${U}:1`,
    ]);
    // pěšky dál
    expect(groupOf(after.state, 1).pos.x - HOME.pos.x).toBeCloseTo(FOOT, 6);
  });

  it('nikdo doma – kůň zůstane u jezdce, vedený; kůň, o kterém ves neví, taky', () => {
    const empty = constant(lhota({ without: [3, 4, 5] }));
    const alone = stepJourney(riding(), T, [at(T, 1, DISMOUNT)], worldOf(empty)).state;
    expect(alone.members.map((m) => [m.mounted, m.horse])).toEqual([
      [false, 'led'],
      [false, 'led'],
    ]);
    expect(alone.parties[0]!.horseWork).toBeUndefined();
    // starší bod: jezdec bez horseId – ves o koni neví
    const old = riding();
    for (const m of old.members) delete m.horseId;
    const legacy = stepJourney(old, T, [at(T, 1, DISMOUNT)], worldOf());
    expect(legacy.state.members.map((m) => m.horse)).toEqual(['led', 'led']);
    expect(legacy.villageEvents).toEqual([]);
  });
});

describe('vcelku = po kouscích', () => {
  it('sedlání přes hranici kousků přes JSON dopadne stejně', () => {
    const intents = [at(T, 1, SADDLE), at(T + 1, 1, go(A)), at(T + 260, 1, DISMOUNT)];
    const begin = start();
    const end = T + 400;
    const whole = stepJourney(begin, end, intents, worldOf());
    let state: JourneyState = begin;
    const events: NewVillageEvent[] = [];
    // osedlání doma, jízda po domovské mapě a sesednutí na ní (vesničan dojde za jezdci)
    for (const to of [T, T + 3, T + SADDLE_TICKS - 1, T + SADDLE_TICKS, T + 261, T + 330, end]) {
      const part = stepJourney(
        JSON.parse(JSON.stringify(state)) as JourneyState,
        to,
        intents,
        worldOf(),
      );
      events.push(...part.villageEvents);
      state = part.state;
    }
    expect(state).toEqual(whole.state);
    expect(events).toEqual(whole.villageEvents);
    expect(whole.state.members.map((m) => m.horse)).toEqual([undefined, undefined]);
    expect(horseEvents(whole).map((b) => b.kind === 'journey-horse' && b.horseId)).toEqual([
      50,
      51,
      null,
      null,
    ]);
  });
});

// Recenze Úlohy 3 (plán 2026-11-14 – Úloha 5, doplněk koordinátora): kůň, o kterém ves ví, se vsi
// vrátí i při ztrátě; práce bez jezdců nečeká; osedlání i sesednutí v jednom výběru.
describe('ztráty jezdců a koní', () => {
  /** První takt dne, který přijde po taktu `tick`. */
  function nextDay(tick: number): number {
    let next = tick + 1;
    while (dayOfTick(next, clock) === dayOfTick(tick, clock)) next++;
    return next;
  }
  const NOTHING = { kind: 'journey-horse', journeyId: 'j1', personId: 1, horseId: null };

  it('jezdec s koněm venku padne – ves ho nemá a kůň je zase volný (horsesOut)', () => {
    const s = abroad({ 2: 'ridden' });
    const known = lhota({ extra: { 2: { away: { ...JOURNEY_AWAY, horseId: 51 } } } });
    expect([...horsesOut(known, SUMMER)]).toEqual([51]);
    const D = nextDay(s.tick);
    const dead = lhota({ without: [2] });
    const step = stepJourney(
      s,
      D,
      [],
      worldOf((day) => (day < dayOfTick(D, clock) ? known : dead)),
    );
    expect(memberOf(step.state, 2)).toMatchObject({ status: 'fallen' });
    expect(horseEvents(step)).toEqual([]);
    expect([...horsesOut(dead, dayOfTick(D, clock))]).toEqual([]);
  });

  it('jezdec padne během osedlání – práce ho vynechá, druhý nasedne', () => {
    const D = nextDay(T);
    const begin = start();
    const step = stepJourney(
      begin,
      D,
      [at(D - 20, 1, SADDLE)],
      worldOf((day) => (day < dayOfTick(D, clock) ? lhota() : lhota({ without: [2] }))),
    );
    const work = step.state.parties[0]!.horseWork!;
    expect(work.riders).toEqual([1]);
    const U = work.untilTick;
    expect(U).toBeGreaterThan(D);
    const after = stepJourney(step.state, U, [], worldOf(constant(lhota({ without: [2] }))));
    expect(memberOf(after.state, 1)).toMatchObject({ mounted: true, horse: 'ridden' });
  });

  it('kůň zmizí během sedlání – jezdec vypadne z práce a ves dostane journey-horse null', () => {
    const D = nextDay(T);
    const saddle = [at(D - 20, 1, SADDLE)];
    const lost = lhota({ horses: [steed(51, 2)] });
    const world = worldOf((day) => (day < dayOfTick(D, clock) ? lhota() : lost));
    const step = stepJourney(start(), D, saddle, world);
    expect(step.state.parties[0]!.horseWork?.riders).toEqual([2]);
    expect(horseEvents(step).slice(2)).toEqual([NOTHING]);
    const U = step.state.parties[0]!.horseWork!.untilTick;
    const done = stepJourney(step.state, U, [], worldOf(constant(lost))).state;
    expect(done.members.map((m) => [m.mounted, m.horse])).toEqual([
      [false, undefined],
      [true, 'ridden'],
    ]);
  });

  it('oba koně zmizí – práce hned skončí, skupina nečeká na nikoho a vyrazí', () => {
    const D = nextDay(T);
    const orders = [at(D - 20, 1, SADDLE), at(D - 19, 1, go(A))];
    const none = lhota({ horses: [] });
    const world = worldOf((day) => (day < dayOfTick(D, clock) ? lhota() : none));
    const step = stepJourney(start(), D, orders, world);
    expect(step.state.parties[0]!.horseWork).toBeUndefined();
    expect(horseEvents(step).slice(2)).toEqual([NOTHING, { ...NOTHING, personId: 2 }]);
    expect(groupOf(step.state, 1).pos.x - HOME.pos.x).toBeCloseTo(FOOT, 6);
    expect(step.state.members.every((m) => !m.mounted && m.horse === undefined)).toBe(true);
  });

  describe('osedlání i sesednutí v jednom výběru (carryHorseWork)', () => {
    /** Jezdec 1 čeká na osedlání (skupina 0), jezdec 2 na koni sesedá (skupina 1); konce prací. */
    function mixed(saddleUntil: number, unsaddleUntil: number): JourneyState {
      const s = start();
      s.groups.push({ ...structuredClone(s.groups[0]!), id: 1, party: 1 });
      s.parties.push({ id: 1, phase: 'out', arrivedTick: s.tick });
      s.nextId = 2;
      memberOf(s, 2).group = 1;
      mount(memberOf(s, 2), 'ridden');
      const work = { groomId: 3, fromTick: s.tick, pen: PEN };
      s.parties[0]!.horseWork = { ...work, kind: 'saddle', riders: [1], untilTick: saddleUntil };
      s.parties[1]!.horseWork = {
        ...work,
        kind: 'unsaddle',
        riders: [2],
        untilTick: unsaddleUntil,
      };
      return s;
    }
    const join = [at(T, 1, go(A, [1, 2]))];

    it('osedlání končí později – nová skupina čeká na něj, sesedaný zůstane na koni', () => {
      const step = stepJourney(mixed(T + 50, T + 30), T, join, worldOf());
      expect(step.state.parties).toHaveLength(1);
      expect(partyOf(step.state, 1).horseWork).toMatchObject({ kind: 'saddle', riders: [1] });
      expect(memberOf(step.state, 2)).toMatchObject({ mounted: true, horse: 'ridden' });
      expect(horseEvents(step)).toEqual([]);
      const done = stepJourney(step.state, T + 50, [], worldOf()).state;
      expect(done.members.every((m) => m.mounted && m.horse === 'ridden')).toBe(true);
    });

    it('sesednutí končí později – sedlaný zůstane bez koně a ves dostane journey-horse null', () => {
      const step = stepJourney(mixed(T + 30, T + 50), T, join, worldOf());
      expect(partyOf(step.state, 2).horseWork).toMatchObject({ kind: 'unsaddle', riders: [2] });
      expect(memberOf(step.state, 1)).toMatchObject({ mounted: false });
      expect(memberOf(step.state, 1).horse).toBeUndefined();
      expect(horseEvents(step)).toEqual([NOTHING]);
    });
  });
});
