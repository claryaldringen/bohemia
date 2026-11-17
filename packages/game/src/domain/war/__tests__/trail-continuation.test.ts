import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { CELL_SIZE_M, generateLandscape, LANDSCAPE_SIZE, obstaclesOf } from '../../landscape';
import { foundVillage } from '../../village/core/actions';
import { trailTerrain } from '../../village/paths/terrain';
import { villageManor } from '../../village/people/manor';
import { landscapeTrailLines } from '../../village/trade/premium-route';
import { trailStart } from '../../village/trade/trail-axis';
import type { TrailExit } from '../../village/trade/trail-exits';
import type { RoadPoint, VillageState } from '../../village/types';
import { LANDSCAPE } from '../../village/__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import { marchCellAt, marchCellCenter, marchGrid, NO_CONTINUATIONS } from '../march-grid';
import { largestRegion } from '../march-search';
import { WAR } from '../rules-war';
import { continuationsOf, trailContinuations, trailEntriesOf } from '../trail-continuation';
import { port, westForest, withRoute } from './continuation-fixtures';

// Pokračování zemské stezky na sousední mapě (trade.md – Zemská stezka, Pokračování na sousední
// mapě; plán 2026-11-16-dense-forest – Rozhodnutí 13, Review Focus 6).

/** Střed okrajové buňky mřížky pochodu (jako `edgeCrossing`). */
const EDGE_M = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2 - WAR.march.cellM / 2;

const exit = (direction: TrailExit['direction'], edge: RoadPoint, builtDay: number): TrailExit => ({
  direction,
  end: edge,
  edge,
  builtDay,
});

describe('vstupy pokračování na mapě (`trailEntriesOf`)', () => {
  const east = exit('E', { x: 960, z: 120 }, 3);
  const north = exit('N', { x: 40, z: 960 }, 4);

  it('výstup E souseda (0; 0) vede na (1; 0) – bod na opačném okraji', () => {
    expect(
      trailEntriesOf({ x: 1, y: 0 }, [{ cell: { x: 0, y: 0 }, exits: [east, north] }]),
    ).toEqual([{ point: { x: -EDGE_M, z: 120 }, builtDay: 3 }]);
  });

  it('výstup NE z rohu vede do protějšího rohu úhlopříčné mapy', () => {
    const corner = exit('NE', { x: 960, z: 960 }, 7);
    expect(trailEntriesOf({ x: 1, y: 1 }, [{ cell: { x: 0, y: 0 }, exits: [corner] }])).toEqual([
      { point: { x: -EDGE_M, z: -EDGE_M }, builtDay: 7 },
    ]);
    expect(trailEntriesOf({ x: 1, y: 0 }, [{ cell: { x: 0, y: 0 }, exits: [corner] }])).toEqual([]);
  });

  it('pořadí podle políčka souseda (y, pak x) – sousedé v obráceném pořadí dají totéž', () => {
    const west = { cell: { x: 0, y: 0 }, exits: [east] };
    const south = { cell: { x: 1, y: -1 }, exits: [north] };
    const entries = trailEntriesOf({ x: 1, y: 0 }, [west, south]);
    expect(entries).toEqual([
      { point: { x: 40, z: -EDGE_M }, builtDay: 4 },
      { point: { x: -EDGE_M, z: 120 }, builtDay: 3 },
    ]);
    expect(trailEntriesOf({ x: 1, y: 0 }, [south, west])).toEqual(entries);
  });
});

