import { length2 } from './det-math';
import { POOL_HALF_WIDTH, SHALLOW_LENGTH } from './stream';
import type { Promontory, StreamPoint } from './types';

// Brod na každé mapě s potokem (landscape.md – Brod na každé mapě s potokem, schváleno
// 14. 11. 2026): brod sítě pěšin je mělčina (`StreamPoint.shallow`), chodec i vůz přejdou potok
// jen jí (paths.md – Odhad vzdáleností, Jen brodem). Potok bez mělčiny – smyčka přirozené pevnosti
// nebo soutok ji vzaly – dostane jednu: deterministicky z hotové osy, bez losu.

/**
 * Smyčka a šíje ostrožny zůstanou bez brodu (jako smyčka zaříznutého meandru v generátoru):
 * bod osy mělčiny leží aspoň tolik políček od obrysu každé ostrožny (návrh Clauda).
 */
export const FORD_PROMONTORY_GAP = 4;

/** Čtverec vzdálenosti bodu p od úsečky a–b (políčka). */
function segmentDistance2(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2)) : 0;
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  return dx * dx + dy * dy;
}

/** Bod osy leží blíž než FORD_PROMONTORY_GAP od obrysu některé ostrožny. */
function nearPromontory(p: StreamPoint, promontories: readonly Promontory[]): boolean {
  const gap2 = FORD_PROMONTORY_GAP * FORD_PROMONTORY_GAP;
  for (const { outline } of promontories) {
    for (let k = 0; k < outline.length; k++) {
      const a = outline[k]!;
      const b = outline[(k + 1) % outline.length]!;
      if (segmentDistance2(p, a, b) < gap2) return true;
    }
  }
  return false;
}

/**
 * Potok s aspoň jednou mělčinou (a krajina bez potoka) zůstane – tentýž objekt. Potok bez mělčiny
 * dostane mělčinu kolem bodu osy nejblíž středu mapy (při shodě dřívější po proudu): body do
 * SHALLOW_LENGTH políček podél toku, jako mělčina generátoru, jen bez rozšíření koryta (šířky,
 * voda a terén zůstanou). Brodem není tůň s náběhem (průměrná poloviční šířka od POOL_HALF_WIDTH)
 * ani okolí ostrožny (`FORD_PROMONTORY_GAP`). Nový seznam, vstup se nemění.
 */
export function withStreamFord(
  stream: readonly StreamPoint[],
  size: number,
  promontories: readonly Promontory[] = [],
): readonly StreamPoint[] {
  if (stream.length < 2 || stream.some((p) => p.shallow)) return stream;
  const allowed = stream.map(
    (p) =>
      (p.halfWidthLeft + p.halfWidthRight) / 2 < POOL_HALF_WIDTH &&
      !nearPromontory(p, promontories),
  );
  const middle = (size - 1) / 2;
  let center = -1;
  let best = Infinity;
  stream.forEach((p, k) => {
    if (!allowed[k]) return;
    const d = (p.x - middle) * (p.x - middle) + (p.y - middle) * (p.y - middle);
    if (d < best) {
      best = d;
      center = k;
    }
  });
  if (center < 0) return stream;
  const along = [0];
  for (let k = 1; k < stream.length; k++) {
    const a = stream[k - 1]!;
    const b = stream[k]!;
    along.push(along[k - 1]! + length2(b.x - a.x, b.y - a.y));
  }
  const at = along[center]!;
  return stream.map((p, k) =>
    allowed[k] && Math.abs(along[k]! - at) <= SHALLOW_LENGTH ? { ...p, shallow: true } : p,
  );
}
