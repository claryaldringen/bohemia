import { describe, expect, it } from 'vitest';
import {
  cellSkeletonVersions,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  PREMIUM_LAYER_VERSION,
  riverCenterlines,
  skeletonFeaturesOf,
  type Landscape,
} from '@bohemia/game';
import { premiumOverlay } from '../dev-premium';
import {
  DEV_SKELETONS,
  parseSkeleton,
  premiumFitsSkeleton,
  skeletonFocus,
  skeletonOverlay,
  type DevSkeleton,
} from '../dev-skeleton';

// Mapa z kostry světa na /dev/landscape (world-skeleton.md – Mapa z kostry): výběr výřezu,
// překryv trasy stezky kostry a pohled na soutok nebo brod.

const cache = new Map<string, Landscape>();
function landscapeOf(name: DevSkeleton, premium?: 'ford-hill'): Landscape {
  const key = `${name}:${premium ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const slice = DEV_SKELETONS[name];
  const versions = cellSkeletonVersions(slice, CURRENT_LAYER_VERSIONS);
  const l = generateLandscape(
    1,
    premium ? { ...versions, premium: PREMIUM_LAYER_VERSION } : versions,
    premium,
    slice,
  );
  cache.set(key, l);
  return l;
}

describe('mapa z kostry na /dev/landscape', () => {
  it('?skeleton= přijme jen výřez náhledu, jinak suchá mapa', () => {
    for (const name of Object.keys(DEV_SKELETONS)) expect(parseSkeleton(name)).toBe(name);
    expect(parseSkeleton(undefined)).toBeUndefined();
    expect(parseSkeleton('')).toBeUndefined();
    expect(parseSkeleton('toString')).toBeUndefined();
    expect(parseSkeleton('řeka')).toBeUndefined();
  });

  it('prémie s kostrou jen na svém místě kostry, ostatní jen na suché mapě', () => {
    expect(premiumFitsSkeleton('navigable-river', 'straight')).toBe(true);
    expect(premiumFitsSkeleton('confluence', 'straight')).toBe(true);
    expect(premiumFitsSkeleton('ford-hill', 'ford')).toBe(true);
    expect(premiumFitsSkeleton('mountain-pass', 'trail')).toBe(true);
    expect(premiumFitsSkeleton('ford-hill', 'straight')).toBe(false);
    expect(premiumFitsSkeleton('navigable-river', 'junction')).toBe(false);
    expect(premiumFitsSkeleton('fertile', 'straight')).toBe(false);
    expect(premiumFitsSkeleton('fertile', undefined)).toBe(true);
    expect(premiumFitsSkeleton('ford-hill', undefined)).toBe(false);
  });

  it('překryv stezky kostry: úseky trasy jako otevřené čáry, brod kroužkem; bez stezky nic', () => {
    expect(skeletonOverlay(generateLandscape(1))).toEqual([]);
    expect(skeletonOverlay(landscapeOf('straight'))).toEqual([]);
    const ford = landscapeOf('ford');
    const route = skeletonFeaturesOf(ford)!.route!;
    const overlay = skeletonOverlay(ford);
    const lines = overlay.filter((s) => s.open);
    expect(lines.length).toBe(route.legs.length);
    expect(lines.map((s) => s.lines![0]!.length)).toEqual(route.legs.map((leg) => leg.length));
    expect(overlay.length - lines.length).toBe(route.fords.length);
    expect(route.fords.length).toBeGreaterThan(0);
  });

  it('prémie brodu na kostře: stezku kreslí jen překryv kostry, ne podruhé prvek route', () => {
    const l = landscapeOf('ford', 'ford-hill');
    expect(skeletonFeaturesOf(l)?.route).toBeTruthy();
    const premium = premiumOverlay(l);
    // jediná otevřená čára prvků prémie by byla stezka – na kostře ji nese skeletonOverlay
    expect(premium.some((s) => s.open)).toBe(false);
    expect(skeletonOverlay(l).some((s) => s.open)).toBe(true);
  });

  it('pohled: brod trasy, ústí přítoku do hlavního toku, pramen řeky, jinak nic', () => {
    const ford = landscapeOf('ford');
    const [fx, fz] = skeletonFeaturesOf(ford)!.route!.fords[0]!;
    expect(skeletonFocus(ford)).toMatchObject({ x: fx, z: fz });
    const junction = landscapeOf('junction');
    const mouth = riverCenterlines(junction)[1]!.points.at(-1)!;
    expect(skeletonFocus(junction)).toMatchObject({ x: mouth.x, z: mouth.z });
    const source = landscapeOf('source');
    const head = riverCenterlines(source)[0]!.points[0]!;
    expect(skeletonFocus(source)).toMatchObject({ x: head.x, z: head.z });
    expect(skeletonFocus(landscapeOf('straight'))).toBeNull();
    expect(skeletonFocus(landscapeOf('trail'))).toBeNull();
    expect(skeletonFocus(generateLandscape(1))).toBeNull();
  });
});
