import { describe, expect, it } from 'vitest';
import type { Point } from '../village-layout';
import {
  RAIL_WEAVE_M,
  WOVEN_CORNER_RADIUS_M,
  WOVEN_INNER_CORNER_RADIUS_M,
  fencePosts,
  fenceStage,
  wovenFence,
  type FencePost,
  type FenceStyle,
} from '../woven-fence';

const style: FenceStyle = { postStep: 1, rails: [0.2, 0.4, 0.6, 0.8], gateWidth: 1.4 };
const dist = (p: FencePost, [x, z]: Point): number => Math.hypot(p.x - x, p.z - z);

/** Obdélník 0–12 × 0–8, ohrazení vlevo (proti směru hodinových ručiček v x, z). */
const rect: Point[] = [
  [0, 0],
  [12, 0],
  [12, 8],
  [0, 8],
];
/** Tvar L: obdélník 0–12 × 0–8 bez čtvrtiny 6–12 × 4–8, vnitřní roh v (6, 4). */
const ell: Point[] = [
  [0, 0],
  [12, 0],
  [12, 4],
  [6, 4],
  [6, 8],
  [0, 8],
];

function maxGap(posts: readonly FencePost[], closed: boolean): number {
  let gap = 0;
  const pairs = closed ? posts.length : posts.length - 1;
  for (let i = 0; i < pairs; i++) {
    const a = posts[i]!;
    const b = posts[(i + 1) % posts.length]!;
    gap = Math.max(gap, Math.hypot(b.x - a.x, b.z - a.z));
  }
  return gap;
}

