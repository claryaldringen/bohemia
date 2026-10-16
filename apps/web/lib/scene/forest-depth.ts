import { SURFACE_CODES, type Landscape } from '@bohemia/game';

/**
 * Hloubka lesa po políčkách: 0 mimo les, 1 krajní řada (sousedí s nelesním políčkem), 2 druhá
 * řada… (4-souvislá vzdálenost). Okraj mapy se bere jako les – na hranici mapy nevzniká okraj.
 */
export function forestDepth(l: Landscape): Uint16Array {
  const { size } = l;
  const depth = new Uint16Array(size * size);
  const queue: number[] = [];
  for (let i = 0; i < depth.length; i++) {
    if (l.surface[i] === SURFACE_CODES.forest) depth[i] = 0xffff;
    else queue.push(i);
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
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
      if (depth[n]! <= depth[i]! + 1) continue;
      depth[n] = depth[i]! + 1;
      queue.push(n);
    }
  }
  return depth;
}
