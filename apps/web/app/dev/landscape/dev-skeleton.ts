import {
  riverCenterlines,
  seatSlot,
  SKELETON_PREMIUM_SLOTS,
  skeletonFeaturesOf,
  type Landscape,
  type PremiumType,
  type SkeletonRiverPort,
  type SkeletonSlice,
  type SkeletonTrailPort,
} from '@bohemia/game';
import { PREMIUM_COLORS } from '@/lib/minimap';
import type { HoldingsOverlaySector } from '@/lib/scene/holdings-overlay';
import type { PremiumFocus } from '@/lib/scene/premium-sites-layout';
import type { Point } from '@/lib/scene/village-layout';

// Mapa z kostry světa na /dev/landscape (world-skeleton.md – Mapa z kostry): výběr výřezu
// `?skeleton=<výřez>` (body řek a stezek na okraji jako v testech pásma kostry), vývojový
// překryv trasy stezky kostry a pohled kamery na soutok nebo brod.

const river = (
  side: SkeletonRiverPort['side'],
  at: number,
  widthM: number,
  flow: SkeletonRiverPort['flow'],
): SkeletonRiverPort => ({ side, at, widthM, flow });

const trail = (side: SkeletonTrailPort['side'], at: number): SkeletonTrailPort => ({ side, at });

/** Výřezy náhledu – stejné body jako `SKELETON_BAND_CASES` (testy pásma mapy z kostry). */
export const DEV_SKELETONS = {
  straight: { world: 1, rivers: [river('N', 60, 35, 'in'), river('S', 70, 35, 'out')], trails: [] },
  corner: { world: 1, rivers: [river('S', 90, 30, 'out'), river('W', 40, 30, 'in')], trails: [] },
  junction: {
    world: 1,
    rivers: [river('N', 50, 40, 'in'), river('E', 64, 25, 'in'), river('S', 80, 45, 'out')],
    trails: [],
  },
  source: { world: 1, rivers: [river('S', 64, 25, 'out')], trails: [] },
  trail: { world: 1, rivers: [], trails: [trail('E', 40), trail('W', 90)] },
  ford: {
    world: 1,
    rivers: [river('N', 60, 35, 'in'), river('S', 70, 35, 'out')],
    trails: [trail('W', 40), trail('E', 90)],
  },
  crossroads: { world: 1, rivers: [], trails: [trail('W', 40), trail('E', 90), trail('N', 60)] },
} as const satisfies Record<string, SkeletonSlice>;

export type DevSkeleton = keyof typeof DEV_SKELETONS;

export const DEV_SKELETON_NAMES: Readonly<Record<DevSkeleton, string>> = {
  straight: 'rovně',
  corner: 'ohyb',
  junction: 'soutok řek',
  source: 'pramen',
  trail: 'stezka',
  ford: 'brod',
  crossroads: 'křižovatka',
};

/** Výřez z parametru stránky; neznámý nebo prázdný = suchá mapa (bez kostry). */
export function parseSkeleton(value: string | undefined): DevSkeleton | undefined {
  return value !== undefined && Object.hasOwn(DEV_SKELETONS, value)
    ? (value as DevSkeleton)
    : undefined;
}

/**
 * Smí prémiový typ na mapu s výřezem (premium: 2)? Typ kostry jen na svém místě kostry
 * (`SKELETON_PREMIUM_SLOTS` = `seatSlot`), ostatní typy jen na suché mapě (výřez žádný).
 */
export function premiumFitsSkeleton(type: PremiumType, skeleton: DevSkeleton | undefined): boolean {
  const slot = SKELETON_PREMIUM_SLOTS[type] ?? 'dry';
  return skeleton === undefined ? slot === 'dry' : seatSlot(DEV_SKELETONS[skeleton]) === slot;
}

/** Barva trasy stezky kostry – jako stezka prémiové krajiny na minimapě. */
const ROUTE_COLOR = PREMIUM_COLORS.route.map((c) => c / 255) as [number, number, number];
/** Poloměr kroužku brodu trasy (m). */
const FORD_RING_M = 12;

/**
 * Překryv trasy stezky kostry (`skeletonFeaturesOf(l).route`): úseky od bodů na okraji k obejití
 * vsi a kroužky brodů. Mapa bez stezky prázdný. U prémií na kostře (brod, průsmyk) je prvek
 * `route` táž čára – `premiumOverlay` ji pak nekreslí.
 */
export function skeletonOverlay(l: Landscape): HoldingsOverlaySector[] {
  const route = skeletonFeaturesOf(l)?.route;
  if (!route) return [];
  const sectors: HoldingsOverlaySector[] = route.legs
    .filter((leg) => leg.length > 1)
    .map((leg) => ({
      cells: [],
      color: ROUTE_COLOR,
      lines: [leg.map(([x, z]): Point => [x, z])],
      open: true,
    }));
  for (const [fx, fz] of route.fords) {
    const ring = Array.from({ length: 24 }, (_, k): Point => {
      const a = (k / 24) * Math.PI * 2;
      return [fx + Math.cos(a) * FORD_RING_M, fz + Math.sin(a) * FORD_RING_M];
    });
    sectors.push({ cells: [], color: ROUTE_COLOR, lines: [ring] });
  }
  return sectors;
}

/** Přiblížení kamery na soutok, brod a pramen (m). */
const FOCUS_RADIUS_M = 260;

/**
 * Kam se podívat na mapu z kostry: brod trasy stezky, jinak ústí přítoku do hlavního toku
 * (soutok řek), jinak pramen řeky bez vtoku (sem ústí potok mapy); jiné výřezy (a suchá
 * mapa) null.
 */
export function skeletonFocus(l: Landscape): PremiumFocus | null {
  const ford = skeletonFeaturesOf(l)?.route?.fords[0];
  if (ford) return { x: ford[0], z: ford[1], radiusM: FOCUS_RADIUS_M };
  const lines = l.skeleton ? riverCenterlines(l) : [];
  const mouth = lines.length > 1 ? lines[1]!.points.at(-1) : undefined;
  if (mouth) return { x: mouth.x, z: mouth.z, radiusM: FOCUS_RADIUS_M };
  const source = l.skeleton?.rivers.every((p) => p.flow === 'out')
    ? lines[0]?.points[0]
    : undefined;
  return source ? { x: source.x, z: source.z, radiusM: FOCUS_RADIUS_M } : null;
}