describe('osa pokračování (`trailContinuations`)', () => {
  it('bez branky k nejbližšímu místu největší souvislé oblasti; vstup v oblasti – bez osy', () => {
    const { landscape: l, entry } = westForest();
    const o = obstaclesOf(l);
    const axes = trailContinuations(l, o, [entry], null);
    expect(axes).toHaveLength(1);
    const axis = axes[0]!;
    expect(axis[0]).toEqual(entry);
    const grid = marchGrid(l, o, null);
    const region = largestRegion(grid);
    expect(region[marchCellAt(grid, entry)]).toBe(0);
    expect(region[marchCellAt(grid, axis.at(-1)!)]).toBe(1);
    const inside = marchCellCenter(grid, region.indexOf(1));
    expect(trailContinuations(l, o, [inside], null)).toEqual([]);
  });

  it('stezka krajiny s koncem do 30 m od vstupu – bez osy (stezka kostry tam pokračuje)', () => {
    const l = withRoute([port('S', 64), port('N', 64)]);
    const lines = landscapeTrailLines(l);
    expect(lines.length).toBeGreaterThan(0);
    const end = lines[0]![0]!;
    const entry = { x: end.x + 20, z: end.z };
    // s brankou (druhý konec úseku – místo vsi) by osa jinak vedla – kontrola vstupem o 200 m dál
    const gate = lines[0]!.at(-1)!;
    expect(trailContinuations(l, obstaclesOf(l), [entry], null)).toEqual([]);
    expect(trailContinuations(l, obstaclesOf(l), [entry], gate)).toEqual([]);
    const far = { x: end.x + 200, z: end.z };
    expect(trailContinuations(l, obstaclesOf(l), [far], gate)).toHaveLength(1);
  });

  it('paměť a determinismus – tentýž objekt, krajina ze seedu znovu dá tutéž osu', () => {
    const { seed, landscape: l, entry } = westForest();
    const axes = trailContinuations(l, obstaclesOf(l), [entry], null);
    expect(trailContinuations(l, obstaclesOf(l), [entry], null)).toBe(axes);
    const again = generateLandscape(seed);
    expect(trailContinuations(again, obstaclesOf(again), [entry], null)).toEqual(axes);
  });
});

describe('pokračování na mapě v den tažení (`continuationsOf`)', () => {
  it('den dostavění bez osy, den poté s osou (Review Focus 6)', () => {
    const { landscape, entry } = westForest();
    const map = {
      landscape,
      obstacles: obstaclesOf(landscape),
      trailEntries: [{ point: entry, builtDay: 10 }],
    };
    expect(continuationsOf(map, null, 10)).toBe(NO_CONTINUATIONS);
    expect(continuationsOf(map, null, 11)).toHaveLength(1);
    expect(continuationsOf({ landscape, obstacles: null }, null, 11)).toBe(NO_CONTINUATIONS);
  });

  it('k brance dvorce tamní vsi; ves bez dvorce – k největší souvislé oblasti', () => {
    // krajina testu pěšin: les pro x < −90, vstup na západním okraji v hustém lese
    const day = dayIndexOf({ year: 600, month: 5, day: 1 });
    const v = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
    );
    v.lastDay = day;
    const half = (LANDSCAPE.size * LANDSCAPE.cellSizeM) / 2;
    const entry = { x: -half + WAR.march.cellM / 2, z: 0 };
    const map = {
      landscape: LANDSCAPE,
      obstacles: null,
      trailEntries: [{ point: entry, builtDay: 1 }],
    };
    const grid = marchGrid(LANDSCAPE, null, null);
    const region = largestRegion(grid);
    expect(region[marchCellAt(grid, entry)]).toBe(0);

    const toGate = continuationsOf(map, v, day);
    expect(toGate).toHaveLength(1);
    const gate = trailStart(LANDSCAPE, villageManor(v)!);
    const last = toGate[0]!.at(-1)!;
    expect(toGate[0]![0]).toEqual(entry);
    expect(Math.hypot(last.x - gate.x, last.z - gate.z)).toBeLessThanOrEqual(
      trailTerrain(LANDSCAPE, null).cellM,
    );

    const bare: VillageState = { ...v, dwellings: [], constructions: [] };
    delete bare.manorId;
    expect(villageManor(bare)).toBeNull();
    const toMeadow = continuationsOf(map, bare, day);
    expect(toMeadow).toHaveLength(1);
    expect(region[marchCellAt(grid, toMeadow[0]!.at(-1)!)]).toBe(1);
  });
});
