import { describe, it, expect } from 'vitest';
import {
  MAX_PIT_CUTS,
  PIT_SHAPES,
  insidePackedCut,
  insidePit,
  packPitCuts,
  pitMeshData,
  pitOutline,
  spoilHeapData,
  worldToLocal,
} from '../dwelling-pit';
import { localToWorld, pointInPolygon } from '../village-layout';
import type { Position } from '@bohemia/game';

const SUN = { x: -0.8, y: -0.6, z: -0.35 };

describe('tvar jámy', () => {
  it('zemnice 1 m, polozemnice 0,5 m, šíje široká jako dveře a míří ke vchodu (+z)', () => {
    expect(PIT_SHAPES.zemnice.depth).toBe(1);
    expect(PIT_SHAPES.polozemnice.depth).toBe(0.5);
    for (const shape of Object.values(PIT_SHAPES)) {
      expect(insidePit(shape, 0, 0)).toBe(true);
      expect(insidePit(shape, 0, shape.rampEndZ - 0.05)).toBe(true);
      expect(insidePit(shape, 0, -shape.halfZ - 0.05)).toBe(false);
      // vedle šíje už je terén
      expect(insidePit(shape, shape.rampHalfX + 0.05, shape.halfZ + 0.3)).toBe(false);
      expect(shape.rampHalfX).toBeCloseTo(0.42);
    }
  });

  it('obvod se šíjí obklopuje jámu i šíji, rozšířený obvod je větší', () => {
    const shape = PIT_SHAPES.zemnice;
    const outline = pitOutline(shape);
    expect(pointInPolygon(outline, 0, 0)).toBe(true);
    expect(pointInPolygon(outline, 0, 3.5)).toBe(true);
    expect(pointInPolygon(outline, 1, 3.5)).toBe(false);
    expect(pointInPolygon(pitOutline(shape, 0.3), 1.95, 0)).toBe(true);
  });

  it('worldToLocal je obrácené localToWorld', () => {
    const position: Position = { x: 12, z: -7, rotation: 2.1 };
    const [x, z] = localToWorld(position, 1.3, -0.4);
    const [lx, lz] = worldToLocal(position, x, z);
    expect(lx).toBeCloseTo(1.3);
    expect(lz).toBeCloseTo(-0.4);
  });
});

describe('data řezu terénu pro shader', () => {
  const cuts = [
    { position: { x: 0, z: 0, rotation: 0 }, shape: PIT_SHAPES.zemnice },
    { position: { x: 30, z: 10, rotation: Math.PI / 2 }, shape: PIT_SHAPES.polozemnice },
  ];

  it('bez jam nic neprořízne', () => {
    const packed = packPitCuts([]);
    expect(packed.count).toBe(0);
    expect(insidePackedCut(packed, 0, 0)).toBe(false);
  });

  it('prořízne jámu i šíji podle natočení, okolí nechá', () => {
    const packed = packPitCuts(cuts);
    expect(packed.count).toBe(2);
    expect(insidePackedCut(packed, 0, 0)).toBe(true);
    expect(insidePackedCut(packed, 0, 3.5)).toBe(true); // šíje zemnice (+z)
    expect(insidePackedCut(packed, 0, -3)).toBe(false);
    // polozemnice natočená o π/2: vchod míří do +x
    expect(insidePackedCut(packed, 30 + 2.8, 10)).toBe(true);
    expect(insidePackedCut(packed, 30, 10 + 2.8)).toBe(false);
  });

  it('obdélník všech jam je obsahuje celé a jam víc než limit se vynechá', () => {
    const packed = packPitCuts(cuts);
    const [minX, minZ, maxX, maxZ] = packed.bounds;
    expect(minX).toBeLessThan(-1.85);
    expect(maxX).toBeGreaterThan(33.1);
    expect(minZ).toBeLessThan(-2);
    expect(maxZ).toBeGreaterThan(12);
    const many = Array.from({ length: MAX_PIT_CUTS + 5 }, (_, i) => ({
      position: { x: i * 20, z: 0, rotation: 0 },
      shape: PIT_SHAPES.zemnice,
    }));
    expect(packPitCuts(many).count).toBe(MAX_PIT_CUTS);
  });
});

