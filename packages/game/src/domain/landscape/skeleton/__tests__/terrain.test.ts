import { describe, expect, it } from 'vitest';
import { length2 } from '../../det-math';
import { generateLandscape, generateLandscapeAttempt } from '../../generate';
import { RIVER } from '../../premium/river';
import { createRandom } from '../../random';
import { terrainStart } from '../../terrain';
import {
  CURRENT_LAYER_VERSIONS,
  LANDSCAPE_SIZE,
  type Landscape,
  type LayerVersions,
  type StreamPoint,
} from '../../types';
import { portTile } from '../ports-map';
import { planRiverCourses } from '../river-course';
import type { SkeletonRiverPort, SkeletonSlice } from '../types';

const SIZE = LANDSCAPE_SIZE;
const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };

const port = (
  side: SkeletonRiverPort['side'],
  at: number,
  widthM: number,
  flow: 'in' | 'out',
): SkeletonRiverPort => ({ side, at, widthM, flow });

const slice = (...rivers: SkeletonRiverPort[]): SkeletonSlice => ({ world: 1, rivers, trails: [] });

const RIVER_CASES: Record<string, SkeletonSlice> = {
  rovně: slice(port('N', 60, 35, 'in'), port('S', 70, 35, 'out')),
  ohyb: slice(port('S', 90, 30, 'out'), port('W', 40, 30, 'in')),
  soutok: slice(port('N', 50, 40, 'in'), port('E', 64, 25, 'in'), port('S', 80, 45, 'out')),
  pramen: slice(port('S', 64, 25, 'out')),
};

const TRAIL: SkeletonSlice = {
  world: 1,
  rivers: [],
  trails: [
    { side: 'E', at: 40 },
    { side: 'W', at: 90 },
  ],
};

const edgeDistance = (p: { x: number; y: number }): number =>
  Math.min(p.x, p.y, SIZE - 1 - p.x, SIZE - 1 - p.y);

/** Vzdálenost bodu od vody řek (osa minus polovina šířky v nejbližším bodě, políčka). */
function riverGap(
  rivers: readonly (readonly StreamPoint[])[],
  p: { x: number; y: number },
): number {
  let best = Infinity;
  for (const course of rivers) {
    for (const q of course) {
      const half = Math.max(q.halfWidthLeft, q.halfWidthRight);
      best = Math.min(best, length2(q.x - p.x, q.y - p.y) - half);
    }
  }
  return best;
}

