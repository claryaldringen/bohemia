import type { Landscape } from '../types';
import { tileCenterWorld } from '../world';
import { premiumFeaturesOf } from './generate';
import type { PremiumFeatures, PremiumSite } from './types';

/**
 * Okruh kolem místa pro vesnici (m), kam prvky typu s plochou nebo osou nesmí – ves a louka
 * u ní zůstanou volné (návrh Clauda).
 */
export const PREMIUM_VILLAGE_CLEARANCE_M = 120;
/** Tolerance zaokrouhlení – prvek (i stezka) smí ležet přesně na okraji okruhu. */
const EDGE_TOLERANCE_M = 0.01;

/** Proč prémiová krajina neprošla kontrolou typu. */
export type PremiumFailure =
  /** Prvek typu v krajině chybí (nebo typ zatím nemá průchod). */
  | 'no-features'
  /** Typ nevrátil žádný prvek. */
  | 'no-sites'
  /** Prvek zasahuje do okruhu místa pro vesnici. */
  | 'village-site';

export type PremiumCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: PremiumFailure };

/**
 * Kontrola prémiového typu (část pásma srovnatelnosti – `checkBand`): prvek typu existuje
 * a nezasahuje do okruhu místa pro vesnici. Krajina bez typu projde vždy.
 */
export function checkPremium(landscape: Landscape): PremiumCheck {
  if (landscape.premium === undefined) return { ok: true };
  return checkPremiumFeatures(landscape, premiumFeaturesOf(landscape));
}

/** Kontrola daných prvků typu nad krajinou (`checkPremium` bez hledání prvků). */
export function checkPremiumFeatures(
  landscape: Landscape,
  features: PremiumFeatures | null,
): PremiumCheck {
  if (features === null) return { ok: false, reason: 'no-features' };
  if (features.sites.length === 0) return { ok: false, reason: 'no-sites' };
  const village = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  for (const site of features.sites) {
    if (siteIntrudes(site, village, PREMIUM_VILLAGE_CLEARANCE_M)) {
      return { ok: false, reason: 'village-site' };
    }
  }
  return { ok: true };
}

/**
 * Zasahuje prvek do kruhu (střed a poloměr v m světa)? Obrys je uzavřený mnohoúhelník – zasahuje,
 * když kruhem vede jeho hrana nebo když střed kruhu leží uvnitř; osa je lomená čára. Prvek jen
 * s polohou (pramen, brod bez osy) se nekontroluje. Stezka (`route`) smí vést až k okraji kruhu,
 * ne přes něj – platí pro ni totéž pravidlo jako pro ostatní prvky.
 */
export function siteIntrudes(
  site: PremiumSite,
  center: { readonly x: number; readonly z: number },
  radiusM: number,
): boolean {
  const limit = radiusM - EDGE_TOLERANCE_M;
  const limit2 = limit * limit;
  if (site.line && site.line.length > 0 && pathDistance2(site.line, center, false) < limit2) {
    return true;
  }
  if (site.outline && site.outline.length > 0) {
    if (insidePolygon(site.outline, center)) return true;
    if (pathDistance2(site.outline, center, true) < limit2) return true;
  }
  return false;
}

/** Druhá mocnina nejmenší vzdálenosti bodu od lomené čáry (uzavřené = i hrana zpět na začátek). */
function pathDistance2(
  points: readonly (readonly [number, number])[],
  c: { readonly x: number; readonly z: number },
  closed: boolean,
): number {
  if (points.length === 1) {
    const [x, z] = points[0]!;
    return (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
  }
  let best = Infinity;
  const segments = closed ? points.length : points.length - 1;
  for (let k = 0; k < segments; k++) {
    const [ax, az] = points[k]!;
    const [bx, bz] = points[(k + 1) % points.length]!;
    best = Math.min(best, segmentDistance2(ax, az, bx, bz, c.x, c.z));
  }
  return best;
}

function segmentDistance2(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0 ? 0 : Math.min(1, Math.max(0, ((cx - ax) * dx + (cz - az) * dz) / length2));
  const px = ax + t * dx - cx;
  const pz = az + t * dz - cz;
  return px * px + pz * pz;
}

/** Leží bod uvnitř mnohoúhelníku (paprsek po ose x, sudý–lichý počet průsečíků)? */
function insidePolygon(
  points: readonly (readonly [number, number])[],
  c: { readonly x: number; readonly z: number },
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > c.z !== zj > c.z && c.x < ((xj - xi) * (c.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
