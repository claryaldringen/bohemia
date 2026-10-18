import { describe, expect, it } from 'vitest';
import type { PathLine } from '../path-network';
import { EARTH_LAYER, WORN_LAYER, pathRibbons } from '../path-ribbon';

const line = (strength: number, open = true): PathLine => ({
  points: [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 30, z: 10 },
  ],
  strength: [strength, strength, strength],
  years: [10, 10, 10],
  openStart: open,
  openEnd: open,
});

/** Šířka průřezu `k` (vnější body 0 a 3). */
function width(grid: ReturnType<typeof pathRibbons>, k: number): number {
  const p = grid.positions;
  const a = k * 4;
  const b = k * 4 + 3;
  return Math.hypot(p[b * 2]! - p[a * 2]!, p[b * 2 + 1]! - p[a * 2 + 1]!);
}

describe('pathRibbons – pás pěšiny', () => {
  it('průřez ze čtyř bodů: měkké okraje průhledné, střed kryje', () => {
    const grid = pathRibbons([line(0.6)], WORN_LAYER);
    const sections = grid.alphas.length / 4;
    expect(sections).toBeGreaterThan(30);
    expect(grid.positions.length).toBe(grid.alphas.length * 2);
    expect(grid.indices.length).toBe((sections - 1) * 18);
    const mid = Math.floor(sections / 2) * 4;
    expect(grid.alphas[mid]).toBe(0);
    expect(grid.alphas[mid + 3]).toBe(0);
    expect(grid.alphas[mid + 1]).toBeGreaterThan(0.5);
  });

  it('volný konec se vytrácí, v rozcestí ne', () => {
    const open = pathRibbons([line(0.6, true)], WORN_LAYER);
    const joined = pathRibbons([line(0.6, false)], WORN_LAYER);
    expect(open.alphas[1]).toBe(0);
    expect(joined.alphas[1]).toBeGreaterThan(0.5);
  });

  it('silnější pěšina je širší a výraznější, holá hlína jen u silné', () => {
    const weak = pathRibbons([line(0.2)], WORN_LAYER);
    const strong = pathRibbons([line(1)], WORN_LAYER);
    const k = Math.floor(weak.alphas.length / 8);
    expect(width(strong, k)).toBeGreaterThan(width(weak, k));
    expect(strong.alphas[k * 4 + 1]).toBeGreaterThan(weak.alphas[k * 4 + 1]!);
    expect(Math.max(...pathRibbons([line(0.2)], EARTH_LAYER).alphas)).toBe(0);
    expect(Math.max(...pathRibbons([line(1)], EARTH_LAYER).alphas)).toBeGreaterThan(0.5);
  });

  it('stejná pěšina = stejný pás (vlnění ze souřadnic konců)', () => {
    expect(pathRibbons([line(0.6)], WORN_LAYER)).toEqual(pathRibbons([line(0.6)], WORN_LAYER));
  });
});
