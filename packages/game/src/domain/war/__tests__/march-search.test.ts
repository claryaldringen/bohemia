import { describe, expect, it } from 'vitest';
import { createRandom, deriveSeed } from '../../landscape/random';
import { PathHeap } from '../../village/paths/network-search';
import type { MarchGrid } from '../march-grid';
import {
  gridSearch,
  largestRegion,
  marchArea,
  marchAreas,
  octileCost,
  reachableCells,
  STEP_DIAGONAL,
  STEP_STRAIGHT,
} from '../march-search';

// Hledání s rovnoměrnou cenou (plán 2026-11-16-dense-forest – Rozhodnutí 5, brána po Úloze 1).

/** Otevřená mřížka w × h – tempo 1 všude, bez příznaků, buňka (0, 0) se středem v (0, 0). */
function openGrid(w: number, h: number, cellM: number): MarchGrid {
  return {
    width: w,
    height: h,
    originX: 0,
    originZ: 0,
    cellM,
    pace: new Float32Array(w * h).fill(1),
    flags: new Uint16Array(w * h),
  };
}

/** Index buňky (i, j). */
const at = (g: MarchGrid, i: number, j: number): number => j * g.width + i;

/** Cíl jedna buňka – odhad oktilovou cenou k ní. */
function toCell(g: MarchGrid, start: number, target: number): number[] | null {
  const ti = target % g.width;
  const tj = (target - ti) / g.width;
  return gridSearch(
    g,
    start,
    (c) => c === target,
    (i, j) => octileCost(i - ti, j - tj),
  );
}

/**
 * Cena řetězu buněk – a zároveň kontrola, že je souvislý (8 sousedů), vede průchodnými buňkami
 * (start vždy) a úhlopříčně jen kolem průchodných rohů.
 */
function chainCost(g: MarchGrid, cells: readonly number[]): number {
  const w = g.width;
  const open = (c: number): boolean => c === cells[0] || g.pace[c]! > 0;
  let cost = 0;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1]!;
    const b = cells[k]!;
    const di = (b % w) - (a % w);
    const dj = (b - (b % w)) / w - (a - (a % w)) / w;
    expect(Math.max(Math.abs(di), Math.abs(dj))).toBe(1);
    expect(open(b)).toBe(true);
    if (di !== 0 && dj !== 0) {
      expect(open(a + di)).toBe(true);
      expect(open(a + dj * w)).toBe(true);
    }
    cost += octileCost(di, dj);
  }
  return cost;
}

/** Referenční Dijkstra se stejnými pravidly (start průchodný vždy, roh se neřeže); null = nedojde. */
function dijkstra(g: MarchGrid, start: number, target: number): number | null {
  const w = g.width;
  const h = g.height;
  const dist = new Float64Array(w * h).fill(Infinity);
  const open = (c: number): boolean => c === start || g.pace[c]! > 0;
  const heap = new PathHeap();
  dist[start] = 0;
  heap.push(start, 0);
  while (heap.size > 0) {
    const c = heap.pop();
    if (heap.topKey > dist[c]!) continue;
    if (c === target) return dist[c]!;
    const i = c % w;
    const j = (c - i) / w;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const n = jj * w + ii;
        if (!open(n)) continue;
        if (di !== 0 && dj !== 0 && (!open(j * w + ii) || !open(jj * w + i))) continue;
        const nd = dist[c]! + (di !== 0 && dj !== 0 ? STEP_DIAGONAL : STEP_STRAIGHT);
        if (nd < dist[n]!) {
          dist[n] = nd;
          heap.push(n, nd);
        }
      }
    }
  }
  return null;
}

