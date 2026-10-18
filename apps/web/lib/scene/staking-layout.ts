// Vytyčení staveniště bez Babylonu: kde stojí kolíky a kudy vede napnutý provázek. Společné
// pro obydlí, pohřebiště a sad – od chvíle, kdy hráč stavbu zadá (průběh 0 %), je podle
// kolíků a provázku vidět, kde bude stát. Souřadnice světa scény v metrech (x, z).
import type { Point } from './village-layout';

/** Nejvyšší rozestup kolíků podél obrysu (m); delší úsek se rozdělí rovnoměrně. */
export const PEG_SPACING_M = 3;
/** Kolíky blíž než tohle (m) splynou v jeden (rohy sousedních čtverců, zlomy obrysu). */
const PEG_MERGE_M = 0.4;

/** Body čáry s kolíky: všechny zlomy a mezi nimi nejvýš každých `spacing` metrů. */
export function stakingLine(line: readonly Point[], spacing = PEG_SPACING_M): Point[] {
  const out: Point[] = [];
  line.forEach((b, k) => {
    const a = line[k - 1];
    if (!a) {
      out.push(b);
      return;
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return out;
}

/** Uzavřený obrys jako čára (přidá první bod nakonec). */
export function closedLine(loop: readonly Point[]): Point[] {
  return loop.length > 0 ? [...loop, loop[0]!] : [];
}

/** Kolíky podél čar (bez duplicit v rozích, kde se čáry potkají). */
export function stakingPegs(
  lines: readonly (readonly Point[])[],
  spacing = PEG_SPACING_M,
): Point[] {
  const pegs: Point[] = [];
  for (const line of lines) {
    for (const p of stakingLine(line, spacing)) {
      if (!pegs.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < PEG_MERGE_M)) pegs.push(p);
    }
  }
  return pegs;
}
