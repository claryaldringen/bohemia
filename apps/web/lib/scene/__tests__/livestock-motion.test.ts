import { describe, it, expect } from 'vitest';
import {
  chickenPose,
  createHerdState,
  createLivestockPose,
  herdAnimalPose,
  herdState,
  routeAt,
  valueNoise,
  type LivestockClock,
} from '../livestock-motion';
import { chickenBox, planLivestock, type Herd } from '../livestock-placement';
import { GROUND, VILLAGE, inSquares as inVillageSquares } from './livestock-fixtures';

const DAY_S = 86.4;
const clockAt = (seconds: number): LivestockClock => ({
  seconds,
  gameDay: seconds / DAY_S,
  daySeconds: DAY_S,
});

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

describe('herdState', () => {
  const herd = plan.herds.find((h) => h.kind === 'flock')!;

  it('stádo se stěhuje plynule a většinu dne stojí na pastvině', () => {
    const state = createHerdState();
    let last: { x: number; z: number } | null = null;
    let resting = 0;
    const steps = 2000;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * DAY_S * 3;
      herdState(herd, clockAt(t), state);
      if (last) expect(Math.hypot(state.x - last.x, state.z - last.z)).toBeLessThan(0.5);
      last = { x: state.x, z: state.z };
      if (state.moving === 0) resting++;
      expect(state.moving).toBeGreaterThanOrEqual(0);
      expect(state.moving).toBeLessThanOrEqual(1);
    }
    expect(resting / steps).toBeGreaterThan(0.3);
  });

  it('mezi přesuny stojí na pastvině trasy', () => {
    const state = createHerdState();
    herdState(herd, clockAt(DAY_S * 10), state);
    const spot = herd.route.some((p) => Math.hypot(p.x - state.x, p.z - state.z) < 1e-6);
    // Buď stojí na pastvině, nebo je právě na cestě mezi dvěma sousedními.
    expect(spot || state.moving > 0 || state.travelled > 0).toBe(true);
  });
});

describe('herdAnimalPose', () => {
  it('zvířata se drží u stáda a nikdy nevejdou na pole, hřbitov ani do vody', () => {
    const state = createHerdState();
    const pose = createLivestockPose();
    for (const herd of plan.herds) {
      for (let t = 0; t < DAY_S * 4; t += 0.7) {
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

  it('zvíře chodí plynule (žádné skoky), pase se i stojí', () => {
    const herd = plan.herds.find((h) => h.kind === 'flock')!;
    const state = createHerdState();
    const pose = createLivestockPose();
    let last: { x: number; z: number } | null = null;
    let grazing = 0;
    let standing = 0;
    let walking = 0;
    for (let t = 0; t < 600; t += 0.05) {
      const clock = clockAt(t);
      herdState(herd, clock, state);
      herdAnimalPose(herd, 0, clock, state, pose);
      if (last) expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(0.2);
      last = { x: pose.x, z: pose.z };
      if (pose.head > 0.8) grazing++;
      if (pose.head < 0.05 && Math.abs(pose.stride) < 0.01) standing++;
      if (Math.abs(pose.stride) > 0.5) walking++;
    }
    expect(grazing).toBeGreaterThan(1000);
    expect(standing).toBeGreaterThan(100);
    expect(walking).toBeGreaterThan(50);
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
        for (let t = 0; t < 200; t += 0.05) {
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
          if (last) expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(0.15);
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