describe('hledání s rovnoměrnou cenou (Rozhodnutí 5)', () => {
  it('oktilová cena: 1000 rovně, 1414 úhlopříčně', () => {
    expect(octileCost(0, 0)).toBe(0);
    expect(octileCost(3, 0)).toBe(3000);
    expect(octileCost(-2, 2)).toBe(2828);
    expect(octileCost(5, -2)).toBe(3 * 1000 + 2 * 1414);
  });

  it('otevřená mřížka 10 × 10 – z rohu do rohu úhlopříčkou', () => {
    const g = openGrid(10, 10, 10);
    const cells = toCell(g, 0, 99)!;
    expect(cells).toHaveLength(10);
    expect(cells[0]).toBe(0);
    expect(cells[9]).toBe(99);
    expect(chainCost(g, cells)).toBe(9 * 1414);
  });

  it('roh mezi dvěma neprůchodnými buňkami se neřeže', () => {
    const g = openGrid(2, 2, 10);
    g.pace[at(g, 1, 0)] = 0;
    g.pace[at(g, 0, 1)] = 0;
    expect(toCell(g, 0, 3)).toBeNull();
  });

  it('start v neprůchodné buňce – skupina na něm stojí, trasa vede ven', () => {
    const g = openGrid(5, 5, 10);
    g.pace[at(g, 2, 2)] = 0;
    const cells = toCell(g, at(g, 2, 2), at(g, 4, 4))!;
    expect(cells).not.toBeNull();
    expect(cells[0]).toBe(at(g, 2, 2));
    expect(cells[cells.length - 1]).toBe(at(g, 4, 4));
    expect(chainCost(g, cells)).toBe(2 * 1414);
  });

  it('nedosažitelný cíl – null', () => {
    const g = openGrid(6, 6, 10);
    for (let j = 0; j < 6; j++) g.pace[at(g, 3, j)] = 0;
    expect(toCell(g, at(g, 0, 0), at(g, 5, 5))).toBeNull();
    // neprůchodný cíl
    expect(toCell(g, at(g, 0, 0), at(g, 3, 2))).toBeNull();
  });

  it('cíl na startu – jedna buňka', () => {
    const g = openGrid(4, 4, 10);
    expect(toCell(g, 5, 5)).toEqual([5]);
  });

  it('stejné volání dvakrát – stejný řetěz', () => {
    const g = openGrid(30, 20, 10);
    for (let j = 2; j < 18; j++) g.pace[at(g, 15, j)] = 0;
    const first = toCell(g, at(g, 1, 10), at(g, 28, 9));
    toCell(g, at(g, 28, 1), at(g, 2, 18));
    expect(toCell(g, at(g, 1, 10), at(g, 28, 9))).toEqual(first);
  });

  it('JPS dá stejnou cenu jako Dijkstra – 200 náhodných mřížek 64 × 64 (30 % neprůchodných)', () => {
    const random = createRandom(deriveSeed(7, 'march'));
    let found = 0;
    for (let k = 0; k < 200; k++) {
      const g = openGrid(64, 64, 10);
      for (let c = 0; c < g.pace.length; c++) if (random.next() < 0.3) g.pace[c] = 0;
      const start = Math.floor(random.next() * g.pace.length);
      const target = Math.floor(random.next() * g.pace.length);
      const cells = toCell(g, start, target);
      const reference = dijkstra(g, start, target);
      expect(cells === null).toBe(reference === null);
      if (cells === null || reference === null) continue;
      found++;
      expect(cells[0]).toBe(start);
      expect(cells[cells.length - 1]).toBe(target);
      expect(chainCost(g, cells)).toBe(reference);
    }
    // test nesmí být prázdný – většina dvojic na sebe dosáhne
    expect(found).toBeGreaterThan(60);
  });

  it('k okraji – cíl jako množina buněk', () => {
    const g = openGrid(20, 20, 10);
    for (let i = 0; i < 18; i++) g.pace[at(g, i, 10)] = 0;
    const cells = gridSearch(
      g,
      at(g, 5, 2),
      (c) => (c - (c % 20)) / 20 === 19,
      (_i, j) => octileCost(0, j - 19),
    )!;
    // přes mezeru u východního okraje (sloupce 18 a 19 řádku 10)
    expect(cells.some((c) => c === at(g, 18, 10) || c === at(g, 19, 10))).toBe(true);
    expect((cells[cells.length - 1]! - (cells[cells.length - 1]! % 20)) / 20).toBe(19);
  });
});

