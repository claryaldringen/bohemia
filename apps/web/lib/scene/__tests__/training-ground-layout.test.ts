import { describe, expect, it } from 'vitest';
import { homesteadLayout, plotFenceRect, type PlotSquare } from '../homestead-layout';
import {
  RANGE_M,
  hutTrainingGround,
  manorTrainingGround,
  rangeStrip,
  trainingGroundOf,
} from '../training-ground-layout';
import type { SceneVillage } from '../../village-view';

// Cvičiště vojvodovy rodiny (lord.md – Terče a cvičiště na dvorku): jen scéna, poloha z obydlí.

const MANORS: PlotSquare[] = [
  { x: 7.5, z: 7.5, size: 15, yard: { x: 7.5, z: -7.5 } },
  { x: 7.5, z: 7.5, size: 15, yard: { x: 7.5, z: 22.5 } },
  { x: 7.5, z: 7.5, size: 15, yard: { x: 22.5, z: 7.5 } },
  { x: 7.5, z: 7.5, size: 15, yard: { x: -7.5, z: 7.5 } },
];

const inside = (square: PlotSquare, x: number, z: number, margin = 0): boolean => {
  const r = plotFenceRect(square);
  return x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin;
};

describe('cvičiště na dvorku dvorce', () => {
  it('terče, kůl, stojan a místa cvičících uvnitř plotu', () => {
    for (const square of MANORS) {
      const ground = manorTrainingGround(square);
      expect(ground.pieces.filter((p) => p.part === 'target')).toHaveLength(2);
      for (const piece of ground.pieces) expect(inside(square, piece.x, piece.z, 0.2)).toBe(true);
      const spots = [
        ...ground.lanes.flatMap((l) => [l.shoot, l.wait]),
        ...ground.pairs.flat(),
        ground.post,
      ];
      for (const s of spots) expect(inside(square, s.x, s.z, 0.3)).toBe(true);
    }
  });

  it('střelnice ≈ 20 m podél delší osy a nemíří na bránu', () => {
    for (const square of MANORS) {
      const ground = manorTrainingGround(square);
      const gate = homesteadLayout(square, 'center').gate!;
      const axis = { x: square.yard!.x - square.x, z: square.yard!.z - square.z };
      const len = Math.hypot(axis.x, axis.z);
      for (const lane of ground.lanes) {
        const dx = lane.target.x - lane.shoot.x;
        const dz = lane.target.z - lane.shoot.z;
        expect(Math.hypot(dx, dz)).toBeCloseTo(RANGE_M, 0);
        // podél delší osy dvorce
        expect(Math.abs((dx * axis.x + dz * axis.z) / len / Math.hypot(dx, dz))).toBeCloseTo(1, 3);
        // střelec hledí k terči
        expect(lane.shoot.headingX * dx + lane.shoot.headingZ * dz).toBeGreaterThan(0);
        // přímka střelby míjí bránu (průchod 2,4 m) o víc než metr
        const cross = Math.abs(
          ((gate.x - lane.shoot.x) * dz - (gate.z - lane.shoot.z) * dx) / Math.hypot(dx, dz),
        );
        expect(cross).toBeGreaterThan(1.2 + 1);
      }
    }
  });

  it('pruh střelnice (bez záhonů) obsahuje střelce i terče', () => {
    const square = MANORS[0]!;
    const strip = rangeStrip(square);
    const ground = manorTrainingGround(square);
    for (const lane of ground.lanes) {
      for (const p of [lane.shoot, lane.target]) {
        expect(p.x).toBeGreaterThan(strip.minX);
        expect(p.x).toBeLessThan(strip.maxX);
        expect(p.z).toBeGreaterThan(strip.minZ);
        expect(p.z).toBeLessThan(strip.maxZ);
      }
    }
  });
});

describe('bez dvorce – terč u zemnice', () => {
  const home = { x: 0, z: 0, rotation: 0 };
  const others = [
    { x: 20, z: 0 },
    { x: 15, z: 12 },
  ];

  it('1 terč a kůl mimo obydlí, odvrácené od ostatních obydlí, střílí se ven ze vsi', () => {
    const ground = hutTrainingGround(home, 4, others);
    const targets = ground.pieces.filter((p) => p.part === 'target');
    expect(targets).toHaveLength(1);
    expect(ground.pieces.filter((p) => p.part === 'post')).toHaveLength(1);
    const target = targets[0]!;
    // mimo obydlí – ≈ 10 m od jeho okraje
    expect(Math.hypot(target.x, target.z)).toBeGreaterThan(4 + 8);
    // na straně odvrácené od ostatních obydlí
    for (const o of others) expect(target.x * o.x + target.z * o.z).toBeLessThan(0);
    for (const o of others) {
      expect(Math.hypot(target.x - o.x, target.z - o.z)).toBeGreaterThan(Math.hypot(o.x, o.z));
    }
    // střelec stojí mezi obydlím a terčem a střílí ven
    const lane = ground.lanes[0]!;
    expect(Math.hypot(lane.shoot.x, lane.shoot.z)).toBeGreaterThan(4);
    expect(lane.shoot.headingX * target.x + lane.shoot.headingZ * target.z).toBeGreaterThan(0);
  });

  it('osamělá zemnice – terč před vchodem', () => {
    const ground = hutTrainingGround({ x: 0, z: 0, rotation: Math.PI / 2 }, 4, []);
    const target = ground.pieces.find((p) => p.part === 'target')!;
    expect(target.x).toBeGreaterThan(10);
    expect(Math.abs(target.z)).toBeLessThan(1e-6);
  });
});

describe('trainingGroundOf – kde cvičiště stojí', () => {
  const dwelling = (id: number, x: number, z: number, extra = {}) => ({
    id,
    type: 'zemnice' as const,
    position: { x, z, rotation: 0 },
    built: true,
    progress: 1,
    ...extra,
  });

  it('dvorec s dvorem – vždy na dvorku; bez dvorce u obydlí cvičící rodiny', () => {
    const plot = {
      cell: { x: 0, y: 0 },
      x: 7.5,
      z: 7.5,
      size: 15,
      variant: 'center' as const,
      yard: { cell: { x: 0, y: -1 }, x: 7.5, z: -7.5 },
    };
    const manor = { dwellings: [dwelling(1, 7.5, 7.5, { plot }), dwelling(2, 40, 0)] };
    expect(trainingGroundOf(manor as SceneVillage)?.home).toBe(1);
    const hut = {
      dwellings: [dwelling(1, 0, 0), dwelling(2, 20, 0)],
      labor: { lord: { home: 1, trainees: [], household: [] } },
    };
    const ground = trainingGroundOf(hut as unknown as SceneVillage);
    expect(ground?.home).toBe(1);
    expect(ground!.pieces.find((p) => p.part === 'target')!.x).toBeLessThan(0);
    // rodina necvičí a dvorec nemá dvůr – žádné cvičiště
    expect(trainingGroundOf({ dwellings: hut.dwellings } as SceneVillage)).toBeNull();
  });
});
