import { describe, expect, it } from 'vitest';
import { length2 } from '../../det-math';
import { generateLandscapeAttempt } from '../../generate';
import { lineKeepsAway } from '../../premium/route';
import {
  CURRENT_LAYER_VERSIONS,
  LANDSCAPE_SIZE,
  type Landscape,
  type LayerVersions,
} from '../../types';
import { tileCenterWorld } from '../../world';
import { checkSkeleton } from '../check';
import { skeletonFeaturesOf } from '../features';
import { portTile } from '../ports-map';
import { skeletonRoute } from '../route';
import type { SkeletonRiverPort, SkeletonSlice, SkeletonTrailPort } from '../types';

const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };
const SEEDS = [1, 2, 3, 4, 5, 6];

const trail = (side: SkeletonTrailPort['side'], at: number): SkeletonTrailPort => ({ side, at });
const river = (
  side: SkeletonRiverPort['side'],
  at: number,
  flow: 'in' | 'out',
): SkeletonRiverPort => ({
  side,
  at,
  widthM: 30,
  flow,
});
const slice = (trails: SkeletonTrailPort[], rivers: SkeletonRiverPort[] = []): SkeletonSlice => ({
  world: 1,
  rivers,
  trails,
});

const THROUGH = slice([trail('W', 40), trail('E', 90)]);
const CROSSROADS = slice([trail('W', 40), trail('E', 90), trail('N', 60)]);
const END = slice([trail('W', 60)]);
const FORD = slice([trail('W', 40), trail('E', 90)], [river('N', 60, 'in'), river('S', 70, 'out')]);
const NO_CROSSING = slice(
  [trail('W', 30), trail('N', 20)],
  [river('N', 90, 'in'), river('S', 100, 'out')],
);

function landscapeOf(seed: number, s: SkeletonSlice): Landscape {
  return generateLandscapeAttempt(seed, SKELETON, undefined, s);
}

const villageOf = (l: Landscape): { x: number; z: number } =>
  tileCenterWorld(l, l.villageSite.x, l.villageSite.y);

/** Políčko bodu ve světě. */
function cellAt(l: Landscape, x: number, z: number): number {
  const h = (l.size * l.cellSizeM) / 2;
  const tx = Math.min(l.size - 1, Math.max(0, Math.floor((x + h) / l.cellSizeM)));
  const ty = Math.min(l.size - 1, Math.max(0, Math.floor((z + h) / l.cellSizeM)));
  return ty * l.size + tx;
}

