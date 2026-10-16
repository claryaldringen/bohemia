/** Euklidovská vzdálenost (v políčkách) každého políčka k nejbližšímu políčku masky. */
export function distanceToMask(mask: Uint8Array, size: number): Float32Array {
  const targets: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) targets.push(i % size, Math.floor(i / size));
  const distance = new Float32Array(size * size).fill(Infinity);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let best = Infinity;
      for (let t = 0; t < targets.length; t += 2) {
        const dx = targets[t]! - x;
        const dy = targets[t + 1]! - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      distance[y * size + x] = Math.sqrt(best);
    }
  }
  return distance;
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
