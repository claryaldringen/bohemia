import { describe, it, expect } from 'vitest';
import {
  birdFlockBounds,
  birdPose,
  createPose,
  fishPose,
  fishSchoolBounds,
  type Bounds,
  type FaunaPose,
} from '../fauna-motion';
import type { BirdFlock, FishSchool } from '../fauna-placement';

const crows: BirdFlock = {
  species: 'crow',
  x: 100,
  z: -40,
  y: 160,
  radiusM: 25,
  speedMps: 10,
  turn: 1,
  driftM: 0,
  seed: 7,
  birds: [
    { phase: 0, radius: 1, heightM: 0, scale: 1 },
    { phase: 2.2, radius: 0.9, heightM: 2, scale: 0.95 },
    { phase: 4.1, radius: 1.1, heightM: -1.5, scale: 1.05 },
  ],
};
const hawk: BirdFlock = {
  species: 'hawk',
  x: -300,
  z: 200,
  y: 190,
  radiusM: 70,
  speedMps: 9,
  turn: -1,
  driftM: 25,
  seed: 3,
  birds: [{ phase: 1, radius: 1, heightM: 0, scale: 1 }],
};
const school: FishSchool = {
  x: 10,
  z: 20,
  surfaceY: 30,
  flowX: 0.6,
  flowZ: 0.8,
  alongM: 7,
  acrossM: 4,
  turn: -1,
  speedMps: 0.7,
  visibilityM: 1,
  seed: 11,
  fish: [
    { phase: 0, radius: 1, depthM: 0.1, scale: 1 },
    { phase: 0.25, radius: 0.85, depthM: 0.25, scale: 0.9 },
    { phase: 0.5, radius: 1.1, depthM: 0.4, scale: 0.8 },
    { phase: 0.7, radius: 0.95, depthM: 0.2, scale: 1 },
  ],
};

const STEP_S = 1 / 30;
/** Poloha a pohyb všech členů skupiny po dobu `seconds` (snímky po 1/30 s). */
function track(
  pose: (index: number, t: number, out: FaunaPose) => FaunaPose,
  members: number,
  seconds: number,
): { index: number; t: number; pose: FaunaPose; next: FaunaPose }[] {
  const result = [];
  for (let index = 0; index < members; index++) {
    for (let t = 0; t < seconds; t += STEP_S) {
      result.push({
        index,
        t,
        pose: pose(index, t, createPose()),
        next: pose(index, t + STEP_S, createPose()),
      });
    }
  }
  return result;
}
const inside = (p: FaunaPose, b: Bounds): boolean =>
  p.x >= b.minX &&
  p.x <= b.maxX &&
  p.y >= b.minY &&
  p.y <= b.maxY &&
  p.z >= b.minZ &&
  p.z <= b.maxZ;
const horizontalSpeed = (a: FaunaPose, b: FaunaPose): number =>
  Math.hypot(b.x - a.x, b.z - a.z) / STEP_S;

describe('birdPose', () => {
  const crowFrames = track((i, t, out) => birdPose(crows, i, t, out), 3, 120);
  const hawkFrames = track((i, t, out) => birdPose(hawk, i, t, out), 1, 300);

  it('ptáci plynule krouží stálou rychlostí a míří po směru letu', () => {
    for (const { pose, next } of [...crowFrames, ...hawkFrames]) {
      const speed = horizontalSpeed(pose, next);
      expect(speed).toBeGreaterThan(6);
      expect(speed).toBeLessThan(14);
      expect(Math.hypot(pose.forwardX, pose.forwardY, pose.forwardZ)).toBeCloseTo(1, 5);
      const dx = (next.x - pose.x) / (speed * STEP_S);
      const dz = (next.z - pose.z) / (speed * STEP_S);
      expect(dx * pose.forwardX + dz * pose.forwardZ).toBeGreaterThan(0.95);
    }
  });

  it('v zatáčce se naklánějí ke středu kroužení', () => {
    for (const { pose } of crowFrames) {
      const tilt = Math.hypot(pose.tiltX, pose.tiltZ);
      expect(tilt).toBeGreaterThan(0.15);
      expect(tilt).toBeLessThan(0.6);
      expect(pose.tiltX * (crows.x - pose.x) + pose.tiltZ * (crows.z - pose.z)).toBeGreaterThan(0);
    }
  });

  it('zůstávají v obalu svého hejna (podle něj se počítá, jestli jsou v záběru)', () => {
    const crowBounds = birdFlockBounds(crows);
    const hawkBounds = birdFlockBounds(hawk);
    for (const { pose } of crowFrames) expect(inside(pose, crowBounds)).toBe(true);
    for (const { pose } of hawkFrames) expect(inside(pose, hawkBounds)).toBe(true);
  });

  it('vrány střídají mávání a plachtění, káně většinou plachtí', () => {
    const flapping = (frames: typeof crowFrames): number =>
      frames.filter(({ pose, next }) => Math.abs(next.flap - pose.flap) > 0.15).length /
      frames.length;
    for (const { pose } of [...crowFrames, ...hawkFrames]) {
      expect(Math.abs(pose.flap)).toBeLessThanOrEqual(1);
      expect(pose.opacity).toBe(1);
    }
    expect(flapping(crowFrames)).toBeGreaterThan(0.15);
    expect(flapping(crowFrames)).toBeLessThan(0.65);
    expect(flapping(hawkFrames)).toBeGreaterThan(0.01);
    expect(flapping(hawkFrames)).toBeLessThan(0.25);
  });

  it('poloha je funkcí času – stejný čas, stejná póza', () => {
    expect(birdPose(crows, 1, 42.5, createPose())).toEqual(birdPose(crows, 1, 42.5, createPose()));
  });
});

