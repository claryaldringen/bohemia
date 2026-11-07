import { describe, expect, it } from 'vitest';
import type { Construction, TileCell } from '../../types';
import { fortificationOutline, fortSegments, withFortPoints, type Fortification } from '..';
import { fortificationArea, squareOutline } from '../squares-outline';
import { squareSegments } from '../squares-segments';

// Převod opevnění po čtvercích na body (fortifications.md – Pro implementaci – Obvod z bodů):
// tvar zůstane, úseky převezmou stav starého úseku pod svým středem, brány podle polohy, plán
// rozestavěné stavby se přerozdělí beze ztráty práce; jednou a idempotentně.

const GEO = { size: 128, cellSizeM: 15 };

function rect(w: number, h: number, x0 = 62, y0 = 62): TileCell[] {
  const cells: TileCell[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y });
  return cells;
}

function oldFort(): Fortification {
  const cells = rect(4, 4);
  const area = fortificationArea(cells, null, GEO);
  if ('error' in area) throw new Error(area.error);
  const shapes = squareSegments(squareOutline(area, 'fence'));
  const north = shapes[1]!;
  return {
    id: 7,
    grid: null,
    cells,
    kind: 'fence',
    // úsek k hotový v den 100 + k – podle dne se pozná, odkud nový úsek stav převzal
    segments: shapes.map((s) => ({
      index: s.index,
      builtDay: s.index < 8 ? 100 + s.index : null,
      state: 1,
    })),
    gates: [
      {
        segment: 1,
        offsetM: 5,
        x: north.line.x + north.line.dx * 5,
        z: north.line.z + north.line.dz * 5,
      },
    ],
  };
}

function state(): { fortifications: Fortification[]; constructions: Construction[] } {
  const work = [8, 9, 10, 11, 12, 13, 14, 15].map((index) => ({ index, cost: 3 }));
  const site = { kind: 'fortification', fortificationId: 7, fortSegments: work };
  return { fortifications: [oldFort()], constructions: [site as unknown as Construction] };
}

describe('převod opevnění po čtvercích', () => {
  it('body z okraje, tvar zůstane, úseky a brány převezmou stav podle polohy', () => {
    const s = state();
    withFortPoints(s, GEO);
    const fort = s.fortifications[0]!;
    expect(fort.points).toBeDefined();
    expect(fort.cells).toBeUndefined();
    expect(fort.grid).toBeUndefined();
    const outline = fortificationOutline(fort.points!, 'fence')!;
    // 4 × 4 čtverce: délka plotu dřív 237,854 m
    expect(outline.lengthM).toBeCloseTo(237.829, 2);
    const shapes = fortSegments(outline);
    expect(fort.segments).toHaveLength(shapes.length);
    // hotová severní a východní strana (staré úseky 0–7), jih a západ nehotové
    const built = fort.segments.filter((x) => x.builtDay !== null);
    expect(built.length).toBeGreaterThanOrEqual(7);
    expect(built.length).toBeLessThanOrEqual(9);
    for (const seg of built) expect(seg.builtDay).toBeLessThan(108);
    expect(fort.gates).toHaveLength(1);
    expect(Math.abs(fort.gates[0]!.x - oldFort().gates[0]!.x)).toBeLessThan(0.5);
    expect(Math.abs(fort.gates[0]!.z - oldFort().gates[0]!.z)).toBeLessThan(0.5);
    // plán stavby: jen nehotové nové úseky, práce celkem stejná
    const work = s.constructions[0]!.fortSegments!;
    expect(work.reduce((sum, w) => sum + w.cost, 0)).toBeCloseTo(24, 9);
    for (const w of work) expect(fort.segments[w.index]!.builtDay).toBeNull();
  });

  it('jednou a idempotentně', () => {
    const s = state();
    withFortPoints(s, GEO);
    const once = JSON.stringify(s);
    withFortPoints(s, GEO);
    expect(JSON.stringify(s)).toBe(once);
  });
});
