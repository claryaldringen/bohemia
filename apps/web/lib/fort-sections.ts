// Úseky opevnění na obvodu, jak je hráč vidí (fortifications.md – Rozhraní, Úseky): výpočet je
// v jádře (`section-spans.ts` – server boří přesně zvýrazněný úsek); tady jen znovu vyvezený
// a hledání bodu obvodu nejblíž kliku (čte ho scéna i panel).
export {
  FORT_GATE_HALF_M,
  alongFrom,
  fortPerimeter,
  fortSectionSpans,
  gateCenterM,
  loopDistanceM,
  segmentsAlong,
  spanAt,
  type FortPerimeter,
  type FortSectionSpan,
} from '@bohemia/game';

/** Bod obvodu nejblíž bodu `point`: poloha po obvodu (m od začátku dílu 0) a vzdálenost (m). */
export function perimeterPosition(
  shapes: readonly { lengthM: number; path: readonly (readonly [number, number])[] }[],
  point: { x: number; z: number },
): { s: number; distance: number } | null {
  let best: { s: number; distance: number } | null = null;
  let start = 0;
  for (const shape of shapes) {
    let along = 0;
    for (let i = 0; i + 1 < shape.path.length; i++) {
      const [ax, az] = shape.path[i]!;
      const [bx, bz] = shape.path[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const len = Math.sqrt(l2);
      const t =
        l2 > 0 ? Math.min(1, Math.max(0, ((point.x - ax) * dx + (point.z - az) * dz) / l2)) : 0;
      const distance = Math.hypot(point.x - (ax + dx * t), point.z - (az + dz * t));
      if (!best || distance < best.distance) best = { s: start + along + len * t, distance };
      along += len;
    }
    // začátky dílů podle jejich délek – stejně jako `fortPerimeter`
    start += shape.lengthM;
  }
  return best;
}
