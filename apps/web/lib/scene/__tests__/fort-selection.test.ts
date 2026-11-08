import { describe, expect, it } from 'vitest';
import { FORTIFICATIONS, sectionPieces } from '@bohemia/game';
import {
  FORT_GATE_HALF_M,
  alongFrom,
  fortPerimeter,
  fortSectionSpans,
  gateCenterM,
  perimeterPosition,
  spanAt,
} from '../../fort-sections';
import type { SceneFortification } from '../../fort-view';
import { demoFortification, SHOWCASE_FORT_GEO } from '../fortification-showcase';
import {
  fortBandRings,
  fortGateRings,
  fortSectionRings,
  targetOutline,
} from '../selection-highlight';
import type { Point } from '../village-layout';
import type { SceneVillage } from '../../village-view';

// Výběr opevnění (fortifications.md – Rozhraní, Úseky; Martin 8. 11. 2026: „Žluté označení
// nesedí s tvarem označené hradby.“): úsek je hradba mezi okraji bran po obvodu – brána leží
// uvnitř dílu, úsek tedy nezačíná na začátku dílu s branou. Obrys úseku je pás, podle kterého
// scéna staví (křivka a šířka pásu druhu), brána má vlastní obrys, dvojklik celý obvod.

describe('úseky mezi branami po obvodu', () => {
  const lengths = [15, 15, 15, 15];

  it('úsek od okraje brány po okraj další brány, i přes začátek dílu 0', () => {
    const spans = fortSectionSpans(lengths, [
      { segment: 2, offsetM: 5 },
      { segment: 0, offsetM: 10 },
    ]);
    expect(spans.map((s) => s.gateSegment)).toEqual([0, 2]);
    // brána 0 v 10 m, brána 2 ve 35 m
    expect(spans[0]).toMatchObject({ fromM: 12, segments: [0, 1, 2] });
    expect(spans[0]!.lengthM).toBeCloseTo(21);
    expect(spans[1]).toMatchObject({ fromM: 37, segments: [2, 3, 0] });
    expect(spans[1]!.lengthM).toBeCloseTo(31);
    // součet úseků a bran je celý obvod
    expect(spans[0]!.lengthM + spans[1]!.lengthM + 2 * FORTIFICATIONS.gate.widthM).toBeCloseTo(60);
    expect(spanAt(spans, 5, 60)?.gateSegment).toBe(2);
    expect(spanAt(spans, 20, 60)?.gateSegment).toBe(0);
    expect(spanAt(spans, 10, 60)).toBeNull();
  });

  it('bez brány jeden úsek přes celý obvod, s jednou branou kolem dokola bez brány', () => {
    expect(fortSectionSpans(lengths, [])).toEqual([
      { gateSegment: null, fromM: 0, lengthM: 60, segments: [0, 1, 2, 3] },
    ]);
    const one = fortSectionSpans(lengths, [{ segment: 1, offsetM: 7.5 }]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ gateSegment: 1, fromM: 24.5, lengthM: 56 });
    expect(one[0]!.segments).toEqual([1, 2, 3, 0]);
  });
});

/** Palisáda z ukázky s branami jako na Vlkově – brána u konce dílu 0 a uprostřed dílu 2. */
const gated = (): SceneFortification =>
  demoFortification(
    {
      id: 3,
      kind: 'palisade',
      cells: { x: 8, y: 8, w: 6, h: 6 },
      gates: [
        { segment: 0, offsetM: 12 },
        { segment: 2, offsetM: 6 },
      ],
    },
    SHOWCASE_FORT_GEO,
  );

const band = FORTIFICATIONS.bandM.palisade;

/** Poloha bodu po obvodu a vzdálenost od křivky. */
const onCurve = (f: SceneFortification, p: Point): { s: number; distance: number } =>
  perimeterPosition(f.shapes, { x: p[0], z: p[1] })!;

/** Plocha mnohoúhelníku (m²). */
const area = (ring: readonly Point[]): number =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2,
  );

