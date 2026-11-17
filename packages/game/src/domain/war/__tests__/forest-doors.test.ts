import { describe, expect, it } from 'vitest';
import { nearestForestDoor, nearestReachableForest } from '../forest-doors';
import { createRandom } from '../../landscape/random';
import { reachableCells } from '../march-search';
import { nearestForestOf } from '../ladders';
import {
  MARCH_BUILDING,
  MARCH_FOREST,
  marchCellAt,
  marchCellCenter,
  type MarchGrid,
} from '../march-grid';
import { inSight } from '../sight';

// Dveře hustého lesa (plán 2026-11-16-dense-forest – Rozhodnutí 10; Martin 16. 11. 2026).

const W = 40;
const H = 20;

/** Louka W × H po 2,5 m; `dense(i, j)` – neprůchodný hustý les, `wet(i, j)` – neprůchodná voda. */
function gridOf(
  dense: (i: number, j: number) => boolean,
  wet: (i: number, j: number) => boolean = () => false,
): MarchGrid {
  const pace = new Float32Array(W * H).fill(1);
  const flags = new Uint16Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (dense(i, j)) {
        pace[c] = 0;
        flags[c] = MARCH_FOREST;
      } else if (wet(i, j)) pace[c] = 0;
    }
  }
  return { width: W, height: H, originX: 0, originZ: 0, cellM: 2.5, pace, flags };
}

describe('nearestForestDoor', () => {
  it('blok hustého lesa → průchodná buňka u jeho okraje, nejbližší', () => {
    const grid = gridOf((i) => i >= 30);
    const door = nearestForestDoor(grid, { x: 10, z: 10 })!;
    const c = marchCellAt(grid, door);
    expect(grid.pace[c]).toBeGreaterThan(0);
    expect(door.x).toBe(marchCellCenter(grid, 29 + 8 * W).x);
    // sousedí s neprůchodnou buňkou lesa
    const i = c % W;
    expect((grid.flags[c + 1]! & MARCH_FOREST) !== 0 && i === 29).toBe(true);
    // nejbližší: z dolního kraje je to buňka v téže řadě
    const low = nearestForestDoor(grid, { x: 10, z: 2 })!;
    expect(low.z).toBeLessThan(5);
  });

  it('mapa bez lesa → null', () => {
    expect(
      nearestForestDoor(
        gridOf(() => false),
        { x: 10, z: 10 },
      ),
    ).toBeNull();
    expect(
      nearestReachableForest(
        gridOf(() => false),
        { x: 10, z: 10 },
      ),
    ).toBeNull();
  });
});

describe('nearestReachableForest', () => {
  it('les jen za řekou bez brodu → null, s brodem dveře', () => {
    const river = (i: number): boolean => i === 20;
    const behind = gridOf((i) => i >= 30, river);
    expect(nearestForestDoor(behind, { x: 10, z: 10 })).not.toBeNull();
    expect(nearestReachableForest(behind, { x: 10, z: 10 })).toBeNull();
    const ford = gridOf(
      (i) => i >= 30,
      (i, j) => i === 20 && j !== 5,
    );
    expect(nearestReachableForest(ford, { x: 10, z: 10 })).toEqual(
      nearestForestDoor(ford, { x: 10, z: 10 }),
    );
  });

  it('lidé ve středu domu (stavba přes víc buněk) utečou k dveřím z nejbližší volné buňky', () => {
    // e2e multiplayer-war:143 – útočník u vsi, lidé stojí ve středu zemnice: dům s pozemkem
    // zabere v mřížce 2,5 m 5 × 5 buněk, žádný z 8 sousedů středu není průchodný
    const house = (i: number, j: number): boolean => i >= 8 && i <= 12 && j >= 8 && j <= 12;
    const grid = gridOf((i) => i >= 30);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (!house(i, j)) continue;
        grid.pace[j * W + i] = 0;
        grid.flags[j * W + i] = MARCH_BUILDING;
      }
    }
    const centre = marchCellCenter(grid, 10 + 10 * W);
    const door = nearestReachableForest(grid, centre);
    expect(door).not.toBeNull();
    expect(door).toEqual(nearestForestDoor(grid, centre));
    // les jen za řekou bez brodu zůstane nedosažitelný i z domu
    const behind = gridOf(
      (i) => i >= 30,
      (i) => i === 20,
    );
    for (let c = 0; c < W * H; c++) {
      if (!house(c % W, Math.floor(c / W))) continue;
      behind.pace[c] = 0;
      behind.flags[c] = MARCH_BUILDING;
    }
    expect(nearestReachableForest(behind, centre)).toBeNull();
  });
});

describe('dohled v hustém lese (Terén – stezka hustým lesem 50 m)', () => {
  it('ze stezky v hustém lese na 60 m ne; z okrajového pruhu na 140 m ano', () => {
    const pace = new Float32Array(W * H).fill(1);
    const flags = new Uint16Array(W * H);
    // hustý les s průsekem v řadě 10 (stezka: `MARCH_FOREST`, tempo 1,5) vlevo; louka vpravo
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < 20; i++) {
        flags[j * W + i] = MARCH_FOREST;
        pace[j * W + i] = j === 10 ? 1.5 : 0;
      }
    }
    const grid: MarchGrid = {
      width: W,
      height: H,
      originX: 0,
      originZ: 0,
      cellM: 2.5,
      pace,
      flags,
    };
    const trail = marchCellCenter(grid, 10 * W + 2);
    expect(inSight(grid, trail, { x: trail.x + 60, z: trail.z })).toBe(false);
    expect(inSight(grid, trail, { x: trail.x + 40, z: trail.z })).toBe(true);
    // 5 m od okraje (buňka 22 na louce, les je do buňky 19)
    const edge = marchCellCenter(grid, 5 * W + 21);
    expect(inSight(grid, edge, { x: edge.x + 90, z: edge.z })).toBe(true);
    expect(inSight(grid, edge, { x: edge.x + 140, z: edge.z })).toBe(true);
    expect(inSight(grid, edge, { x: edge.x + 160, z: edge.z })).toBe(false);
  });
});

describe('nearestReachableForest – oblasti místo zaplavení', () => {
  it('týž výsledek jako zaplavení `reachableCells` (i start v neprůchodné buňce)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = createRandom(seed);
      const grid = gridOf(
        (i, j) => i >= 25 && rng.next() < 0.8 + (j % 2) * 0.1,
        (i, j) => (i === 12 || j === 9) && rng.next() < 0.85,
      );
      for (let k = 0; k < 60; k++) {
        const start = Math.floor(rng.next() * W * H);
        const from = marchCellCenter(grid, start);
        const reach = reachableCells(grid, start);
        expect(nearestReachableForest(grid, from)).toEqual(
          nearestForestOf(grid, from, (c) => reach[c] === 1),
        );
      }
    }
  });
});
