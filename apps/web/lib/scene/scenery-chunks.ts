/**
 * Ořez stromů, dekorací a impostorů podle záběru – čisté funkce bez Babylonu (scenery-culling.ts
 * je adaptér). Krajina se dělí na čtverce; instance každého modelu se seřadí po čtvercích,
 * každý čtverec má obal (AABB) svých instancí a do bufferu kamery jdou jen instance čtverců,
 * jejichž obal je v záběru. Draw cally se nemění (jeden buffer na model), kreslí se jen
 * trojúhelníky v záběru.
 */

/**
 * Čtverců na stranu krajiny: 16 × 16 po ≈ 120 m (krajina ≈ 1,9 km). Výchozí záběr (≈ 200 m
 * do hloubky) vidí 4–9 čtverců; draw cally počet čtverců neovlivní, menší čtverce jen víc
 * testů obalů při pohybu kamery (desítky µs).
 */
export const SCENERY_CHUNKS = 16;

/** Mřížka čtverců přes krajinu (čtverec kolem počátku, strana `extentM`). */
export interface ChunkGrid {
  /** Levý dolní roh (x = z) – krajina je kolem počátku. */
  originM: number;
  sizeM: number;
  /** Čtverců na stranu. */
  count: number;
}

export function chunkGrid(extentM: number, count = SCENERY_CHUNKS): ChunkGrid {
  return { originM: -extentM / 2, sizeM: extentM / count, count };
}

/** Index čtverce pod bodem (mimo krajinu nejbližší okrajový). */
export function chunkIndexOf(grid: ChunkGrid, x: number, z: number): number {
  const clamp = (v: number): number =>
    Math.min(grid.count - 1, Math.max(0, Math.floor((v - grid.originM) / grid.sizeM)));
  return clamp(z) * grid.count + clamp(x);
}

/** Instance seřazené po čtvercích: `order` = původní indexy, čtverec c má `order[offsets[c]..offsets[c+1])`. */
export interface ChunkOrder {
  order: Uint32Array;
  offsets: Uint32Array;
}

/**
 * Seřadí instance (matice po 16 číslech, poloha v [12], [14]) po čtvercích – stabilně, uvnitř
 * čtverce v původním pořadí.
 */
export function chunkOrder(matrices: Float32Array, grid: ChunkGrid): ChunkOrder {
  const count = matrices.length / 16;
  const chunks = grid.count * grid.count;
  const chunkOf = new Uint32Array(count);
  const offsets = new Uint32Array(chunks + 1);
  for (let i = 0; i < count; i++) {
    const c = chunkIndexOf(grid, matrices[i * 16 + 12]!, matrices[i * 16 + 14]!);
    chunkOf[i] = c;
    offsets[c + 1]!++;
  }
  for (let c = 0; c < chunks; c++) offsets[c + 1]! += offsets[c]!;
  const fill = offsets.slice(0, chunks);
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[fill[chunkOf[i]!]!++] = i;
  return { order, offsets };
}

/** Obal modelu v jeho souřadnicích: [minX, minY, minZ, maxX, maxY, maxZ]. */
export type LocalBounds = readonly [number, number, number, number, number, number];

/**
 * Obaly čtverců (6 čísel na čtverec: min x, y, z, max x, y, z; prázdný čtverec +∞ / −∞) – obal
 * modelu převedený maticí každé instance (střed maticí, poloosy přes absolutní hodnoty matice –
 * stejný kvádr jako z 8 převedených rohů).
 */
export function chunkBounds(
  matrices: Float32Array,
  chunk: ChunkOrder,
  local: LocalBounds,
  out: Float32Array = new Float32Array((chunk.offsets.length - 1) * 6),
): Float32Array {
  const chunks = chunk.offsets.length - 1;
  const cx = (local[0] + local[3]) / 2;
  const cy = (local[1] + local[4]) / 2;
  const cz = (local[2] + local[5]) / 2;
  const ex = (local[3] - local[0]) / 2;
  const ey = (local[4] - local[1]) / 2;
  const ez = (local[5] - local[2]) / 2;
  for (let c = 0; c < chunks; c++) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let k = chunk.offsets[c]!; k < chunk.offsets[c + 1]!; k++) {
      const m = chunk.order[k]! * 16;
      // sloupcové vektory Babylonu: x' = x·m0 + y·m4 + z·m8 + m12
      const px =
        cx * matrices[m]! + cy * matrices[m + 4]! + cz * matrices[m + 8]! + matrices[m + 12]!;
      const py =
        cx * matrices[m + 1]! + cy * matrices[m + 5]! + cz * matrices[m + 9]! + matrices[m + 13]!;
      const pz =
        cx * matrices[m + 2]! + cy * matrices[m + 6]! + cz * matrices[m + 10]! + matrices[m + 14]!;
      const qx =
        ex * Math.abs(matrices[m]!) +
        ey * Math.abs(matrices[m + 4]!) +
        ez * Math.abs(matrices[m + 8]!);
      const qy =
        ex * Math.abs(matrices[m + 1]!) +
        ey * Math.abs(matrices[m + 5]!) +
        ez * Math.abs(matrices[m + 9]!);
      const qz =
        ex * Math.abs(matrices[m + 2]!) +
        ey * Math.abs(matrices[m + 6]!) +
        ez * Math.abs(matrices[m + 10]!);
      minX = Math.min(minX, px - qx);
      minY = Math.min(minY, py - qy);
      minZ = Math.min(minZ, pz - qz);
      maxX = Math.max(maxX, px + qx);
      maxY = Math.max(maxY, py + qy);
      maxZ = Math.max(maxZ, pz + qz);
    }
    out.set([minX, minY, minZ, maxX, maxY, maxZ], c * 6);
  }
  return out;
}

