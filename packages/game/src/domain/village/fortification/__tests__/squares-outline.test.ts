import { describe, expect, it } from 'vitest';
import { fenceOutline } from '../../paths/entrances';
import { FORTIFICATIONS } from '../../rules-fortifications';
import { turnRotation } from '../../square-grid';
import type { FortKind, SquareGrid, TileCell } from '../../types';
import {
  fortificationArea,
  squareOutline,
  type FortArea,
  type SquareOutline,
} from '../squares-outline';
import { squareSegments } from '../squares-segments';

// Obvod opevnění (fortifications.md – Obvod): plocha po čtvercích, vnější okraj se zakulacenými
// rohy, délka, pás a útočiště; úseky po stranách okrajových čtverců.

const GEO = { size: 128, cellSizeM: 15 };
/** Zakulacený roh ušetří proti ostrému (2 − π/2) × poloměr. */
const SAVED = 2 - Math.PI / 2;
/** Zakulacení ostrého rohu čtverce o straně r ubere (1 − π/4) × r². */
const FILLET = 1 - Math.PI / 4;
const KINDS: readonly FortKind[] = ['fence', 'palisade', 'rampart'];

function rect(w: number, h: number, x0 = 62, y0 = 62): TileCell[] {
  const cells: TileCell[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y });
  return cells;
}

function area(cells: readonly TileCell[], grid: SquareGrid | null = null): FortArea {
  const a = fortificationArea(cells, grid, GEO);
  if ('error' in a) throw new Error(a.error);
  return a;
}

function outline(
  cells: readonly TileCell[],
  kind: FortKind,
  grid: SquareGrid | null = null,
): SquareOutline {
  return squareOutline(area(cells, grid), kind);
}

/** Tvar L – 4 × 4 bez čtverce 2 × 2 v severovýchodním rohu (5 vnějších rohů, 1 vnitřní). */
const L_SHAPE = rect(4, 4).filter((c) => !(c.x >= 64 && c.y >= 64));

describe('plocha opevnění', () => {
  it('bez čtverců, nesouvislá (jen rohem) a menší než 2 × 2 neprojde', () => {
    expect(fortificationArea([], null, GEO)).toEqual({ error: 'empty' });
    expect(fortificationArea([...rect(2, 2), ...rect(2, 2, 64, 64)], null, GEO)).toEqual({
      error: 'disconnected',
    });
    expect(fortificationArea(rect(3, 1), null, GEO)).toEqual({ error: 'too-small' });
    expect(fortificationArea(L_SHAPE.slice(0, 3), null, GEO)).toEqual({ error: 'too-small' });
    expect('error' in fortificationArea(rect(2, 2), null, GEO)).toBe(false);
  });

  it('díra se zaplní – obvod jako plná plocha', () => {
    const ring = rect(4, 4).filter((c) => !(c.x >= 63 && c.x <= 64 && c.y >= 63 && c.y <= 64));
    const a = area(ring);
    expect(a.cells).toHaveLength(16);
    expect(squareOutline(a, 'palisade').lengthM).toBeCloseTo(
      outline(rect(4, 4), 'palisade').lengthM,
      9,
    );
  });

  it('opakované čtverce se sloučí', () => {
    expect(area([...rect(2, 2), ...rect(2, 2)]).cells).toHaveLength(4);
  });
});