describe('souvislé oblasti mřížky (brána po Úloze 1)', () => {
  it('stejné číslo = dosažitelné zaplavením, neprůchodná 0, čísla po indexech', () => {
    const random = createRandom(deriveSeed(11, 'march-areas'));
    for (let k = 0; k < 20; k++) {
      const g = openGrid(40, 30, 10);
      for (let c = 0; c < g.pace.length; c++) if (random.next() < 0.35) g.pace[c] = 0;
      const areas = marchAreas(g);
      expect(marchAreas(g)).toBe(areas);
      const labels = Array.from({ length: g.pace.length }, (_, c) => marchArea(g, c));
      let max = 0;
      for (let c = 0; c < labels.length; c++) {
        if (g.pace[c]! <= 0) expect(labels[c]).toBe(0);
        else {
          // první buňka nové oblasti dostane další číslo
          expect(labels[c]!).toBeLessThanOrEqual(max + 1);
          max = Math.max(max, labels[c]!);
        }
      }
      const start = labels.findIndex((l) => l > 0);
      const seen = reachableCells(g, start);
      for (let c = 0; c < labels.length; c++) {
        expect(seen[c] === 1).toBe(labels[c] === labels[start]);
      }
    }
  });

  it('úhlopříčně jen kolem průchodných rohů', () => {
    const g = openGrid(2, 2, 10);
    g.pace[at(g, 1, 0)] = 0;
    g.pace[at(g, 0, 1)] = 0;
    expect([0, 1, 2, 3].map((c) => marchArea(g, c))).toEqual([1, 0, 0, 2]);
  });

  it('jedno pole s okrajem na mřížku: Uint16, nad 65 535 oblastí Int32 (paměť)', () => {
    const g = openGrid(40, 30, 10);
    const { stride, labels } = marchAreas(g);
    expect(stride).toBe(42);
    expect(labels).toBeInstanceOf(Uint16Array);
    expect(labels).toHaveLength(42 * 32);
    // šachovnice 600 × 600 – každá průchodná buňka je oblast sama (úhlopříčně přes zavřené rohy
    // ne): 180 000 oblastí se do Uint16 nevejde
    const board = openGrid(600, 600, 2.5);
    for (let c = 0; c < board.pace.length; c++) {
      const i = c % 600;
      if ((i + (c - i) / 600) % 2 === 1) board.pace[c] = 0;
    }
    const big = marchAreas(board);
    expect(big.labels).toBeInstanceOf(Int32Array);
    expect(marchArea(board, 0)).toBe(1);
    expect(marchArea(board, 2)).toBe(2);
    expect(marchArea(board, 600 * 600 - 1)).toBe(180_000);
    // hledání nad Int32 průchodností: sousední buňky šachovnice spolu nesouvisí
    expect(
      gridSearch(
        board,
        0,
        (c) => c === 601,
        (i, j) => octileCost(i - 1, j - 1),
      ),
    ).toBeNull();
    expect(
      gridSearch(
        board,
        0,
        (c) => c === 0,
        () => 0,
      ),
    ).toEqual([0]);
  });
});

describe('největší souvislá oblast (plán 2026-11-16-dense-forest – Rozhodnutí 13)', () => {
  it('zeď ve sloupci 3 – 1 právě v 60 buňkách vpravo od zdi', () => {
    const g = openGrid(10, 10, 2.5);
    for (let j = 0; j < 10; j++) g.pace[at(g, 3, j)] = 0;
    const region = largestRegion(g);
    expect(region).toHaveLength(100);
    expect(region.reduce((sum, v) => sum + v, 0)).toBe(60);
    for (let c = 0; c < 100; c++) expect(region[c]).toBe(c % 10 > 3 ? 1 : 0);
  });

  it('dvě oblasti po 4 buňkách – remíza pro oblast s buňkou 0', () => {
    const g = openGrid(9, 1, 2.5);
    g.pace[4] = 0;
    expect(Array.from(largestRegion(g))).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0]);
  });

  it('oblasti spojené jen rohem mezi dvěma neprůchodnými buňkami jsou dvě', () => {
    // 4 × 2: vlevo dole 2 buňky, vpravo nahoře 2 buňky – dotýkají se jen rohem
    const g = openGrid(4, 2, 2.5);
    for (const [i, j] of [
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      g.pace[at(g, i, j)] = 0;
    }
    expect(Array.from(largestRegion(g))).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    // mapa bez průchodné buňky – žádná oblast
    const closed = openGrid(2, 1, 2.5);
    closed.pace.fill(0);
    expect(Array.from(largestRegion(closed))).toEqual([0, 0]);
  });
});
