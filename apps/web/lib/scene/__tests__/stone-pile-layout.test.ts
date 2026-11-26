import { describe, expect, it } from 'vitest';
import type { SceneCart } from '../../village-view-scene-types';
import { withStoneCartHeaps } from '../../village-view-crafts';
import { stoneDestination } from '../stone-destination';
import {
  MAX_PILES_PER_STACK,
  QUARRY_ROCK_PILE,
  quarryRockPileAt,
  stackPieces,
  stackRadius,
  stoneLayout,
} from '../stone-pile-layout';

// Hromady kamení a lomy ve scéně (fortifications.md – Kámen).

describe('rozložení hromad kamení', () => {
  it('hromada se složí z velkých dílů (3 m³) a zbytek malými, nejvýš MAX dílů', () => {
    expect(stackPieces(0)).toEqual([]);
    expect(stackPieces(7).map((p) => p.kind)).toEqual(['b', 'b', 'a']);
    expect(stackPieces(0.5)[0]!.scale).toBeCloseTo(Math.cbrt(0.5), 9);
    expect(stackPieces(1000)).toHaveLength(MAX_PILES_PER_STACK);
  });

  it('lom: plocha s bloky a přisekaným kamenem, u výchozu vylomené bloky; rozestavěný jen bloky', () => {
    // láme se 12 m od plochy v −z (Lom jako plocha u skal)
    const rock = { x: 10, z: 8, hx: 0, hz: -1, r: 3 };
    const built = stoneLayout({ quarries: [{ outcropId: 3, x: 10, z: 20, rotation: 0, rock }] });
    expect(built.a).toHaveLength(3);
    expect(built.b).toHaveLength(1);
    // na ploše (do půlky úhlopříčky 8 m) – kromě hromádky u skály
    const onArea = (p: { x: number; z: number }): boolean => Math.hypot(p.x - 10, p.z - 20) < 5.7;
    expect(built.b.every(onArea)).toBe(true);
    expect(built.a.filter(onArea)).toHaveLength(2);
    const [rx, rz] = quarryRockPileAt(rock);
    expect(built.a.some((p) => p.x === rx && p.z === rz)).toBe(true);
    // za lamači od skály (osy u bodu lámání)
    expect(rz - rock.z).toBeCloseTo(QUARRY_ROCK_PILE.back, 9);
    const building = stoneLayout({
      quarries: [
        { outcropId: 3, x: 10, z: 20, rotation: 0, rock, building: true, constructionId: 9 },
      ],
    });
    expect(building.a).toHaveLength(1);
    expect(building.b).toHaveLength(0);
  });

  it('díly hromady stojí kolem jejího místa', () => {
    const layout = stoneLayout({ stoneStacks: [{ id: 1, x: 0, z: 0, m3: 9 }] });
    expect(layout.b.map((p) => p.x)).toEqual([-2.6, 0, 2.6]);
    expect(layout.b.every((p) => p.z === 0)).toBe(true);
  });
});

describe('hromady kamení na volném místě (site z dat scény – stoneStackSite)', () => {
  const stack = { id: 1, x: 0, z: 0, m3: 4 };

  it('díly leží kolem místa ze scény; hromada bez místa se nekreslí, bez údaje u kotvy', () => {
    const at = stoneLayout({ stoneStacks: [{ ...stack, site: { x: 10, z: 5, rotation: 0 } }] });
    const spots = [...at.a, ...at.b];
    expect(spots).toHaveLength(2);
    const cx = spots.reduce((sum, p) => sum + p.x, 0) / spots.length;
    const cz = spots.reduce((sum, p) => sum + p.z, 0) / spots.length;
    expect([cx, cz]).toEqual([10, 5]);
    expect(stoneLayout({ stoneStacks: [{ ...stack, site: null }] })).toEqual({ a: [], b: [] });
    expect([...stoneLayout({ stoneStacks: [stack] }).b][0]!.x).toBeCloseTo(-1.3, 9);
  });

  it('nosiči i vůz s kamenem míří k nakreslené hromadě; nekreslí-li se, ke kotvě jako dřív', () => {
    const home = { x: 2, z: 0 };
    const drawn = { stoneStacks: [{ ...stack, site: { x: 10, z: 5, rotation: 0 } }], home };
    expect(stoneDestination(drawn, home, undefined, { x: 50, z: 50 })).toEqual({
      at: { x: 10, z: 5 },
      r: stackRadius(4),
    });
    const hidden = { stoneStacks: [{ ...stack, site: null }], home };
    expect(stoneDestination(hidden, home, undefined, { x: 50, z: 50 })!.at).toEqual({ x: 0, z: 0 });
    const cart = {
      id: 7,
      kind: 'two-wheel',
      job: { load: 'stone', construction: 99 },
      goal: { from: { x: 50, z: 50 }, to: { x: 30, z: 30 } },
    } as unknown as SceneCart;
    const [moved] = withStoneCartHeaps([cart], drawn);
    expect(moved!.goal).toMatchObject({ to: { x: 10, z: 5 }, anyOf: [{ x: 30, z: 30 }] });
  });
});
