/**
 * Euklidovská vzdálenost (v políčkách) každého políčka k nejbližšímu políčku masky – přesná
 * transformace vzdálenosti v lineárním čase (Felzenszwalb & Huttenlocher): nejdřív po sloupcích,
 * pak po řádcích nad čtverci vzdáleností.
 */
export function distanceToMask(mask: Uint8Array, size: number): Float32Array {
  const distance = new Float32Array(size * size);
  if (!mask.some((v) => v)) return distance.fill(Infinity);
  const far = 4 * size * size;
  const squared = new Float64Array(size * size);
  const line = new Float64Array(size);
  const out = new Float64Array(size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) line[y] = mask[y * size + x] ? 0 : far;
    squaredDistance1d(line, out, size);
    for (let y = 0; y < size; y++) squared[y * size + x] = out[y]!;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) line[x] = squared[y * size + x]!;
    squaredDistance1d(line, out, size);
    for (let x = 0; x < size; x++) distance[y * size + x] = Math.sqrt(out[x]!);
  }
  return distance;
}

/** 1D: out[q] = min_p (q − p)² + f[p] – dolní obálka parabol. */
function squaredDistance1d(f: Float64Array, out: Float64Array, n: number): void {
  const vertex = new Int32Array(n);
  const boundary = new Float64Array(n + 1);
  let k = 0;
  vertex[0] = 0;
  boundary[0] = -Infinity;
  boundary[1] = Infinity;
  const intersection = (q: number, p: number): number =>
    (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    // boundary[0] = −∞, takže smyčka skončí nejpozději u první paraboly.
    let s = intersection(q, vertex[k]!);
    while (s <= boundary[k]!) {
      k--;
      s = intersection(q, vertex[k]!);
    }
    k++;
    vertex[k] = q;
    boundary[k] = s;
    boundary[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (boundary[k + 1]! < q) k++;
    const p = vertex[k]!;
    out[q] = (q - p) * (q - p) + f[p]!;
  }
}

/** Největší výškový rozdíl políčka vůči 4 sousedům. */
export function maxStep(heights: Float32Array, size: number, x: number, y: number): number {
  const h = heights[y * size + x]!;
  let step = 0;
  if (x > 0) step = Math.max(step, Math.abs(h - heights[y * size + x - 1]!));
  if (x < size - 1) step = Math.max(step, Math.abs(h - heights[y * size + x + 1]!));
  if (y > 0) step = Math.max(step, Math.abs(h - heights[(y - 1) * size + x]!));
  if (y < size - 1) step = Math.max(step, Math.abs(h - heights[(y + 1) * size + x]!));
  return step;
}

export function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Minimální binární halda pro Dijkstru. */
export class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! <= this.priorities[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0]!;
    const lastItem = this.items.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.priorities[left]! < this.priorities[smallest]!)
          smallest = left;
        if (right < this.items.length && this.priorities[right]! < this.priorities[smallest]!)
          smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b]!, this.priorities[a]!];
  }
}
