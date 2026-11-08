import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
} from '../../domain/landscape';
import { cellLandscapeSeed, skeletonSlice } from '../../domain/world';
import {
  cellSkeletonVersions,
  emptyCellLandscape,
  emptyCellMarchGrid,
  settledCellLandscape,
} from '../cell-landscape';
import { settlementLandscape } from '../enter-game';
import type { Settlement } from '../settlements';

// Krajina prázdného políčka pro tažení (war.md – Pohyb – mapu po mapě).

describe('krajina políčka světa', () => {
  it('prázdné políčko má tutéž krajinu, jakou by dostala nová ves', () => {
    const cell = { x: 2, y: -1 };
    const empty = emptyCellLandscape(7, cell);
    const village = generateAcceptedLandscape(cellLandscapeSeed(7, cell));
    expect(empty.seed).toBe(village.seed);
    expect(empty.landscape.heights).toEqual(village.landscape.heights);
    expect(empty.obstacles.count).toBeGreaterThan(0);
    const settled = settledCellLandscape(empty.seed, CURRENT_LAYER_VERSIONS);
    expect(settled.landscape.surface).toEqual(empty.landscape.surface);
  });

  it('mřížka pochodu prázdného políčka pokryje celou mapu', () => {
    const grid = emptyCellMarchGrid(7, { x: 0, y: 1 });
    expect(grid.width * grid.cellM).toBe(1920);
    expect(grid.pace.some((p) => p > 0)).toBe(true);
  });

  // seed světa 1: políčkem (−4, −2) teče řeka kostry, (−3, −2) vedle je suché (world.md – Kostra)
  const RIVER_WORLD = 1;
  const riverCell = { x: -4, y: -2 };

  it('verze vrstev podle výřezu: s kostrou `skeleton: 1`, suchá mapa bez ní', () => {
    const slice = skeletonSlice(RIVER_WORLD, riverCell);
    expect(slice?.rivers.length).toBeGreaterThan(0);
    expect(cellSkeletonVersions(slice)).toEqual({ ...CURRENT_LAYER_VERSIONS, skeleton: 1 });
    expect(cellSkeletonVersions(null)).toBe(CURRENT_LAYER_VERSIONS);
    expect(cellSkeletonVersions(null, { ...CURRENT_LAYER_VERSIONS, skeleton: 1 })).toEqual(
      CURRENT_LAYER_VERSIONS,
    );
  });

  it('prázdné políčko s řekou kostry má řeku z výřezu; uložený výřez dá tutéž krajinu', () => {
    const slice = skeletonSlice(RIVER_WORLD, riverCell);
    const empty = emptyCellLandscape(RIVER_WORLD, riverCell);
    expect(empty.landscape.rivers?.length).toBeGreaterThan(0);
    expect(empty.landscape.skeleton).toEqual(slice);
    const settled = settledCellLandscape(empty.seed, cellSkeletonVersions(slice), undefined, slice);
    expect(settled.landscape.heights).toEqual(empty.landscape.heights);
    expect(settled.landscape.rivers).toEqual(empty.landscape.rivers);
  });

  it('sídlo bez výřezu na políčku s kostrou má krajinu jako dřív; soused bez vsi má řeku', () => {
    // vývojové sídlo z doby před kostrou (Review Focus 5): `skeleton` null, verze bez `skeleton`
    const seed = cellLandscapeSeed(RIVER_WORLD, riverCell);
    const settlement: Settlement = {
      id: 's',
      ownerId: 'p',
      isSeat: true,
      landscapeSeed: seed,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: riverCell,
      skeleton: null,
      createdAt: new Date(0),
    };
    const landscape = settlementLandscape(settlement);
    expect(landscape).toEqual(generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS));
    expect(landscape.rivers).toBeUndefined();
    expect(landscape.skeleton).toBeUndefined();
    expect(settledCellLandscape(seed, CURRENT_LAYER_VERSIONS).landscape).toEqual(landscape);
    expect(emptyCellLandscape(RIVER_WORLD, riverCell).landscape.rivers?.length).toBeGreaterThan(0);
  });
});
