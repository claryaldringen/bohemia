import { describe, expect, it } from 'vitest';
import {
  NO_OBSTACLE_CHANGES,
  packObstacles,
  type Landscape,
  type ObstaclePlacement,
} from '@bohemia/game';
import {
  CLEARED_SHARE,
  clearedForest,
  clearingDistance,
  sameClearing,
  villageClearedForest,
} from '../cleared-forest';

// Krajina 8 × 8 políček po 15 m se středem v počátku (políčko (4, 4) = svět 0–15 m); sloupce
// x ≥ 4 jsou les, ostatní louka.
const SIZE = 8;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: Uint8Array.from({ length: SIZE * SIZE }, (_, i) => (i % SIZE >= 4 ? 1 : 2)),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 1, y: 1 },
  stream: [],
  obstacleLayer: null,
};
const tile = (x: number, y: number): number => y * SIZE + x;

const tree = (id: number, x: number, z: number, kind: ObstaclePlacement['kind'] = 'tree') => ({
  id,
  kind,
  look: kind === 'tree' ? ('oak-1' as const) : ('stone-1' as const),
  x,
  z,
  rotation: 0,
  scale: 1,
});
/** Políčko (4, 4): čtyři dospělé stromy a kámen; (5, 4): dva stromy; louka (2, 4): strom. */
const layer = packObstacles(
  [
    tree(1, 2, 2),
    tree(2, 6, 3),
    tree(3, 10, 4),
    tree(4, 12, 12),
    tree(5, 8, 8, 'stone'),
    tree(6, 20, 3),
    tree(7, 25, 9),
    tree(8, -20, 4),
  ],
  SIZE,
  15,
);

describe('clearedForest', () => {
  it('bez změn žádný vymýcený les', () => {
    const cleared = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES);
    expect(cleared.tiles).toEqual([]);
    expect(cleared.share.every((v) => v === 0)).toBe(true);
  });

  it('podíl vykácených dospělých stromů v políčku lesa – od poloviny je vymýcené', () => {
    const cleared = clearedForest(landscape, layer, {
      removed: [1],
      stumps: [2, 6],
      saplings: [],
    });
    expect(cleared.share[tile(4, 4)]).toBeCloseTo(2 / 4);
    expect(cleared.share[tile(5, 4)]).toBeCloseTo(1 / 2);
    expect(CLEARED_SHARE).toBe(0.5);
    expect(cleared.tiles).toEqual([tile(4, 4), tile(5, 4)]);
  });

  it('kámen se nepočítá, louka nikdy není vymýcený les', () => {
    const cleared = clearedForest(landscape, layer, {
      removed: [5, 8],
      stumps: [],
      saplings: [],
    });
    expect(cleared.share[tile(4, 4)]).toBe(0);
    expect(cleared.share[tile(2, 4)]).toBe(0);
    expect(cleared.tiles).toEqual([]);
  });

  it('dorůstající nálet je pořád paseka, dorostlý strom (mezi změnami už není) les vrátí', () => {
    const young = clearedForest(landscape, layer, { removed: [], stumps: [], saplings: [6, 7] });
    expect(young.tiles).toEqual([tile(5, 4)]);
    const grown = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES);
    expect(grown.tiles).toEqual([]);
  });

  it('založený díl pole v lese je vymýcený celý, i bez stromů; na louce nic', () => {
    const cleared = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES, [
      { x: 6, y: 6 },
      { x: 1, y: 1 },
      { x: 99, y: 0 },
    ]);
    expect(cleared.tiles).toEqual([tile(6, 6)]);
    expect(cleared.share[tile(6, 6)]).toBe(1);
  });

  it('ze stavu vsi: díl, který se teprve zakládá, má stromy ještě na sobě', () => {
    const part = (x: number, stage: 'founding' | 'ready') => ({
      cell: { x, y: 6 },
      x: 0,
      z: 0,
      size: 15,
      stage,
    });
    const cleared = villageClearedForest(landscape, layer, {
      fields: [{ id: 1, parts: [part(5, 'founding'), part(6, 'ready')] }],
    });
    expect(cleared.tiles).toEqual([tile(6, 6)]);
  });
});

describe('clearingDistance a sameClearing', () => {
  const cleared = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES, [{ x: 6, y: 6 }]);

  it('vzdálenost k okraji vymýceného políčka, uvnitř 0, dál než maximum Infinity', () => {
    // políčko (6, 6) = svět x 30–45, z 30–45
    expect(clearingDistance(cleared, 37, 37, 20)).toBe(0);
    expect(clearingDistance(cleared, 50, 37, 20)).toBeCloseTo(5);
    expect(clearingDistance(cleared, 25, 25, 20)).toBeCloseTo(Math.hypot(5, 5));
    expect(clearingDistance(cleared, -40, -40, 20)).toBe(Infinity);
    const none = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES);
    expect(clearingDistance(none, 37, 37, 20)).toBe(Infinity);
  });

  it('stejná políčka a podíly po desetinách jsou stejný vymýcený les', () => {
    const again = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES, [{ x: 6, y: 6 }]);
    expect(sameClearing(cleared, again)).toBe(true);
    expect(sameClearing(cleared, null)).toBe(false);
    expect(sameClearing(null, null)).toBe(true);
    const felled = clearedForest(landscape, layer, { removed: [], stumps: [1], saplings: [] }, [
      { x: 6, y: 6 },
    ]);
    expect(sameClearing(cleared, felled)).toBe(false);
  });
});