describe('fishPose', () => {
  const frames = track((i, t, out) => fishPose(school, i, t, out), school.fish.length, 300);
  const swimming = frames.filter(({ pose, next }) => pose.forwardY === 0 && next.forwardY === 0);

  it('ryby plavou pomalu a plynule a míří po směru plavání', () => {
    for (const { pose, next } of swimming) {
      const speed = horizontalSpeed(pose, next);
      expect(speed).toBeGreaterThan(0.1);
      expect(speed).toBeLessThan(2);
      const dx = (next.x - pose.x) / (speed * STEP_S);
      const dz = (next.z - pose.z) / (speed * STEP_S);
      expect(dx * pose.forwardX + dz * pose.forwardZ).toBeGreaterThan(0.95);
      expect(pose.tiltX).toBe(0);
      expect(pose.tiltZ).toBe(0);
    }
  });

  it('zůstávají v obalu hejna', () => {
    const bounds = fishSchoolBounds(school);
    for (const { pose } of frames) expect(inside(pose, bounds)).toBe(true);
  });

  it('mrskají ocasem tím rychleji, čím rychleji plavou', () => {
    const fish = swimming.filter((f) => f.index === 0);
    let beats = 0;
    for (let k = 1; k < fish.length; k++) {
      if (Math.sign(fish[k]!.pose.flap) !== Math.sign(fish[k - 1]!.pose.flap)) beats++;
    }
    // Půlkmity za sekundu: 1–4 kmity za sekundu.
    const perSecond = beats / 2 / 300;
    expect(perSecond).toBeGreaterThan(1);
    expect(perSecond).toBeLessThan(4);
    for (const { pose } of frames) expect(Math.abs(pose.flap)).toBeLessThanOrEqual(1);
  });

  it('hlouběji plovoucí ryba je pod hladinou méně vidět', () => {
    const opacity = (index: number): number =>
      swimming.find((f) => f.index === index)!.pose.opacity;
    expect(opacity(0)).toBeGreaterThan(opacity(3));
    expect(opacity(3)).toBeGreaterThan(opacity(1));
    expect(opacity(1)).toBeGreaterThan(opacity(2));
    expect(opacity(2)).toBeGreaterThan(0.5);
    // Kalná voda ryby skryje víc.
    const murky = fishPose({ ...school, visibilityM: 0.3 }, 2, 1, createPose()).opacity;
    expect(murky).toBeLessThan(0.35);
  });

  it('občas některá ryba vyskočí nad hladinu jako v 0 A.D.', () => {
    const restingY = (index: number): number => swimming.find((f) => f.index === index)!.pose.y;
    const jumping = frames.filter((f) => f.pose.forwardY !== 0);
    expect(jumping.length).toBeGreaterThan(0);
    expect(jumping.length / frames.length).toBeLessThan(0.03);
    const high = jumping.filter((f) => f.pose.y > restingY(f.index) + 0.3);
    expect(high.length).toBeGreaterThan(0);
    for (const { pose } of high) expect(pose.opacity).toBe(1);
    for (const { pose } of swimming) expect(pose.y).toBeGreaterThan(school.surfaceY);
  });

  it('poloha je funkcí času – stejný čas, stejná póza', () => {
    expect(fishPose(school, 2, 17.25, createPose())).toEqual(
      fishPose(school, 2, 17.25, createPose()),
    );
  });
});
