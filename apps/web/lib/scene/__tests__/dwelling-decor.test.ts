import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { HEIGHT_SCALE } from '../constants';
import { terrainMeshHeight } from '../drape';
import { EARTH_LAYERS, earthPatch, eaveTufts } from '../dwelling-decor';
import { buildRenderSurface } from '../render-surface';

describe('okolí obydlí', () => {
  const position = { x: 40, z: -20, rotation: 0.7 };

  it('trsy trávy leží podél dlouhých stran, ne před vchodem, a jsou pokaždé stejné', () => {
    const tufts = eaveTufts('zemnice', position, 3);
    expect(tufts.length).toBeGreaterThan(60);
    expect(eaveTufts('zemnice', position, 3)).toEqual(tufts);
    expect(eaveTufts('zemnice', position, 4)).not.toEqual(tufts);
    const c = Math.cos(position.rotation);
    const s = Math.sin(position.rotation);
    for (const t of tufts) {
      // zpět do souřadnic modelu (x napříč, z k vchodu)
      const dx = t.x - position.x;
      const dz = t.z - position.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      expect(Math.abs(lx)).toBeGreaterThan(2.2);
      expect(Math.abs(lx)).toBeLessThan(3.3);
      expect(Math.abs(lz)).toBeLessThan(3);
    }
  });

  it('vyšlapaná hlína je před vchodem a k okraji slábne', () => {
    const patch = earthPatch('polozemnice', { x: 0, z: 0, rotation: 0 }, 1, EARTH_LAYERS.earth);
    // střed skvrny (první bod) před dveřmi, tj. v +z
    expect(patch.positions[1]!).toBeGreaterThan(2.5);
    expect(patch.alphas[0]!).toBeGreaterThan(0.7);
    expect(patch.alphas[patch.alphas.length - 1]!).toBeLessThan(0.05);
    for (const index of patch.indices) expect(index).toBeLessThan(patch.alphas.length);
  });
});

describe('terrainMeshHeight – výška na trojúhelnících terénu', () => {
  const landscape = generateLandscape(7);
  const surface = buildRenderSurface(landscape);

  it('v bodech sítě sedí přesně na výšky terénu', () => {
    for (const v of [0, 17, 4000, surface.resolution * 300 + 211]) {
      const { x, z } = surface.position(v);
      expect(terrainMeshHeight(surface, x, z)).toBeCloseTo(surface.heights[v]! * HEIGHT_SCALE, 4);
    }
  });

  it('uvnitř čtverce interpoluje rovinně po trojúhelnících, na úhlopříčce spojitě', () => {
    const n = surface.resolution;
    const v = 200 * n + 150;
    const a = surface.position(v);
    const step = surface.position(v + 1).x - a.x;
    const h = (i: number, j: number): number => surface.heights[v + j * n + i]! * HEIGHT_SCALE;
    // střed úhlopříčky z (i+1, j) do (i, j+1)
    expect(terrainMeshHeight(surface, a.x + step / 2, a.z + step / 2)).toBeCloseTo(
      (h(1, 0) + h(0, 1)) / 2,
      4,
    );
    // čtvrtina v prvním trojúhelníku (a, b, c)
    expect(terrainMeshHeight(surface, a.x + step / 4, a.z + step / 4)).toBeCloseTo(
      h(0, 0) + (h(1, 0) - h(0, 0)) / 4 + (h(0, 1) - h(0, 0)) / 4,
      4,
    );
  });
});
