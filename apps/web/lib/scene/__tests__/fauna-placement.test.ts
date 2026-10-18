import { describe, it, expect } from 'vitest';
import { buildForestField, generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { HEIGHT_SCALE } from '../constants';
import {
  birdFlocks,
  fishLoopPoint,
  fishSchools,
  flockReach,
  type FishSchool,
} from '../fauna-placement';
import { buildRenderSurface } from '../render-surface';
import { tileAt } from '../tile-at';

const SEEDS = [3, 42, 5];

describe.each(SEEDS)('fishSchools (krajina %i)', (seed) => {
  const landscape = generateLandscape(seed);
  const surface = buildRenderSurface(landscape);
  const stream = surface.stream;
  const schools = fishSchools(surface);
  /** Body dráhy každé ryby po celém kole. */
  const loop = (school: FishSchool): { x: number; z: number }[] =>
    school.fish.flatMap((fish) =>
      Array.from({ length: 32 }, (_, k) =>
        fishLoopPoint(school, fish.radius, (k / 32) * Math.PI * 2, { x: 0, z: 0 }),
      ),
    );

  it('v potoce je pár hejn, v každém několik ryb – ne stovky', () => {
    expect(schools.length).toBeGreaterThanOrEqual(2);
    expect(schools.length).toBeLessThanOrEqual(8);
    for (const school of schools) {
      expect(school.fish.length).toBeGreaterThanOrEqual(4);
      expect(school.fish.length).toBeLessThanOrEqual(8);
    }
    expect(schools.reduce((sum, s) => sum + s.fish.length, 0)).toBeLessThanOrEqual(60);
  });

  it('ryby plavou celé kolo v dost hluboké vodě a dál od břehu', () => {
    for (const school of schools) {
      for (const p of loop(school)) {
        const near = stream.nearest(p.x, p.z);
        expect(near.bankDistance).toBeLessThanOrEqual(-1.5);
        expect(near.level - surface.heightAt(p.x, p.z)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('hejna stojí v tůních a klidných úsecích, ne v peřejích ani na mělčinách', () => {
    for (const school of schools) {
      const near = stream.nearest(school.x, school.z);
      expect(near.speed).toBeLessThanOrEqual(0.5);
      expect(near.shallow).toBeLessThanOrEqual(0.3);
      expect(school.surfaceY).toBeCloseTo(near.level * HEIGHT_SCALE, 1);
      // Dráha je protáhlá po proudu.
      expect(Math.abs(school.flowX * near.flowX + school.flowZ * near.flowZ)).toBeGreaterThan(0.95);
      expect(school.alongM).toBeGreaterThanOrEqual(school.acrossM);
    }
  });

  it('hejna jsou rozesetá podél potoka', () => {
    for (const a of schools) {
      for (const b of schools) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it('průzračnost vody i hloubka ryb jsou v rozumných mezích', () => {
    for (const school of schools) {
      expect(school.visibilityM).toBeGreaterThanOrEqual(0.3);
      expect(school.visibilityM).toBeLessThanOrEqual(2.6);
      for (const fish of school.fish) {
        expect(fish.depthM).toBeGreaterThanOrEqual(0.05);
        expect(fish.depthM).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('stejná krajina = stejná hejna', () => {
    expect(fishSchools(surface)).toEqual(schools);
  });
});

describe.each(SEEDS)('birdFlocks (krajina %i)', (seed) => {
  const landscape = generateLandscape(seed);
  const surface = buildRenderSurface(landscape);
  const field = buildForestField(landscape);
  const groundHeight = (x: number, z: number): number => surface.heightAt(x, z) * HEIGHT_SCALE;
  const flocks = birdFlocks(landscape, field, surface.stream, groundHeight);
  const crows = flocks.filter((f) => f.species === 'crow');
  const hawks = flocks.filter((f) => f.species === 'hawk');
  const half = (landscape.size * landscape.cellSizeM) / 2;

  it('nad krajinou krouží pár hejn vran a jedno káně', () => {
    expect(crows.length).toBeGreaterThanOrEqual(2);
    expect(crows.length).toBeLessThanOrEqual(4);
    expect(hawks).toHaveLength(1);
    expect(hawks[0]!.birds).toHaveLength(1);
    // Počty vran jako hejna v 0 A.D. (crow_circle): 2, 3, 5, výjimečně 10.
    for (const flock of crows) expect([2, 3, 5, 10]).toContain(flock.birds.length);
    expect(flocks.reduce((sum, f) => sum + f.birds.length, 0)).toBeLessThanOrEqual(30);
  });

  it('krouží nad loukami a celé kolo je nad krajinou', () => {
    for (const flock of flocks) {
      const tile = tileAt(landscape, flock.x, flock.z)!;
      expect(landscape.surface[tile.y * landscape.size + tile.x]).toBe(SURFACE_CODES.meadow);
      expect(field.distanceAt(flock.x, flock.z)).toBeLessThan(0);
      const reach = flockReach(flock);
      expect(reach).toBeLessThan(flock.radiusM * 1.2 + flock.driftM);
      expect(Math.abs(flock.x) + reach).toBeLessThan(half);
      expect(Math.abs(flock.z) + reach).toBeLessThan(half);
    }
    // Vrány drží u lesa (hnízdí v korunách), káně loví nad otevřenou loukou.
    for (const flock of crows) expect(field.distanceAt(flock.x, flock.z)).toBeGreaterThan(-220);
    expect(field.distanceAt(hawks[0]!.x, hawks[0]!.z)).toBeLessThan(-40);
  });

  it('létají vysoko nad terénem i nad stromy, ne však nesmyslně vysoko', () => {
    for (const flock of flocks) {
      const clearance = flock.species === 'hawk' ? 45 : 25;
      const reach = flockReach(flock);
      for (let k = 0; k < 48; k++) {
        const angle = (k / 48) * Math.PI * 2;
        for (const r of [0, reach / 2, reach]) {
          const ground = groundHeight(flock.x + Math.cos(angle) * r, flock.z + Math.sin(angle) * r);
          for (const bird of flock.birds) {
            expect(flock.y + bird.heightM - ground).toBeGreaterThanOrEqual(clearance);
          }
        }
      }
      expect(flock.y - groundHeight(flock.x, flock.z)).toBeLessThanOrEqual(130);
    }
  });

  it('hejna jsou od sebe daleko', () => {
    for (const a of flocks) {
      for (const b of flocks) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(300);
      }
    }
  });

  it('stejná krajina = stejní ptáci', () => {
    expect(birdFlocks(landscape, field, surface.stream, groundHeight)).toEqual(flocks);
  });
});
