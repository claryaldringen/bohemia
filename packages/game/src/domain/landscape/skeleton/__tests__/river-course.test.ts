import { describe, expect, it } from 'vitest';
import { length2 } from '../../det-math';
import { RIVER, selfTouching } from '../../premium/river';
import { createRandom } from '../../random';
import type { ChannelSample } from '../../stream';
import type { Terrain } from '../../terrain';
import { CELL_SIZE_M, LANDSCAPE_SIZE, type StreamPoint } from '../../types';
import { carveRiverCourses, riversOf } from '../rivers';
import { planRiverCourses, type RiverCoursePlan } from '../river-course';
import { portTile } from '../ports-map';
import type { SkeletonRiverPort, SkeletonSlice } from '../types';

const SIZE = LANDSCAPE_SIZE;

/** Umělý terén: rovina klesající k jihu (sever = +y) a drobný šum. */
function slopedTerrain(): Terrain {
  const random = createRandom(3);
  const heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) heights[y * SIZE + x] = 0.15 * y + 2 * random.next();
  }
  return {
    size: SIZE,
    heights,
    water: new Uint8Array(SIZE * SIZE),
    villageSite: { x: 64, y: 64 },
    stream: [],
  };
}

const port = (
  side: SkeletonRiverPort['side'],
  at: number,
  widthM: number,
  flow: 'in' | 'out',
): SkeletonRiverPort => ({ side, at, widthM, flow });

const slice = (...rivers: SkeletonRiverPort[]): SkeletonSlice => ({ world: 1, rivers, trails: [] });

const CASES: Record<string, SkeletonSlice> = {
  rovně: slice(port('N', 60, 35, 'in'), port('S', 70, 35, 'out')),
  ohyb: slice(port('S', 90, 30, 'out'), port('W', 40, 30, 'in')),
  soutok: slice(port('N', 50, 40, 'in'), port('E', 64, 25, 'in'), port('S', 80, 45, 'out')),
  pramen: slice(port('S', 64, 25, 'out')),
};

interface Built {
  readonly slice: SkeletonSlice;
  readonly plans: RiverCoursePlan[];
  readonly terrain: Terrain;
  readonly rivers: readonly (readonly StreamPoint[])[];
}

function build(name: string): Built {
  const s = CASES[name]!;
  const terrain = slopedTerrain();
  const plans = planRiverCourses(terrain.heights, SIZE, s, createRandom(11));
  if (!plans) throw new Error(`trasa ${name} nevede`);
  carveRiverCourses(terrain, plans, 12, { floodplainCells: RIVER.floodplainCells });
  return { slice: s, plans, terrain, rivers: riversOf(terrain) };
}

const BUILT = Object.fromEntries(Object.keys(CASES).map((name) => [name, build(name)]));

const inflows = (s: SkeletonSlice): SkeletonRiverPort[] => s.rivers.filter((p) => p.flow === 'in');
const outflow = (s: SkeletonSlice): SkeletonRiverPort => s.rivers.find((p) => p.flow === 'out')!;

function near(a: { x: number; y: number }, b: { x: number; y: number }, cells: number): boolean {
  return length2(a.x - b.x, a.y - b.y) <= cells;
}

/** Souvislý úsek vodních políček na okraji kolem bodu `p` – šířka vody v bodě okraje (m). */
function edgeWaterM(terrain: Terrain, p: SkeletonRiverPort): number {
  const tile = portTile(p.side, p.at, SIZE);
  const along = p.side === 'N' || p.side === 'S' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const wet = (k: number): boolean => {
    const x = tile.x + along.x * k;
    const y = tile.y + along.y * k;
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE && terrain.water[y * SIZE + x] === 1;
  };
  let count = wet(0) ? 1 : 0;
  for (let k = 1; wet(k); k++) count++;
  for (let k = -1; wet(k); k--) count++;
  return count * CELL_SIZE_M;
}

/** Body osy jako vzorky toku (vzdálenost podél osy a šířky) pro `selfTouching`. */
function asSamples(river: readonly StreamPoint[]): ChannelSample[] {
  let s = 0;
  return river.map((p, k) => {
    if (k > 0) s += length2(p.x - river[k - 1]!.x, p.y - river[k - 1]!.y);
    return {
      x: p.x,
      y: p.y,
      s,
      tx: 0,
      ty: 0,
      left: p.halfWidthLeft,
      right: p.halfWidthRight,
      shallow: p.shallow,
      pool: false,
    };
  });
}

describe('portTile', () => {
  it('sever = poslední řádek (+z), východ = poslední sloupec, at od západu a od jihu', () => {
    expect(portTile('N', 30, SIZE)).toEqual({ x: 30, y: SIZE - 1 });
    expect(portTile('S', 30, SIZE)).toEqual({ x: 30, y: 0 });
    expect(portTile('E', 30, SIZE)).toEqual({ x: SIZE - 1, y: 30 });
    expect(portTile('W', 30, SIZE)).toEqual({ x: 0, y: 30 });
    expect(() => portTile('N', SIZE, SIZE)).toThrow(RangeError);
  });
});

