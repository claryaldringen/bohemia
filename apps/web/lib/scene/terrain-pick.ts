/**
 * Pick terénu po výškové síti (bez Babylonu): paprsek projde jen políčka sítě pod sebou (DDA)
 * a testuje jejich dva trojúhelníky – stejné trojúhelníky a stejný test jako `scene.pick` na
 * síti terénu (terrain-mesh.ts), jen místo všech 516 tisíc trojúhelníků pár set. Výsledek je
 * stejný bod (test proti Babylonu v `terrain-pick.test.ts`), ≈ 1,6 ms → setiny ms.
 */

/** Paprsek ve světových souřadnicích (jako Babylon `Ray`: směr jednotkový, délka do far). */
export interface TerrainRay {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  /** Nejdelší vzdálenost zásahu (Babylon: far rovina kamery); bez ní neomezeně. */
  length?: number;
}

export interface TerrainHit {
  x: number;
  y: number;
  z: number;
  /** Vzdálenost od počátku paprsku (v délkách směru). */
  distance: number;
}

export type TerrainPicker = (ray: TerrainRay) => TerrainHit | null;

/** Tolerance barycentrických souřadnic – Babylon `Ray.epsilon` (výchozí `Epsilon`). */
const BARYCENTRIC_EPSILON = 0.001;
/** Rezerva výšky políčka (m) při přeskakování políček, kudy paprsek jde nad nebo pod terénem. */
const HEIGHT_MARGIN = 0.01;

/**
 * Picker sítě terénu: `positions` jsou vrcholy (x, y, z) mřížky `n` × `n` po řádcích (z), síť
 * dělí čtverec (i, j) na trojúhelníky (a, b, c) a (b, d, c) – a = (i, j), b = (i + 1, j),
 * c = (i, j + 1), d = (i + 1, j + 1) – přesně jako `createTerrainMesh`.
 */
