import { describe, expect, it } from 'vitest';
import {
  MARCH_FOREST,
  SURFACE_CODES,
  generateLandscape,
  marchCellCenter,
  obstaclesOf,
  type ClearedForest,
  type Landscape,
  type MarchGrid,
} from '@bohemia/game';
import type { SceneRoad } from '../../village-view';
import {
  browserMarchGrid,
  cursorBlocked,
  cursorRoads,
  edgeReachable,
  roadsKey,
} from '../march-cursor';

// Kurzor nad místem, kam skupina nedojde (march-cursor.ts): dosažitelnost z oblastí mřížky pochodu.

/** Mapa 200 × 200 m, buňka 2,5 m; sloupce `walls` jsou hustý les (pace 0). */
function gridWith(walls: readonly number[]): MarchGrid {
  const width = 80;
  const pace = new Float32Array(width * width).fill(1);
  const flags = new Uint16Array(width * width);
  for (let j = 0; j < width; j++) {
    for (const i of walls) {
      pace[j * width + i] = 0;
      flags[j * width + i] = MARCH_FOREST;
    }
  }
  return { width, height: width, originX: -100, originZ: -100, cellM: 2.5, pace, flags };
}

describe('cursorBlocked', () => {
  const grid = gridWith([40, 41]);
  const from = { x: -50, z: 0 };

  it('hustý les a oblast za ním jsou nedosažitelné, louka ve stejné oblasti ne', () => {
    expect(cursorBlocked(grid, from, { x: 0, z: 0 }, 1920)).toBe(true);
    expect(cursorBlocked(grid, from, { x: 50, z: 0 }, 1920)).toBe(true);
    expect(cursorBlocked(grid, from, { x: -20, z: 10 }, 1920)).toBe(false);
  });

  it('okraj mapy: přechod jen k okraji ve stejné oblasti', () => {
    expect(edgeReachable(grid, from, 'W')).toBe(true);
    expect(edgeReachable(grid, from, 'E')).toBe(false);
    expect(cursorBlocked(grid, from, { x: 950, z: 0 }, 1920)).toBe(true);
    expect(cursorBlocked(grid, from, { x: -950, z: 0 }, 1920)).toBe(false);
    // roh mapy: úhlopříčný soused dvěma kolmými kroky – rozhoduje okraj prvního kroku trasy
    // (`firstRouteStep`: NE → N, SE → E), ne rohová buňka za lesem (oprava Úlohy 5)
    expect(edgeReachable(grid, from, 'NE')).toBe(true);
    expect(edgeReachable(grid, from, 'SE')).toBe(false);
  });

  it('skupina stojící v hustém lese unikne a dojde, kam dojde okolí', () => {
    expect(cursorBlocked(grid, { x: 0, z: 0 }, { x: -20, z: 10 }, 1920)).toBe(false);
  });
});

describe('browserMarchGrid', () => {
  it('bez vymýceného lesa i s ním je mřížka krajiny stejně velká a deterministická', () => {
    const l = generateLandscape(42);
    const layer = obstaclesOf(l);
    const a = browserMarchGrid(l, layer, null, []);
    const b = browserMarchGrid(l, layer, null, []);
    expect(Array.from(a.flags.subarray(0, 2000))).toEqual(Array.from(b.flags.subarray(0, 2000)));
    expect(a.width).toBeGreaterThan(100);
  });

  it('paseka vsi otevře hustý les, jinde zůstává neprůchodný', () => {
    const l = generateLandscape(42);
    const layer = obstaclesOf(l);
    const plain = browserMarchGrid(l, layer, null, []);
    const dense = Array.from(plain.flags).findIndex((f) => f === MARCH_FOREST);
    expect(dense).toBeGreaterThanOrEqual(0);
    const at = marchCellCenter(plain, dense);
    const half = (l.size * l.cellSizeM) / 2;
    const tile =
      Math.floor((at.z + half) / l.cellSizeM) * l.size + Math.floor((at.x + half) / l.cellSizeM);
    const clearing: ClearedForest = {
      size: l.size,
      cellSizeM: l.cellSizeM,
      share: new Float32Array(l.size * l.size),
      mask: new Uint8Array(l.size * l.size),
      tiles: [tile],
      areas: [],
    };
    const opened = browserMarchGrid(l, layer, clearing, []);
    expect(plain.pace[dense]).toBe(0);
    expect(opened.pace[dense]).toBe(1);
    expect(opened.flags[dense]).toBe(0);
    const stillDense = Array.from(opened.flags).filter((f) => f === MARCH_FOREST).length;
    expect(stillDense).toBeGreaterThan(0);
  });
});

/** Rovná krajina 1 920 m celá lesem – hustý les až k okrajům. */
function forestEverywhere(): Landscape {
  const size = 128;
  return {
    size,
    cellSizeM: 15,
    heights: new Float32Array(size * size),
    surface: new Uint8Array(size * size).fill(SURFACE_CODES.forest),
    fertility: new Uint8Array(size * size),
    villageSite: { x: 64, y: 64 },
    stream: [],
    obstacleLayer: null,
  };
}

describe('cursorRoads – kusy hotových stezek ke kraji', () => {
  // hotová stezka končí 25 m před západním krajem (pás u kraje, trade.md – Pokračování na sousední
  // mapě); server ji kusem ke kraji otevře (`marchGrid` – `edgePieces`), prohlížeč ze scény vsi
  const road = {
    id: 1,
    points: [
      { x: -600, z: 0 },
      { x: -935, z: 0 },
    ],
    grade: 'improved',
    swath: true,
  } as SceneRoad;
  const from = { x: -700, z: 0 };

  it('stezka hustým lesem do pásu u kraje – okraj dosažitelný', () => {
    const l = forestEverywhere();
    const closed = browserMarchGrid(l, null, null, cursorRoads({ roads: [road] }));
    expect(edgeReachable(closed, from, 'W')).toBe(false);
    const village = {
      roads: [road],
      trailEdgePieces: [
        [
          { x: -935, z: 0 },
          { x: -960, z: 0 },
        ],
      ],
    };
    const open = browserMarchGrid(l, null, null, cursorRoads(village));
    expect(edgeReachable(open, from, 'W')).toBe(true);
    expect(cursorBlocked(open, from, { x: -955, z: 0 }, 1920)).toBe(false);
    // jinam hustým lesem dál ne
    expect(cursorBlocked(open, from, { x: -700, z: 100 }, 1920)).toBe(true);
  });

  it('klíč os z obsahu – nové pole se stejnými body dá týž klíč', () => {
    const a = cursorRoads({ roads: [road] });
    const b = cursorRoads({ roads: [{ ...road, points: road.points.map((p) => ({ ...p })) }] });
    expect(roadsKey(a)).toBe(roadsKey(b));
    expect(roadsKey(a)).not.toBe(roadsKey(cursorRoads(null)));
  });
});
