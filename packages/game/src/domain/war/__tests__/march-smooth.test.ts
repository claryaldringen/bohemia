import { describe, expect, it } from 'vitest';
import { marchProgress } from '../march';
import { marchCellAt, marchCellCenter, type MarchGrid, type Pos } from '../march-grid';
import { gridSearch, octileCost } from '../march-search';
import { lineOfSight, pathAlong, smoothCells } from '../march-smooth';

// Vyhlazení trasy na dohled a rozdělení podle tempa (plán 2026-11-16-dense-forest – Rozhodnutí 6).

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

const at = (g: MarchGrid, i: number, j: number): number => j * g.width + i;
const dist = (a: Pos, b: Pos): number => Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
const polyline = (points: readonly Pos[]): number =>
  points.reduce((sum, p, k) => (k === 0 ? 0 : sum + dist(points[k - 1]!, p)), 0);

/** Řetěz buněk z hledání mezi body. */
function chain(g: MarchGrid, from: Pos, to: Pos): number[] {
  const target = marchCellAt(g, to);
  const ti = target % g.width;
  const tj = (target - ti) / g.width;
  return gridSearch(
    g,
    marchCellAt(g, from),
    (c) => c === target,
    (i, j) => octileCost(i - ti, j - tj),
  )!;
}

describe('dohled po mřížce', () => {
  it('volno – dohled; přes neprůchodnou buňku – ne', () => {
    const g = openGrid(20, 20, 1);
    expect(lineOfSight(g, { x: 1, z: 1 }, { x: 17.3, z: 9.6 })).toBe(true);
    g.pace[at(g, 9, 5)] = 0;
    expect(lineOfSight(g, { x: 1, z: 1 }, { x: 17.3, z: 9.6 })).toBe(false);
    expect(lineOfSight(g, { x: 1, z: 1 }, { x: 17.3, z: 1.2 })).toBe(true);
  });

  it('chybějící a nekonečné souřadnice průchod nezacyklí', { timeout: 2000 }, () => {
    // jen že průchod skončí – hodnota pro takový vstup nic neznamená
    const g = openGrid(20, 20, 1);
    expect(typeof lineOfSight(g, { x: 1, z: 1 }, { x: Number.NaN, z: 3 })).toBe('boolean');
    expect(typeof lineOfSight(g, { x: 1, z: 1 }, { x: Infinity, z: 3 })).toBe('boolean');
    expect(typeof lineOfSight(g, { x: -Infinity, z: 1 }, { x: 4, z: Infinity })).toBe('boolean');
    expect(
      pathAlong(g, [
        { x: 1, z: 1 },
        { x: 1e12, z: 3 },
      ]).points,
    ).toHaveLength(2);
  });

  it('přesně rohem mezi dvěma úhlopříčně neprůchodnými buňkami – ne', () => {
    const g = openGrid(4, 4, 1);
    g.pace[at(g, 1, 0)] = 0;
    g.pace[at(g, 0, 1)] = 0;
    expect(lineOfSight(g, { x: 0, z: 0 }, { x: 1, z: 1 })).toBe(false);
    // jedna z buněk u rohu volná – roh se pořád neřeže
    g.pace[at(g, 0, 1)] = 1;
    expect(lineOfSight(g, { x: 0, z: 0 }, { x: 1, z: 1 })).toBe(false);
    // obě volné – dohled
    g.pace[at(g, 1, 0)] = 1;
    expect(lineOfSight(g, { x: 0, z: 0 }, { x: 3, z: 3 })).toBe(true);
  });
});

describe('vyhlazení na dohled (Rozhodnutí 6)', () => {
  it('otevřená mřížka – rovně ze startu do cíle', () => {
    const g = openGrid(50, 50, 1);
    const from = { x: 0, z: 0 };
    const to = { x: 40, z: 17 };
    expect(smoothCells(g, chain(g, from, to), from, to)).toEqual([from, to]);
  });

  it('kolem překážky tvaru L – úseky na dohled, kratší než řetěz buněk', () => {
    const g = openGrid(50, 50, 1);
    for (let j = 5; j <= 40; j++) g.pace[at(g, 25, j)] = 0;
    for (let i = 10; i <= 25; i++) g.pace[at(g, i, 40)] = 0;
    const from = { x: 12.3, z: 30.6 };
    const to = { x: 41.2, z: 22.7 };
    const cells = chain(g, from, to);
    const points = smoothCells(g, cells, from, to);
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
    for (let k = 1; k < points.length; k++) {
      expect(lineOfSight(g, points[k - 1]!, points[k]!)).toBe(true);
    }
    const centres = cells.map((c) => marchCellCenter(g, c));
    centres[0] = from;
    centres[centres.length - 1] = to;
    expect(polyline(points)).toBeLessThanOrEqual(polyline(centres));
  });

  it('z místa těsně u rohu zdi bez dohledu – přes střed buňky startu', () => {
    const g = openGrid(10, 10, 1);
    g.pace[at(g, 3, 4)] = 0;
    // start v buňce (2, 4) u jejího severovýchodního rohu – úsečka k (4, 6) by řízla zeď
    const from = { x: 2.45, z: 3.6 };
    const to = { x: 4, z: 6 };
    const points = smoothCells(g, chain(g, from, to), from, to);
    for (let k = 1; k < points.length; k++) {
      expect(lineOfSight(g, points[k - 1]!, points[k]!)).toBe(true);
    }
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
  });
});

