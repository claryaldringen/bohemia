import { fieldFrame, roadLand } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFieldPart } from '../../village-view';
import { roadCutKey, roadCutMask } from '../road-cut-mask';

// Kousky pole oddělené cestou ve scéně (roads.md a fields.md – Cesta přes pole): maska krytí
// podle buněk z jádra – stejné místo jako v simulaci, i u natočeného pole.

const GEO = { size: 20, cellSizeM: 15 };

describe('maska oddělených kousků pole', () => {
  it('bez oddělených kousků žádná maska', () => {
    const part: SceneFieldPart = { cell: { x: 0, y: 0 }, x: 7.5, z: 7.5, size: 15, stage: 'sown' };
    expect(roadCutMask([part])).toBeNull();
    expect(roadCutKey([part])).toBe('');
  });

  it('natočené pole: kde jádro kousek oddělilo, tam maska 0, jinde 1', () => {
    const grid = { x: 0, z: 0, rotation: Math.PI / 6 };
    const frame = fieldFrame(GEO, grid);
    // bod v mřížce pole (m od středu čtverce 0, 0) → svět
    const world = (u: number, v: number): { x: number; z: number } => ({
      x: frame.x + u * frame.c + v * frame.s,
      z: frame.z - u * frame.s + v * frame.c,
    });
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    // cesta přes roh pole (jako x + z = 52 u pole 0–30 m) – růžek za ní
    const a = world(10 - 7.5, 42 - 7.5);
    const b = world(42 - 7.5, 10 - 7.5);
    const land = roadLand(
      [{ frame, squares: cells.map((cell, k) => ({ id: k + 1, cell })) }],
      [{ points: [a, b], grade: 'trodden' }],
    );
    const parts: SceneFieldPart[] = cells.map((cell, k) => {
      const center = world(cell.x * 15, cell.y * 15);
      const cut = land.get(k + 1)?.cut;
      return {
        id: k + 1,
        cell,
        x: center.x,
        z: center.z,
        size: 15,
        rotation: grid.rotation,
        stage: 'sown',
        ...(cut ? { roadCut: cut } : {}),
      };
    });
    expect(parts.filter((p) => p.roadCut).map((p) => p.id)).toEqual([4]);
    const mask = roadCutMask(parts)!;
    const corner = world(21.5, 21.5);
    expect(mask(corner.x, corner.z)).toBe(0);
    const inside = world(5, 5);
    expect(mask(inside.x, inside.z)).toBe(1);
    expect(roadCutKey(parts)).toMatch(/^1,1:/);
  });
});
