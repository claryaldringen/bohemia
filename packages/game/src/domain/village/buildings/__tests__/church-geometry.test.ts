import { describe, expect, it } from 'vitest';
import { CHURCH } from '../../rules/rules-masonry';
import type { ChurchDims, ChurchType } from '../../types/types-masonry';
import {
  churchCapacity,
  churchCost,
  churchFootprintWorld,
  churchLocalToWorld,
  churchParts,
  churchTypesFor,
  churchyardGraves,
  churchyardRect,
  clampChurchDims,
  defaultChurchDims,
  wallThickness,
} from '../church-geometry';
import { buildingLocalToWorld } from '../../core/obstacles';
import { rectangleSamples } from '../../placement/placement-geometry';

const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);

describe('typy a výchozí rozměry', () => {
  it('typy podle okruhu', () => {
    expect(churchTypesFor('adriatic')).toEqual(['chancel', 'basilica']);
    expect(churchTypesFor('carolingian')).toEqual(['apse', 'rotunda']);
  });
  it('tloušťka zdi', () => {
    expect(wallThickness(6)).toBeCloseTo(0.78, 10);
  });
});

describe('kalibrace – rotunda Ø 6,5 × 6 m', () => {
  const dims = defaultChurchDims('rotunda');
  const cost = churchCost('rotunda', dims);
  it('zdivo, vápno, práce, kapacita', () => {
    expect(cost.masonryM3).toBeGreaterThan(150);
    expect(cost.masonryM3).toBeLessThan(180);
    expect(cost.limeT).toBeGreaterThan(9.5);
    expect(cost.limeT).toBeLessThan(12);
    expect(sum(cost.work)).toBeGreaterThan(1100);
    expect(sum(cost.work)).toBeLessThan(1300);
    expect(churchCapacity('rotunda', dims)).toBe(44);
  });
  it('má 3 části, baziliky 5', () => {
    expect(churchParts('rotunda', dims)).toHaveLength(3);
    expect(churchParts('basilica', defaultChurchDims('basilica'))).toHaveLength(5);
  });
});

describe('ceny a monotónnost', () => {
  it('bazilika je alespoň 4× dražší než jednolodní', () => {
    const big = churchCost('basilica', defaultChurchDims('basilica'));
    const small = churchCost('chancel', defaultChurchDims('chancel'));
    expect(big.masonryM3).toBeGreaterThan(4 * small.masonryM3);
    expect(sum(big.work)).toBeGreaterThan(4 * sum(small.work));
  });
  it.each(['rotunda', 'chancel', 'apse', 'basilica'] as ChurchType[])(
    'větší rozměr = vyšší cena i kapacita (%s)',
    (type) => {
      const d = defaultChurchDims(type);
      const bigger: ChurchDims =
        d.kind === 'round'
          ? { ...d, diameter: d.diameter + 2 }
          : { ...d, width: d.width + 1, length: d.length + 2 };
      expect(churchCost(type, bigger).masonryM3).toBeGreaterThan(churchCost(type, d).masonryM3);
      expect(sum(churchCost(type, bigger).work)).toBeGreaterThan(sum(churchCost(type, d).work));
      expect(churchCapacity(type, bigger)).toBeGreaterThan(churchCapacity(type, d));
      expect(churchyardGraves(type, bigger)).toBeGreaterThan(churchyardGraves(type, d));
    },
  );
  it('vyšší stavba je dražší', () => {
    const d = defaultChurchDims('apse');
    expect(churchCost('apse', { ...d, height: 9 } as ChurchDims).masonryM3).toBeGreaterThan(
      churchCost('apse', d).masonryM3,
    );
  });
});

describe('clampChurchDims', () => {
  it('drží meze a zaokrouhluje na 0,5 m', () => {
    const lim = CHURCH.limits;
    expect(clampChurchDims('rotunda', { kind: 'round', diameter: 99, height: 1 })).toEqual({
      kind: 'round',
      diameter: lim.diameter.max,
      height: lim.height.min,
    });
    expect(
      clampChurchDims('basilica', { kind: 'long', width: 4, length: 99, height: 10.3 }),
    ).toEqual({
      kind: 'long',
      width: lim.basilicaWidth.min,
      length: lim.length.max,
      height: 10.5,
    });
  });
  it('druh round jen u rotundy', () => {
    const c = clampChurchDims('apse', { kind: 'round', diameter: 6, height: 7 });
    expect(c.kind).toBe('long');
    const r = clampChurchDims('rotunda', { kind: 'long', width: 6, length: 8, height: 7 });
    expect(r.kind).toBe('round');
  });
});

describe('hřbitůvek a obrys ve světě', () => {
  it('obdélník je o pás větší než kostel', () => {
    const d = defaultChurchDims('chancel');
    const rect = churchyardRect('chancel', d);
    expect(rect.length).toBeGreaterThan(8 + 2 * CHURCH.churchyardBeltM);
    expect(rect.width).toBeGreaterThan(5 + 2 * CHURCH.churchyardBeltM);
    expect(churchyardGraves('chancel', d)).toBeGreaterThan(20);
  });
  it('obrys ve světě se otočí a posune', () => {
    const d = defaultChurchDims('chancel');
    const at0 = churchFootprintWorld('chancel', d, { x: 0, z: 0, rotation: 0 });
    const at90 = churchFootprintWorld('chancel', d, { x: 10, z: 20, rotation: Math.PI / 2 });
    expect(at0).toHaveLength(2);
    const a = at0[0]![0]!;
    const b = at90[0]![0]!;
    expect(b.x).toBeCloseTo(10 + a.z, 8);
    expect(b.z).toBeCloseTo(20 - a.x, 8);
  });
  it('natočený kostel (45°) – obrys sedí s rectangleSamples stejného obdélníku (konvence budov)', () => {
    const d = defaultChurchDims('chancel');
    if (d.kind !== 'long') throw new Error('obdélný kostel');
    const position = { x: 30, z: -12, rotation: Math.PI / 4 };
    const nave = churchFootprintWorld('chancel', d, position)[0]!;
    const t = wallThickness(d.height);
    // první a poslední vzorek každého sloupce = rohy obdélníku lodi i se zdmi
    const samples = rectangleSamples(d.length + 2 * t, d.width + 2 * t, position);
    const corners = [samples[0]!, samples[samples.length - 1]!];
    for (const [cx, cz] of corners) {
      expect(nave.some((p) => Math.hypot(p.x - cx, p.z - cz) < 1e-3)).toBe(true);
    }
    // osa vstup → kněžiště míří do (cos r, −sin r) jako místní +x budov
    const [ax, az] = buildingLocalToWorld(position, 1, 0);
    const east = churchLocalToWorld(position, 1, 0);
    expect(east.x).toBeCloseTo(ax, 6);
    expect(east.z).toBeCloseTo(az, 6);
  });
});
