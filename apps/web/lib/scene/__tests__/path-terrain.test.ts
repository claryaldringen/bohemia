import { describe, expect, it } from 'vitest';
import {
  PATH_FORD,
  PATH_FOREST_EDGE,
  PATH_WATER_SPOT,
  buildPathTerrain,
  pathWindowFor,
  windowContains,
  withObstacles,
} from '../path-terrain';
import { N, ORIGIN, STEP, testSource } from './path-fixtures';

const all = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 };
const cell = (x: number, z: number): number =>
  Math.round((z - ORIGIN) / STEP) * N + Math.round((x - ORIGIN) / STEP);

describe('buildPathTerrain – cena chůze', () => {
  const terrain = buildPathTerrain(testSource(), all);

  it('rovná louka 1, les dražší, potok neprůchodný kromě brodu', () => {
    expect(terrain.cost[cell(0, 0)]).toBe(1);
    expect(terrain.cost[cell(-120, 0)]).toBeGreaterThan(1);
    expect(terrain.cost[cell(30, 73.125)]).toBe(Infinity);
    const ford = cell(-101.25, 73.125);
    expect(terrain.cost[ford]).toBeGreaterThan(1);
    expect(terrain.cost[ford]).toBeLessThan(Infinity);
    expect(terrain.flags[ford]! & PATH_FORD).toBeTruthy();
  });

  it('suchý břeh u vody a okraj lesa mají příznak', () => {
    expect(terrain.flags[cell(30, 67.5)]! & PATH_WATER_SPOT).toBeTruthy();
    expect(terrain.flags[cell(30, 40)]! & PATH_WATER_SPOT).toBeFalsy();
    expect(terrain.flags[cell(-90, 0)]! & PATH_FOREST_EDGE).toBeTruthy();
    expect(terrain.flags[cell(0, 0)]! & PATH_FOREST_EDGE).toBeFalsy();
  });

  it('svah zdražuje se čtvercem sklonu, sráz je neprůchodný', () => {
    const gentle = buildPathTerrain(testSource({ slope: (x) => x * 0.05 }), all);
    const steep = buildPathTerrain(testSource({ slope: (x) => x * 0.15 }), all);
    const cliff = buildPathTerrain(testSource({ slope: (x) => x * 0.6 }), all);
    expect(gentle.cost[cell(0, 0)]).toBeCloseTo(1.25, 2);
    expect(steep.cost[cell(0, 0)]).toBeCloseTo(3.25, 2);
    expect(cliff.cost[cell(0, 0)]).toBe(Infinity);
  });

  it('okno sítě a jeho souřadnice', () => {
    const source = testSource();
    const window = pathWindowFor(source, { minX: -20, minZ: -20, maxX: 20, maxZ: 30 });
    const part = buildPathTerrain(source, window);
    expect(part.originX).toBeLessThanOrEqual(-20);
    expect(part.originX + (part.width - 1) * part.cellM).toBeGreaterThanOrEqual(20);
    expect(windowContains(all, window)).toBe(true);
    expect(windowContains(window, all)).toBe(false);
    const big = pathWindowFor(source, { minX: -1e4, minZ: -1e4, maxX: 1e4, maxZ: 1e4 });
    expect(big).toEqual(all);
  });

  it('překážky přidají cenu buňce kmene, výchoz je neprůchodný v poloměru', () => {
    const blocked = withObstacles(terrain, (_a, _b, _c, _d, visit) => {
      visit(0, 0, 0, 3);
      visit(30, 30, 4, Infinity);
    });
    expect(blocked.cost[cell(0, 0)]).toBe(4);
    expect(blocked.cost[cell(3.75, 0)]).toBe(1);
    expect(blocked.cost[cell(30, 30)]).toBe(Infinity);
    expect(blocked.cost[cell(33.75, 30)]).toBe(Infinity);
    expect(blocked.cost[cell(37.5, 30)]).toBe(1);
    expect(terrain.cost[cell(0, 0)]).toBe(1);
  });
});
