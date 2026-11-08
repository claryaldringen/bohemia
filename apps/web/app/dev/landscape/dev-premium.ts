import {
  PREMIUM_TYPES,
  premiumFeaturesOf,
  skeletonFeaturesOf,
  type Landscape,
  type PremiumType,
} from '@bohemia/game';
import { PREMIUM_COLORS } from '@/lib/minimap';
import type { HoldingsOverlaySector } from '@/lib/scene/holdings-overlay';
import type { Point } from '@/lib/scene/village-layout';

// Prémiové krajiny na /dev/landscape (premium-landscapes.md – Vzhled): výběr typu
// `?premium=<typ>` a vývojový překryv prvků typu – obrysy ploch, osy a stezky, kroužky míst.

/** Typ z parametru stránky; neznámý nebo prázdný = průměrná krajina. */
export function parsePremium(value: string | undefined): PremiumType | undefined {
  return (PREMIUM_TYPES as readonly string[]).includes(value ?? '')
    ? (value as PremiumType)
    : undefined;
}

/** Poloměr kroužku místa (m) – brod, přístaviště, pramen, sedlo… */
const POINT_RING_M = 9;

/**
 * Překryv prvků krajiny v barvách minimapy (`PREMIUM_COLORS`); průměrná krajina prázdný. Na mapě
 * se stezkou kostry je prvek `route` (brod, průsmyk) táž trasa – kreslí ji `skeletonOverlay`.
 */
export function premiumOverlay(l: Landscape): HoldingsOverlaySector[] {
  const features = premiumFeaturesOf(l);
  if (!features) return [];
  const skeletonRoute = !!skeletonFeaturesOf(l)?.route;
  return features.sites.flatMap((site): HoldingsOverlaySector[] => {
    // řeka je voda ve scéně – bez překryvu
    if (site.kind === 'river') return [];
    if (site.kind === 'route' && skeletonRoute) return [];
    const [r, g, b] = PREMIUM_COLORS[site.kind];
    const color = [r / 255, g / 255, b / 255] as const;
    const sectors: HoldingsOverlaySector[] = [];
    if (site.outline && site.outline.length > 2) {
      sectors.push({ cells: [], color, lines: [site.outline.map(([x, z]): Point => [x, z])] });
    }
    if (site.line && site.line.length > 1) {
      sectors.push({
        cells: [],
        color,
        lines: [site.line.map(([x, z]): Point => [x, z])],
        open: true,
      });
    }
    if (sectors.length === 0) {
      const ring = Array.from({ length: 24 }, (_, k): Point => {
        const a = (k / 24) * Math.PI * 2;
        return [site.x + Math.cos(a) * POINT_RING_M, site.z + Math.sin(a) * POINT_RING_M];
      });
      sectors.push({ cells: [], color, lines: [ring] });
    }
    return sectors;
  });
}