describe('stezka kostry na mapě', () => {
  it('stezka W→E: konce u bodů, 150 m od vsi, nejblíž ≤ 450 m', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const l = landscapeOf(seed, THROUGH);
      const route = skeletonRoute(l);
      if (route === null) continue;
      found++;
      expect(route.legs).toHaveLength(2);
      for (const [k, t] of THROUGH.trails.entries()) {
        const tile = portTile(t.side, t.at, LANDSCAPE_SIZE);
        const c = tileCenterWorld(l, tile.x, tile.y);
        const end = route.ends[k]!.point;
        expect(length2(end[0] - c.x, end[1] - c.z)).toBeLessThanOrEqual(15);
        expect(route.ends[k]!.side).toBe(t.side);
      }
      const v = villageOf(l);
      let nearest = Infinity;
      for (const leg of route.legs) {
        expect(lineKeepsAway(leg, v, 150)).toBe(true);
        for (const p of leg) nearest = Math.min(nearest, length2(p[0] - v.x, p[1] - v.z));
      }
      expect(nearest).toBeLessThanOrEqual(450);
    }
    expect(found).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  it('křižovatka: tři větve k jednomu bodu', () => {
    const l = landscapeOf(1, CROSSROADS);
    const features = skeletonFeaturesOf(l)!;
    expect(features.crossroads).toBe(true);
    expect(features.route!.legs).toHaveLength(3);
    const meet = features.route!.legs.map((leg) => leg.at(-1)!);
    expect(length2(meet[0]![0] - meet[1]![0], meet[0]![1] - meet[1]![1])).toBeLessThan(0.01);
    expect(length2(meet[0]![0] - meet[2]![0], meet[0]![1] - meet[2]![1])).toBeLessThan(0.01);
  });

  it('konec stezky: jedna větev končící u vsi', () => {
    for (const seed of SEEDS) {
      const l = landscapeOf(seed, END);
      const features = skeletonFeaturesOf(l)!;
      expect(features.trailEnd).toBe(true);
      if (features.route === null) continue;
      expect(features.route.legs).toHaveLength(1);
      const last = features.route.legs[0]!.at(-1)!;
      const v = villageOf(l);
      expect(length2(last[0] - v.x, last[1] - v.z)).toBeLessThanOrEqual(210);
    }
  });

  it('brod: stezka přejde řeku právě jednou, u mělčiny', () => {
    let crossed = 0;
    for (const seed of SEEDS) {
      const l = landscapeOf(seed, FORD);
      const route = skeletonRoute(l);
      if (route === null) continue;
      expect(route.fords).toHaveLength(1);
      crossed++;
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('brod: stezka přejde řeku rovně přes střed mělčiny', () => {
    let crossed = 0;
    for (const seed of SEEDS) {
      const l = landscapeOf(seed, FORD);
      const route = skeletonRoute(l);
      if (route === null) continue;
      const [fx, fz] = route.fords[0]!;
      // Střed brodu je střed mělčiny na ose řeky.
      const centers = (l.rivers ?? []).flatMap((course) =>
        course.flatMap((p, k) => {
          const mid = p.shallow && !course[k - 1]?.shallow;
          if (!mid) return [];
          let last = k;
          while (course[last + 1]?.shallow) last++;
          const c = course[Math.round((k + last) / 2)]!;
          return [tileCenterWorld(l, c.x, c.y)];
        }),
      );
      expect(centers.some((c) => length2(c.x - fx, c.z - fz) < 0.01)).toBe(true);
      // Stezka prochází středem mělčiny (± 2 m).
      let nearest = Infinity;
      for (const leg of route.legs) {
        for (let i = 0; i + 1 < leg.length; i++) {
          const [ax, az] = leg[i]!;
          const [bx, bz] = leg[i + 1]!;
          const dx = bx - ax;
          const dz = bz - az;
          const t = Math.min(
            1,
            Math.max(0, ((fx - ax) * dx + (fz - az) * dz) / (dx * dx + dz * dz)),
          );
          nearest = Math.min(nearest, length2(ax + t * dx - fx, az + t * dz - fz));
        }
      }
      expect(nearest).toBeLessThanOrEqual(2);
      // Ve vodě řeky vede stezka jen v mělčině – nejdál přes polovinu šířky brodu od středu.
      const shallowHalfM =
        Math.max(
          ...(l.rivers ?? []).flatMap((course) =>
            course.filter((p) => p.shallow).map((p) => Math.max(p.halfWidthLeft, p.halfWidthRight)),
          ),
        ) * l.cellSizeM;
      for (const leg of route.legs) {
        for (const [x, z] of leg) {
          const i = cellAt(l, x, z);
          const tx = i % l.size;
          const ty = Math.floor(i / l.size);
          const inRiver = (l.rivers ?? []).some((course) =>
            course.some(
              (p) =>
                length2(p.x - tx, p.y - ty) <= Math.max(p.halfWidthLeft, p.halfWidthRight) - 0.5,
            ),
          );
          if (inRiver) {
            expect(length2(x - fx, z - fz)).toBeLessThanOrEqual(shallowHalfM + l.cellSizeM);
          }
        }
      }
      crossed++;
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('stejná krajina = stejná trasa', () => {
    const l = landscapeOf(1, FORD);
    expect(skeletonRoute(landscapeOf(1, FORD))).toEqual(skeletonRoute(l));
  });

  it('bez přechodu řeky nejde žádný bod trasy ve vodě řeky', () => {
    for (const seed of SEEDS) {
      const l = landscapeOf(seed, NO_CROSSING);
      const route = skeletonRoute(l);
      if (route === null) continue;
      expect(route.fords).toHaveLength(0);
      for (const leg of route.legs) {
        for (const [x, z] of leg) {
          const i = cellAt(l, x, z);
          const tx = i % l.size;
          const ty = Math.floor(i / l.size);
          // Voda řeky = vodní políčko do poloviny šířky od osy nějaké řeky.
          const inRiver = (l.rivers ?? []).some((course) =>
            course.some(
              (p) =>
                length2(p.x - tx, p.y - ty) <= Math.max(p.halfWidthLeft, p.halfWidthRight) - 0.5,
            ),
          );
          expect(inRiver).toBe(false);
        }
      }
    }
  });

  it('checkSkeleton: null bez výřezu a na mapách se stezkou, kde je trasa', () => {
    expect(checkSkeleton(generateLandscapeAttempt(1, CURRENT_LAYER_VERSIONS))).toBeNull();
    const l = landscapeOf(1, THROUGH);
    expect(checkSkeleton(l)).toBeNull();
  });

  it('mezipaměť vrací tytéž prvky', () => {
    const l = landscapeOf(2, THROUGH);
    expect(skeletonFeaturesOf(l)).toBe(skeletonFeaturesOf(l));
    expect(skeletonFeaturesOf(generateLandscapeAttempt(2, CURRENT_LAYER_VERSIONS))).toBeNull();
  });
});
