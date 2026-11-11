import { describe, expect, it } from 'vitest';
import { churchParts, defaultChurchDims, wallThickness } from '@bohemia/game';
import type { ChurchType } from '@bohemia/game';
import {
  churchMeshData,
  churchScaffoldData,
  triangleCount,
  type ChurchMeshArrays,
  type ChurchProgress,
} from '../church-mesh';

const DONE: ChurchProgress = { foundation: 1, walls: 1, roof: 1, decor: 1 };

function build(
  type: ChurchType,
  progress: ChurchProgress = DONE,
): ReturnType<typeof churchMeshData> {
  return churchMeshData(churchParts(type, defaultChurchDims(type)), progress, wallThickness);
}

function maxY(a: ChurchMeshArrays): number {
  let m = -Infinity;
  for (let i = 1; i < a.positions.length; i += 3) m = Math.max(m, a.positions[i]!);
  return m;
}

/** Podíl trojúhelníků, jejichž pořadí vrcholů (proti směru hodin) odpovídá uložené normále. */
function windingMatch(a: ChurchMeshArrays): number {
  let ok = 0;
  const n = a.indices.length / 3;
  for (let t = 0; t < n; t++) {
    const [i, j, k] = [a.indices[3 * t]!, a.indices[3 * t + 1]!, a.indices[3 * t + 2]!];
    const p = (v: number): number[] => a.positions.slice(3 * v, 3 * v + 3);
    const [p0, p1, p2] = [p(i), p(j), p(k)] as [number[], number[], number[]];
    const u = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!] as const;
    const v = [p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!] as const;
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nn = a.normals.slice(3 * i, 3 * i + 3);
    const dot = g[0]! * nn[0]! + g[1]! * nn[1]! + g[2]! * nn[2]!;
    if (dot > 0 || Math.hypot(...g) < 1e-9) ok++;
  }
  return n === 0 ? 1 : ok / n;
}

describe('churchMeshData', () => {
  it('rotunda a bazilika mají zdi, střechy i otvory a bazilika je větší', () => {
    const rot = build('rotunda');
    const bas = build('basilica');
    for (const d of [rot, bas]) {
      expect(triangleCount(d.walls)).toBeGreaterThan(0);
      expect(triangleCount(d.roofs)).toBeGreaterThan(0);
      expect(triangleCount(d.openings)).toBeGreaterThan(0);
    }
    // bazilika (kruh má víc úseků, ale míň oken) má víc otvorů a je delší než rotunda
    expect(triangleCount(bas.openings)).toBeGreaterThan(triangleCount(rot.openings));
    expect(Math.max(...bas.walls.positions)).toBeGreaterThan(Math.max(...rot.walls.positions));
  });

  it('výška zdí roste s postupem zdí', () => {
    const heights = [0.25, 0.5, 1].map((walls) =>
      maxY(build('apse', { foundation: 1, walls, roof: 0, decor: 0 }).walls),
    );
    expect(heights[0]!).toBeLessThan(heights[1]!);
    expect(heights[1]!).toBeLessThan(heights[2]!);
  });

  it('bez střech při roof = 0, i když jsou zdi hotové', () => {
    for (const type of ['rotunda', 'chancel', 'apse', 'basilica'] as const) {
      const d = build(type, { foundation: 1, walls: 1, roof: 0, decor: 0 });
      expect(triangleCount(d.roofs)).toBe(0);
      expect(triangleCount(d.walls)).toBeGreaterThan(0);
    }
  });

  it('střecha roste po částech', () => {
    const half = triangleCount(build('rotunda', { ...DONE, roof: 0.5 }).roofs);
    const full = triangleCount(build('rotunda').roofs);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('jen základy – nízký sokl bez oken', () => {
    const d = build('chancel', { foundation: 1, walls: 0, roof: 0, decor: 0 });
    expect(maxY(d.walls)).toBeCloseTo(0.3, 5);
    expect(triangleCount(d.openings)).toBe(0);
  });

  it('nic nezačato = prázdné sítě', () => {
    const d = build('rotunda', { foundation: 0, walls: 0, roof: 0, decor: 0 });
    expect(triangleCount(d.walls)).toBe(0);
  });

  it('žádné NaN, platné indexy a shodné délky polí', () => {
    for (const type of ['rotunda', 'chancel', 'apse', 'basilica'] as const) {
      const d = build(type);
      for (const a of [d.walls, d.roofs, d.openings]) {
        const verts = a.positions.length / 3;
        expect(a.normals.length).toBe(a.positions.length);
        expect(a.colors.length).toBe(verts * 4);
        expect(a.uvs.length).toBe(verts * 2);
        expect([...a.positions, ...a.normals, ...a.uvs].every(Number.isFinite)).toBe(true);
        expect(a.indices.every((i) => i >= 0 && i < verts)).toBe(true);
      }
    }
  });

  it('pořadí vrcholů odpovídá normálám (vnější strana)', () => {
    for (const type of ['rotunda', 'basilica'] as const) {
      const d = build(type);
      expect(windingMatch(d.walls)).toBeGreaterThan(0.99);
      // u kuželů nese vrchol střechy průměrnou normálu, proto s tolerancí
      expect(windingMatch(d.roofs)).toBeGreaterThan(0.95);
      expect(windingMatch(d.openings)).toBeGreaterThan(0.99);
    }
  });

  it('počty trojúhelníků (hlídá nechtěnou změnu)', () => {
    const counts = (['rotunda', 'basilica'] as const).map((t) => {
      const d = build(t);
      return [triangleCount(d.walls), triangleCount(d.roofs), triangleCount(d.openings)];
    });
    // [zdi, střechy, otvory] – rotunda a bazilika v základních rozměrech
    expect(counts).toEqual([
      [296, 50, 40],
      [178, 21, 104],
    ]);
  });
});

describe('churchScaffoldData', () => {
  const parts = churchParts('apse', defaultChurchDims('apse'));
  it('lešení jen při rozestavěných zdech', () => {
    expect(triangleCount(churchScaffoldData(parts, 0, wallThickness))).toBe(0);
    expect(triangleCount(churchScaffoldData(parts, 0.5, wallThickness))).toBeGreaterThan(0);
    expect(triangleCount(churchScaffoldData(parts, 1, wallThickness))).toBe(0);
  });
});
