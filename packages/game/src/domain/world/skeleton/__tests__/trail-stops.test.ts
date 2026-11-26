import { describe, expect, it } from 'vitest';
import { deriveSeed } from '../../../landscape/random';
import type { GridCell } from '../../../village/people/world-grid';
import {
  sideTowards,
  SKELETON,
  type TrailConnection,
  trailEdgeExists,
  trailNode,
  trailPath,
  trailSides,
  settlementMerchantStops,
  trailStops,
} from '..';
import type { SkeletonSlice } from '../../../landscape/skeleton/types';

// Zastávky na dálkových stezkách (markets.md – Rozhodnutí plánu 4, bod 5): cesta spojení uzlů po
// políčkách a pořadí políčka na ní. Jen čte graf kostry (world-skeleton.md – Stezky – síť uzlů).

const SEEDS = [1, 7, 20270101];
/** Okno 60 × 60 políček kolem (0, 0) – i záporné souřadnice. */
const HALF = 30;

function windowCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let x = -HALF; x < HALF; x++) for (let y = -HALF; y < HALF; y++) cells.push({ x, y });
  return cells;
}

/** Bloky, které do okna zasahují. */
function windowBlocks(): GridCell[] {
  const first = Math.floor(-HALF / SKELETON.trail.block);
  const last = Math.floor((HALF - 1) / SKELETON.trail.block);
  const blocks: GridCell[] = [];
  for (let x = first; x <= last; x++) for (let y = first; y <= last; y++) blocks.push({ x, y });
  return blocks;
}

/** Spojení z uzlů bloků okna – i ta, která kostra nemá. */
function windowConnections(): TrailConnection[] {
  return windowBlocks().flatMap((block): TrailConnection[] => [
    { block, dir: 'E' },
    { block, dir: 'N' },
  ]);
}

/** Cesty spojení okna, která kostra má. */
function windowPaths(seed: number): { connection: TrailConnection; path: GridCell[] }[] {
  return windowConnections().flatMap((connection) => {
    const path = trailPath(seed, connection);
    return path === null ? [] : [{ connection, path }];
  });
}

function keyOf({ block, dir }: TrailConnection): string {
  return `${block.x},${block.y},${dir}`;
}

/** Blok na druhém konci spojení. */
function farBlock({ block, dir }: TrailConnection): GridCell {
  return dir === 'E' ? { x: block.x + 1, y: block.y } : { x: block.x, y: block.y + 1 };
}

describe('cesta spojení (trailPath)', () => {
  it.each(SEEDS)('má ji právě spojení kostry (seed %i)', (seed) => {
    const connections = windowConnections();
    const exists = connections.map((c) => trailEdgeExists(seed, c.block, c.dir));
    expect(new Set(exists)).toEqual(new Set([true, false]));
    expect(connections.map((c) => trailPath(seed, c) !== null)).toEqual(exists);
  });

  it.each(SEEDS)('začíná v uzlu bloku a končí v uzlu sousedního bloku (seed %i)', (seed) => {
    for (const { connection, path } of windowPaths(seed)) {
      expect(path[0]).toEqual(trailNode(seed, connection.block));
      expect(path.at(-1)).toEqual(trailNode(seed, farBlock(connection)));
    }
  });

  it.each(SEEDS)('jde po stezce krok za krokem, každým políčkem jednou (seed %i)', (seed) => {
    for (const { path } of windowPaths(seed)) {
      expect(new Set(path.map((c) => `${c.x},${c.y}`)).size).toBe(path.length);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
        expect(trailSides(seed, a)).toContain(sideTowards(a, b));
        expect(trailSides(seed, b)).toContain(sideTowards(b, a));
      }
    }
  });
});

