import { describe, expect, it } from 'vitest';
import {
  PLAIN_FRAME,
  PLAIN_SHAPE,
  dwellingFrame,
  dwellingShape,
  dwellingShapeAt,
  shapeFrame,
  shapeRect,
  shapeScales,
  shapeX,
  shapeXPieces,
  shapeY,
  shapeYPieces,
  shapeZ,
  shapeZPieces,
  shapedFootprint,
  type DwellingShape,
} from '../dwelling-shape';
import { DWELLING_FOOTPRINT_M, DWELLING_SHAPE, PLOT_VARIANTS } from '../rules';
import type { DwellingType } from '../types';

// population.md – Varianty rozměrů (Martin, GitHub #1): plocha, poměr stěn a výška každé stavby
// jiné nejvýš o 10 %; dveře a šíje se schody se nenatahují.

/** Polohy rozeseté po krajině (m, s necelými centimetry jako ve hře). */
function positions(count: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: -600 + ((i * 37.137) % 1200), z: -600 + ((i * 91.731) % 1200) });
  }
  return out;
}

const TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];

describe('varianta rozměrů', () => {
  it('každá odchylka nejvýš ±10 % a varianty jsou opravdu různé', () => {
    const shapes = positions(2000).map((p) => dwellingShapeAt(p.x, p.z));
    for (const s of shapes) {
      for (const value of [s.area, s.ratio, s.height]) {
        expect(value).toBeGreaterThanOrEqual(1 - DWELLING_SHAPE.spread);
        expect(value).toBeLessThanOrEqual(1 + DWELLING_SHAPE.spread);
      }
    }
    // rozložení po celém rozpětí – ne pár typů, ale hromada různých stavení
    const areas = shapes.map((s) => s.area);
    expect(Math.min(...areas)).toBeLessThan(0.91);
    expect(Math.max(...areas)).toBeGreaterThan(1.09);
    const distinct = new Set(shapes.map((s) => `${s.area}/${s.ratio}/${s.height}`));
    expect(distinct.size).toBeGreaterThan(1900);
  });

  it('stejné místo dá vždy stejný tvar – i po převodu JSON, natočení na něm nezáleží', () => {
    for (const raw of positions(200)) {
      const p = { x: Math.round(raw.x * 100) / 100, z: Math.round(raw.z * 100) / 100 };
      const a = dwellingShape({ type: 'zemnice', position: { ...p } });
      const b = dwellingShape({ type: 'zemnice', position: JSON.parse(JSON.stringify(p)) });
      expect(b).toEqual(a);
      // pod centimetr se tvar nemění (poloha na cm)
      expect(dwellingShapeAt(p.x + 0.001, p.z)).toEqual(dwellingShapeAt(p.x, p.z));
    }
    // zlatý otisk – prohlížeč i server počítají jen přesně zaokrouhlované operace
    expect(dwellingShapeAt(12.34, -56.78)).toEqual({ area: 1.054, ratio: 0.978, height: 1.069 });
  });

  it('dvorec a stavby s dnešním tvarem variantu nemají', () => {
    expect(dwellingShape({ type: 'dvorec', position: { x: 3, z: 7 } })).toBe(PLAIN_SHAPE);
    expect(dwellingShape({ type: 'zemnice', position: { x: 3, z: 7 }, plainShape: true })).toBe(
      PLAIN_SHAPE,
    );
    expect(shapeFrame('polozemnice', PLAIN_SHAPE)).toBe(PLAIN_FRAME);
  });

  it('dům v rohu pozemku se napříč rozšíří nejvýš o plotCornerMaxWidth – ubere se plocha', () => {
    let clamped = 0;
    for (const p of positions(800)) {
      const free = dwellingShape({ type: 'polozemnice', position: p });
      for (const variant of PLOT_VARIANTS) {
        const s = dwellingShape({ type: 'polozemnice', position: p, plot: { variant } });
        expect(s.ratio).toBe(free.ratio);
        expect(s.height).toBe(free.height);
        expect(s.area).toBeLessThanOrEqual(free.area);
        if (variant === 'center') expect(s).toEqual(free);
        else {
          expect(shapeScales(s).sx).toBeLessThanOrEqual(DWELLING_SHAPE.plotCornerMaxWidth + 1e-3);
          if (s.area < free.area) clamped++;
        }
      }
    }
    expect(clamped).toBeGreaterThan(0);
  });
});

