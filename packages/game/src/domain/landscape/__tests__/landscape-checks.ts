// Nezávislé kontroly krajiny pro testy – záměrně nepoužívají kód domény (kromě typů),
// aby chyba v generátoru nemohla projít díky stejné chybě v kontrole.

/** Existuje 8-souvislá komponenta vody, která se dotýká dvou protilehlých okrajů? */
export function waterTouchesOppositeEdges(water: Uint8Array, size: number): boolean {
  const seen = new Uint8Array(size * size);
  for (let start = 0; start < size * size; start++) {
    if (!water[start] || seen[start]) continue;
    const edges = { left: false, right: false, top: false, bottom: false };
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % size;
      const y = Math.floor(i / size);
      if (x === 0) edges.left = true;
      if (x === size - 1) edges.right = true;
      if (y === 0) edges.top = true;
      if (y === size - 1) edges.bottom = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = ny * size + nx;
          if (water[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if ((edges.left && edges.right) || (edges.top && edges.bottom)) return true;
  }
  return false;
}

export function reliefM(heights: Float32Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return max - min;
}

/** Největší výškový rozdíl políčka vůči 4 sousedům. */
export function maxNeighbourStepM(
  heights: Float32Array,
  size: number,
  x: number,
  y: number,
): number {
  const h = heights[y * size + x]!;
  let step = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    step = Math.max(step, Math.abs(h - heights[ny * size + nx]!));
  }
  return step;
}

export function share(values: Uint8Array, code: number): number {
  let count = 0;
  for (const v of values) if (v === code) count++;
  return count / values.length;
}

/** Velikosti 4-souvislých komponent políček s hodnotou 1 v masce. */
export function componentSizes(mask: Uint8Array, size: number): number[] {
  const seen = new Uint8Array(mask.length);
  const sizes: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let count = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      count++;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    sizes.push(count);
  }
  return sizes;
}
