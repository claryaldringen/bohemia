import { describe, expect, it } from 'vitest';
import type { Point } from '../../placement/polygon';
import { FORTIFICATIONS } from '../../rules/rules-fortifications';
import type { FortKind } from '../../types';
import {
  autoGates,
  addGate,
  circlePoints,
  convexHull,
  curveBend,
  fortBandPieces,
  fortificationOutline,
  fortSegments,
  fortShapeError,
  fortWalls,
  gateChord,
  hullOffsetPoints,
  normalizeFortPoints,
  steinerInnerArea,
  type FortOutline,
} from '..';

// Obvod z bodů (fortifications.md – Obvod; Martin 7. 11. 2026): křivka, délka, plocha, útočiště,
// úseky, brány a pás – zlaté hodnoty kruhu, oválu a promáčknutého tvaru.

const GEO = { size: 128, cellSizeM: 15 };
const KINDS: readonly FortKind[] = ['fence', 'palisade', 'rampart'];

const CIRCLE = circlePoints([0, 0], 30);
const OVAL: Point[] = circlePoints([0, 0], 1).map(([x, z]): Point => [x * 40, z * 25]);
const DENT: Point[] = CIRCLE.map(([x, z]): Point => (z > 20 ? [x, z - 12] : [x, z]));

function outline(points: readonly Point[], kind: FortKind = 'fence'): FortOutline {
  const o = fortificationOutline(points, kind);
  if (!o) throw new Error('bez obvodu');
  return o;
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
}