describe('obvod opevnění', () => {
  it('4 × 4 čtverce – zlaté délky a plochy útočiště', () => {
    const fence = outline(rect(4, 4), 'fence');
    const palisade = outline(rect(4, 4), 'palisade');
    const rampart = outline(rect(4, 4), 'rampart');
    // zlaté hodnoty (plán: plot ≈ 237,9 m, palisáda ≈ 234,8 m, val ≈ 226,3 m)
    expect(fence.lengthM).toBeCloseTo(237.854, 4);
    expect(palisade.lengthM).toBeCloseTo(234.8496, 4);
    expect(rampart.lengthM).toBeCloseTo(226.2655, 4);
    // útočiště (plán: ≈ 3 360 / 3 250 / 1 600 m²)
    expect(fence.innerAreaM2).toBeCloseTo(3363.9463, 4);
    expect(palisade.innerAreaM2).toBeCloseTo(3247.0686, 4);
    expect(rampart.innerAreaM2).toBeCloseTo(1600, 6);
    for (const o of [fence, palisade, rampart]) {
      const { outer } = FORTIFICATIONS.cornerM[o.kind];
      expect(o.lengthM).toBeCloseTo(240 - 4 * SAVED * outer, 9);
      expect(o.bandM).toBe(FORTIFICATIONS.bandM[o.kind]);
      expect(o.runs).toHaveLength(4);
    }
    // vnitřní hrana pásu: plot 58 m se zakulacením 0,25 m, val ostrá 40 m
    expect(fence.innerAreaM2).toBeCloseTo(58 * 58 - 4 * FILLET * 0.25 * 0.25, 9);
  });

  it('tvar L – vnitřní roh 0,5 m u plotu, polovina vnějšího u palisády a valu', () => {
    for (const kind of KINDS) {
      const o = outline(L_SHAPE, kind);
      const { outer, inner } = FORTIFICATIONS.cornerM[kind];
      expect(inner).toBe(kind === 'fence' ? 0.5 : outer / 2);
      const radii = o.runs.map((r) => r.arc.r).sort((a, b) => a - b);
      expect(radii).toEqual([inner, outer, outer, outer, outer, outer]);
      expect(o.lengthM).toBeCloseTo(240 - 5 * SAVED * outer - SAVED * inner, 9);
    }
    // útočiště: 4 × 4 bez 2 × 2 – plocha 2 700 m² zmenšená o pás, zakulacení vnitřního rohu přidá
    const w = FORTIFICATIONS.bandM.palisade;
    const { outer, inner } = FORTIFICATIONS.cornerM.palisade;
    const sharp = (60 - 2 * w) * (60 - 2 * w) - (30 - w + w) * (30 - w + w);
    const expected =
      sharp - 5 * FILLET * (outer - w) * (outer - w) + FILLET * (inner + w) * (inner + w);
    expect(outline(L_SHAPE, 'palisade').innerAreaM2).toBeCloseTo(expected, 9);
  });

  it('natočená mřížka 30° dá tutéž délku i plochu', () => {
    const grid: SquareGrid = { x: 123.4, z: -56.7, rotation: turnRotation(2) };
    for (const kind of KINDS) {
      const flat = outline(L_SHAPE, kind);
      const turned = outline(
        L_SHAPE.map((c) => ({ x: c.x - 62, y: c.y - 62 })),
        kind,
        grid,
      );
      expect(turned.lengthM).toBeCloseTo(flat.lengthM, 9);
      expect(turned.innerAreaM2).toBeCloseTo(flat.innerAreaM2, 9);
    }
  });

  it('úseky a oblouky jako pletený plot (fenceOutline s poloměry druhu)', () => {
    const grid: SquareGrid = { x: 10, z: 20, rotation: turnRotation(3) };
    for (const kind of KINDS) {
      for (const g of [null, grid]) {
        const o = outline(L_SHAPE, kind, g);
        const fence = fenceOutline(o.area.squares, 0, o.corners)!;
        const length =
          fence.segments.reduce((s, x) => s + x.length, 0) +
          fence.arcs.reduce((s, a) => s + (Math.PI / 2) * a.r, 0);
        expect(length).toBeCloseTo(o.lengthM, 9);
        expect(o.runs).toHaveLength(fence.arcs.length);
        for (const { arc } of o.runs) {
          const same = fence.arcs.filter(
            (a) => a.r === arc.r && Math.abs(a.x - arc.x) < 1e-9 && Math.abs(a.z - arc.z) < 1e-9,
          );
          expect(same).toHaveLength(1);
        }
      }
    }
  });

  it('val na pruhu širokém jeden čtverec – rohy se zmenší, aby se vešly', () => {
    // 2 × 2 a z něj na východ pruh 2 čtverce dlouhý a 1 široký
    const cells = [...rect(2, 2), { x: 64, y: 62 }, { x: 65, y: 62 }];
    const o = outline(cells, 'rampart');
    expect(o.corners.outer).toBeCloseTo(7.5, 9);
    expect(o.corners.inner).toBeCloseTo(3.75, 9);
    for (const r of o.runs) expect(r.line.length).toBeGreaterThanOrEqual(-1e-9);
    // pruh je užší než dva pásy valu – útočiště jen v bloku 2 × 2 (30 − 2 × 10)
    expect(o.innerAreaM2).toBeGreaterThan(0);
    expect(o.innerAreaM2).toBeLessThan(10 * 10 + FILLET * 14 * 14);
    // plot ani palisáda se nezmenší
    expect(outline(cells, 'palisade').corners).toEqual(FORTIFICATIONS.cornerM.palisade);
  });
});

describe('úseky opevnění', () => {
  it('4 × 4 – 16 úseků po 15 m po směru hodin od severu, oblouk k úseku, kde začíná', () => {
    const o = outline(rect(4, 4), 'palisade');
    const segments = squareSegments(o);
    expect(segments).toHaveLength(16);
    expect(segments.map((s) => s.index)).toEqual([...Array(16).keys()]);
    // sever (y = 65) od západu k východu, východ (x = 65) od severu k jihu, jih, západ
    expect(segments.map((s) => `${s.cell.x},${s.cell.y}`)).toEqual([
      '62,65',
      '63,65',
      '64,65',
      '65,65',
      '65,65',
      '65,64',
      '65,63',
      '65,62',
      '65,62',
      '64,62',
      '63,62',
      '62,62',
      '62,62',
      '62,63',
      '62,64',
      '62,65',
    ]);
    const r = FORTIFICATIONS.cornerM.palisade.outer;
    // rohy na konci úseků 3, 7, 11, 15
    for (const s of segments) {
      const corner = s.index % 4 === 3;
      expect(s.arc?.r ?? 0).toBe(corner ? r : 0);
      const start = s.index % 4 === 0 ? r : 0;
      const end = corner ? r : 0;
      expect(s.line.length).toBeCloseTo(15 - start - end, 9);
      expect(s.lengthM).toBeCloseTo(15 - start - end + (corner ? (Math.PI / 2) * r : 0), 9);
    }
    expect(segments.reduce((sum, s) => sum + s.lengthM, 0)).toBeCloseTo(o.lengthM, 9);
    // první úsek na severu jde k východu (+x), z = 30
    expect(segments[0]!.line).toMatchObject({ dx: 1, dz: 0 });
    expect(segments[0]!.line.z).toBeCloseTo(30, 9);
    expect(segments[0]!.line.x).toBeCloseTo(-30 + r, 9);
  });

  it('pořadí úseků je pevné – nezávisí na pořadí čtverců', () => {
    const a = squareSegments(outline(L_SHAPE, 'fence'));
    const b = squareSegments(outline([...L_SHAPE].reverse(), 'fence'));
    expect(b).toEqual(a);
    expect(a).toHaveLength(16);
  });
});
