import type { HorseWork, Pos } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import {
  CATCH_M_S,
  ExpeditionLeave,
  arrivalScript,
  chasePose,
  horseWorkScript,
  joinScripts,
  ledHorseAt,
  legPose,
  type ChoreoContext,
  type ExpeditionYard,
} from '../expedition-choreo';
import type { RiderPose, SceneJourney } from '../journey-riders';

// Dvorec: vchod v počátku, brána 20 m na sever, kůl koně vojvody (3, 18); branka ohrady na východě
// (20, 18), vchod obydlí osoby 8 je (5, 0).
const yard: ExpeditionYard = {
  door: { x: 0, z: 0 },
  gate: { x: 0, z: 20 },
  horses: [
    {
      riderId: 7,
      horseId: 70,
      spot: { x: 3, z: 18, headingX: 0, headingZ: 1 },
      lead: {
        points: [
          { x: 20, z: 18 },
          { x: 3, z: 18 },
        ],
        length: 17,
        heading: { x: 0, z: 1 },
      },
    },
  ],
  gateOf: (id) => (id === 70 ? { x: 20, z: 18 } : null),
  horseOf: (id) => (id === 7 ? 70 : null),
  entryOf: (id) => (id === 8 ? { x: 5, z: 0 } : null),
  leg: (a, b) => [a, b],
};

const dist = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.z - b.z);

const pose = (key: string, x: number, z: number, over: Partial<RiderPose> = {}): RiderPose => ({
  journeyId: 'j1',
  own: true,
  key,
  personId: Number(key),
  x,
  z,
  hx: 0,
  hz: 1,
  mounted: false,
  lord: false,
  wounded: false,
  look: 'man',
  led: false,
  speed: 0,
  ...over,
});

const hitch = pose('7', 3, 18, { lord: true, look: 'line' });

function context(over: Partial<ChoreoContext> = {}): ChoreoContext {
  return {
    yard,
    nowMs: 0,
    figureAt: (id) => (id === 9 ? { x: -10, z: 5 } : null),
    riderAt: (id) => (id === 7 ? hitch : null),
    adultNear: () => null,
    ...over,
  };
}

/** Takty po 250 ms (4 za sekundu). */
const tickMs = (tick: number): number => tick * 250;

const work = (over: Partial<HorseWork> = {}): HorseWork => ({
  kind: 'saddle',
  groomId: 9,
  riders: [7],
  fromTick: 0,
  untilTick: 80,
  pen: { x: 22, z: 18 },
  ...over,
});

/** Nejmenší vzdálenost, jakou vesničan v čase `[0, until)` od bodu `at` dosáhne, a kdy. */
function closest(legs: Parameters<typeof legPose>[0], until: number, at: Pos): [number, number] {
  let best: [number, number] = [Infinity, 0];
  for (let s = 0; s < until; s += 0.05) {
    const p = legPose(legs, s);
    if (p && dist(p, at) < best[0]) best = [dist(p, at), s];
  }
  return best;
}

describe('sedlání', () => {
  it('vesničan je u branky před untilTick, kůň u jezdce nejpozději v untilTick, jezdec sedí od něj', () => {
    const script = horseWorkScript(work(), context(), tickMs);
    expect(script.kind).toBe('saddling');
    expect(script.end).toBeCloseTo(20, 5);
    const groom = script.actors[0]!;
    expect(groom.personId).toBe(9);
    const [d, when] = closest(groom.legs, 20, { x: 20, z: 18 });
    expect(d).toBeLessThan(0.3);
    expect(when).toBeLessThan(20);
    // kůň vyjde z branky a těsně před untilTick je u jezdce
    const horse = script.horses[0]!;
    expect(horse.horseId).toBe(70);
    expect(dist(ledHorseAt(horse, horse.from)!, { x: 20, z: 18 })).toBeLessThan(0.3);
    expect(dist(ledHorseAt(horse, 19.99)!, { x: 3, z: 18 })).toBeLessThan(0.5);
    expect(ledHorseAt(horse, 20)).toBeNull();
    // jezdec nasedne v untilTick
    expect(script.seats.get('7')).toEqual({ at: 20, mountedAfter: true });
  });

  it('tempo – cesta se natáhne a stáhne tak, aby příchod padl na untilTick', () => {
    for (const ticks of [24, 400]) {
      const script = horseWorkScript(work({ untilTick: ticks }), context(), tickMs);
      expect(script.end).toBeCloseTo(ticks / 4, 5);
      const horse = script.horses[0]!;
      expect(dist(ledHorseAt(horse, horse.until - 0.01)!, { x: 3, z: 18 })).toBeLessThan(0.5);
    }
  });

  it('bez vesničana jde pro koně jezdec sám', () => {
    const script = horseWorkScript(work({ groomId: null }), context(), tickMs);
    const rider = script.actors[0]!;
    expect(rider.key).toBe('7');
    expect(rider.replaces).toBe(true);
    const [d] = closest(rider.legs, 20, { x: 20, z: 18 });
    expect(d).toBeLessThan(0.3);
    expect(dist(legPose(rider.legs, 19.99)!, { x: 3, z: 18 })).toBeLessThan(0.6);
    expect(script.horses).toHaveLength(1);
  });
});

