import { describe, expect, it } from 'vitest';
import { createRandom } from '../../landscape/random';
import { nearestForestOf } from '../ladders';
import { MARCH_FOREST, MARCH_ROAD, marchCellCenter, type MarchGrid, type Pos } from '../march-grid';
import { dist2 } from '../orders';

/**
 * Lineární hledání – reference: průchodná buňka, která v 8 směrech sousedí s neprůchodnou buňkou
 * hustého lesa (plán 2026-11-16-dense-forest – Rozhodnutí 11); při shodě nejmenší index buňky.
 */
function linearNearest(grid: MarchGrid, from: Pos): Pos | null {
  const dense = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return false;
    const n = j * grid.width + i;
    return (grid.flags[n]! & MARCH_FOREST) !== 0 && grid.pace[n] === 0;
  };
  let best: Pos | null = null;
  let bestD = Infinity;
  for (let c = 0; c < grid.flags.length; c++) {
    if (!(grid.pace[c]! > 0)) continue;
    const i = c % grid.width;
    const j = (c - i) / grid.width;
    let door = false;
    for (let dj = -1; dj <= 1 && !door; dj++) {
      for (let di = -1; di <= 1 && !door; di++) {
        if ((di !== 0 || dj !== 0) && dense(i + di, j + dj)) door = true;
      }
    }
    if (!door) continue;
    const p = marchCellCenter(grid, c);
    const d = dist2(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Náhodná mřížka: hustý les neprůchodný (`density`), desetina lesa je průsek (průchodný). */
function randomGrid(seed: number, width: number, height: number, density: number): MarchGrid {
  const rng = createRandom(seed);
  const flags = new Uint16Array(width * height);
  const pace = new Float32Array(width * height).fill(1);
  for (let c = 0; c < flags.length; c++) {
    if (rng.next() >= density) continue;
    flags[c] = MARCH_FOREST;
    if (rng.next() < 0.9) pace[c] = 0;
    else {
      flags[c] = MARCH_FOREST | MARCH_ROAD;
      pace[c] = 1.5;
    }
  }
  return {
    width,
    height,
    originX: -37.5 + rng.next() * 10,
    originZ: 12 + rng.next() * 10,
    cellM: 4,
    pace,
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
