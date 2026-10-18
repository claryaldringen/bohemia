import { describe, it, expect } from 'vitest';
import {
  chickenPose,
  createHerdState,
  createLivestockPose,
  herdAnimalPose,
  herdPeriodS,
  herdRouteIndex,
  herdState,
  keepRouteSpot,
  livestockClock,
  LIVESTOCK_EPOCH_MS,
  routeAt,
  valueNoise,
  type LivestockClock,
} from '../livestock-motion';
import { chickenBox, planLivestock, type Herd } from '../livestock-placement';
import { GROUND, VILLAGE, inSquares as inVillageSquares } from './livestock-fixtures';

const clockAt = (seconds: number): LivestockClock => ({ seconds });
/** Dvacet minut skutečného času. */
const SPAN_S = 20 * 60;

const plan = planLivestock(VILLAGE, GROUND, 7);
const inSquares = (x: number, z: number): boolean => inVillageSquares(VILLAGE, x, z);

describe('routeAt', () => {
  it('jde po trase tam a zpět, i do záporných dní', () => {
    const route = [0, 1, 2, 3].map((x) => ({ x, z: 0 }));
    const xs = Array.from({ length: 10 }, (_, j) => routeAt(route, j).x);
    expect(xs).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
    expect(routeAt(route, -1).x).toBe(1);
    expect(routeAt([{ x: 5, z: 5 }], 17)).toEqual({ x: 5, z: 5 });
  });
});

describe('livestockClock', () => {
  it('skutečný čas od pevného počátku – herní svět do něj nevstupuje', () => {
    expect(livestockClock(LIVESTOCK_EPOCH_MS + 90_000).seconds).toBe(90);
  });
});

describe('herdState', () => {
  const herd = plan.herds.find((h) => h.kind === 'flock')!;

  it('stádo je na pastvině pár minut a k další dojde krokem, ne během', () => {
    const state = createHerdState();
    const dt = 0.5;
    let last: { x: number; z: number } | null = null;
    let resting = 0;
    let restRun = 0;
    let longestRest = 0;
    let steps = 0;
    for (let t = 0; t <= SPAN_S * 2; t += dt) {
      herdState(herd, clockAt(t), state);
      if (last) {
        // Krokem v hloučku – nejvýš 0,85 m/s.
        expect(Math.hypot(state.x - last.x, state.z - last.z) / dt).toBeLessThan(0.86);
      }
      last = { x: state.x, z: state.z };
      if (state.moving === 0) {
        resting++;
        restRun += dt;
        longestRest = Math.max(longestRest, restRun);
      } else {
        restRun = 0;
      }
      steps++;
      expect(state.moving).toBeGreaterThanOrEqual(0);
      expect(state.moving).toBeLessThanOrEqual(1);
    }
    expect(resting / steps).toBeGreaterThan(0.85);
    expect(longestRest).toBeGreaterThan(180);
    expect(herdPeriodS(herd)).toBeGreaterThanOrEqual(240);
  });

  it('mezi přesuny stojí na pastvině trasy', () => {
    const state = createHerdState();
    herdState(herd, clockAt(herdPeriodS(herd) * (10.9 - herd.phase)), state);
    expect(state.moving).toBe(0);
    expect(herd.route.some((p) => Math.hypot(p.x - state.x, p.z - state.z) < 1e-6)).toBe(true);
  });
});