describe('sesednutí', () => {
  it('jezdec sesedne v untilTick a kůň po něm dojde do ohrady', () => {
    const script = horseWorkScript(work({ kind: 'unsaddle' }), context(), tickMs);
    expect(script.kind).toBe('unsaddling');
    expect(script.seats.get('7')).toEqual({ at: 20, mountedAfter: false });
    const groom = script.actors[0]!;
    // vesničan je u jezdců v untilTick
    expect(dist(legPose(groom.legs, 19.99)!, { x: 3, z: 18 })).toBeLessThan(0.5);
    const horse = script.horses[0]!;
    expect(horse.back).toBe(true);
    expect(ledHorseAt(horse, 19.9)).toBeNull();
    expect(dist(ledHorseAt(horse, 20.01)!, { x: 3, z: 18 })).toBeLessThan(0.5);
    // dojde k brance a pak ho ohrada zase kreslí (scénář ho už nevede)
    expect(dist(ledHorseAt(horse, horse.until - 0.01)!, { x: 20, z: 18 })).toBeLessThan(0.5);
    expect(ledHorseAt(horse, horse.until)).toBeNull();
    expect(script.end).toBeGreaterThanOrEqual(horse.until);
  });
});

describe('připojení', () => {
  it('nový člověk začne na poloze postavy vsi a dorazí na své místo bez skoku', () => {
    const target = pose('9', 0, 20);
    const [chase] = joinScripts([target], context());
    expect(chase!.via!.total).toBeCloseTo(dist({ x: -10, z: 5 }, target) / CATCH_M_S.foot, 5);
    const at0 = chasePose(chase!, target, 0);
    expect(dist(at0, { x: -10, z: 5 })).toBeLessThan(1e-6);
    let last = Infinity;
    for (let s = 0; s <= chase!.total; s += 0.1) {
      const d = dist(chasePose(chase!, target, s), target);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
    const end = chasePose(chase!, target, chase!.total);
    expect(end).toBe(target);
  });

  it('bez postavy vsi jde od vchodu obydlí', () => {
    const [chase] = joinScripts([pose('8', 0, 20)], context());
    expect(chase!.via!.points[0]).toEqual({ x: 5, z: 0 });
  });

  it('z domu dveřmi a brankou, ne zdí – pak dohání hlouček, který mezitím popojel (D49)', () => {
    // cesta postav vede od dveří (−10, 5) brankou pozemku (0, 12) k hloučku před ní (0, 20)
    const gate = { x: 0, z: 12 };
    const ctx = context({ yard: { ...context().yard, leg: (a, b) => [a, gate, b] } });
    const start = pose('9', 0, 20);
    const [chase] = joinScripts([start], ctx);
    expect(chase!.via!.points).toEqual([{ x: -10, z: 5 }, gate, { x: 0, z: 20 }]);
    // první úsek ode dveří k brance, ne rovně k hloučku
    const toGate = dist({ x: -10, z: 5 }, gate) / CATCH_M_S.foot;
    const half = chasePose(chase!, start, toGate / 2);
    expect(dist(half, { x: -5, z: 8.5 })).toBeLessThan(1e-6);
    expect(dist(chasePose(chase!, start, toGate), gate)).toBeLessThan(1e-6);
    // hlouček mezitím popojel o 10 m – po cestě člověk dohání bez skoku a dorazí na místo
    const moved = { ...start, z: 30, speed: 3.5 };
    const after = chasePose(chase!, moved, chase!.via!.total + 1e-6);
    expect(dist(after, { x: 0, z: 20 })).toBeLessThan(1e-3);
    expect(chasePose(chase!, moved, chase!.total)).toBe(moved);
  });
});

describe('příjezd', () => {
  const group = [pose('7', 0, 60, { mounted: true, lord: true, look: 'line' }), pose('8', 2, 60)];

  it('pěší dojde ke vchodu svého obydlí, kůň jezdce do ohrady', () => {
    const script = arrivalScript(group, context(), 'j1');
    const woman = script.actors.find((a) => a.key === '8')!;
    expect(woman.legs.at(-1)!.b).toEqual({ x: 5, z: 0 });
    const horse = script.horses[0]!;
    expect(horse.back).toBe(true);
    expect(dist(ledHorseAt(horse, horse.until - 0.01)!, { x: 20, z: 18 })).toBeLessThan(0.5);
    // sám – jezdec odvede koně sám a nikdo jiný nechybí
    expect(script.actors.map((a) => a.key).sort()).toEqual(['7', '8']);
    expect(script.replaced.sort()).toEqual(['7', '8']);
  });

  it('koně odvede nejbližší dospělý doma', () => {
    const adult = { id: 9, at: { x: 10, z: 10 } };
    const script = arrivalScript(group, context({ adultNear: () => adult }), 'j1');
    const helper = script.actors.find((a) => a.key === 'groom:9')!;
    expect(helper.replaces).toBe(false);
    const horse = script.horses[0]!;
    // dospělý je u koně, když ho vede od kůlu
    const p = legPose(helper.legs, horse.from + 0.01)!;
    expect(dist(p, { x: 3, z: 18 })).toBeLessThan(1);
    // jezdec nevede koně – jeho cesta nejde na ohradu
    const rider = script.actors.find((a) => a.key === '7')!;
    expect(rider.legs.at(-1)!.b).toEqual(yard.door);
  });

  it('vedený kůň pěšáka se doma odevzdá', () => {
    const led = [pose('7', 0, 60, { led: true, lord: true, look: 'line' })];
    const script = arrivalScript(led, context(), 'j1');
    expect(script.horses).toHaveLength(1);
    expect(script.actors[0]!.legs[0]!.led).toBe(true);
  });
});

describe('ExpeditionLeave', () => {
  const journey = (over: Partial<SceneJourney> = {}): SceneJourney => ({
    journeyId: 'j1',
    own: true,
    leader: 'Bořivoj',
    house: 'Bořivojovci',
    tick: 0,
    pos: { x: 0, z: 20 },
    goal: null,
    home: { x: 0, z: 20 },
    men: [
      {
        key: '7',
        personId: 7,
        lord: true,
        mounted: false,
        wounded: false,
        look: 'line',
        led: false,
      },
    ],
    arrived: false,
    phase: 'out',
    waitDaysLeft: null,
    ...over,
  });
  const setup = (): ExpeditionLeave => {
    const leave = new ExpeditionLeave();
    leave.setContext((nowMs) => context({ nowMs, riderAt: (id) => leave.drawnPose(id) }));
    return leave;
  };

  it('nové horseWork přehraje scénář, načtení uprostřed nic', () => {
    const leave = setup();
    const glide = [pose('7', 3, 18)];
    // první pohled už s dávno rozběhnutým sedláním – nic se nepřehraje
    expect(leave.observe([journey({ horseWork: work() })], 0, false)).toBe(false);
    leave.at(glide, 0, false);
    expect(leave.active()).toBe(false);
    expect(leave.ownPhase()).toBe('riding');
    // nový příkaz
    const fresh = work({ fromTick: 400, untilTick: 480 });
    expect(leave.observe([journey({ horseWork: fresh, tick: 400 })], 100_000, false)).toBe(true);
    const shown = leave.at(glide, 118_000, false);
    expect(leave.ownPhase()).toBe('saddling');
    expect(shown.led).toHaveLength(1);
    expect(leave.groom()).not.toBeNull();
    expect(leave.horsesOut(118_000)).toEqual([70]);
    expect(leave.menOut().hidden).toEqual([9]);
    // po untilTick je po scénáři
    leave.at(glide, 130_000, false);
    expect(leave.active()).toBe(false);
  });

  it('nový člověk u domova se připojí od své postavy vsi', () => {
    const leave = setup();
    leave.observe([journey()], 0, false);
    leave.at([pose('7', 3, 18)], 0, false);
    const men = [
      ...journey().men,
      {
        key: '9',
        personId: 9,
        lord: false,
        mounted: false,
        wounded: false,
        look: 'man' as const,
        led: false,
      },
    ];
    expect(leave.observe([journey({ men })], 1000, false)).toBe(true);
    const glide = [pose('7', 3, 18), pose('9', 0, 20)];
    const first = leave.at(glide, 1000, false);
    expect(leave.ownPhase()).toBe('joining');
    const joined = first.poses.find((p) => p.key === '9')!;
    expect(dist(joined, { x: -10, z: 5 })).toBeLessThan(1e-6);
    expect(leave.menOut().hidden).toEqual([9]);
    const done = leave.at(glide, 1000 + 30_000, false);
    expect(done.poses.find((p) => p.key === '9')).toEqual(glide[1]);
    expect(leave.active()).toBe(false);
  });

  it('omezený pohyb scénář přeskočí', () => {
    const leave = setup();
    leave.observe([journey()], 0, true);
    leave.at([pose('7', 3, 18)], 0, true);
    const fresh = work({ fromTick: 400, untilTick: 480 });
    expect(leave.observe([journey({ horseWork: fresh, tick: 400 })], 100_000, true)).toBe(false);
    expect(leave.active()).toBe(false);
  });

  it('hlouček u domova, který zmizel, přijede', () => {
    const leave = setup();
    leave.observe([journey({ phase: 'returning' })], 0, false);
    leave.observe([journey({ phase: 'returning' })], 100, false);
    leave.at([pose('7', 0, 20, { mounted: true })], 100, false);
    expect(leave.observe([], 200, false)).toBe(true);
    leave.at([], 300, false);
    expect(leave.ownPhase()).toBe('arriving');
  });
});
