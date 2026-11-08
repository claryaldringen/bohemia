import type { Fortification } from './types';

// Úseky opevnění pro hráče (demolition.md – Opevnění; Martin 8. 11. 2026: „Hradba bude fungovat
// podobně jako cesta – bude rozdělena na jednotlivé úseky mezi bránami.“). Úsek = díl s branou
// a díly po směru hodin až před další díl s branou (návrh Clauda); obvod bez brány i s jedinou
// branou je jeden úsek. Díly po ≈ 15 m (`FortSegment`) zůstávají jednotkou stavby, stáří
// a průlomu – úsek se z nich vždy znovu spočítá, neukládá se, takže nová brána úsek rozdělí.

/** Úsek opevnění mezi branami – indexy dílů v pořadí po směru hodin. */
export interface FortSection {
  /** Díly úseku; první je díl s branou (u obvodu bez brány díl 0). */
  segments: readonly number[];
  /** Díl s branou na začátku úseku; obvod bez brány null. */
  gateSegment: number | null;
}

/**
 * Úseky opevnění mezi branami v pořadí bran po obvodu (`gates` seřazené podle dílu). Obvod bez
 * brány je jeden úsek od dílu 0, s jednou branou jeden úsek od dílu s branou.
 */
export function fortSections(fort: Pick<Fortification, 'segments' | 'gates'>): FortSection[] {
  const n = fort.segments.length;
  if (n === 0) return [];
  const starts = [...new Set(fort.gates.map((g) => g.segment))]
    .filter((i) => i >= 0 && i < n)
    .sort((a, b) => a - b);
  if (starts.length === 0) {
    return [{ segments: Array.from({ length: n }, (_, k) => k), gateSegment: null }];
  }
  return starts.map((start, k) => {
    const next = starts[(k + 1) % starts.length]!;
    // s jedinou branou je další brána ta samá – úsek obejde celý obvod
    const length = next > start ? next - start : next + n - start;
    return {
      segments: Array.from({ length }, (_, j) => (start + j) % n),
      gateSegment: start,
    };
  });
}

/** Úsek, ve kterém leží díl `segment`; neznámý díl null. */
export function sectionOf(
  fort: Pick<Fortification, 'segments' | 'gates'>,
  segment: number,
): FortSection | null {
  return fortSections(fort).find((s) => s.segments.includes(segment)) ?? null;
}
