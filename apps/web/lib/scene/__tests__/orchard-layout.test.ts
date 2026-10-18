import { describe, expect, it } from 'vitest';
import {
  APPLE_VARIANTS,
  TREES_PER_SIDE,
  TREES_PER_SQUARE,
  orchardRowLines,
  orchardTreeSpots,
  plantingPhase,
  plantingProgress,
} from '../orchard-layout';

const square = { cell: { x: 4, y: 7 }, x: 30, z: -15, size: 15 };

describe('jabloně ve čtverci', () => {
  it('4 stromy v pravidelné mřížce po 7,5 m, uvnitř čtverce, stejné políčko = stejné stromy', () => {
    const spots = orchardTreeSpots(square);
    expect(spots).toHaveLength(TREES_PER_SQUARE);
    expect(TREES_PER_SQUARE).toBe(4);
    const xs = [...new Set(spots.map((s) => s.x))].sort((a, b) => a - b);
    const zs = [...new Set(spots.map((s) => s.z))].sort((a, b) => a - b);
    expect(xs).toEqual([square.x - 3.75, square.x + 3.75]);
    expect(zs).toEqual([square.z - 3.75, square.z + 3.75]);
    for (const spot of spots) {
      expect(spot.variant).toBeGreaterThanOrEqual(0);
      expect(spot.variant).toBeLessThan(APPLE_VARIANTS);
    }
    // sází se po řadách: nejdřív celá první řada
    expect(spots[0]!.z).toBe(spots[1]!.z);
    expect(spots[2]!.z).toBeGreaterThan(spots[1]!.z);
    expect(orchardTreeSpots({ ...square })).toEqual(spots);
    expect(orchardTreeSpots({ ...square, cell: { x: 5, y: 7 } })).not.toEqual(spots);
  });

  it('řady rovně pokračují přes sousední čtverce se stejným rozestupem', () => {
    const right = orchardTreeSpots({ ...square, cell: { x: 5, y: 7 }, x: square.x + 15 });
    const below = orchardTreeSpots({ ...square, cell: { x: 4, y: 8 }, z: square.z + 15 });
    const spots = orchardTreeSpots(square);
    // vpravo: stejné řady (z), první strom 7,5 m za posledním
    expect(right.map((s) => s.z)).toEqual(spots.map((s) => s.z));
    expect(right[0]!.x - spots[1]!.x).toBeCloseTo(7.5);
    // dole: stejné sloupce (x), řada 7,5 m za poslední řadou
    expect(below.map((s) => s.x)).toEqual(spots.map((s) => s.x));
    expect(below[0]!.z - spots[3]!.z).toBeCloseTo(7.5);
  });

  it('na skalním výchozu strom chybí – ostatní zůstanou v řadě na svém místě', () => {
    const free = orchardTreeSpots(square);
    const first = free[0]!;
    const rock = { x: first.x + 0.5, z: first.z + 0.5, radius: 2 };
    const rocky = orchardTreeSpots(square, [rock]);
    expect(rocky).toHaveLength(free.length - 1);
    expect(rocky).toEqual(free.slice(1));
    // obří výchoz přes celý čtverec – stromy tam nejsou
    expect(orchardTreeSpots(square, [{ x: square.x, z: square.z, radius: 12 }])).toEqual([]);
  });

  it('vytyčení: provázek podél každé řady přes celý čtverec', () => {
    const lines = orchardRowLines([square]);
    expect(lines).toHaveLength(TREES_PER_SIDE);
    for (const [[x0, z0], [x1, z1]] of lines as [[number, number], [number, number]][]) {
      expect(z0).toBe(z1);
      expect(x0).toBe(square.x - 7.5);
      expect(x1).toBe(square.x + 7.5);
    }
    expect(lines.map((line) => line[0]![1])).toEqual([square.z - 3.75, square.z + 3.75]);
  });

  it('výsadba po fázích: nejdřív kůly, pak sazenice', () => {
    expect(plantingProgress(0, 4)).toEqual({ stakes: 0, saplings: 0 });
    expect(plantingProgress(0.25, 4)).toEqual({ stakes: 2, saplings: 0 });
    expect(plantingProgress(0.5, 4)).toEqual({ stakes: 4, saplings: 0 });
    expect(plantingProgress(0.75, 4)).toEqual({ stakes: 4, saplings: 2 });
    expect(plantingProgress(1, 4)).toEqual({ stakes: 4, saplings: 4 });
    expect(plantingProgress(0.25, TREES_PER_SQUARE)).toEqual({ stakes: 2, saplings: 0 });
    expect(plantingPhase(0.2).label).toBe('Kůly');
    expect(plantingPhase(0.8).label).toBe('Sazenice');
  });
});