describe('herdAnimalPose', () => {
  it('zvířata se drží u stáda a nikdy nevejdou na pole, hřbitov ani do vody', () => {
    const state = createHerdState();
    const pose = createLivestockPose();
    for (const herd of plan.herds) {
      for (let t = 0; t < SPAN_S * 2; t += 1.3) {
        const clock = clockAt(t);
        herdState(herd, clock, state);
        for (let i = 0; i < herd.animals.length; i++) {
          herdAnimalPose(herd, i, clock, state, pose);
          expect(Math.hypot(pose.x - state.x, pose.z - state.z)).toBeLessThanOrEqual(
            herd.radiusM + 1e-6,
          );
          expect(inSquares(pose.x, pose.z)).toBe(false);
          // Prasata se drží pásu u okraje lesa – hlouček je širší než pás, pár metrů přes.
          if (herd.kind === 'swine') {
            const near = [-4, 0, 4].some((dx) => GROUND.forestEdge(pose.x + dx, pose.z));
            expect(near).toBe(true);
          }
          if (herd.kind !== 'swine') expect(GROUND.pasture(pose.x, pose.z)).toBe(true);
          expect(Math.abs(pose.stride)).toBeLessThanOrEqual(1);
          expect(pose.head).toBeGreaterThanOrEqual(0);
          expect(pose.head).toBeLessThanOrEqual(1);
          expect(Math.hypot(pose.forwardX, pose.forwardZ)).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it('zvířata chodí klidně: popojdou krokem a desítky sekund se pasou', () => {
    const state = createHerdState();
    const pose = createLivestockPose();
    const dt = 0.1;
    for (const herd of plan.herds) {
      for (let i = 0; i < herd.animals.length; i++) {
        let last: { x: number; z: number } | null = null;
        let grazing = 0;
        let walking = 0;
        let samples = 0;
        let fastest = 0;
        for (let t = 0; t < SPAN_S; t += dt) {
          const clock = clockAt(t);
          herdState(herd, clock, state);
          herdAnimalPose(herd, i, clock, state, pose);
          if (last) {
            fastest = Math.max(fastest, Math.hypot(pose.x - last.x, pose.z - last.z) / dt);
          }
          last = { x: pose.x, z: pose.z };
          samples++;
          if (pose.head > 0.7) grazing++;
          if (Math.abs(pose.stride) > 0.3) walking++;
        }
        // Chodí ≈ 0,6–1 m/s (prase ryje pomalu), nikdy neběží – ani když se stádo stěhuje
        // (vlastní popocházení se s přesunem nesčítá).
        expect(fastest).toBeLessThan(1.05);
        expect(grazing / samples).toBeGreaterThan(0.45);
        expect(walking / samples).toBeLessThan(0.25);
      }
    }
  });

  it('stejný čas = stejná póza (deterministicky, bez stavu)', () => {
    const herd: Herd = plan.herds[0]!;
    const a = createLivestockPose();
    const b = createLivestockPose();
    const s = createHerdState();
    herdState(herd, clockAt(1234.5), s);
    herdAnimalPose(herd, 3, clockAt(1234.5), s, a);
    herdAnimalPose(herd, 2, clockAt(99), s, b);
    herdAnimalPose(herd, 3, clockAt(1234.5), s, b);
    expect(b).toEqual(a);
    // I po velmi dlouhé době (skutečný čas od počátku roku 2026).
    herdState(herd, clockAt(3e8), s);
    herdAnimalPose(herd, 3, clockAt(3e8), s, a);
    herdAnimalPose(herd, 3, clockAt(3e8), s, b);
    expect(b).toEqual(a);
  });
});

describe('chickenPose', () => {
  it('slepice zobou kolem domu – mimo dům, do pár metrů od něj, bez skoků', () => {
    const pose = createLivestockPose();
    for (const flock of plan.chickens) {
      const type = VILLAGE.dwellings.find((d) => d.position === flock.position)!.type;
      const box = chickenBox(type);
      for (let i = 0; i < flock.chickens.length; i++) {
        let last: { x: number; z: number } | null = null;
        let pecks = 0;
        for (let t = 0; t < 300; t += 0.05) {
          chickenPose(flock, i, clockAt(t), pose);
          const c = Math.cos(flock.position.rotation);
          const s = Math.sin(flock.position.rotation);
          const dx = pose.x - flock.position.x;
          const dz = pose.z - flock.position.z;
          const lx = dx * c - dz * s;
          const lz = dx * s + dz * c;
          expect(Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ).toBe(false);
          expect(Math.abs(lx)).toBeLessThan(box.halfX + flock.reachM.to + 0.5);
          expect(lz).toBeGreaterThan(box.minZ - flock.reachM.to - 0.5);
          expect(lz).toBeLessThan(box.maxZ + flock.reachM.to + 0.5);
          // Cupitá klidně – nejvýš ≈ 1 m/s.
          if (last) expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(0.05);
          last = { x: pose.x, z: pose.z };
          if (pose.head > 0.9) pecks++;
        }
        expect(pecks).toBeGreaterThan(20);
      }
    }
  });
});

describe('valueNoise', () => {
  it('hladký šum v rozsahu −1 … 1', () => {
    let last = valueNoise(5, 0, 0);
    for (let t = 0.01; t < 50; t += 0.01) {
      const v = valueNoise(5, t, 0);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - last)).toBeLessThan(0.05);
      last = v;
    }
  });
});

describe('keepRouteSpot', () => {
  const herd = (route: [number, number][]): Herd => ({
    kind: 'flock',
    seed: 1,
    phase: 0,
    routeOffset: 0,
    route: route.map(([x, z]) => ({ x, z })),
    radiusM: 5,
    animals: [],
  });
  // Pastvina č. 2, přesun už doběhl (konec období).
  const period = herdPeriodS(herd([[0, 0]]));
  const clock: LivestockClock = { seconds: 2.95 * period };

  it('po přepočtu zůstane stádo na pastvině, kde právě je', () => {
    const before = herd([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
    const after = keepRouteSpot(
      before,
      herd([
        [50, 50],
        [20, 0],
        [60, 60],
      ]),
      clock,
    );
    expect(herdRouteIndex(before, clock)).toBe(2);
    const state = herdState(after, clock, createHerdState());
    expect(state.x).toBeCloseTo(20, 6);
    expect(state.z).toBeCloseTo(0, 6);
    // Dál pokračuje po nové trase.
    const later = herdState(after, { seconds: clock.seconds + period }, createHerdState());
    expect([later.x, later.z]).toEqual([60, 60]);
  });

  it('když nová trasa pastvinu nemá, stádo se nemění', () => {
    const next = herd([
      [5, 5],
      [6, 6],
    ]);
    expect(
      keepRouteSpot(
        herd([
          [0, 0],
          [10, 0],
          [20, 0],
        ]),
        next,
        clock,
      ),
    ).toBe(next);
    expect(keepRouteSpot({ ...next, kind: 'cattle' }, next, clock)).toBe(next);
  });

  it('beze změny vsi stádo zůstává, kde bylo – i uprostřed přesunu a na cestě zpět', () => {
    for (const h of plan.herds) {
      for (let t = 0; t < 400 * 600; t += 997) {
        const kept = keepRouteSpot(h, h, clockAt(t));
        const a = herdState(h, clockAt(t), createHerdState());
        const b = herdState(kept, clockAt(t), createHerdState());
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.z).toBeCloseTo(a.z, 6);
      }
    }
  });
});