describe('terén mapy z kostry', () => {
  it('bez výřezu (null) bit po bitu jako dřív', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const dry = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS);
      expect(generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS, undefined, null)).toEqual(dry);
      expect('skeleton' in dry).toBe(false);
      expect('rivers' in dry).toBe(false);
    }
  });

  it('výřez jen se stezkou – terén suché mapy, krajina nese výřez', () => {
    for (const seed of [1, 2, 3]) {
      const dry = generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS);
      const trail = generateLandscapeAttempt(seed, SKELETON, undefined, TRAIL);
      expect(trail.heights).toEqual(dry.heights);
      expect(trail.surface).toEqual(dry.surface);
      expect(trail.fertility).toEqual(dry.fertility);
      expect(trail.skeleton).toEqual(TRAIL);
      expect('rivers' in trail).toBe(false);
    }
  });

  it('verze skeleton bez výřezu i výřez bez verze → RangeError', () => {
    const river = RIVER_CASES.rovně!;
    expect(() => generateLandscapeAttempt(1, SKELETON)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, SKELETON, undefined, null)).toThrow(RangeError);
    expect(() => generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS, undefined, river)).toThrow(
      RangeError,
    );
    expect(() => generateLandscape(1, CURRENT_LAYER_VERSIONS, undefined, TRAIL)).toThrow(
      RangeError,
    );
    expect(() => generateLandscape(1, SKELETON)).toThrow(RangeError);
    // Prázdný výřez = suchá mapa (bez verze projde, s verzí ne).
    const empty: SkeletonSlice = { world: 1, rivers: [], trails: [] };
    expect(generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS, undefined, empty)).toEqual(
      generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS),
    );
    expect(() => generateLandscapeAttempt(1, SKELETON, undefined, empty)).toThrow(RangeError);
  });

  it('prémiový typ na mapě z kostry zatím není (premium: 2) → RangeError', () => {
    expect(() => generateLandscape(1, SKELETON, 'navigable-river', RIVER_CASES.rovně!)).toThrow(
      RangeError,
    );
  });

  describe.each(Object.keys(RIVER_CASES))('výřez s řekou – %s', (name) => {
    const s = RIVER_CASES[name]!;
    const landscapes: Landscape[] = [1, 2, 3].map((seed) =>
      generateLandscape(seed, SKELETON, undefined, s),
    );

    it('krajina nese výřez a řeky kostry (hlavní tok a přítok za každý další vtok)', () => {
      const inflows = s.rivers.filter((p) => p.flow === 'in').length;
      for (const l of landscapes) {
        expect(l.skeleton).toEqual(s);
        expect(l.rivers).toHaveLength(Math.max(1, inflows));
        expect('river' in l).toBe(false);
      }
    });

    it('potok začíná na okraji a končí u vody řeky (u pramene u počátku řeky)', () => {
      for (const l of landscapes) {
        const first = l.stream[0]!;
        const last = l.stream.at(-1)!;
        expect(edgeDistance(first)).toBeLessThan(0.5);
        // Jen začátek leží na okraji – dál od něj potok podél okraje nevede.
        for (const p of l.stream.slice(6)) expect(edgeDistance(p)).toBeGreaterThanOrEqual(0.5);
        expect(edgeDistance(last)).toBeGreaterThanOrEqual(2);
        const rivers = l.rivers!;
        if (s.rivers.some((p) => p.flow === 'in')) {
          expect(riverGap(rivers, last)).toBeLessThanOrEqual(2);
        } else {
          const source = rivers[0]![0]!;
          expect(length2(source.x - last.x, source.y - last.y)).toBeLessThanOrEqual(2 + 1.5);
        }
      }
    });

    it('ústí potoka aspoň 20 políček od bodů řeky na okraji', () => {
      for (const l of landscapes) {
        const first = l.stream[0]!;
        for (const p of s.rivers) {
          const tile = portTile(p.side, p.at, SIZE);
          expect(length2(tile.x - first.x, tile.y - first.y)).toBeGreaterThanOrEqual(19.5);
        }
      }
    });

    it(`ves leží aspoň ${RIVER.villageMinCells} políček od každého bodu os řek`, () => {
      for (const l of landscapes) {
        for (const course of l.rivers!) {
          for (const p of course) {
            const d = length2(p.x - l.villageSite.x, p.y - l.villageSite.y);
            expect(d).toBeGreaterThanOrEqual(RIVER.villageMinCells);
          }
        }
      }
    });

    it('řeka má spád – hladina po proudu neroste a na výtoku je níž než na začátku', () => {
      for (const l of landscapes) {
        for (const course of l.rivers!) {
          for (let k = 1; k < course.length; k++) {
            expect(course[k]!.level).toBeLessThanOrEqual(course[k - 1]!.level + 1e-6);
          }
        }
        const main = l.rivers![0]!;
        expect(main[0]!.level - main.at(-1)!.level).toBeGreaterThan(1);
      }
    });

    it('hladina potoka v ústí není pod hladinou řeky', () => {
      for (const l of landscapes) {
        const last = l.stream.at(-1)!;
        let nearest = l.rivers![0]![0]!;
        for (const course of l.rivers!) {
          for (const q of course) {
            if (
              length2(q.x - last.x, q.y - last.y) < length2(nearest.x - last.x, nearest.y - last.y)
            )
              nearest = q;
          }
        }
        expect(last.level).toBeGreaterThanOrEqual(nearest.level - 1e-3);
      }
    });
  });
});

describe('soutok u rohu mapy', () => {
  it('hlavní tok W 24 → S 24 s přítokem z východu – trasa vede u každého seedu', () => {
    const corner = slice(
      port('W', 24, 40, 'in'),
      port('S', 24, 45, 'out'),
      port('E', 64, 25, 'in'),
    );
    for (let seed = 1; seed <= 10; seed++) {
      const { heights } = terrainStart(seed, SIZE);
      const plans = planRiverCourses(heights, SIZE, corner, createRandom(seed));
      expect(plans, `seed ${seed}`).not.toBeNull();
      expect(plans).toHaveLength(2);
    }
  });
});
