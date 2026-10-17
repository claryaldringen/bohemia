import { describe, expect, it } from 'vitest';
import { CEMETERY } from '@bohemia/game';
import {
  CEMETERY_PHASES,
  FENCE_HEIGHT_M,
  FRESH_GRAVES,
  GATE_WIDTH_M,
  GRAVE_GRID,
  cemeteryConstruction,
  fenceLayout,
  gravePlacements,
} from '../cemetery-layout';
import type { CellSquare } from '../field-cells';

const square = (cx: number, cy: number): CellSquare => ({
  cell: { x: cx, y: cy },
  x: cx * 15,
  z: cy * 15,
  size: 15,
});
const two = [square(0, 0), square(1, 0)];

describe('gravePlacements', () => {
  it('mřížka 7 × 8 = hroby čtverce podle pravidel', () => {
    expect(GRAVE_GRID.columns * GRAVE_GRID.rows).toBe(CEMETERY.gravesPerSquare);
  });

  it('hroby leží ve svých čtvercích, plní se po čtvercích; poslední jsou čerstvé', () => {
    const graves = gravePlacements(two, 60, 3);
    expect(graves).toHaveLength(60);
    for (const [i, g] of graves.entries()) {
      const s = two[i < 56 ? 0 : 1]!;
      expect(Math.abs(g.x - s.x)).toBeLessThan(7.5);
      expect(Math.abs(g.z - s.z)).toBeLessThan(7.5);
    }
    expect(graves.filter((g) => g.fresh)).toHaveLength(FRESH_GRAVES);
    expect(graves.at(-1)?.fresh).toBe(true);
    expect(graves[0]?.fresh).toBe(false);
  });

  it('deterministické; víc hrobů, než se vejde, se nekreslí', () => {
    expect(gravePlacements(two, 20, 9)).toEqual(gravePlacements(two, 20, 9));
    expect(gravePlacements(two, 500, 9)).toHaveLength(112);
    expect(gravePlacements(two, 0, 9)).toEqual([]);
  });
});

describe('fenceLayout', () => {
  it('plot kolem obrysu s brankou na úseku nejblíž k vsi', () => {
    // čtverce x −7,5 … 22,5, z −7,5 … 7,5; ves na jihu (−z)
    const fence = fenceLayout(two, { x: 7.5, z: -100 });
    expect(fence.corners).toHaveLength(4);
    const total = fence.runs.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    expect(total).toBeCloseTo(2 * (30 + 15) - GATE_WIDTH_M, 6);
    // branka: mezera na jižní straně (z = −7,5) kolem x = 7,5
    const south = fence.runs.filter(([a, b]) => a[1] === -7.5 && b[1] === -7.5);
    expect(south).toHaveLength(2);
    const gatePosts = fence.posts.filter((p) => p.gate);
    expect(gatePosts).toHaveLength(2);
    expect(gatePosts.every((p) => p.z === -7.5 && Math.abs(p.x - 7.5) < GATE_WIDTH_M)).toBe(true);
  });

  it('branka zůstane na místě, když se hřbitov rozšíří jinam; rozšíření ve stavbě branku nemá', () => {
    const village = { x: 0, z: -100 };
    const gate = (squares: CellSquare[]): string[] =>
      fenceLayout(squares, village)
        .posts.filter((p) => p.gate)
        .map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)
        .sort();
    const before = gate([square(0, 0)]);
    expect(before).toHaveLength(2);
    // rozšíření na sever (+z) a na východ – jižní strana u vsi zůstává
    expect(gate([square(0, 0), square(0, 1), square(1, 0), square(1, 1)])).toEqual(before);
    expect(fenceLayout([square(0, 1)], village, false).posts.some((p) => p.gate)).toBe(false);
  });

  it('úseky navazují v pořadí obcházení – kůly se zatloukají dokola', () => {
    const fence = fenceLayout([square(0, 0), square(1, 0), square(1, 1)], null);
    for (let i = 1; i < fence.posts.length; i++) {
      const a = fence.posts[i - 1]!;
      const b = fence.posts[i]!;
      // sousední kůly – nejvýš rozestup s rezervou (přes roh i branku)
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(2.5);
    }
  });

  it('kůly bez opakování v rozích, rozestup kolem 1,4 m', () => {
    const fence = fenceLayout([square(0, 0)], null);
    const keys = new Set(fence.posts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`));
    expect(keys.size).toBe(fence.posts.length);
    expect(fence.posts.length).toBeGreaterThan(38);
    expect(fence.posts.length).toBeLessThan(48);
  });
});

describe('cemeteryConstruction', () => {
  it('fáze navazují: vytyčení, kůly, pletení; hotové = celý plot', () => {
    expect(CEMETERY_PHASES[0].from).toBe(0);
    expect(CEMETERY_PHASES.at(-1)?.to).toBe(1);
    expect(cemeteryConstruction(0.05, false)).toEqual({ layout: true, posts: 0, wattleHeight: 0 });
    const posts = cemeteryConstruction(0.3, false);
    expect(posts.layout).toBe(true);
    expect(posts.posts).toBeCloseTo(0.5, 6);
    expect(posts.wattleHeight).toBe(0);
    const weaving = cemeteryConstruction(0.7, false);
    expect(weaving.posts).toBe(1);
    expect(weaving.wattleHeight).toBeGreaterThan(0);
    expect(weaving.wattleHeight).toBeLessThan(FENCE_HEIGHT_M);
    expect(cemeteryConstruction(0.2, true)).toEqual({
      layout: false,
      posts: 1,
      wattleHeight: FENCE_HEIGHT_M,
    });
  });
});
