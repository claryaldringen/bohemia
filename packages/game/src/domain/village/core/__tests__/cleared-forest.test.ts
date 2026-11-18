import { describe, expect, it } from 'vitest';
import { packObstacles, type Landscape, type ObstaclePlacement } from '../../../landscape';
import { CLEARED_SHARE } from '../../rules';
import { clearedForest, villageClearings } from '../cleared-forest';
import { NO_OBSTACLE_CHANGES } from '../obstacles';
import type { VillageState } from '../../types';

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
});

/** Kostra stavu vsi – jen pole, která čte `villageClearings`; zbytek se nečte. */
function village(parts: Record<string, unknown>): VillageState {
  return {
    fields: [],
    parts: [],
    dwellings: [],
    constructions: [],
    ...parts,
  } as unknown as VillageState;
}

describe('villageClearings', () => {
  it('ves s polovinou pokácených stromů políčka lesa – políčko je ve vymýceném lese', () => {
    const state = village({
      clearedObstacles: [
        { id: 1, day: 0 },
        { id: 2, day: 0 },
      ],
    });
    const cleared = villageClearings(landscape, layer, state, 10);
    expect(cleared.tiles).toEqual([tile(4, 4)]);
  });

  it('díly polí: zakládaný nemá vymýceno, hotový ano; natočená mřížka jen přes stromy', () => {
    const part = (id: number, x: number, y: number, state: 'founding' | 'ready') => ({
      id,
      fieldId: 1,
      cell: { x, y },
      state,
    });
    const flat = village({
      fields: [{ id: 1 }],
      parts: [part(1, 5, 6, 'founding'), part(2, 6, 6, 'ready')],
    });
    expect(villageClearings(landscape, layer, flat, 10).tiles).toEqual([tile(6, 6)]);
    const turned = village({
      fields: [{ id: 1, grid: { x: 0, z: 0, rotation: Math.PI / 12 } }],
      parts: [part(2, 6, 6, 'ready')],
    });
    expect(villageClearings(landscape, layer, turned, 10).tiles).toEqual([]);
  });

  it('milíř, milířiště, zemnice a svatyně v lese jsou paseky; pozemek a louka nic', () => {
    const at = (x: number, z: number): { x: number; z: number; rotation: number } => ({
      x,
      z,
      rotation: 0,
    });
    const kilns = village({
      dwellings: [
        {
          id: 1,
          type: 'zemnice',
          position: at(5, 5),
          workshop: { craft: 'burner', kilns: [{ id: 5, site: { x: 40, z: 40 } }] },
        },
      ],
      kilnRemnants: [{ id: 6, burnerId: 1, x: 50, z: 20, day: 0 }],
    });
    const withKilns = villageClearings(landscape, layer, kilns, 10);
    // zemnice, milíř a milířiště v lese: tři plochy (zemnice dílny může mít víc částí)
    expect(withKilns.areas.length).toBeGreaterThanOrEqual(3);
    const base = villageClearings(
      landscape,
      layer,
      village({ dwellings: [{ id: 1, type: 'zemnice', position: at(5, 5) }] }),
      10,
    ).areas.length;
    expect(withKilns.areas.length - base).toBe(2);
    const shrine = village({
      sacredBuildings: [{ id: 2, kind: 'shrine', position: at(60, 60), builtDay: 0 }],
    });
    expect(villageClearings(landscape, layer, shrine, 10).areas).toHaveLength(1);
    const meadow = village({
      sacredBuildings: [{ id: 2, kind: 'shrine', position: at(-60, 0), builtDay: 0 }],
    });
    expect(villageClearings(landscape, layer, meadow, 10).areas).toEqual([]);
    const plotted = village({
      dwellings: [{ id: 1, type: 'zemnice', position: at(5, 5), plot: { cell: { x: 4, y: 4 } } }],
    });
    expect(villageClearings(landscape, layer, plotted, 10).areas).toEqual([]);
  });

  it('pozemek bez natočení se středem mimo políčko je v lese paseka, na políčku dál ne (D96)', () => {
    // 18. 11. 2026 – D96: pozemek má střed kdekoli pod kurzorem i bez natočení – nezabírá políčko,
    // tak paseku tvoří čtverec sám (jako natočený); dřív stál jen na políčku
    const house = (plot: object): VillageState =>
      village({
        dwellings: [
          { id: 1, type: 'polozemnice', position: { x: 21, z: 6, rotation: Math.PI }, plot },
        ],
      });
    const free = villageClearings(
      landscape,
      layer,
      house({ cell: { x: 5, y: 4 }, variant: 'center', square: { x: 21.3, z: 6.4, rotation: 0 } }),
      10,
    );
    expect(free.areas).toHaveLength(1);
    expect(Math.min(...free.areas[0]!.map((p) => p[0]))).toBeCloseTo(21.3 - 7.5, 9);
    expect(Math.max(...free.areas[0]!.map((p) => p[1]))).toBeCloseTo(6.4 + 7.5, 9);
    // na políčku (i jako čtverec bez natočení ve středu políčka) paseku netvoří jako dřív
    const onTile = house({ cell: { x: 5, y: 4 }, variant: 'center' });
    expect(villageClearings(landscape, layer, onTile, 10).areas).toEqual([]);
    const centered = house({
      cell: { x: 5, y: 4 },
      variant: 'center',
      square: { x: 22.5, z: 7.5, rotation: 0 },
    });
    expect(villageClearings(landscape, layer, centered, 10).areas).toEqual([]);
    // natočený o 90° ve středu políčka – čtverec jako dřív (`turnedSquare`)
    const quarter = house({
      cell: { x: 5, y: 4 },
      variant: 'center',
      square: { x: 22.5, z: 7.5, rotation: Math.PI / 2 },
    });
    expect(villageClearings(landscape, layer, quarter, 10).areas).toHaveLength(1);
  });
});
