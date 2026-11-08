import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  obstaclesOf,
  skeletonFeaturesOf,
  type Landscape,
  type LayerVersions,
} from '../../landscape';
import type { SkeletonSlice, SkeletonTrailPort } from '../../landscape/skeleton/types';
import { foundedState } from '../founding';
import { builtTrail, villageTrails } from '../trail';
import type { VillageState } from '../types';
import { freeVillageSite } from '../village-site';

// Stezka kostry světa ve vsi lidského hráče (world-skeleton.md – Mapa z kostry): hotová dálková
// cesta od založení, směr každé větve dává strana mapy.
const WINTER = dayIndexOf({ year: 500, month: 1, day: 5 });
const SKELETON: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };
const trail = (side: SkeletonTrailPort['side'], at: number): SkeletonTrailPort => ({ side, at });
const slice = (trails: SkeletonTrailPort[]): SkeletonSlice => ({ world: 1, rivers: [], trails });

/** První ze zkoušených seedů, jehož mapa má trasu stezky (ne každá projde kontrolou). */
function withRoute(s: SkeletonSlice): Landscape {
  for (let seed = 1; seed < 20; seed++) {
    const l = generateLandscapeAttempt(seed, SKELETON, undefined, s);
    if (skeletonFeaturesOf(l)?.route) return l;
  }
  throw new Error('žádná mapa se stezkou');
}

function found(l: Landscape): VillageState {
  const obstacles = obstaclesOf(l);
  const dwelling = freeVillageSite(l, obstacles)!;
  const r = foundedState(9, { landscape: l, obstacles, today: WINTER, dwelling });
  expect(r.ok).toBe(true);
  return r.ok ? r.state : null!;
}

describe('stezka kostry světa ve vsi', () => {
  it('stezka W→E: hotová stezka na obě strany, cesty s průsekem bez klád', () => {
    const s = found(withRoute(slice([trail('W', 40), trail('E', 90)])));
    const trails = villageTrails(s);
    expect(trails.map((t) => t.direction).sort()).toEqual(['E', 'W']);
    for (const t of trails) {
      expect(builtTrail(s, t.direction)).toBe(t);
      expect(t.builtDay).toBe(WINTER);
      for (const piece of t.pieces) {
        expect(s.roads!.roads.find((r) => r.id === piece.roadId)!.grade).toBe('improved');
      }
    }
  });

  it('křižovatka: tři směry', () => {
    const s = found(withRoute(slice([trail('W', 40), trail('E', 90), trail('N', 60)])));
    expect(
      villageTrails(s)
        .map((t) => t.direction)
        .sort(),
    ).toEqual(['E', 'N', 'W']);
  });

  it('konec stezky: jeden směr', () => {
    const s = found(withRoute(slice([trail('W', 60)])));
    expect(villageTrails(s).map((t) => t.direction)).toEqual(['W']);
  });

  it('suchá mapa: ves bez stezky', () => {
    const l = generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS).landscape;
    expect(villageTrails(found(l))).toEqual([]);
  });
});
