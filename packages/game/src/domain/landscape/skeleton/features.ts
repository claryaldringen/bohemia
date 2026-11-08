import { transferPrecision } from '../quantize';
import type { Landscape } from '../types';
import { skeletonRoute, type SkeletonRoute } from './route';

// Prvky krajiny z kostry světa (world-skeleton.md – Mapa z kostry). Hledají se v hotové krajině
// na serveru i v prohlížeči s přesností prohlížeče, proto jen det-math; výsledek se pamatuje
// u krajiny (jako `premiumFeaturesOf`).

export interface SkeletonFeatures {
  /** Trasa stezky; null = mapa bez stezky (nebo trasa nevede). */
  readonly route: SkeletonRoute | null;
  /** Víc než dva body stezky – větve se potkají u vsi. */
  readonly crossroads: boolean;
  /** Jeden bod stezky – stezka končí u vsi. */
  readonly trailEnd: boolean;
}

const cache = new WeakMap<Landscape, SkeletonFeatures | null>();

/** Prvky kostry krajiny; null = mapa bez výřezu (suchá). */
export function skeletonFeaturesOf(l: Landscape): SkeletonFeatures | null {
  if (l.skeleton === undefined) return null;
  const cached = cache.get(l);
  if (cached !== undefined) return cached;
  const trails = l.skeleton.trails.length;
  const features: SkeletonFeatures = {
    route: skeletonRoute(transferPrecision(l)),
    crossroads: trails > 2,
    trailEnd: trails === 1,
  };
  cache.set(l, features);
  return features;
}