describe('obrys úseku = pás úseku mezi branami', () => {
  it('kopíruje křivku a šířku pásu palisády od okraje brány po okraj další brány', () => {
    const f = gated();
    const lengths = f.shapes.map((x) => x.lengthM);
    const { total } = fortPerimeter(lengths);
    const span = fortSectionSpans(lengths, f.gates).find((x) => x.gateSegment === 0)!;
    const rings = fortSectionRings(f, 0);
    expect(rings).toHaveLength(1);
    const ring = rings[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // každý bod leží v pásu: na křivce (vnější okraj) nebo šířku pásu dovnitř
    for (const p of ring) expect(onCurve(f, p).distance).toBeLessThanOrEqual(band + 1e-6);
    // začíná na okraji brány 0, končí na okraji brány 2 – ne na hranicích dílů
    expect(onCurve(f, ring[0]!).distance).toBeLessThan(1e-6);
    expect(onCurve(f, ring[0]!).s).toBeCloseTo(span.fromM, 4);
    const outerEnd = ring[Math.floor((ring.length - 1) / 2) - 1]!;
    expect(onCurve(f, outerEnd).distance).toBeLessThan(1e-6);
    expect(alongFrom(span.fromM, onCurve(f, outerEnd).s, total)).toBeCloseTo(span.lengthM, 4);
    // nic z obrysu neleží v bráně
    for (const gate of f.gates) {
      const c = gateCenterM(fortPerimeter(lengths), gate);
      for (const p of ring) {
        const d = Math.abs(alongFrom(c - total / 2, onCurve(f, p).s, total) - total / 2);
        expect(d).toBeGreaterThan(FORT_GATE_HALF_M - 0.2);
      }
    }
    // plocha ≈ délka úseku × šířka pásu (rohy ji jen málo mění)
    expect(area(ring) / (span.lengthM * band)).toBeGreaterThan(0.9);
    expect(area(ring) / (span.lengthM * band)).toBeLessThan(1.1);
  });

  it('úsek s branou přes začátek obvodu se nerozdělí; zbořený díl obrys rozdělí', () => {
    const f = gated();
    expect(fortSectionRings(f, 2)).toHaveLength(1);
    const lengths = f.shapes.map((x) => x.lengthM);
    const span = fortSectionSpans(lengths, f.gates).find((x) => x.gateSegment === 2)!;
    const middle = span.segments[Math.floor(span.segments.length / 2)]!;
    const gone: SceneFortification = {
      ...f,
      segments: f.segments.map((s) => (s.index === middle ? { ...s, demolishedDay: 5 } : s)),
    };
    const rings = fortSectionRings(gone, 2);
    expect(rings).toHaveLength(2);
    const { starts } = fortPerimeter(lengths);
    const from = starts[middle]!;
    for (const p of rings.flat()) {
      const along = alongFrom(from, onCurve(gone, p).s, fortPerimeter(lengths).total);
      expect(along < 0.05 || along > lengths[middle]! - 0.05).toBe(true);
    }
  });

  it('zbořený úsek (celé díly i kusy dílů bran) nemá co zvýraznit, druhý úsek zůstane', () => {
    const f = gated();
    const lengths = f.shapes.map((x) => x.lengthM);
    const pieces = sectionPieces(lengths, f.gates, 0);
    expect(pieces.some((x) => x.part === 'after')).toBe(true);
    const gone: SceneFortification = {
      ...f,
      segments: f.segments.map((s) => {
        const mine = pieces.filter((x) => x.index === s.index);
        return {
          ...s,
          ...(mine.some((x) => x.part === undefined) ? { demolishedDay: 5 } : {}),
          ...(mine.some((x) => x.part === 'before') ? { demolishedBeforeGate: 5 } : {}),
          ...(mine.some((x) => x.part === 'after') ? { demolishedAfterGate: 5 } : {}),
        };
      }),
    };
    expect(fortSectionRings(gone, 0)).toEqual([]);
    expect(fortSectionRings(gone, 2).length).toBeGreaterThan(0);
  });

  it('brána má vlastní obrys kolem brány, celý obvod jsou dva uzavřené okraje pásu', () => {
    const f = gated();
    const lengths = f.shapes.map((x) => x.lengthM);
    const perimeter = fortPerimeter(lengths);
    const gate = fortGateRings(f, 2);
    expect(gate).toHaveLength(1);
    const c = gateCenterM(perimeter, f.gates[1]!);
    for (const p of gate[0]!) {
      const at = onCurve(f, p);
      expect(Math.abs(alongFrom(c - 10, at.s, perimeter.total) - 10)).toBeLessThan(
        FORT_GATE_HALF_M + 0.6,
      );
      expect(at.distance).toBeLessThan(band + 0.6);
    }
    expect(fortGateRings(f, 1)).toEqual([]);
    const whole = fortBandRings(f, 0, perimeter.total);
    expect(whole).toHaveLength(2);
    for (const ring of whole) expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('obrys podle výběru: celé opevnění, úsek, brána', () => {
    const f = gated();
    const village: SceneVillage = { dwellings: [], fields: [], forts: [f] };
    expect(targetOutline(village, { kind: 'fortification', id: 3 })).toHaveLength(2);
    expect(targetOutline(village, { kind: 'fortification-section', id: 3, segment: 0 })).toEqual(
      fortSectionRings(f, 0),
    );
    expect(targetOutline(village, { kind: 'fortification-gate', id: 3, segment: 0 })).toEqual(
      fortGateRings(f, 0),
    );
  });
});
