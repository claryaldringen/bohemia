import { describe, expect, it } from 'vitest';
import { PLOT_HOUSE_OFFSET_M, PLOT_VARIANTS } from '@bohemia/game';
import {
  BED_WIDTH_M,
  FENCE_CORNER_RADIUS_M,
  FENCE_INSET_M,
  FENCE_POST_STEP_M,
  FENCE_RAILS_M,
  GATE_WIDTH_M,
  homesteadLayout,
  insidePlot,
  nextPlotVariant,
  plotFenceRect,
  plotHouse,
  plotInward,
  plotStage,
  plotStakingLine,
  polishFence,
} from '../homestead-layout';

const square = { x: 37.5, z: -22.5, size: 15 };

describe('polský plot se zakulacenými rohy', () => {
  const rect = plotFenceRect(square);

  it('kůly nejvýš po metru, v rozích po oblouku – žádný kůl v ostrém rohu', () => {
    const posts = polishFence(rect, null);
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i]!;
      const b = posts[(i + 1) % posts.length]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(FENCE_POST_STEP_M + 1e-9);
    }
    for (const [cx, cz] of [
      [rect.minX, rect.minZ],
      [rect.maxX, rect.minZ],
      [rect.maxX, rect.maxZ],
      [rect.minX, rect.maxZ],
    ] as const) {
      // nejbližší kůl k rohu obdélníku leží na oblouku – (√2 − 1)·r od rohu
      const nearest = Math.min(...posts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
      expect(nearest).toBeCloseTo((Math.SQRT2 - 1) * FENCE_CORNER_RADIUS_M, 1);
    }
    // směr ven je jednotkový a míří od středu
    for (const p of posts) {
      expect(Math.hypot(p.outX, p.outZ)).toBeCloseTo(1);
      expect((p.x - square.x) * p.outX + (p.z - square.z) * p.outZ).toBeGreaterThan(0);
    }
  });

  it('branka je mezera na přední straně (−z), kůly u ní jsou krajní a vyšší', () => {
    const posts = polishFence(rect, { x: square.x + 2, width: GATE_WIDTH_M });
    const first = posts[0]!;
    const last = posts[posts.length - 1]!;
    expect(first.gate && last.gate).toBe(true);
    expect(posts.filter((p) => p.gate)).toHaveLength(2);
    expect(first.z).toBeCloseTo(rect.minZ);
    expect(last.z).toBeCloseTo(rect.minZ);
    expect(first.x - last.x).toBeCloseTo(GATE_WIDTH_M);
    expect((first.x + last.x) / 2).toBeCloseTo(square.x + 2);
  });
});

