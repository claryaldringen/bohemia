import { describe, it, expect } from 'vitest';
import { generateLandscape } from '@bohemia/game';
import { buildRenderSurface, RENDER_SUBDIVISION } from '../render-surface';
import { streamCenterline } from '../stream-geometry';

const landscape = generateLandscape(3);
const surface = buildRenderSurface(landscape);
const stream = streamCenterline(landscape);

describe('buildRenderSurface', () => {
  it('má 4× hustší síť než políčka', () => {
    expect(RENDER_SUBDIVISION).toBe(4);
    expect(surface.resolution).toBe((landscape.size - 1) * 4 + 1);
    expect(surface.heights).toHaveLength(surface.resolution ** 2);
  });

  it('daleko od potoka prochází přesně výškami středů políček', () => {
    for (const [x, y] of [
      [10, 10],
      [100, 20],
      [64, 120],
    ] as const) {
      const v = y * RENDER_SUBDIVISION * surface.resolution + x * RENDER_SUBDIVISION;
      const p = surface.position(v);
      if (stream.nearest(p.x, p.z, 60).distance < 60) continue;
      expect(surface.heights[v]).toBeCloseTo(landscape.heights[y * 128 + x]!, 4);
    }
  });

  it('na ose potoka je dno pod hladinou a hladina je známá', () => {
    let checked = 0;
    for (let v = 0; v < surface.heights.length; v += 7) {
      const p = surface.position(v);
      if (stream.nearest(p.x, p.z).distance > 2) continue;
      expect(surface.waterLevel[v]).toBeGreaterThan(surface.heights[v]! + 0.3);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('daleko od potoka hladina není', () => {
    const v = 0;
    const p = surface.position(v);
    if (stream.nearest(p.x, p.z, 60).distance >= 60) {
      expect(surface.waterLevel[v]).toBe(-Infinity);
    }
  });
});
