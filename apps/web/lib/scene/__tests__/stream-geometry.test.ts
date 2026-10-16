import { describe, it, expect } from 'vitest';
import { generateLandscape, SURFACE_CODES } from '@bohemia/game';
import { streamCenterline } from '../stream-geometry';
import { tileCenter } from '../tile-at';

const landscape = generateLandscape(3);
const stream = streamCenterline(landscape);

describe('streamCenterline', () => {
  it('vede od okraje k okraji krajiny', () => {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const nearEdge = (p: { x: number; z: number }): boolean =>
      Math.max(Math.abs(p.x), Math.abs(p.z)) > half - landscape.cellSizeM;
    expect(nearEdge(stream.points[0]!)).toBe(true);
    expect(nearEdge(stream.points.at(-1)!)).toBe(true);
  });

  it('hladina podél osy nikde nestoupá (teče od prvního bodu dolů)', () => {
    for (let i = 1; i < stream.points.length; i++) {
      expect(stream.points[i]!.level).toBeLessThanOrEqual(stream.points[i - 1]!.level + 1e-6);
    }
  });

  it('osa prochází blízko každého vodního políčka (do 1 políčka)', () => {
    for (let i = 0; i < landscape.surface.length; i++) {
      if (landscape.surface[i] !== SURFACE_CODES.water) continue;
      const { worldX, worldZ } = tileCenter(landscape, i % 128, Math.floor(i / 128));
      expect(stream.nearest(worldX, worldZ).distance).toBeLessThanOrEqual(landscape.cellSizeM);
    }
  });

  it('daleko od potoka nic nenajde', () => {
    const far = stream.points[0]!;
    expect(stream.nearest(far.x + 900, far.z + 900, 40).distance).toBe(Infinity);
  });
});
