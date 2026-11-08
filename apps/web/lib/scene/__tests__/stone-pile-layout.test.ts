import { describe, expect, it } from 'vitest';
import { MAX_PILES_PER_STACK, stackPieces, stoneLayout } from '../stone-pile-layout';

// Hromady kamení a lomy ve scéně (fortifications.md – Kámen).

describe('rozložení hromad kamení', () => {
  it('hromada se složí z velkých dílů (3 m³) a zbytek malými, nejvýš MAX dílů', () => {
    expect(stackPieces(0)).toEqual([]);
    expect(stackPieces(7).map((p) => p.kind)).toEqual(['b', 'b', 'a']);
    expect(stackPieces(0.5)[0]!.scale).toBeCloseTo(Math.cbrt(0.5), 9);
    expect(stackPieces(1000)).toHaveLength(MAX_PILES_PER_STACK);
  });

  it('lom: stěna a dvě hromádky, rozestavěný nižší stěna a jedna hromádka', () => {
    const built = stoneLayout({ quarries: [{ outcropId: 3, x: 10, z: 20, rotation: 0 }] });
    expect(built.faces).toEqual([{ x: 10, z: 18, rotation: 0, scale: 1 }]);
    expect(built.a).toHaveLength(1);
    expect(built.b).toHaveLength(1);
    const building = stoneLayout({
      quarries: [{ outcropId: 3, x: 10, z: 20, rotation: 0, building: true, constructionId: 9 }],
    });
    expect(building.faces[0]!.scaleY).toBe(0.5);
    expect(building.b).toHaveLength(0);
  });

  it('díly hromady stojí kolem jejího místa', () => {
    const layout = stoneLayout({ stoneStacks: [{ id: 1, x: 0, z: 0, m3: 9 }] });
    expect(layout.b.map((p) => p.x)).toEqual([-2.6, 0, 2.6]);
    expect(layout.b.every((p) => p.z === 0)).toBe(true);
  });
});
