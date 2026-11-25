import { LANDSCAPE_SIZE } from '../../landscape/types';
import type { MapSide, SkeletonSlice } from '../../landscape/skeleton/types';

// Místa kostry odvozená z výřezu (world-skeleton.md – Místa kostry a Hustota a stejné podmínky).

/** Místo sídla podle kostry – jen tyto čtyři smějí dostat prémii; ostatní (pramen, soutok…) ne. */
export type SeatSlot = 'dry' | 'river' | 'ford' | 'trail';

const SIDE_OFFSET: Readonly<Record<MapSide, number>> = {
  S: 0,
  E: LANDSCAPE_SIZE,
  N: 2 * LANDSCAPE_SIZE,
  W: 3 * LANDSCAPE_SIZE,
};

/** Poloha bodu na obvodu 0–511: S od západu, E od jihu, N od východu, W od severu. */
function perimeterPosition(side: MapSide, at: number): number {
  const reversed = side === 'N' || side === 'W';
  return SIDE_OFFSET[side] + (reversed ? LANDSCAPE_SIZE - 1 - at : at);
}

/**
 * Kolikrát musí stezka mapy přejít řeku: body řek dělí obvod na oblouky, přechodů je o jedna
 * míň, než je oblouků s bodem stezky (0 bez řeky nebo bez stezky).
 */
export function riverCrossings(slice: SkeletonSlice): number {
  const rivers = slice.rivers.map((p) => perimeterPosition(p.side, p.at));
  if (rivers.length === 0) return 0;
  const arcs = new Set<number>();
  for (const trail of slice.trails) {
    const pos = perimeterPosition(trail.side, trail.at);
    const before = rivers.filter((r) => r < pos).length;
    arcs.add(before % rivers.length);
  }
  return Math.max(0, arcs.size - 1);
}

/** Suchá mapa – bez řeky i stezky. */
export function isDry(slice: SkeletonSlice | null): boolean {
  return slice === null || (slice.rivers.length === 0 && slice.trails.length === 0);
}

/**
 * Mapou vede stezka a žádná řeka – průchod, křižovatka i konec stezky. Ves syna sem smí jako na
 * suchou mapu (markets.md – Rozhodnutí plánu 4, bod 11; Martin 22. 11. 2026: „ok“).
 */
export function isTrailOnly(slice: SkeletonSlice | null): boolean {
  return slice !== null && slice.trails.length > 0 && slice.rivers.length === 0;
}

/** Místo sídla; null = ostatní místa (pramen, soutok řek, křižovatka, konec stezky, víc brodů…). */
export function seatSlot(slice: SkeletonSlice | null): SeatSlot | null {
  if (slice === null || isDry(slice)) return 'dry';
  const inflows = slice.rivers.filter((p) => p.flow === 'in').length;
  const outflows = slice.rivers.length - inflows;
  const singleRiver = inflows === 1 && outflows === 1;
  const trails = slice.trails.length;
  if (singleRiver && trails === 0) return 'river';
  if (slice.rivers.length === 0 && trails === 2) return 'trail';
  if (singleRiver && trails === 2 && riverCrossings(slice) === 1) return 'ford';
  return null;
}