describe('planRiverCourses', () => {
  it('výřez bez řeky nemá tok, vtok bez výtoku je chybný výřez', () => {
    const terrain = slopedTerrain();
    expect(planRiverCourses(terrain.heights, SIZE, slice(), createRandom(1))).toEqual([]);
    expect(() =>
      planRiverCourses(terrain.heights, SIZE, slice(port('N', 50, 30, 'in')), createRandom(1)),
    ).toThrow(RangeError);
  });

  it.each(Object.keys(CASES))(
    '%s: tok začíná u bodu vtoku, hlavní končí u výtoku, přítok na hlavním toku',
    (name) => {
      const { slice: s, plans } = BUILT[name]!;
      const ins = inflows(s);
      expect(plans).toHaveLength(Math.max(1, ins.length));
      expect(plans[0]!.joins).toBeNull();
      const main = plans[0]!;
      expect(near(main.cells.at(-1)!, portTile(outflow(s).side, outflow(s).at, SIZE), 1)).toBe(
        true,
      );
      for (const plan of plans) {
        const start = plan.cells[0]!;
        if (ins.length === 0) continue;
        expect(ins.some((p) => near(start, portTile(p.side, p.at, SIZE), 1))).toBe(true);
      }
      for (const plan of plans.slice(1)) {
        expect(plan.joins).toBe(0);
        const end = plan.cells.at(-1)!;
        expect(main.cells.some((c) => c.x === end.x && c.y === end.y)).toBe(true);
        expect(Math.min(end.x, end.y, SIZE - 1 - end.x, SIZE - 1 - end.y)).toBeGreaterThanOrEqual(
          20,
        );
      }
      // Hlavní tok od nejširšího vtoku (u pramene šířka výtoku).
      const widest = ins.length === 0 ? outflow(s).widthM : Math.max(...ins.map((p) => p.widthM));
      expect(main.fromWidthM).toBe(widest);
      expect(main.toWidthM).toBe(outflow(s).widthM);
    },
  );
});

describe('carveRiverCourses', () => {
  it.each(Object.keys(CASES))(
    '%s: osy řek od bodů okraje, přítok ústí do hlavního toku',
    (name) => {
      const { slice: s, terrain, rivers } = BUILT[name]!;
      const ins = inflows(s);
      expect(rivers).toHaveLength(Math.max(1, ins.length));
      const out = outflow(s);
      expect(near(rivers[0]!.at(-1)!, portTile(out.side, out.at, SIZE), 1)).toBe(true);
      if (ins.length > 0) {
        for (const river of rivers) {
          expect(ins.some((p) => near(river[0]!, portTile(p.side, p.at, SIZE), 1))).toBe(true);
        }
      }
      for (const river of rivers.slice(1)) {
        const end = river.at(-1)!;
        expect(terrain.water[Math.round(end.y) * SIZE + Math.round(end.x)]).toBe(1);
        const axis = Math.min(...rivers[0]!.map((p) => length2(p.x - end.x, p.y - end.y)));
        expect(axis).toBeLessThan(0.6);
      }
    },
  );

  it.each(Object.keys(CASES))('%s: šířka vody v bodě okraje = šířka výřezu ± 15 m', (name) => {
    const { slice: s, terrain, rivers } = BUILT[name]!;
    for (const p of s.rivers) {
      expect(Math.abs(edgeWaterM(terrain, p) - p.widthM)).toBeLessThanOrEqual(CELL_SIZE_M);
    }
    // I šířka osy v bodě okraje přesně podle výřezu.
    const out = outflow(s);
    const last = rivers[0]!.at(-1)!;
    expect((last.halfWidthLeft + last.halfWidthRight) * CELL_SIZE_M).toBeCloseTo(out.widthM, 6);
  });

  it.each(Object.keys(CASES))('%s: hladina po proudu neroste, tok se sám nedotkne', (name) => {
    const { rivers, terrain } = BUILT[name]!;
    for (const river of rivers) {
      for (let k = 1; k < river.length; k++) {
        expect(river[k]!.level).toBeLessThanOrEqual(river[k - 1]!.level + 1e-9);
      }
      expect(selfTouching(asSamples(river))).toBe(false);
    }
    // Přítok neústí pod hladinou hlavního toku v soutoku.
    for (const river of rivers.slice(1)) {
      const end = river.at(-1)!;
      const main = rivers[0]!;
      let k = 0;
      main.forEach((p, j) => {
        if (length2(p.x - end.x, p.y - end.y) < length2(main[k]!.x - end.x, main[k]!.y - end.y))
          k = j;
      });
      expect(end.level).toBeGreaterThanOrEqual(main[k]!.level - 1e-6);
    }
    // Výšky od nejnižšího políčka.
    expect(Math.min(...terrain.heights)).toBeGreaterThanOrEqual(0);
  });

  it('meandruje – osa hlavního toku se odchyluje od trasy', () => {
    const { plans, rivers } = BUILT['rovně']!;
    const cells = plans[0]!.cells;
    let far = 0;
    for (const p of rivers[0]!) {
      const d = Math.min(...cells.map((c) => length2(c.x - p.x, c.y - p.y)));
      far = Math.max(far, d);
    }
    expect(far).toBeGreaterThan(1);
  });

  it('stejný vstup = stejné koryto', () => {
    const again = build('soutok');
    expect(again.rivers).toEqual(BUILT['soutok']!.rivers);
    expect(again.terrain.heights).toEqual(BUILT['soutok']!.terrain.heights);
  });
});

describe('riversOf', () => {
  it('řeky kostry i řeka prémie, bez řeky prázdné', () => {
    const a: StreamPoint[] = [];
    const b: StreamPoint[] = [];
    expect(riversOf({})).toEqual([]);
    expect(riversOf({ river: a })).toEqual([a]);
    expect(riversOf({ rivers: [a, b] })).toEqual([a, b]);
  });
});