describe('wovenFence – zakulacené rohy', () => {
  it('uzavřený plot bez branky: kůly nejvýš po kroku, v rohu po oblouku, ven od středu', () => {
    const fence = wovenFence([{ points: rect, closed: true }], style, null);
    expect(fence.runs).toHaveLength(1);
    const { posts, closed } = fence.runs[0]!;
    expect(closed).toBe(true);
    expect(maxGap(posts, true)).toBeLessThanOrEqual(style.postStep + 1e-9);
    for (const corner of rect) {
      const nearest = Math.min(...posts.map((p) => dist(p, corner)));
      // kůl uprostřed oblouku – (√2 − 1)·r od ostrého rohu
      expect(nearest).toBeCloseTo((Math.SQRT2 - 1) * WOVEN_CORNER_RADIUS_M, 6);
    }
    for (const p of posts) {
      expect(Math.hypot(p.outX, p.outZ)).toBeCloseTo(1, 9);
      expect((p.x - 6) * p.outX + (p.z - 4) * p.outZ).toBeGreaterThan(0);
    }
    const keys = new Set(posts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`));
    expect(keys.size).toBe(posts.length);
  });

  it('vnitřní roh tvaru L má malý oblouk vně ohrazení, vnější rohy velký', () => {
    const fence = wovenFence([{ points: ell, closed: true }], style, null);
    const posts = fencePosts(fence);
    expect(maxGap(posts, true)).toBeLessThanOrEqual(style.postStep + 1e-9);
    // u vnitřního rohu (6, 4) žádný kůl – plot ho objede po oblouku o poloměru 0,5 m
    const inner = Math.min(...posts.map((p) => dist(p, [6, 4])));
    expect(inner).toBeGreaterThan(WOVEN_INNER_CORNER_RADIUS_M * 0.9);
    expect(inner).toBeLessThan(WOVEN_INNER_CORNER_RADIUS_M * 1.1);
    for (const corner of ell.filter(([x, z]) => !(x === 6 && z === 4))) {
      const nearest = Math.min(...posts.map((p) => dist(p, corner)));
      expect(nearest).toBeCloseTo((Math.SQRT2 - 1) * WOVEN_CORNER_RADIUS_M, 6);
    }
  });

  it('otevřený kus začíná a končí přesně v koncových bodech, rohy uvnitř zakulacené', () => {
    const path: Point[] = [
      [0, 0],
      [10, 0],
      [10, 6],
    ];
    const fence = wovenFence([{ points: path, closed: false }], style, null);
    const { posts, closed } = fence.runs[0]!;
    expect(closed).toBe(false);
    expect(dist(posts[0]!, [0, 0])).toBeCloseTo(0, 9);
    expect(dist(posts[posts.length - 1]!, [10, 6])).toBeCloseTo(0, 9);
    expect(Math.min(...posts.map((p) => dist(p, [10, 0])))).toBeGreaterThan(0.4);
    // ohrazení vlevo – ven je vpravo (−z na první straně)
    expect(posts[1]!.outZ).toBeCloseTo(-1, 9);
    expect(maxGap(posts, false)).toBeLessThanOrEqual(style.postStep + 1e-9);
  });
});

describe('wovenFence – branka', () => {
  it('mezera na rovném úseku nejblíž k cíli; kus začíná a končí kůlem branky', () => {
    const fence = wovenFence([{ points: rect, closed: true }], style, {
      toward: { x: 4, z: -20 },
    });
    const { posts, closed } = fence.runs[0]!;
    expect(closed).toBe(false);
    const first = posts[0]!;
    const last = posts[posts.length - 1]!;
    expect(first.gate && last.gate).toBe(true);
    expect(posts.filter((p) => p.gate)).toHaveLength(2);
    expect(first.z).toBeCloseTo(0, 9);
    expect(last.z).toBeCloseTo(0, 9);
    expect(first.x - last.x).toBeCloseTo(style.gateWidth, 9);
    expect((first.x + last.x) / 2).toBeCloseTo(4, 9);
    expect(maxGap(posts, false)).toBeLessThanOrEqual(style.postStep + 1e-9);
  });

  it('branka se vejde i s kůlem po stranách – u rohu se odsune od oblouku', () => {
    const fence = wovenFence([{ points: rect, closed: true }], style, {
      toward: { x: -1, z: -5 },
    });
    const posts = fence.runs[0]!.posts;
    const center = (posts[0]!.x + posts[posts.length - 1]!.x) / 2;
    expect(center).toBeCloseTo(WOVEN_CORNER_RADIUS_M + style.postStep + style.gateWidth / 2, 9);
  });

  it('bez cíle uprostřed prvního úseku; další obrys (díra) zůstane uzavřený', () => {
    const hole: Point[] = [
      [4, 3],
      [4, 5],
      [8, 5],
      [8, 3],
    ];
    const fence = wovenFence(
      [
        { points: hole, closed: true },
        { points: rect, closed: true },
      ],
      { ...style, gateWidth: 2.5 },
      { toward: null },
    );
    // díra nemá dost dlouhý rovný úsek – branka je na vnějším obrysu, kus s brankou první
    expect(fence.runs).toHaveLength(2);
    expect(fence.runs[0]!.closed).toBe(false);
    expect(fence.runs[1]!.closed).toBe(true);
    const posts = fence.runs[0]!.posts;
    expect((posts[0]!.x + posts[posts.length - 1]!.x) / 2).toBeCloseTo(6, 9);
  });
});

describe('fenceStage', () => {
  const fence = wovenFence([{ points: rect, closed: true }], style, null);
  const count = fencePosts(fence).length;

  it('kůly přibývají v pořadí stavby, větve až se všemi kůly a zdola nahoru', () => {
    expect(fenceStage(fence, style, { posts: 0, rails: 1 })).toEqual({ posts: [], rails: [] });
    const half = fenceStage(fence, style, { posts: 0.5, rails: 1 });
    expect(half.posts).toEqual(fencePosts(fence).slice(0, Math.round(count / 2)));
    expect(half.rails).toHaveLength(0);
    const low = fenceStage(fence, style, { posts: 1, rails: 0.4 });
    expect(new Set(low.rails.map((r) => r.height))).toEqual(new Set([0.2, 0.4]));
    // uzavřený plot – větev vede i od posledního kůlu k prvnímu
    const full = fenceStage(fence, style, { posts: 1, rails: 1 });
    expect(full.rails).toHaveLength(style.rails.length * count);
  });

  it('větve obcházejí kůl střídavě vně a uvnitř – sousední výšky opačně', () => {
    const { rails, posts } = fenceStage(fence, style, { posts: 1, rails: 1 });
    const side = (i: number): number => {
      const rail = rails[i]!;
      const post = posts[rail.a]!;
      return ((rail.ax - post.x) * post.outX + (rail.az - post.z) * post.outZ) / RAIL_WEAVE_M;
    };
    expect(side(0)).toBeCloseTo(1, 9);
    expect(side(1)).toBeCloseTo(-1, 9);
    expect(side(count)).toBeCloseTo(-1, 9);
  });
});
