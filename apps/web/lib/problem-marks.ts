// Značky místa problému při kreslení opevnění (fortifications.md – Obvod): z `PlacementCheck.where`
// čistá funkce složí čáry, které scéna nakreslí červeně – kroužek kolem zatarasené branky a obrysy
// staveb, vody nebo jiného opevnění. Bez Babylonu, aby šla otestovat.

import type { PlacementWhere } from '@bohemia/game';

/** Čára značky – lomená čára ve světových souřadnicích (x, z). */
export type MarkLine = readonly (readonly [number, number])[];

/** Poloměr vnějšího kroužku kolem zatarasené branky (m) – terč je vidět i z výšky kamery. */
export const GATE_RING_RADIUS_M = 6;
/** Další kroužky terče jako podíl vnějšího poloměru (dovnitř). */
const INNER_RINGS = [0.7, 0.4, 0.15] as const;
const RING_SEGMENTS = 24;

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
    lines.push(ring(p.x, p.z, GATE_RING_RADIUS_M));
    for (const share of INNER_RINGS) lines.push(ring(p.x, p.z, GATE_RING_RADIUS_M * share));
    // kříž přes terč – střed je přesně u branky
    const r = GATE_RING_RADIUS_M;
    lines.push(
      [
        [p.x - r, p.z],
        [p.x + r, p.z],
      ],
      [
        [p.x, p.z - r],
        [p.x, p.z + r],
      ],
    );
  }
  for (const polygon of where.footprints ?? []) {
    const first = polygon[0];
    if (first) lines.push([...polygon, first]);
  }
  return lines;
}