export function createTerrainPicker(positions: Float32Array, n: number): TerrainPicker {
  const cells = n - 1;
  const x0 = positions[0]!;
  const z0 = positions[2]!;
  const stepX = positions[3]! - x0;
  const stepZ = positions[n * 3 + 2]! - z0;
  const x1 = positions[(n - 1) * 3]!;
  const z1 = positions[(n * n - 1) * 3 + 2]!;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let v = 1; v < positions.length; v += 3) {
    const y = positions[v]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Möller–Trumbore jako Babylon `Ray.intersectsTriangle` (stejné pořadí operací a tolerance)
  const triangle = (
    ray: TerrainRay,
    length: number,
    i0: number,
    i1: number,
    i2: number,
  ): number => {
    const { origin: o, direction: d } = ray;
    const ax = positions[i0 * 3]!;
    const ay = positions[i0 * 3 + 1]!;
    const az = positions[i0 * 3 + 2]!;
    const e1x = positions[i1 * 3]! - ax;
    const e1y = positions[i1 * 3 + 1]! - ay;
    const e1z = positions[i1 * 3 + 2]! - az;
    const e2x = positions[i2 * 3]! - ax;
    const e2y = positions[i2 * 3 + 1]! - ay;
    const e2z = positions[i2 * 3 + 2]! - az;
    const px = d.y * e2z - d.z * e2y;
    const py = d.z * e2x - d.x * e2z;
    const pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det === 0) return Infinity;
    const invdet = 1 / det;
    const tx = o.x - ax;
    const ty = o.y - ay;
    const tz = o.z - az;
    const bv = (tx * px + ty * py + tz * pz) * invdet;
    if (bv < -BARYCENTRIC_EPSILON || bv > 1 + BARYCENTRIC_EPSILON) return Infinity;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const bw = (d.x * qx + d.y * qy + d.z * qz) * invdet;
    if (bw < -BARYCENTRIC_EPSILON || bv + bw > 1 + BARYCENTRIC_EPSILON) return Infinity;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * invdet;
    if (distance > length || distance < 0) return Infinity;
    return distance;
  };

  /** Nejbližší zásah dvou trojúhelníků políčka (i, j), nebo Infinity. */
  const cell = (ray: TerrainRay, length: number, i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= cells || j >= cells) return Infinity;
    const a = j * n + i;
    const b = a + 1;
    const c = a + n;
    const d = c + 1;
    return Math.min(triangle(ray, length, a, b, c), triangle(ray, length, b, d, c));
  };

  return (ray) => {
    const { origin: o, direction: d } = ray;
    const length = ray.length ?? Infinity;
    // vstup a výstup paprsku z kvádru terénu (výšky od nejnižšího po nejvyšší vrchol)
    let tEnter = 0;
    let tExit = length;
    for (const [from, dir, lo, hi] of [
      [o.x, d.x, x0, x1],
      [o.y, d.y, minY - HEIGHT_MARGIN, maxY + HEIGHT_MARGIN],
      [o.z, d.z, z0, z1],
    ] as const) {
      if (dir === 0) {
        if (from < lo || from > hi) return null;
        continue;
      }
      const ta = (lo - from) / dir;
      const tb = (hi - from) / dir;
      tEnter = Math.max(tEnter, Math.min(ta, tb));
      tExit = Math.min(tExit, Math.max(ta, tb));
    }
    if (tEnter > tExit) return null;

    // DDA po políčkách sítě od vstupu do kvádru
    const startX = o.x + d.x * tEnter;
    const startZ = o.z + d.z * tEnter;
    let i = Math.min(cells - 1, Math.max(0, Math.floor((startX - x0) / stepX)));
    let j = Math.min(cells - 1, Math.max(0, Math.floor((startZ - z0) / stepZ)));
    const stepI = d.x > 0 ? 1 : d.x < 0 ? -1 : 0;
    const stepJ = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
    const deltaX = stepI !== 0 ? Math.abs(stepX / d.x) : Infinity;
    const deltaZ = stepJ !== 0 ? Math.abs(stepZ / d.z) : Infinity;
    let nextX = stepI !== 0 ? (x0 + (i + (stepI > 0 ? 1 : 0)) * stepX - o.x) / d.x : Infinity;
    let nextZ = stepJ !== 0 ? (z0 + (j + (stepJ > 0 ? 1 : 0)) * stepZ - o.z) / d.z : Infinity;
    let t = tEnter;
    while (i >= 0 && j >= 0 && i < cells && j < cells && t <= tExit) {
      const leave = Math.min(nextX, nextZ, tExit);
      // paprsek nad nejvyšším nebo pod nejnižším vrcholem políčka trojúhelníky netrefí
      const ya = o.y + d.y * t;
      const yb = o.y + d.y * leave;
      const a = j * n + i;
      const h00 = positions[a * 3 + 1]!;
      const h10 = positions[(a + 1) * 3 + 1]!;
      const h01 = positions[(a + n) * 3 + 1]!;
      const h11 = positions[(a + n + 1) * 3 + 1]!;
      const low = Math.min(h00, h10, h01, h11) - HEIGHT_MARGIN;
      const high = Math.max(h00, h10, h01, h11) + HEIGHT_MARGIN;
      if (Math.max(ya, yb) >= low && Math.min(ya, yb) <= high) {
        let best = cell(ray, length, i, j);
        if (best < Infinity) {
          // Na hraně políčka může (zaokrouhlením a tolerancí) trefit i soused – jako Babylon
          // vezme nejbližší ze všech trojúhelníků.
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              if (di !== 0 || dj !== 0) best = Math.min(best, cell(ray, length, i + di, j + dj));
            }
          }
          return {
            x: o.x + d.x * best,
            y: o.y + d.y * best,
            z: o.z + d.z * best,
            distance: best,
          };
        }
      }
      if (nextX < nextZ) {
        i += stepI;
        t = nextX;
        nextX += deltaX;
      } else {
        j += stepJ;
        t = nextZ;
        nextZ += deltaZ;
      }
      if (stepI === 0 && stepJ === 0) break;
    }
    return null;
  };
}
