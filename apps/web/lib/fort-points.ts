// Úprava návrhu obvodu opevnění z bodů (fortifications.md – Obvod): posun bodu tažením, klik na
// obvod přidá bod, Ctrl + klik bod ubere (nejméně 4). Čisté funkce – scéna
// (`scene/fort-points-editor.ts`) jen předává body terénu a kreslí výsledek.

import { FORTIFICATIONS } from '@bohemia/game';

export type FortEditPoint = readonly [number, number];

/** Nejméně bodů obvodu (fortifications.md – Obvod). */
export const FORT_MIN_POINTS = 4;

function dist2(a: FortEditPoint, x: number, z: number): number {
  return (a[0] - x) * (a[0] - x) + (a[1] - z) * (a[1] - z);
}

function dist(a: FortEditPoint, b: FortEditPoint): number {
  return Math.sqrt(dist2(a, b[0], b[1]));
}

/** Index bodu nejblíž bodu (x, z) do vzdálenosti `radiusM`; žádný tak blízko – null. */
export function nearestPoint(
  points: readonly FortEditPoint[],
  x: number,
  z: number,
  radiusM: number,
): number | null {
  let best: number | null = null;
  let bestD = radiusM * radiusM;
  points.forEach((p, i) => {
    const d = dist2(p, x, z);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Nejbližší bod uzavřené lomené čáry k bodu (x, z) a vzdálenost k němu (m); `open` – čára bez
 * spojnice posledního bodu s prvním (trasa úseku jinudy s konci v branách).
 */
export function nearestOnLoop(
  loop: readonly FortEditPoint[],
  x: number,
  z: number,
  open = false,
): { point: FortEditPoint; distance: number } | null {
  let best: { point: FortEditPoint; distance: number } | null = null;
  for (let k = 0; k < loop.length - (open ? 1 : 0); k++) {
    const a = loop[k]!;
    const b = loop[(k + 1) % loop.length]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * ex + (z - a[1]) * ez) / len2)) : 0;
    const point: FortEditPoint = [a[0] + ex * t, a[1] + ez * t];
    const d = Math.sqrt(dist2(point, x, z));
    if (!best || d < best.distance) best = { point, distance: d };
  }
  return best;
}

/**
 * Přidá bod `at` na obvod – mezi ty dva sousední body, mezi kterými obvod nejméně prodlouží (bod
 * na křivce tak padne mezi body, mezi nimiž křivka vede). Nejvýš `FORTIFICATIONS.outline.maxPoints`
 * bodů – víc vrátí null. `open` – trasa s konci (bod nepřibude mezi poslední a první).
 */
export function insertPoint(
  points: readonly FortEditPoint[],
  at: FortEditPoint,
  open = false,
): FortEditPoint[] | null {
  if (points.length >= FORTIFICATIONS.outline.maxPoints || points.length === 0) return null;
  let best = 0;
  let bestDetour = Infinity;
  for (let i = 0; i < points.length - (open ? 1 : 0); i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const detour = dist(a, at) + dist(at, b) - dist(a, b);
    if (detour < bestDetour - 1e-9) {
      bestDetour = detour;
      best = i;
    }
  }
  return [...points.slice(0, best + 1), at, ...points.slice(best + 1)];
}

/** Ubere bod `index`; obvod by měl méně než `min` bodů (obvod 4) – null (bod zůstane). */
export function removePoint(
  points: readonly FortEditPoint[],
  index: number,
  min = FORT_MIN_POINTS,
): FortEditPoint[] | null {
  if (points.length <= min || index < 0 || index >= points.length) return null;
  return points.filter((_, i) => i !== index);
}

/** Posune bod `index` do `to`. */
export function movePoint(
  points: readonly FortEditPoint[],
  index: number,
  to: FortEditPoint,
): FortEditPoint[] {
  return points.map((p, i) => (i === index ? to : p));
}
