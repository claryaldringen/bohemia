import { length2, smoothstep } from './det-math';
import type { Landscape } from './types';
import { sampleTilesAtWorld } from './world';

/**
 * Směr slunečních paprsků, podle kterého jsou svahy osluněné (sušší tráva, borovice na suchých
 * hřbetech). Scéna svítí stejným směrem (`SUN_DIRECTION` ve webu); tady je zvlášť, protože
 * podle něj stojí překážky – po ostrém spuštění se nesmí změnit bez nové verze vrstvy.
 */
export const SUN_RAYS = { x: -0.8, y: -0.6, z: -0.35 } as const;

/** Okolí (políčka na každou stranu) pro vypouklost – hřbet vystupuje nad průměr okolí. */
const CONVEXITY_RADIUS_TILES = 2;
/**
 * Kde vystupuje skála: od sklonu ROCKY_SLOPE (m/m, bez převýšení scény) se půda na svahu
 * neudrží, na ostrém hřbetu (vypouklost ROCKY_CREST v m) je tak tenká, že skála vylézá i bez
 * sklonu. Odpovídá útesům 0 A.D., které generátor kreslí od sklonu ≈ 27° (ve scéně převýšené).
 */
const ROCKY_SLOPE = { from: 0.1, to: 0.15 };
const ROCKY_CREST = { from: 0.9, to: 1.6 };

/**
 * Tvar terénu v bodě světa (výšky bez převýšení scény). Z něj se odvozuje, kde vystupuje skála
 * a kde je tráva sušší: na prudkém svahu a na vypouklém hřbetu je půda tenká (geomorfologické
 * modely tloušťky půdy, v 0 A.D. útesy podle sklonu), osluněný svah vysychá.
 */
export interface Relief {
  /** Sklon (m/m). */
  slopeAt(worldX: number, worldZ: number): number;
  /** Sklon ve směru ke slunci (m/m): kladný = svah ke slunci, záporný = odvrácený. */
  sunwardAt(worldX: number, worldZ: number): number;
  /** Výška nad průměrem okolí (m): kladná na hřbetech a vrcholech, záporná ve sníženinách. */
  convexityAt(worldX: number, worldZ: number): number;
  /** Jak moc tu vystupuje skála (0–1) – podle sklonu a vypouklosti. */
  rockinessAt(worldX: number, worldZ: number): number;
}

export function buildRelief(l: Landscape): Relief {
  const { size, cellSizeM } = l;
  const slope = new Float32Array(size * size);
  const sunward = new Float32Array(size * size);
  const convexity = new Float32Array(size * size);
  // Vodorovný směr ke slunci (opačný ke směru paprsků).
  const sunLength = length2(SUN_RAYS.x, SUN_RAYS.z);
  const sunX = -SUN_RAYS.x / sunLength;
  const sunZ = -SUN_RAYS.z / sunLength;
  const clamp = (v: number): number => Math.min(size - 1, Math.max(0, v));
  const h = (x: number, y: number): number => l.heights[clamp(y) * size + clamp(x)]!;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = (h(x + 1, y) - h(x - 1, y)) / ((clamp(x + 1) - clamp(x - 1)) * cellSizeM);
      const gz = (h(x, y + 1) - h(x, y - 1)) / ((clamp(y + 1) - clamp(y - 1)) * cellSizeM);
      slope[i] = length2(gx, gz);
      // Svah klesá ve směru −gradientu; ke slunci, když ten míří ke slunci.
      sunward[i] = -(gx * sunX + gz * sunZ);
      let sum = 0;
      let count = 0;
      for (let dy = -CONVEXITY_RADIUS_TILES; dy <= CONVEXITY_RADIUS_TILES; dy++) {
        for (let dx = -CONVEXITY_RADIUS_TILES; dx <= CONVEXITY_RADIUS_TILES; dx++) {
          sum += h(x + dx, y + dy);
          count++;
        }
      }
      convexity[i] = h(x, y) - sum / count;
    }
  }
  const slopeAt = (worldX: number, worldZ: number): number =>
    sampleTilesAtWorld(l, slope, worldX, worldZ);
  const convexityAt = (worldX: number, worldZ: number): number =>
    sampleTilesAtWorld(l, convexity, worldX, worldZ);
  return {
    slopeAt,
    sunwardAt: (worldX, worldZ) => sampleTilesAtWorld(l, sunward, worldX, worldZ),
    convexityAt,
    rockinessAt: (worldX, worldZ) =>
      Math.min(
        1,
        smoothstep(ROCKY_SLOPE.from, ROCKY_SLOPE.to, slopeAt(worldX, worldZ)) +
          smoothstep(ROCKY_CREST.from, ROCKY_CREST.to, convexityAt(worldX, worldZ)),
      ),
  };
}
