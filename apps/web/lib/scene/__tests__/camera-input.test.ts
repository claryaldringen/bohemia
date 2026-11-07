import { describe, expect, it } from 'vitest';
import {
  cameraTerrainLift,
  CLICK_SLOP_PX,
  DOUBLE_CLICK_MS,
  isDrag,
  nextClick,
  pinchZoomFactor,
} from '../camera-input';

describe('isDrag', () => {
  it('do meze kliknutí je to kliknutí, dál tah', () => {
    expect(isDrag({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(isDrag({ x: 10, y: 10 }, { x: 10 + CLICK_SLOP_PX, y: 10 })).toBe(false);
    expect(isDrag({ x: 10, y: 10 }, { x: 10 + CLICK_SLOP_PX + 1, y: 10 })).toBe(true);
    expect(isDrag({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
  });
});

describe('nextClick – dvojklik (fields.md – Co hráč vidí)', () => {
  it('druhé kliknutí do DOUBLE_CLICK_MS a CLICK_SLOP_PX je dvojklik, třetí trojklik', () => {
    const first = nextClick(null, { x: 100, y: 100, at: 1000 });
    expect(first.count).toBe(1);
    const second = nextClick(first, { x: 103, y: 99, at: 1000 + DOUBLE_CLICK_MS });
    expect(second.count).toBe(2);
    expect(nextClick(second, { x: 103, y: 99, at: 1200 + DOUBLE_CLICK_MS }).count).toBe(3);
  });

  it('pozdě, jinde nebo s časem pozpátku začíná nová řada', () => {
    const first = nextClick(null, { x: 100, y: 100, at: 1000 });
    expect(nextClick(first, { x: 100, y: 100, at: 1001 + DOUBLE_CLICK_MS }).count).toBe(1);
    expect(nextClick(first, { x: 101 + CLICK_SLOP_PX, y: 100, at: 1100 }).count).toBe(1);
    expect(nextClick(first, { x: 100, y: 100, at: 900 }).count).toBe(1);
  });
});

describe('pinchZoomFactor', () => {
  it('rozevření prstů přibližuje, sevření oddaluje', () => {
    expect(pinchZoomFactor(-5)).toBeLessThan(1);
    expect(pinchZoomFactor(5)).toBeGreaterThan(1);
    expect(pinchZoomFactor(0)).toBe(1);
  });

  it('gesto 2× (součet deltaY −100 · ln 2 po malých krocích) kameru přiblíží na polovinu', () => {
    const steps = 20;
    const delta = (-100 * Math.LN2) / steps;
    let factor = 1;
    for (let i = 0; i < steps; i++) factor *= pinchZoomFactor(delta);
    expect(factor).toBeCloseTo(0.5, 6);
  });

  it('Ctrl + zub kolečka myši (deltaY 100, i v řádcích) neskočí víc než o čtvrtinu', () => {
    expect(pinchZoomFactor(100)).toBeCloseTo(Math.exp(0.25), 6);
    expect(pinchZoomFactor(-100)).toBeCloseTo(Math.exp(-0.25), 6);
    expect(pinchZoomFactor(3, 1)).toBeCloseTo(Math.exp(0.25), 6);
  });
});

describe('cameraTerrainLift – kamera se nezaboří do hory', () => {
  const orbit = { alpha: -Math.PI / 2, beta: 0.85, radius: 120 };
  const target = { x: 0, y: 10, z: 0 };

  it('nad rovinou (a nízkým terénem pod kamerou) nic nezvedá', () => {
    expect(cameraTerrainLift(target, orbit, () => 10, 4)).toBe(0);
    expect(cameraTerrainLift(target, orbit, () => 60, 4)).toBe(0);
  });

  it('svah hory pod kamerou: cíl se zvedne tak, aby kamera byla `clearance` nad zemí', () => {
    // kamera stojí jižně od cíle (alpha −π/2 → z záporné) – tam je hora
    const ground = (_x: number, z: number): number => (z < -50 ? 200 : 10);
    const lift = cameraTerrainLift(target, orbit, ground, 4);
    const cameraY = target.y + orbit.radius * Math.cos(orbit.beta);
    expect(lift).toBeCloseTo(200 + 4 - cameraY, 9);
    // po zvednutí už nic
    expect(cameraTerrainLift({ ...target, y: target.y + lift }, orbit, ground, 4)).toBeCloseTo(
      0,
      9,
    );
  });
});
