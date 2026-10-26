import { describe, expect, it } from 'vitest';
import { FENCE_CLEARANCE } from '../rules-roads';
import { fenceDistance, fenceOutline, type FenceOutline } from '../paths/entrances';
import { fenceClearance, villageFences } from '../paths/fences';
import { cellX, cellZ, villageGrid } from '../paths/network-grid';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { routeLine, routePoints, type RouteCode } from '../paths/routes';
import { house, part, pathTestTerrain } from './paths-fixtures';

// Odstup od plotu (paths.md – Odstup od plotu): mřížka chodců a osa trasy.

const terrain = pathTestTerrain();
const CELL_M = 3.75;

function village(extra: Partial<PathVillage> = {}): PathVillage {
  return {
    dwellings: [house(1, 0, 0)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 4, adults: 8, elders: 2 }, shares: [] },
    ...extra,
  };
}

const cellAt = (g: ReturnType<typeof villageGrid>, x: number, z: number): number =>
  Math.round((z - g.originZ) / g.cellM) * g.width + Math.round((x - g.originX) / g.cellM);

/** Trasa po buňkách světa (krok nejvýš jedna buňka v každé ose) jako kód trasy. */
function routeOf(cells: readonly (readonly [number, number])[]): RouteCode {
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  // 3 bity na krok, dva kroky na znak (routes.ts) – přes routePoints se ověří, že sedí
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const steps: number[] = [];
  for (let k = 1; k < cells.length; k++) {
    const dx = cells[k]![0] - cells[k - 1]![0];
    const dz = cells[k]![1] - cells[k - 1]![1];
    steps.push(dirs.findIndex(([a, b]) => a === dx && b === dz));
  }
  let code = '';
  for (let k = 0; k < steps.length; k += 2) {
    code += k + 1 < steps.length ? B64[steps[k]! * 8 + steps[k + 1]!] : `${B64[steps[k]! * 8]}=`;
  }
  return { start: [cells[0]![0], cells[0]![1]], steps: code };
}

/** Nejmenší odstup osy od plotů po 0,25 m mimo `skip` metrů od konců. */
function minClearance(
  line: readonly { x: number; z: number }[],
  fences: FenceOutline[],
  skip: number,
): number {
  let best = Infinity;
  const a0 = line[0]!;
  const a1 = line[line.length - 1]!;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!;
    const b = line[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const z = a.z + ((b.z - a.z) * i) / n;
      if (Math.hypot(x - a0.x, z - a0.z) < skip || Math.hypot(x - a1.x, z - a1.z) < skip) continue;
      best = Math.min(best, fenceClearance(fences, x, z, 10));
    }
  }
  return best;
}