describe('křivka obvodu', () => {
  it('pořadí bodů nezávisí na začátku ani na směru zadání', () => {
    const base = normalizeFortPoints(OVAL);
    const shifted = [...OVAL.slice(5), ...OVAL.slice(0, 5)];
    expect(normalizeFortPoints(shifted)).toEqual(base);
    expect(normalizeFortPoints([...OVAL].reverse())).toEqual(base);
    // začátek v nejsevernějším bodě, po směru hodin (další bod na východ)
    expect(base[0]).toEqual([0, 25]);
    expect(base[1]![0]).toBeGreaterThan(0);
    const a = outline(shifted, 'palisade');
    const b = outline([...OVAL].reverse(), 'palisade');
    expect(a.polyline).toEqual(b.polyline);
    expect(fortSegments(a)).toEqual(fortSegments(b));
  });

  it('kruh: délka a plocha jako u kružnice, útočiště Steinerovým vzorcem', () => {
    const o = outline(CIRCLE, 'palisade');
    expect(o.lengthM / (2 * Math.PI * 30)).toBeCloseTo(1, 2);
    expect(o.areaM2 / (Math.PI * 900)).toBeCloseTo(1, 2);
    expect(o.innerAreaM2).toBeCloseTo(steinerInnerArea(o.areaM2, o.lengthM, 1.5), 9);
    expect(o.innerAreaM2 / (Math.PI * 28.5 * 28.5)).toBeCloseTo(1, 2);
  });

  it('Steinerův vzorec je přesný pro kruh i obdélník se zakulacenými rohy', () => {
    const [r, b] = [20, 3];
    expect(steinerInnerArea(Math.PI * r * r, 2 * Math.PI * r, b)).toBeCloseTo(
      Math.PI * (r - b) * (r - b),
      9,
    );
    const [w, h, c] = [60, 30, 8];
    const area = w * h - (4 - Math.PI) * c * c;
    const length = 2 * (w + h) - (8 - 2 * Math.PI) * c;
    const inner = (w - 2 * b) * (h - 2 * b) - (4 - Math.PI) * (c - b) * (c - b);
    expect(steinerInnerArea(area, length, b)).toBeCloseTo(inner, 9);
    expect(steinerInnerArea(100, 40, 5)).toBe(0);
  });

  it('obdélník z návrhu (rovné kusy a oblouky) – délka a plocha jako zakulacený obdélník', () => {
    const rect: Point[] = [
      [0, 0],
      [60, 0],
      [60, 30],
      [0, 30],
    ];
    const o = outline(hullOffsetPoints([rect], 13), 'rampart');
    expect(o.lengthM / (2 * 90 + 2 * Math.PI * 13)).toBeCloseTo(1, 2);
    expect(o.areaM2 / (1800 + 2 * 13 * 90 + Math.PI * 169)).toBeCloseTo(1, 2);
    expect(fortShapeError(o)).toBeNull();
  });

  it('zlaté hodnoty – kruh, ovál, promáčknutý tvar', () => {
    const gold: Record<string, [number, number, number, number, number, number]> = {
      // délka, plocha, útočiště plot / palisáda / val, úseky
      circle: [188.421921, 2824.631554, 2639.351226, 2549.067256, 1254.57161, 13],
      oval: [206.827285, 3138.96977, 2935.284078, 2835.797426, 1384.856186, 14],
      dent: [179.407981, 2223.320944, 2047.054556, 1961.277556, 743.400397, 12],
    };
    const shapes: Record<string, Point[]> = { circle: CIRCLE, oval: OVAL, dent: DENT };
    for (const [name, [len, area, fence, palisade, rampart, segments]] of Object.entries(gold)) {
      const inner = [fence, palisade, rampart];
      KINDS.forEach((kind, k) => {
        const o = outline(shapes[name]!, kind);
        expect(o.lengthM).toBeCloseTo(len, 5);
        expect(o.areaM2).toBeCloseTo(area, 5);
        expect(o.innerAreaM2).toBeCloseTo(inner[k]!, 5);
        expect(fortSegments(o)).toHaveLength(segments);
      });
    }
  });

  it('úseky stejně dlouhé ≈ 15 m, součet = délka, brány na hranicích bodů lomené čáry', () => {
    const o = outline(OVAL);
    const shapes = fortSegments(o);
    const each = o.lengthM / shapes.length;
    expect(each).toBeGreaterThan(12);
    expect(each).toBeLessThan(18);
    for (const s of shapes) expect(s.lengthM).toBeCloseTo(each, 6);
    expect(shapes.reduce((sum, s) => sum + s.lengthM, 0)).toBeCloseTo(o.lengthM, 6);
    for (const s of shapes) {
      expect(s.path[0]).toEqual(o.polyline[o.segmentStarts[s.index]!]);
      expect(s.arc).toBeNull();
    }
  });

  it('kontrola tvaru: málo bodů, ostrý ohyb, křížení, malá plocha', () => {
    expect(fortShapeError(fortificationOutline(CIRCLE.slice(0, 3), 'fence'))).toEqual({
      error: 'too-few',
    });
    expect(fortShapeError(outline(CIRCLE, 'rampart'))).toBeNull();
    // ohyb v měřítku poloměru druhu: promáčknutí snese plot, palisáda ne
    expect(fortShapeError(outline(DENT, 'fence'))).toBeNull();
    expect(fortShapeError(outline(DENT, 'palisade'))?.error).toBe('sharp');
    // mírné promáčknutí – plot a palisáda projdou, val ne
    const soft = CIRCLE.map(([x, z]): Point => (z > 25 ? [x, z - 8] : [x, z]));
    expect(curveBend(normalizeFortPoints(soft)).radiusM).toBeLessThan(8);
    expect(fortShapeError(outline(soft, 'fence'))).toBeNull();
    expect(fortShapeError(outline(soft, 'rampart'))?.error).toBe('sharp');
    const eight: Point[] = [
      [0, 0],
      [40, 40],
      [80, 0],
      [120, 40],
      [120, 0],
      [80, 40],
      [40, 0],
      [0, 40],
    ];
    expect(['crossing', 'sharp']).toContain(fortShapeError(outline(eight))?.error);
    expect(fortShapeError(outline(circlePoints([0, 0], 15)))).toEqual({ error: 'too-small' });
  });
});