describe('síť jámy', () => {
  const position: Position = { x: 5, z: 5, rotation: 0.7 };
  const flat = (): number => 0;
  const build = (depth: number, extra: Partial<Parameters<typeof pitMeshData>[2]> = {}) =>
    pitMeshData(PIT_SHAPES.zemnice, position, {
      depth,
      base: -0.05,
      rim: flat,
      roofCover: 0,
      fresh: true,
      sun: SUN,
      ...extra,
    });

  it('dno je o hloubku pod patou, stěny sahají k terénu, indexy platné', () => {
    const data = build(1);
    expect(data.floorY).toBeCloseTo(-1.05);
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 1; i < data.positions.length; i += 3) {
      top = Math.max(top, data.positions[i]!);
      bottom = Math.min(bottom, data.positions[i]!);
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(0.05);
    expect(bottom).toBeCloseTo(-1.05);
    const vertices = data.positions.length / 3;
    expect(data.indices.length % 3).toBe(0);
    expect(Math.max(...data.indices)).toBeLessThan(vertices);
    expect(data.colors.length).toBe(vertices * 4);
  });

  it('všechny vrcholy leží v jámě nebo na jejím okraji', () => {
    const data = build(0.6);
    for (let v = 0; v < data.positions.length / 3; v++) {
      const [lx, lz] = worldToLocal(position, data.positions[v * 3]!, data.positions[v * 3 + 2]!);
      expect(pointInPolygon(pitOutline(PIT_SHAPES.zemnice, 0.01), lx, lz)).toBe(true);
    }
  });

  it('na svahu je dno těsně pod nejnižším okrajem, nikdy nad terénem', () => {
    // svah 0,3 m/m napříč – spodní okraj o 0,55 m níž než pata
    const slope = (x: number): number => 0.3 * (x - 5);
    const data = pitMeshData(
      PIT_SHAPES.zemnice,
      { x: 5, z: 5, rotation: 0 },
      {
        depth: 0.1,
        base: 0,
        rim: (x) => slope(x),
        roofCover: 0,
        fresh: true,
        sun: SUN,
      },
    );
    expect(data.floorY).toBeLessThan(slope(5 - 1.85));
  });

  it('stín okraje: u stěny na straně slunce je dno tmavší než u protější', () => {
    const data = build(0.8);
    const shape = PIT_SHAPES.zemnice;
    const underSunWall: number[] = [];
    const oppositeWall: number[] = [];
    // paprsky míří do (−0,8; −0,35) – slunce stojí na straně (+0,8; +0,35)
    const toSun = worldToLocal({ x: 0, z: 0, rotation: position.rotation }, 0.8, 0.35);
    for (let v = 0; v < data.positions.length / 3; v++) {
      if (Math.abs(data.positions[v * 3 + 1]! - data.floorY) > 1e-4) continue;
      const [lx, lz] = worldToLocal(position, data.positions[v * 3]!, data.positions[v * 3 + 2]!);
      if (Math.abs(lz) > shape.halfZ - 0.6) continue;
      const along = lx * toSun[0] + lz * toSun[1];
      const red = data.colors[v * 4]!;
      if (along > 1.2) underSunWall.push(red);
      if (along < -1.2) oppositeWall.push(red);
    }
    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    expect(underSunWall.length).toBeGreaterThan(3);
    expect(mean(oppositeWall)).toBeGreaterThan(mean(underSunWall) * 1.2);
  });

  it('pod střechou je jáma tmavší', () => {
    const open = build(1, { roofCover: 0 });
    const roofed = build(1, { roofCover: 1 });
    const sum = (c: Float32Array): number => c.reduce((a, b) => a + b, 0);
    expect(sum(roofed.colors)).toBeLessThan(sum(open.colors) * 0.85);
  });
});

describe('hromada hlíny', () => {
  it('leží patou na terénu, vrchol je nejvýš o výšku hromady (s hroudami)', () => {
    const ground = (x: number, z: number): number => 0.1 * x + 0.05 * z;
    const data = spoilHeapData({
      seed: 3,
      x: 10,
      z: 4,
      rotation: 0.5,
      rx: 1.5,
      rz: 1,
      height: 0.9,
      ground,
    });
    let maxLift = 0;
    for (let v = 0; v < data.positions.length / 3; v++) {
      const x = data.positions[v * 3]!;
      const z = data.positions[v * 3 + 2]!;
      const lift = data.positions[v * 3 + 1]! - ground(x, z);
      expect(lift).toBeGreaterThan(-0.05);
      maxLift = Math.max(maxLift, lift);
    }
    expect(maxLift).toBeGreaterThan(0.6);
    expect(maxLift).toBeLessThan(0.9 * 1.5);
    expect(Math.max(...data.indices)).toBeLessThan(data.positions.length / 3);
  });
});