describe('odstup od plotu', () => {
  it('plot čtverce: rovné úseky, oblouk rohu a vnitřek', () => {
    const fence = fenceOutline([{ cell: { x: 0, y: 0 }, x: 0, z: 0, size: 15 }], 1.5)!;
    // plot 1,5 m uvnitř čtverce: strana x = 6
    expect(fenceDistance(fence, 10, 0)).toBeCloseTo(4, 6);
    expect(fenceDistance(fence, 0, 0)).toBeCloseTo(6, 6);
    // roh – oblouk o poloměru 1,25 se středem (4,75; 4,75)
    expect(fenceDistance(fence, 7.5, 7.5)).toBeCloseTo(Math.hypot(2.75, 2.75) - 1.25, 6);
    expect(
      fenceDistance(fence, 6 - 1.25 + 1.25 * Math.SQRT1_2, 4.75 + 1.25 * Math.SQRT1_2),
    ).toBeCloseTo(0, 6);
    expect(fence.inside(0, 0)).toBe(true);
    expect(fence.inside(5.9, 0)).toBe(true);
    expect(fence.inside(6.1, 0)).toBe(false);
  });

  it('mřížka chodců: pruh u plotu neprůchodný, řada na hranici čtverců dražší, dál beze změny', () => {
    const pens = [{ ...part(0, 37.5), id: 4, built: true, stocked: false }];
    const open = villageGrid({ village: village(), terrain }, []);
    const grid = villageGrid({ village: village({ pens }), terrain }, []);
    const gate = villageFences(village({ pens }), false)[0]!.gate!;
    // řada na hranici čtverce (1,5 m od plotu) daleko od branky – dražší o `nearCost`
    for (const [x, z] of [
      [-7.5, 37.5],
      [7.5, 37.5],
      [0, 45],
      [0, 30],
    ] as const) {
      if (Math.hypot(x - gate.x, z - gate.z) < 5) continue;
      const c = cellAt(grid, x, z);
      expect(grid.base[c]! / open.base[c]!).toBeCloseTo(FENCE_CLEARANCE.nearCost, 5);
    }
    // o řadu dál beze změny
    const far = cellAt(grid, 11.25, 37.5);
    expect(grid.base[far]).toBe(open.base[far]);
  });

  it('natočená ohrada: střed buňky uvnitř plotu nebo do `axisM` od něj je neprůchodný (kromě branky)', () => {
    const pens = [{ ...part(0, 37.5), rotation: Math.PI / 12, id: 4, built: true }];
    const v = village({ pens });
    const grid = villageGrid({ village: v, terrain }, []);
    const { outline, gate } = villageFences(v, false)[0]!;
    let checked = 0;
    for (let c = 0; c < grid.width * grid.height; c++) {
      const x = cellX(grid, c);
      const z = cellZ(grid, c);
      if (Math.abs(x) > 15 || Math.abs(z - 37.5) > 15) continue;
      if (gate && Math.hypot(x - gate.x, z - gate.z) < 4) continue;
      if (outline.inside(x, z) || fenceDistance(outline, x, z) < FENCE_CLEARANCE.axisM) {
        expect(grid.base[c]).toBe(Infinity);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('ulička mezi dvěma ohradami zůstává průchodná (jen dražší)', () => {
    const pens = [
      { ...part(-7.5, 37.5), id: 4, built: true, stocked: false },
      { ...part(7.5, 37.5), id: 5, built: true, stocked: false },
    ];
    const grid = villageGrid({ village: village({ pens }), terrain }, []);
    for (const z of [33.75, 37.5, 41.25])
      expect(Number.isFinite(grid.base[cellAt(grid, 0, z)]!)).toBe(true);
  });

  it('trasa sítě vede nejvýš řadou na hranici čtverců – žádná buňka do `axisM` od plotu mimo branku', () => {
    const cemetery = { id: 7, squares: [part(-7.5, -37.5), part(7.5, -37.5)], built: true };
    const v = village({ cemeteries: [cemetery] });
    const network = computePathNetwork({ village: v, terrain, keepRoutes: true });
    const [{ outline, gate }] = villageFences(v, false) as [
      ReturnType<typeof villageFences>[number],
    ];
    const near = network.lines
      .flatMap((l) => l.points)
      .filter((p) => !gate || Math.hypot(p.x - gate.x, p.z - gate.z) > 4)
      .filter((p) => outline.inside(p.x, p.z));
    expect(near).toEqual([]);
  });

  it('osa trasy neusekne roh plotu (oblouk) a podél plotu drží odstup', () => {
    // hřbitov o jednom čtverci kolem počátku, trasa po východní řadě hranice čtverců (x = 7,5) na jih,
    // za JV rohem po jižní řadě (z = −7,5) na západ
    const fences = [fenceOutline([{ cell: { x: 0, y: 0 }, x: 0, z: 0, size: 15 }], 1.5)!];
    const cells: [number, number][] = [];
    for (let j = 16; j >= -2; j--) cells.push([2, j]);
    for (let i = 1; i >= -10; i--) cells.push([i, -2]);
    const route = routeOf(cells);
    const raw = routePoints(route, CELL_M);
    expect(raw[0]).toEqual({ x: 7.5, z: 60 });
    expect(raw[raw.length - 1]).toEqual({ x: -37.5, z: -7.5 });
    const plain = routeLine(route, CELL_M);
    const kept = routeLine(route, CELL_M, fences);
    // bez plotů vyhlazení roh usekne – přes plot
    expect(minClearance(plain, fences, FENCE_CLEARANCE.gateM)).toBeLessThan(FENCE_CLEARANCE.axisM);
    expect(minClearance(kept, fences, FENCE_CLEARANCE.gateM)).toBeGreaterThanOrEqual(
      FENCE_CLEARANCE.axisM - 0.01,
    );
    // konce zůstanou
    expect(kept[0]).toEqual(raw[0]);
    expect(kept[kept.length - 1]).toEqual(raw[raw.length - 1]);
    // trasa daleko od plotu beze změny
    expect(
      routeLine(route, CELL_M, [
        fenceOutline([{ cell: { x: 20, y: 20 }, x: 300, z: 300, size: 15 }], 1.5)!,
      ]),
    ).toEqual(plain);
  });

  it('trasa k brance do branky dojde – konec u plotu se nehlídá', () => {
    const fences = [fenceOutline([{ cell: { x: 0, y: 0 }, x: 0, z: 0, size: 15 }], 1.5)!];
    // od severu k brance na severní straně (z = 6): poslední buňka 1,5 m před plotem
    const cells: [number, number][] = [];
    for (let j = 20; j >= 9; j--) cells.push([3, j]);
    cells.push([2, 8], [1, 7]);
    for (let j = 6; j >= 2; j--) cells.push([0, j]);
    const route = routeOf(cells);
    const raw = routePoints(route, CELL_M);
    const line = routeLine(route, CELL_M, fences);
    expect(line[line.length - 1]).toEqual(raw[raw.length - 1]);
    expect(
      fenceDistance(fences[0]!, line[line.length - 1]!.x, line[line.length - 1]!.z),
    ).toBeCloseTo(1.5, 6);
  });
});