describe('návrh obvodu', () => {
  it('vypouklý obal po směru hodin, bez bodů uvnitř', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [5, 5],
      [10, 10],
      [0, 10],
    ]);
    expect(hull).toHaveLength(4);
    let area2 = 0;
    hull.forEach((p, i) => {
      const q = hull[(i + 1) % hull.length]!;
      area2 += p[0] * q[1] - q[0] * p[1];
    });
    expect(area2).toBeLessThan(0);
  });

  it('body návrhu nejvýš 15 m od sebe, všechny ve vzdálenosti odstupu od jádra', () => {
    const core: Point[][] = [
      [
        [0, 0],
        [15, 0],
        [15, 15],
        [0, 15],
      ],
      [
        [40, 20],
        [55, 20],
        [55, 35],
        [40, 35],
      ],
    ];
    const pts = hullOffsetPoints(core, 4);
    pts.forEach((p, i) => {
      expect(dist(p, pts[(i + 1) % pts.length]!)).toBeLessThanOrEqual(15 + 1e-9);
    });
    const corners = core.flat();
    for (const p of pts) {
      const nearest = Math.min(...corners.map((c) => dist(c, p)));
      expect(nearest).toBeGreaterThanOrEqual(4 - 1e-6);
    }
    expect(fortShapeError(outline(pts, 'fence'))).toBeNull();
  });

  it('kruh 20 m – body po nejvýš 15 m, po směru hodin od severu', () => {
    const pts = circlePoints([5, 5], 20);
    expect(pts[0]).toEqual([5, 25]);
    pts.forEach((p, i) => {
      expect(dist(p, [5, 5])).toBeCloseTo(20, 9);
      expect(dist(p, pts[(i + 1) % pts.length]!)).toBeLessThanOrEqual(15);
    });
  });
});

describe('brány a pás obvodu z bodů', () => {
  const road = [
    { x: -100, z: 3 },
    { x: 100, z: 3 },
  ];

  it('brána na průsečíku s cestou – 4 m tětiva, nejvýš jedna na úsek', () => {
    const o = outline(CIRCLE, 'palisade');
    const gates = autoGates(o, [road], { x: 0, z: 0 });
    expect(gates).toHaveLength(2);
    const shapes = fortSegments(o);
    for (const g of gates) {
      // střed na průsečíku, u konce úseku posunutý nejvýš o půl brány, ať je brána celá v úseku
      expect(Math.abs(g.z - 3)).toBeLessThan(FORTIFICATIONS.gate.widthM / 2);
      const chord = gateChord(o, shapes[g.segment]!, g);
      expect(dist(chord.a, chord.b)).toBeCloseTo(FORTIFICATIONS.gate.widthM, 3);
    }
    const again = addGate(o, gates, { x: gates[0]!.x, z: gates[0]!.z });
    expect(again).toEqual({ error: 'segment-taken' });
    expect(addGate(o, gates, { x: 0, z: 0 })).toEqual({ error: 'off-outline' });
  });

  it('bez cesty jedna brána v úseku nejblíž kotvě', () => {
    const o = outline(CIRCLE);
    const [gate, ...rest] = autoGates(o, [], { x: 0, z: -100 });
    expect(rest).toHaveLength(0);
    expect(gate!.z).toBeLessThan(-29);
  });

  it('pás leží uvnitř křivky a pokryje plochu mezi křivkou a vnitřním okrajem', () => {
    const o = outline(CIRCLE, 'rampart');
    const pieces = fortBandPieces(o);
    let area = 0;
    for (const p of pieces) {
      let a2 = 0;
      p.corners.forEach((c, i) => {
        const q = p.corners[(i + 1) % p.corners.length]!;
        a2 += c[0] * q[1] - q[0] * c[1];
      });
      area += Math.abs(a2) / 2;
      for (const c of p.corners) expect(dist(c, [0, 0])).toBeLessThanOrEqual(30 + 0.01);
    }
    // kusy se o 5 cm překrývají (chůze po společné hraně neprojde) – součet ploch o kus víc
    const ratio = area / (o.areaM2 - o.innerAreaM2);
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.15);
  });

  it('stěny – brána vyřízne otvor z pásu úseku', () => {
    const o = outline(CIRCLE, 'palisade');
    const gates = autoGates(o, [road], { x: 0, z: 0 });
    const fort = {
      points: o.points,
      kind: 'palisade' as const,
      segments: fortSegments(o).map((s) => ({ index: s.index, builtDay: 0, state: 1 })),
      gates,
    };
    const walls = fortWalls(GEO, fort);
    expect(walls.gates).toHaveLength(2);
    expect(walls.walls.length).toBeGreaterThan(fortBandPieces(o).length - 10);
    const shut = fortWalls(GEO, { ...fort, gates: [] });
    expect(shut.gates).toHaveLength(0);
  });
});
