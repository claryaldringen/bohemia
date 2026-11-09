import { describe, expect, it } from 'vitest';
import { createRandom } from '../../landscape/random';
import { nearestForestOf } from '../ladders';
import { MARCH_FOREST, marchCellCenter, type MarchGrid, type Pos } from '../march-grid';
import { dist2 } from '../orders';

/** Původní lineární hledání – reference (při shodě vyhrává nejmenší index buňky). */
function linearNearest(grid: MarchGrid, from: Pos): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let c = 0; c < grid.flags.length; c++) {
    if ((grid.flags[c]! & MARCH_FOREST) === 0) continue;
    const p = marchCellCenter(grid, c);
    const d = dist2(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function randomGrid(seed: number, width: number, height: number, density: number): MarchGrid {
  const rng = createRandom(seed);
  const flags = new Uint16Array(width * height);
  for (let c = 0; c < flags.length; c++) if (rng.next() < density) flags[c] = MARCH_FOREST;
  return {
    width,
    height,
    originX: -37.5 + rng.next() * 10,
    originZ: 12 + rng.next() * 10,
    cellM: 4,
    pace: new Float32Array(width * height).fill(1),
    flags,
  };
}

describe('nearestForestOf', () => {
  it('dává totéž co lineární průchod (i při shodě a mimo mřížku)', () => {
    const shapes: [number, number, number, number][] = [
      [60, 45, 0.02, 1],
      [33, 70, 0.3, 2],
      [100, 100, 0.002, 3],
      [17, 9, 0.5, 4],
      [40, 40, 0, 5],
      [1, 1, 1, 6],
    ];
    for (const [w, h, density, seed] of shapes) {
      const grid = randomGrid(seed, w, h, density);
      const rng = createRandom(seed * 7919);
      const points: Pos[] = [];
      for (let k = 0; k < 400; k++) {
        points.push({
          x: grid.originX + (rng.next() * 1.6 - 0.3) * w * grid.cellM,
          z: grid.originZ + (rng.next() * 1.6 - 0.3) * h * grid.cellM,
        });
      }
      points.push({ x: grid.originX - 5000, z: grid.originZ + 9000 });
      // přesně uprostřed mezi dvěma středy buněk a přesně v buňkách
      for (let k = 0; k < 150; k++) {
        const c = Math.floor(rng.next() * w * h);
        const a = marchCellCenter(grid, c);
        const b = marchCellCenter(grid, Math.floor(rng.next() * w * h));
        points.push(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      }
      for (const from of points) {
        expect(nearestForestOf(grid, from)).toEqual(linearNearest(grid, from));
      }
    }
  });
});