describe('úseky podle tempa (Rozhodnutí 6)', () => {
  it('rovný úsek 40 m přes pás tempa 1,5 široký 10 m', () => {
    const g = openGrid(50, 50, 1);
    for (let j = 0; j < 50; j++) for (let i = 20; i < 30; i++) g.pace[at(g, i, j)] = 1.5;
    const from = { x: 3, z: 12.3 };
    const to = { x: 43, z: 12.3 };
    const path = pathAlong(g, [from, to]);
    // start, vstup do pásu (x = 19,5), výstup (29,5), cíl
    expect(path.points).toHaveLength(4);
    expect(path.points[0]).toEqual(from);
    expect(path.points[1]!.x).toBeCloseTo(19.5, 9);
    expect(path.points[2]!.x).toBeCloseTo(29.5, 9);
    expect(path.points[3]).toEqual(to);
    expect(path.cells).toEqual([at(g, 3, 12), at(g, 20, 12), at(g, 30, 12), at(g, 43, 12)]);
    const meadow = path.meadowM[3]!;
    expect(Math.abs(meadow - (30 + 10 / 1.5))).toBeLessThanOrEqual(2 / 1024);
    expect(path.lengthM).toBeCloseTo(40, 9);
    const half = marchProgress(path, meadow / 2);
    expect(half.z).toBeCloseTo(12.3, 9);
    expect(half.x).toBeGreaterThan(from.x);
    expect(half.x).toBeLessThan(to.x);
  });

  it('úhlopříčný úsek – hranice tempa leží na úsečce, poloha podle metrů louky přesně', () => {
    const g = openGrid(50, 50, 1);
    for (let j = 0; j < 50; j++) for (let i = 20; i < 30; i++) g.pace[at(g, i, j)] = 0.25;
    const from = { x: 3.2, z: 4.1 };
    const to = { x: 44.7, z: 31.9 };
    const path = pathAlong(g, [from, to]);
    expect(path.points).toHaveLength(4);
    const cross = (p: Pos): number =>
      (to.x - from.x) * (p.z - from.z) - (to.z - from.z) * (p.x - from.x);
    for (const p of path.points) expect(Math.abs(cross(p))).toBeLessThan(1e-9);
    // v lese čtyřikrát tolik metrů louky
    const inForest = dist(path.points[1]!, path.points[2]!);
    expect(path.meadowM[2]! - path.meadowM[1]!).toBeCloseTo(4 * inForest, 2);
    // uprostřed lesa je poloha uprostřed jeho úseku
    const middle = marchProgress(path, (path.meadowM[1]! + path.meadowM[2]!) / 2);
    expect(middle.x).toBeCloseTo((path.points[1]!.x + path.points[2]!.x) / 2, 6);
  });

  it('neprůchodná buňka má tempo louky, opakovaný bod se vynechá, trasa má aspoň dva body', () => {
    const g = openGrid(20, 20, 1);
    g.pace[at(g, 5, 5)] = 0;
    const path = pathAlong(g, [
      { x: 5, z: 5 },
      { x: 5, z: 5 },
      { x: 9, z: 5 },
    ]);
    expect(path.points).toEqual([
      { x: 5, z: 5 },
      { x: 9, z: 5 },
    ]);
    expect(path.meadowM).toEqual([0, 4]);
    const still = pathAlong(g, [{ x: 2, z: 2 }]);
    expect(still.points).toEqual([
      { x: 2, z: 2 },
      { x: 2, z: 2 },
    ]);
    expect(still.meadowM).toEqual([0, 0]);
  });
});
