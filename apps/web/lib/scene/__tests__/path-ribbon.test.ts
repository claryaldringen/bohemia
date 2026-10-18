import { describe, expect, it } from 'vitest';
import type { PathLine } from '@bohemia/game';
import { EARTH_LAYER, WORN_LAYER, pathRibbons, roadFade, roadLines } from '../path-ribbon';

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

describe('pevné cesty z dat (roads.md)', () => {
  const road = (id: number, points: { x: number; z: number }[]) => ({
    id,
    points,
    grade: 'trodden' as const,
  });
  const a = road(1, [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ]);
  const b = road(2, [
    { x: 40, z: 0 },
    { x: 40, z: 30 },
  ]);

  it('cesta je plně vyšlapaná pěšina, volný konec se vytrácí, v rozcestí ne', () => {
    const [first, second] = roadLines([a, b]);
    expect(first!.points).toEqual(a.points);
    expect(first!.strength.every((s) => s === 1)).toBe(true);
    expect(first!.openStart).toBe(true);
    expect(first!.openEnd).toBe(false);
    expect(second!.openStart).toBe(false);
    expect(second!.openEnd).toBe(true);
    // stejná data = stejný pás (kreslí se stabilně, ne podle pěšin dne)
    expect(pathRibbons(roadLines([a, b]), EARTH_LAYER)).toEqual(
      pathRibbons(roadLines([a, b]), EARTH_LAYER),
    );
  });

  it('pěšina dne se u osy cesty ztrácí, dál od ní je plná', () => {
    expect(roadFade([])).toBeUndefined();
    const fade = roadFade([a, b])!;
    expect(fade(20, 0.5)).toBe(0);
    expect(fade(20, 2.3)).toBeGreaterThan(0);
    expect(fade(20, 2.3)).toBeLessThan(1);
    expect(fade(20, 10)).toBe(1);
    const along = pathRibbons([line(0.6)], WORN_LAYER, () => 1, fade);
    // pěšina po ose cesty (z = 0) až k x = 20 zmizí, za ohybem se objeví
    expect(along.alphas[1 + 4 * 5]).toBe(0);
    expect(Math.max(...along.alphas)).toBeGreaterThan(0.5);
  });
});
