import { MinHeap } from './grid';

/**
 * Výška políčka nad dnem nejbližšího vodního políčka (m) – „výška nad potokem“. Nízká v nivě
 * (rovina u potoka, kam sahá velká voda a nanáší naplaveniny), vysoká na svazích údolí a na
 * vršcích. Nejbližší vodní políčko se hledá po mřížce (Dijkstra, 8 směrů); voda má 0.
 */
export function heightAboveStream(
  water: Uint8Array,
  heights: Float32Array,
  size: number,
): Float32Array {
  const distance = new Float64Array(size * size).fill(Infinity);
  const bed = new Float32Array(size * size);
  const heap = new MinHeap();
  for (let i = 0; i < water.length; i++) {
    if (!water[i]) continue;
    distance[i] = 0;
    bed[i] = heights[i]!;
    heap.push(i, 0);
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const x = i % size;
    const y = Math.floor(i / size);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        const d = distance[i]! + (dx && dy ? Math.SQRT2 : 1);
        if (d < distance[n]!) {
          distance[n] = d;
          bed[n] = bed[i]!;
          heap.push(n, d);
        }
      }
    }
  }
  const above = new Float32Array(size * size);
  for (let i = 0; i < above.length; i++) above[i] = water[i] ? 0 : heights[i]! - bed[i]!;
  return above;
}

/**
 * Jak moc je políčko nivou (0–1): nízko nad potokem a nedaleko od vody. Sdílí ho vegetace
 * (lužní louky) i úrodnost (naplaveniny) od verze 2.
 */
export function alluvialness(waterDistance: number, aboveStream: number): number {
  const low = clamp01(1 - (aboveStream - ALLUVIAL_FULL_M) / ALLUVIAL_FADE_M);
  const near = clamp01(1 - (waterDistance - ALLUVIAL_FULL_CELLS) / ALLUVIAL_FADE_CELLS);
  return low * near;
}

/** Niva naplno do této výšky nad dnem potoka (m) a vzdálenosti od vody (políčka)… */
const ALLUVIAL_FULL_M = 1.5;
const ALLUVIAL_FULL_CELLS = 3;
/** …a plynule zanikne o tolik výš (m) a dál (políčka). */
const ALLUVIAL_FADE_M = 2.5;
const ALLUVIAL_FADE_CELLS = 13;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
