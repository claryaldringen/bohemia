import { describe, expect, it } from 'vitest';
import { DWELLING_PATH_BOX_M, PATH_WALK, type PathLine } from '@bohemia/game';
import { pathRouter } from '../path-router';
import { createVillagerPose, route, shuttle } from '../villager-motion';
import { houseBox } from '../villager-plan';

/** Pěšina po ose x z `from` do `to` (body po 5 m) se stálou silou. */
function line(from: number, to: number, strength: number): PathLine {
  const points = [];
  for (let x = from; x <= to + 1e-9; x += 5) points.push({ x, z: 0 });
  return {
    points,
    strength: points.map(() => strength),
    years: points.map(() => 10),
    openStart: true,
    openEnd: true,
  };
}

describe('pathRouter – chůze postav po pěšinách', () => {
  it('k pěšině, po ní a od ní k cíli; na pěšině rychlejší tempo', () => {
    const router = pathRouter({ lines: [line(0, 100, 1)] });
    const r = router.route({ x: -2, z: 4 }, { x: 102, z: 3 })!;
    expect(r.points[0]).toEqual([-2, 4]);
    expect(r.points[r.points.length - 1]).toEqual([102, 3]);
    expect(r.pace).toHaveLength(r.points.length - 1);
    expect(r.pace[0]).toBe(1);
    expect(r.pace[r.pace.length - 1]).toBe(1);
    const inner = r.pace.slice(1, -1);
    for (const p of inner) expect(p).toBeCloseTo(PATH_WALK.speed, 9);
  });

  it('daleko od pěšin nebo bez sítě se jde rovnou', () => {
    expect(pathRouter({ lines: [] }).route({ x: 0, z: 0 }, { x: 50, z: 0 })).toBeNull();
    const router = pathRouter({ lines: [line(0, 100, 1)] });
    expect(router.route({ x: 0, z: 200 }, { x: 50, z: 200 })).toBeNull();
  });

  it('postava jde po pěšině rychleji (a rychleji kráčí)', () => {
    const points: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const options = {
      outClip: 'walk' as const,
      outSpeed: 1,
      endClip: 'weed' as const,
      endS: 0,
      backClip: 'carry' as const,
      backSpeed: 1,
      restClip: 'idle' as const,
      restS: 0,
      phase: 0,
    };
    const plain = shuttle(route(points), options);
    const trodden = shuttle(route(points, [4 / 3]), options);
    const a = plain(50, [], createVillagerPose());
    const b = trodden(50, [], createVillagerPose());
    expect(a.x).toBeCloseTo(50, 6);
    expect(b.x).toBeCloseTo(50 * (4 / 3), 6);
    expect(b.pace).toBeCloseTo(4 / 3, 9);
  });
});

describe('obdélník domu pro pěšiny sedí s postavami ve scéně', () => {
  it('DWELLING_PATH_BOX_M = houseBox (dům se šíjí)', () => {
    for (const type of ['zemnice', 'polozemnice'] as const) {
      const scene = houseBox(type);
      const box = DWELLING_PATH_BOX_M[type];
      expect(box.minX).toBeCloseTo(scene.minX, 9);
      expect(box.maxX).toBeCloseTo(scene.maxX, 9);
      expect(box.minZ).toBeCloseTo(scene.minZ, 9);
      expect(box.maxZ).toBeCloseTo(scene.maxZ, 9);
    }
  });
});
