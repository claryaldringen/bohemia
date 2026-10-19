import { ROAD_SWATH } from '@bohemia/game';
import type { SceneRoad } from '../village-view';

// Průseky lesem ve scéně (roads.md – Průsek lesem; Martin, 19. 10. 2026: „Tam, kde zemská stezka
// prochází lesem, ať se les vykácí.“): stromy, keře a mladé stromky v pruhu skryje InstanceHider
// podle id z jádra (`obstacles.removed`, pařezy), tady jen pás kolem osy úseků s průsekem –
// plocha korun nad ním zapadne (forest-canopy.ts) a zarůstání do něj nevstoupí (wild-growth.ts).
// Maska vymýceného lesa po políčkách (cleared-forest.ts) je na pruh 7 m moc hrubá. Čistý modul
// bez Babylonu.

/** Pás průseku – osa a poloviční šířka (m) s obdélníkem pro rychlé vyřazení. */
export interface SwathBand {
  points: readonly { x: number; z: number }[];
  halfM: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Pásy průseků – úseky pevných cest s vykáceným průsekem (`SceneRoad.swath`). */
export function swathBands(roads: readonly SceneRoad[] | undefined): SwathBand[] {
  return (roads ?? [])
    .filter((r) => r.swath && r.points.length >= 2)
    .map((r) => {
      const xs = r.points.map((p) => p.x);
      const zs = r.points.map((p) => p.z);
      return {
        points: r.points,
        halfM: ROAD_SWATH.halfM,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      };
    });
}

/** Klíč pásů – plocha korun a zarůstání se přestaví, jen když se změní. */
export function swathBandsKey(bands: readonly SwathBand[]): string {
  return bands
    .map((b) => b.points.map((p) => `${Math.round(p.x * 10)},${Math.round(p.z * 10)}`).join(' '))
    .join('|');
}

/**
 * Vzdálenost bodu od okraje nejbližšího průseku (m): uvnitř pásu záporná, dál kladná; jen do
 * `maxM` od okraje (dál Infinity).
 */
export function swathDistance(
  bands: readonly SwathBand[],
  x: number,
  z: number,
  maxM: number,
): number {
  let best = Infinity;
  for (const band of bands) {
    const reach = band.halfM + maxM;
    if (
      x < band.minX - reach ||
      x > band.maxX + reach ||
      z < band.minZ - reach ||
      z > band.maxZ + reach
    ) {
      continue;
    }
    const pts = band.points;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) - band.halfM;
      if (d < best) best = d;
    }
  }
  return best <= maxM ? best : Infinity;
}