describe('pozemek polozemnice – 5 variant', () => {
  it('dům uprostřed nebo v rohu (jako jádro), vchodem k brance proti dveřím', () => {
    const houses = PLOT_VARIANTS.map((v) => plotHouse(square, v));
    expect(new Set(houses.map((h) => `${h.x},${h.z}`)).size).toBe(5);
    for (const variant of PLOT_VARIANTS) {
      const layout = homesteadLayout(square, variant);
      const offset = PLOT_HOUSE_OFFSET_M[variant];
      expect(layout.house.x).toBeCloseTo(square.x + offset.x);
      expect(layout.house.z).toBeCloseTo(square.z + offset.z);
      const gateX = (layout.fence[0]!.x + layout.fence[layout.fence.length - 1]!.x) / 2;
      expect(gateX).toBeCloseTo(layout.house.x);
      expect(layout.fence[0]!.z).toBeCloseTo(square.z - square.size / 2 + FENCE_INSET_M);
    }
    expect(nextPlotVariant('center', 1)).toBe(PLOT_VARIANTS[1]);
    expect(nextPlotVariant('center', -1)).toBe(PLOT_VARIANTS.at(-1));
  });

  it('záhony leží uvnitř plotu, mimo dům, dvorek a cestičku k brance', () => {
    for (const variant of PLOT_VARIANTS) {
      const layout = homesteadLayout(square, variant);
      expect(layout.beds.length, variant).toBeGreaterThan(6);
      const rect = layout.fenceRect;
      const { house } = layout;
      const gateX = (layout.fence[0]!.x + layout.fence[layout.fence.length - 1]!.x) / 2;
      for (const bed of layout.beds) {
        const x0 = bed.x - bed.length / 2;
        const x1 = bed.x + bed.length / 2;
        const z0 = bed.z - BED_WIDTH_M / 2;
        const z1 = bed.z + BED_WIDTH_M / 2;
        expect(x0).toBeGreaterThan(rect.minX + 0.4);
        expect(x1).toBeLessThan(rect.maxX - 0.4);
        expect(z0).toBeGreaterThan(rect.minZ + 0.4);
        expect(z1).toBeLessThan(rect.maxZ - 0.4);
        // dům se střechou a valy
        const overHouse =
          x1 > house.x - 3.35 && x0 < house.x + 3.35 && z1 > house.z - 3.5 && z0 < house.z + 3.35;
        expect(overHouse, `${variant} ${bed.x},${bed.z}`).toBe(false);
        // cestička od branky ke dveřím
        const onPath = x1 > gateX - 0.75 && x0 < gateX + 0.75 && z0 < house.z - 3.5;
        expect(onPath, `${variant} ${bed.x},${bed.z}`).toBe(false);
      }
      // rostliny stojí na svých záhonech
      for (const plant of layout.plants) {
        const bed = layout.beds[plant.bed]!;
        expect(plant.crop).toBe(bed.crop);
        expect(Math.abs(plant.x - bed.x)).toBeLessThan(bed.length / 2);
        expect(Math.abs(plant.z - bed.z)).toBeLessThan(BED_WIDTH_M / 2);
      }
      expect(new Set(layout.beds.map((b) => b.crop)).size).toBe(4);
    }
  });

  it('stejné políčko a varianta = stejný pozemek', () => {
    expect(homesteadLayout(square, 'back-left')).toEqual(homesteadLayout(square, 'back-left'));
  });

  it('rekvizity se zrcadlí dovnitř pozemku: znaménka posunu domu v osách modelu', () => {
    expect(plotInward('center')).toEqual({ x: 0, z: 0 });
    expect(plotInward('back-left')).toEqual({ x: -1, z: 1 });
    expect(plotInward('front-right')).toEqual({ x: 1, z: -1 });
  });

  it('slepice uvnitř: bod v ohrazení s odstupem od plotu', () => {
    expect(insidePlot(square, square.x, square.z)).toBe(true);
    expect(insidePlot(square, square.x + 7.2, square.z)).toBe(false);
    expect(insidePlot(square, square.x + 6.8, square.z, 0.5)).toBe(false);
  });
});

describe('pozemek během stavby', () => {
  const layout = homesteadLayout(square, 'front-left');

  it('kůly přibývají po obvodu, větve až s posledním kůlem a zdola, záhony nakonec', () => {
    const none = plotStage(layout, { posts: 0, rails: 0, beds: 0 });
    expect(none.posts).toHaveLength(0);
    const half = plotStage(layout, { posts: 0.5, rails: 1, beds: 1 });
    expect(half.posts.length).toBe(Math.round(layout.fence.length / 2));
    // bez všech kůlů se nic neplete ani nesází záhony nezávisle
    expect(half.rails).toHaveLength(0);
    const low = plotStage(layout, { posts: 1, rails: 0.3, beds: 0 });
    const heights = new Set(low.rails.map((r) => r.height));
    expect(heights.size).toBe(Math.ceil(FENCE_RAILS_M.length * 0.3));
    expect(Math.max(...heights)).toBeLessThan(FENCE_RAILS_M.at(-1)!);
    expect(low.beds).toHaveLength(0);
    const full = plotStage(layout, { posts: 1, rails: 1, beds: 1 });
    expect(full.rails).toHaveLength(FENCE_RAILS_M.length * (layout.fence.length - 1));
    expect(full.beds).toHaveLength(layout.beds.length);
    expect(full.plants).toHaveLength(layout.plants.length);
  });

  it('větve obcházejí kůl střídavě vně a uvnitř', () => {
    const { rails } = plotStage(layout, { posts: 1, rails: 1, beds: 0 });
    const first = rails[0]!;
    const post = layout.fence[0]!;
    const side = (first.ax - post.x) * post.outX + (first.az - post.z) * post.outZ;
    const nextLevel = rails[layout.fence.length - 1]!;
    const sideNext = (nextLevel.ax - post.x) * post.outX + (nextLevel.az - post.z) * post.outZ;
    expect(Math.sign(side)).toBe(-Math.sign(sideNext));
  });

  it('vytyčení při zadání: kolíky a provázek po obdélníku budoucího plotu', () => {
    const line = plotStakingLine(square);
    const rect = plotFenceRect(square);
    expect(line).toHaveLength(5);
    expect(line[0]).toEqual(line[4]);
    expect(line).toContainEqual([rect.minX, rect.minZ]);
    expect(line).toContainEqual([rect.maxX, rect.maxZ]);
  });
});