/**
 * Obaly čtverců převedené maticí meshe (16 čísel jako u Babylonu – pata instance je v prostoru
 * meshe, ořez se počítá ve světě): kvádr každého čtverce maticí – střed maticí, poloosy přes
 * absolutní hodnoty matice. Prázdné čtverce zůstanou prázdné.
 */
export function transformBounds(
  bounds: Float32Array,
  matrix: ArrayLike<number>,
  out: Float32Array = new Float32Array(bounds.length),
): Float32Array {
  const m = matrix;
  for (let i = 0; i < bounds.length; i += 6) {
    if (bounds[i] === Infinity) {
      out.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], i);
      continue;
    }
    const cx = (bounds[i]! + bounds[i + 3]!) / 2;
    const cy = (bounds[i + 1]! + bounds[i + 4]!) / 2;
    const cz = (bounds[i + 2]! + bounds[i + 5]!) / 2;
    const ex = (bounds[i + 3]! - bounds[i]!) / 2;
    const ey = (bounds[i + 4]! - bounds[i + 1]!) / 2;
    const ez = (bounds[i + 5]! - bounds[i + 2]!) / 2;
    for (let a = 0; a < 3; a++) {
      const center = cx * m[a]! + cy * m[4 + a]! + cz * m[8 + a]! + m[12 + a]!;
      const extent = ex * Math.abs(m[a]!) + ey * Math.abs(m[4 + a]!) + ez * Math.abs(m[8 + a]!);
      out[i + a] = center - extent;
      out[i + 3 + a] = center + extent;
    }
  }
  return out;
}

/** Sjednotí obaly čtverců `source` do `target` (stejná mřížka). */
export function mergeBounds(target: Float32Array, source: Float32Array): void {
  for (let i = 0; i < target.length; i += 6) {
    for (let k = 0; k < 3; k++) {
      target[i + k] = Math.min(target[i + k]!, source[i + k]!);
      target[i + 3 + k] = Math.max(target[i + 3 + k]!, source[i + 3 + k]!);
    }
  }
}

/** Prázdné obaly (+∞ / −∞) pro `chunks` čtverců. */
export function emptyBounds(chunks: number): Float32Array {
  const out = new Float32Array(chunks * 6);
  for (let i = 0; i < out.length; i += 6)
    out.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], i);
  return out;
}

/**
 * Je kvádr (obal čtverce `c`) aspoň zčásti v záběru? Roviny záběru po 4 číslech (normála a d,
 * uvnitř je `n · p + d ≥ 0` jako v Babylonu) – test „kladného rohu“: kvádr je venku, když je
 * i jeho roh nejdál ve směru normály za některou rovinou. Prázdný čtverec nikdy.
 */
export function boxInFrustum(bounds: Float32Array, c: number, planes: Float64Array): boolean {
  const i = c * 6;
  const minX = bounds[i]!;
  if (minX === Infinity) return false;
  const minY = bounds[i + 1]!;
  const minZ = bounds[i + 2]!;
  const maxX = bounds[i + 3]!;
  const maxY = bounds[i + 4]!;
  const maxZ = bounds[i + 5]!;
  for (let p = 0; p < planes.length; p += 4) {
    const nx = planes[p]!;
    const ny = planes[p + 1]!;
    const nz = planes[p + 2]!;
    const d = planes[p + 3]!;
    const x = nx >= 0 ? maxX : minX;
    const y = ny >= 0 ? maxY : minY;
    const z = nz >= 0 ? maxZ : minZ;
    if (nx * x + ny * y + nz * z + d < 0) return false;
  }
  return true;
}

/**
 * Zkopíruje do `out` hodnoty (`stride` čísel na instanci) instancí z viditelných čtverců
 * (`chunks` – indexy čtverců) v pořadí po čtvercích, bez skrytých (`hidden[i]` = 1). Vrátí počet.
 */
export function compactChunks(
  source: Float32Array,
  stride: number,
  chunk: ChunkOrder,
  chunks: readonly number[],
  hidden: Uint8Array | null,
  out: Float32Array,
): number {
  let n = 0;
  for (const c of chunks) {
    for (let k = chunk.offsets[c]!; k < chunk.offsets[c + 1]!; k++) {
      const i = chunk.order[k]!;
      if (hidden?.[i]) continue;
      const from = i * stride;
      const to = n * stride;
      for (let s = 0; s < stride; s++) out[to + s] = source[from + s]!;
      n++;
    }
  }
  return n;
}