describe('zastávky políčka (trailStops)', () => {
  it.each(SEEDS)('má je právě políčko se stezkou – mimo uzel jednu (seed %i)', (seed) => {
    const { block } = SKELETON.trail;
    let onTrail = 0;
    for (const cell of windowCells()) {
      const stops = trailStops(seed, cell);
      const sides = trailSides(seed, cell);
      expect(stops.length > 0).toBe(sides.length > 0);
      if (sides.length === 0) continue;
      onTrail++;
      const node = trailNode(seed, {
        x: Math.floor(cell.x / block),
        y: Math.floor(cell.y / block),
      });
      const isNode = node.x === cell.x && node.y === cell.y;
      expect(stops).toHaveLength(isNode ? sides.length : 1);
    }
    expect(onTrail).toBeGreaterThan(100);
  });

  it.each(SEEDS)('políčko cesty má zastávku spojení – pořadí a délka cesty (seed %i)', (seed) => {
    for (const { connection, path } of windowPaths(seed)) {
      const key = keyOf(connection);
      path.forEach((cell, index) => {
        expect(trailStops(seed, cell).filter((stop) => stop.key === key)).toEqual([
          { key, seed: deriveSeed(seed, `merchants:${key}`), index, length: path.length },
        ]);
      });
    }
  });

  it.each(SEEDS)('uzel má zastávku za každé spojení, které v něm končí (seed %i)', (seed) => {
    const existing = (connections: TrailConnection[]): string[] =>
      connections.filter((c) => trailEdgeExists(seed, c.block, c.dir)).map(keyOf);
    let crossroads = 0;
    for (const block of windowBlocks()) {
      const starting = existing([
        { block, dir: 'E' },
        { block, dir: 'N' },
      ]);
      const ending = existing([
        { block: { x: block.x - 1, y: block.y }, dir: 'E' },
        { block: { x: block.x, y: block.y - 1 }, dir: 'N' },
      ]);
      const stops = trailStops(seed, trailNode(seed, block));
      // seřazené podle klíče
      expect(stops.map((stop) => stop.key)).toEqual([...starting, ...ending].sort());
      for (const { key, index, length } of stops) {
        expect(index).toBe(starting.includes(key) ? 0 : length - 1);
      }
      if (stops.length > 1) crossroads++;
    }
    expect(crossroads).toBeGreaterThan(0);
  });

  it('nezávisí na pořadí dotazů', () => {
    const cells = windowCells().slice(0, 1200);
    const first = cells.map((cell) => trailStops(7, cell));
    expect(first.some((stops) => stops.length > 0)).toBe(true);
    for (let i = 0; i < 1000; i++) trailStops(SEEDS[i % SEEDS.length]!, { x: 40 + i, y: 25 - i });
    // tatáž políčka odzadu
    const again = [...cells].reverse().map((cell) => trailStops(7, cell));
    expect(again.reverse()).toEqual(first);
  });

  it('každé spojení má vlastní seed – i totéž spojení v jiném světě', () => {
    const seeds = SEEDS.flatMap((seed) =>
      windowPaths(seed).map(({ path }) => trailStops(seed, path[1]!)[0]!.seed),
    );
    expect(seeds.length).toBeGreaterThan(30);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('skutečné zastávky světa 20270101: křižovatka (7, 14) a políčka obou cest z ní', () => {
    expect(trailStops(20270101, { x: 7, y: 14 })).toEqual([
      { key: '-1,0,E', seed: 516930650, index: 24, length: 25 },
      { key: '0,0,E', seed: 3982287348, index: 0, length: 28 },
      { key: '0,0,N', seed: 2945924114, index: 0, length: 22 },
    ]);
    // 13 políček k hranici bloků (20, 14) a 3 na jih po ní
    expect(trailStops(20270101, { x: 20, y: 11 })).toEqual([
      { key: '0,0,E', seed: 3982287348, index: 16, length: 28 },
    ]);
    // 6 políček na sever k hranici bloků (7, 20)
    expect(trailStops(20270101, { x: 7, y: 20 })).toEqual([
      { key: '0,0,N', seed: 2945924114, index: 6, length: 22 },
    ]);
  });

  it('políčko bez stezky nemá zastávku – i uzel, ve kterém žádné spojení nekončí', () => {
    const cell = windowCells().find((c) => trailSides(20270101, c).length === 0)!;
    expect(trailStops(20270101, cell)).toEqual([]);
    expect(trailNode(7, { x: -2, y: 0 })).toEqual({ x: -26, y: 14 });
    expect(trailStops(7, { x: -26, y: 14 })).toEqual([]);
  });
});

describe('zastávky kupců sídla (settlementMerchantStops)', () => {
  /** Křižovatka (7, 14) světa 20270101 – zastávky tří spojení (test výš). */
  const cell = { x: 7, y: 14 };
  const slice = (trails: SkeletonSlice['trails']): SkeletonSlice => ({
    world: 1,
    rivers: [],
    trails,
  });
  const withTrail = slice([{ side: 'N', at: 256 }]);

  it('výřez se stezkou: zastávky políčka (`trailStops`)', () => {
    const stops = settlementMerchantStops(20270101, cell, withTrail);
    expect(stops.length).toBeGreaterThan(0);
    expect(stops).toEqual(trailStops(20270101, cell));
  });

  it('bez stezky ve výřezu kupci nejsou, i když políčkem stezka kostry vede', () => {
    expect(trailStops(20270101, cell).length).toBeGreaterThan(0);
    expect(settlementMerchantStops(20270101, cell, null)).toEqual([]);
    expect(settlementMerchantStops(20270101, cell, slice([]))).toEqual([]);
  });

  it('odříznuté sídlo bez políčka světa kupce nemá', () => {
    expect(settlementMerchantStops(20270101, null, withTrail)).toEqual([]);
  });
});