describe('zobrazení tvaru', () => {
  const extremes: DwellingShape[] = [
    { area: 1.1, ratio: 0.9, height: 1.1 },
    { area: 0.9, ratio: 1.1, height: 0.9 },
    { area: 1.1, ratio: 1.1, height: 0.9 },
    { area: 0.9, ratio: 0.9, height: 1.1 },
  ];

  it('dveře se nenatahují – pás |x| ≤ DOOR zůstává, šíře půdorysu je přesně sx × dnešní', () => {
    for (const type of TYPES) {
      for (const shape of extremes) {
        const f = shapeFrame(type, shape);
        const door = DWELLING_SHAPE.doorHalfM;
        for (const x of [-door, -0.3, 0, 0.21, door]) expect(shapeX(f, x)).toBe(x);
        const half = DWELLING_FOOTPRINT_M[type].width / 2;
        expect(shapeX(f, half)).toBeCloseTo(shapeScales(shape).sx * half, 12);
        expect(shapeX(f, -half)).toBeCloseTo(-shapeScales(shape).sx * half, 12);
        // zobrazení je rostoucí a spojité
        let last = -Infinity;
        for (let x = -6; x <= 6; x += 0.05) {
          expect(shapeX(f, x)).toBeGreaterThan(last);
          last = shapeX(f, x);
        }
      }
    }
  });

  it('šíje se schody se nenatahuje – jen se posune se štítem; jáma pod terénem zůstává', () => {
    for (const type of TYPES) {
      for (const shape of extremes) {
        const f = shapeFrame(type, shape);
        const front = DWELLING_SHAPE.frontM[type];
        // šíje od začátku (front) po konec – délka i schody stejné
        for (const rampEnd of [3.1, 3.7]) {
          expect(shapeZ(f, rampEnd) - shapeZ(f, front)).toBeCloseTo(rampEnd - front, 12);
        }
        expect(shapeZ(f, front)).toBeCloseTo(front * shapeScales(shape).sz, 12);
        expect(shapeZ(f, -2)).toBeCloseTo(-2 * shapeScales(shape).sz, 12);
        // pod terénem (jáma, schody) beze změny, nad ním × výška
        for (const y of [-1, -0.5, 0]) expect(shapeY(f, y)).toBe(y);
        expect(shapeY(f, 2)).toBeCloseTo(2 * shape.height, 12);
      }
    }
  });

  it('úseky (kosti modelu ve scéně) dávají totéž jako zobrazení bodu', () => {
    const f = shapeFrame('polozemnice', { area: 1.08, ratio: 0.93, height: 1.06 });
    const [left, door, right] = shapeXPieces(f);
    for (const [x, piece] of [
      [-3, left],
      [0.2, door],
      [2.7, right],
    ] as const) {
      expect(piece.scale * x + piece.offset).toBeCloseTo(shapeX(f, x), 12);
    }
    const [house, ramp] = shapeZPieces(f);
    expect(house.scale * -2.5 + house.offset).toBeCloseTo(shapeZ(f, -2.5), 12);
    expect(ramp.scale * 3.1 + ramp.offset).toBeCloseTo(shapeZ(f, 3.1), 12);
    const [below, above] = shapeYPieces(f);
    expect(below.scale * -0.4 + below.offset).toBe(shapeY(f, -0.4));
    expect(above.scale * 1.7 + above.offset).toBeCloseTo(shapeY(f, 1.7), 12);
  });

  it('dnešní tvar je přesně identita – bit po bitu', () => {
    const rect = { minX: -4.8, maxX: 4.8, minZ: -4.4, maxZ: 7.5 };
    expect(shapeRect(PLAIN_FRAME, rect)).toBe(rect);
    const frame = dwellingFrame({ type: 'zemnice', position: { x: 1, z: 1 }, plainShape: true });
    for (const v of [-4.8, -0.1, 0.42, 3.7, 7.5]) {
      expect(shapeX(frame, v)).toBe(v);
      expect(shapeZ(frame, v)).toBe(v);
      expect(shapeY(frame, v)).toBe(v);
    }
    expect(shapedFootprint('zemnice', PLAIN_SHAPE)).toEqual({ width: 4, depth: 4, centerZ: 0 });
  });

  it('plocha půdorysu (bez šíje) i výška se liší nejvýš o 10 %', () => {
    for (const p of positions(500)) {
      for (const type of TYPES) {
        const shape = dwellingShape({ type, position: p });
        const { width, depth } = shapedFootprint(type, shape);
        const plain = DWELLING_FOOTPRINT_M[type];
        const ratio = (width * depth) / (plain.width * plain.depth);
        expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(DWELLING_SHAPE.spread + 1e-9);
        expect(Math.abs(shape.height - 1)).toBeLessThanOrEqual(DWELLING_SHAPE.spread);
      }
    }
  });
});
