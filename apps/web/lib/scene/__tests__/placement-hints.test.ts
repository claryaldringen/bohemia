import { describe, expect, it } from 'vitest';
import { SURFACE_CODES, checkPlotPlacement, packObstacles, type Landscape } from '@bohemia/game';
import { plotUnderCursor, roadsUnderPlanned } from '../placement-hints';
import type { SceneRoad } from '../../village-view';

// Náhled umisťování stavby (D96 – Martin 18. 11. 2026): pozemek domu má střed pod kurzorem i bez
// natočení a kusy cest, které by stavba po postavení opustila, náhled vyznačí žlutě.

/** Rovná louka 16 × 16 políček po 15 m – políčko (8, 8) leží v x, z ∈ [0, 15]. */
const LANDSCAPE: Landscape = {
  size: 16,
  cellSizeM: 15,
  heights: new Float32Array(256),
  surface: new Uint8Array(256).fill(SURFACE_CODES.meadow),
  fertility: new Uint8Array(256),
  villageSite: { x: 8, y: 8 },
  stream: [],
  obstacleLayer: null,
};
const EMPTY = packObstacles([], 16, 15);

const road = (id: number, from: [number, number], to: [number, number]): SceneRoad => ({
  id,
  points: [
    { x: from[0], z: from[1] },
    { x: to[0], z: to[1] },
  ],
  grade: 'trodden',
});

describe('pozemek pod kurzorem (population.md – Natočený pozemek, D96)', () => {
  it('bez natočení i po 90° má střed pod kurzorem na cm, nepřichytí se na políčko', () => {
    for (const rotation of [0, Math.PI / 2]) {
      const at = plotUnderCursor(LANDSCAPE, 11.234, 4.5, rotation, 'center')!;
      expect(at.plot.cell).toEqual({ x: 8, y: 8 });
      expect(at.plot.square).toEqual({ x: 11.23, z: 4.5, rotation });
      expect(at.square).toMatchObject({ x: 11.23, z: 4.5, size: 15 });
      // server přijme totéž co náhled
      expect(checkPlotPlacement(LANDSCAPE, null, 'polozemnice', at.plot, EMPTY).ok).toBe(true);
    }
  });

  it('bez natočení přesně ve středu políčka je to políčko jako dřív', () => {
    const at = plotUnderCursor(LANDSCAPE, 7.5, 7.5, 0, 'center')!;
    expect(at.plot).toEqual({ cell: { x: 8, y: 8 }, variant: 'center' });
    expect(at.square).toEqual({ x: 7.5, z: 7.5, size: 15 });
    expect(plotUnderCursor(LANDSCAPE, 500, 0, 0, 'center')).toBeNull();
  });
});

describe('zásah stavby do cest (paths.md – Stavba přes cestu, Náhled u kurzoru)', () => {
  const plot = plotUnderCursor(LANDSCAPE, 7.5, 7.5, 0, 'center')!.plot;
  const planned = {
    kind: 'dwelling' as const,
    type: 'polozemnice' as const,
    position: { x: 7.5, z: 7.5, rotation: Math.PI },
    plot,
  };

  it('cesta přes pozemek se vyznačí, cesta mimo a krátký zásah ne', () => {
    const roads = [road(1, [7.5, -30], [7.5, 45]), road(2, [40, -30], [40, 45])];
    const under = roadsUnderPlanned(LANDSCAPE, () => roads)(planned);
    expect(under.map((s) => s.roadId)).toEqual([1]);
    const end = [road(3, [7.5, 40], [7.5, 14])];
    expect(roadsUnderPlanned(LANDSCAPE, () => end)(planned)).toEqual([]);
  });

  it('bez cest nic; cesta ve vylepšení a opuštěná se nevyznačí; stejný vstup = minulý výsledek', () => {
    expect(roadsUnderPlanned(LANDSCAPE, () => [])(planned)).toEqual([]);
    const upgrading: SceneRoad = {
      ...road(4, [7.5, -30], [7.5, 45]),
      upgrade: { grade: 'improved', progress: 0.5 },
    };
    const abandoned: SceneRoad = { ...road(5, [7.5, -30], [7.5, 45]), abandoned: true };
    expect(roadsUnderPlanned(LANDSCAPE, () => [upgrading, abandoned])(planned)).toEqual([]);
    const roads = [road(1, [7.5, -30], [7.5, 45])];
    const under = roadsUnderPlanned(LANDSCAPE, () => roads);
    expect(under(planned)).toBe(under({ ...planned }));
  });
});
