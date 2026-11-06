// Značky místa problému při kreslení opevnění (fortifications.md – Obvod): z `PlacementCheck.where`
// čistá funkce složí čáry, které scéna nakreslí červeně – kroužek kolem zatarasené branky a obrysy
// staveb, vody nebo jiného opevnění. Bez Babylonu, aby šla otestovat.

import type { PlacementWhere } from '@bohemia/game';

/** Čára značky – lomená čára ve světových souřadnicích (x, z). */
export type MarkLine = readonly (readonly [number, number])[];

/** Poloměr kroužku kolem zatarasené branky (m). */
export const GATE_RING_RADIUS_M = 1.4;
const RING_SEGMENTS = 16;

/** Uzavřený kroužek kolem bodu (a menší uvnitř, aby byl vidět i z dálky). */
function ring(x: number, z: number, radius: number): MarkLine {
  const points: [number, number][] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    points.push([x + Math.cos(a) * radius, z + Math.sin(a) * radius]);
  }
  return points;
}

/** Čáry značek místa problému; bez údaje žádné. */
export function problemMarks(where: PlacementWhere | undefined): MarkLine[] {
  if (!where) return [];
  const lines: MarkLine[] = [];
  for (const p of where.points ?? []) {
    lines.push(ring(p.x, p.z, GATE_RING_RADIUS_M), ring(p.x, p.z, GATE_RING_RADIUS_M / 2));
  }
  for (const polygon of where.footprints ?? []) {
    const first = polygon[0];
    if (first) lines.push([...polygon, first]);
  }
  return lines;
}
