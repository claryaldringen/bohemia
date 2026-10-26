import { describe, expect, it } from 'vitest';
import { createHerdState, createLivestockPose, herdState } from '../livestock-motion';
import {
  FLEE,
  PRESENCE_SLOT_S,
  createFlightState,
  flightAt,
  flightCalming,
  nearestThreat,
  startFlight,
  wildAnimalPose,
  wildPresent,
} from '../wildlife-motion';
import type { WildGroup } from '../wildlife-placement';

// Pohyb zvěře ve scéně (wildlife.md – Ve scéně): výskyt vzácných, útěk do 30 m od člověka.

const spots = (...points: [number, number][]): Float32Array =>
  Float32Array.from(points.flatMap(([x, z]) => [x, 0, z]));

const group: WildGroup = {
  species: 'deer',
  zone: 'edge',
  herd: {
    kind: 'cattle',
    tended: true,
    seed: 11,
    phase: 0.3,
    routeOffset: 0,
    route: [
      { x: 0, z: 0 },
      { x: 20, z: 0 },
    ],
    radiusM: 5,
    animals: [{ species: 'horse', seed: 5, scale: 1, homeX: 1, homeZ: -1 }],
  },
  models: ['wild-hind'],
  presence: 1,
  fleeSpeed: 7,
};

describe('nearestThreat', () => {
  it('najde nejbližšího člověka do 30 m, skryté (NaN) a vzdálené ne', () => {
    const s = spots([40, 0], [25, 0], [10, 10]);
    s[6] = NaN; // třetí postava není vidět
    expect(nearestThreat(0, 0, s)).toEqual({ x: 25, z: 0, d: 25 });
    expect(nearestThreat(0, 0, spots([31, 0]))).toBeNull();
    expect(nearestThreat(0, 0, new Float32Array(0))).toBeNull();
  });
});

describe('útěk', () => {
  const free = (): boolean => true;

  it('skupina uteče od člověka, pak stojí a krokem se vrátí na trasu', () => {
    const flight = startFlight(100, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: -10, z: 0 }, 7, free)!;
    expect(flight.toX).toBeCloseTo(FLEE.distanceM);
    expect(flight.toZ).toBeCloseTo(0);
    const st = createFlightState();
    // v běhu: posun roste, běží směrem od člověka
    expect(flightAt(flight, 100 + flight.runS / 2, st)).toBe(true);
    expect(st.x).toBeCloseTo(FLEE.distanceM / 2);
    expect(st.run).toBe(1);
    expect(st.headingX).toBeCloseTo(1);
    expect(flightCalming(flight, 100 + flight.runS / 2)).toBe(false);
    // klid: stojí na konci
    expect(flightAt(flight, 100 + flight.runS + 10, st)).toBe(true);
    expect(st.x).toBeCloseTo(FLEE.distanceM);
    expect(st.run + st.walk).toBe(0);
    expect(flightCalming(flight, 100 + flight.runS + 10)).toBe(true);
    // návrat krokem
    const back = 100 + flight.runS + FLEE.calmS + flight.returnS / 2;
    expect(flightAt(flight, back, st)).toBe(true);
    expect(st.x).toBeCloseTo(FLEE.distanceM / 2);
    expect(st.walk).toBe(1);
    expect(st.headingX).toBeCloseTo(-1);
    // konec – zpět na trase
    expect(flightAt(flight, 100 + flight.runS + FLEE.calmS + flight.returnS + 1, st)).toBe(false);
    expect(st.x).toBe(0);
  });

  it('do vody neuteče – odkloní se, a když nemá kam, zůstane', () => {
    const noEast = (x: number): boolean => x < 5;
    const flight = startFlight(0, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: -10, z: 0 }, 7, noEast);
    expect(flight).toBeNull();
    const noStraight = (x: number, z: number): boolean => !(x > 40 && Math.abs(z) < 5);
    const turned = startFlight(0, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: -10, z: 0 }, 7, noStraight)!;
    expect(Math.abs(turned.toZ)).toBeGreaterThan(5);
    expect(turned.toX).toBeGreaterThan(0);
  });

  it('za běhu se zvíře posune, míří od člověka a krok se točí rychleji', () => {
    const clock = { seconds: 5000 };
    const state = herdState(group.herd, clock, createHerdState());
    const still = wildAnimalPose(group, 0, clock, state, null, createLivestockPose());
    const flight = startFlight(
      4998,
      { x: 0, z: 0 },
      state,
      { x: state.x - 5, z: state.z },
      7,
      () => true,
    )!;
    const st = createFlightState();
    flightAt(flight, clock.seconds, st);
    const running = wildAnimalPose(group, 0, clock, state, st, createLivestockPose());
    expect(running.x - still.x).toBeCloseTo(st.x);
    expect(running.forwardX).toBeCloseTo(1);
    expect(running.head).toBe(0);
    // krok v běhu: o kus dál jiná fáze kroku (rychlý krok)
    flightAt(flight, clock.seconds + 0.1, st);
    const later = wildAnimalPose(
      group,
      0,
      { seconds: clock.seconds + 0.1 },
      state,
      st,
      createLivestockPose(),
    );
    expect(Math.abs(later.stride - running.stride)).toBeGreaterThan(0.05);
  });
});

describe('wildPresent', () => {
  it('vždy vidět s presence 1; vzácní jen v části úseků, deterministicky', () => {
    expect(wildPresent(group, 123)).toBe(true);
    const rare = { ...group, presence: 0.3 };
    let shown = 0;
    for (let k = 0; k < 400; k++) {
      const t = k * PRESENCE_SLOT_S + 10;
      const a = wildPresent(rare, t);
      expect(wildPresent(rare, t)).toBe(a);
      if (a) shown++;
    }
    expect(shown / 400).toBeGreaterThan(0.2);
    expect(shown / 400).toBeLessThan(0.4);
  });
});

describe('startFlight – celá dráha útěku', () => {
  it('úzká překážka uprostřed dráhy (mimo cíl a půl cesty) útěk odkloní', () => {
    const wall = (x: number, z: number): boolean => !(x > 9 && x < 11 && Math.abs(z) < 3);
    const flight = startFlight(0, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: -10, z: 0 }, 7, wall);
    expect(flight === null || Math.abs(flight.toZ) > 3).toBe(true);
    if (flight) expect(flight.toX).toBeGreaterThan(0);
  });
});
