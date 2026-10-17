import { describe, expect, it } from 'vitest';
import type { Landscape } from '@bohemia/game';
import { minimapImage, minimapToWorld, worldToMinimap } from '../minimap';

const SIZE = 8;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  // levý sloupec voda, horní řádek (y = SIZE − 1, sever) les, jinak louka
  surface: Uint8Array.from({ length: SIZE * SIZE }, (_, i) =>
    i % SIZE === 0 ? 0 : Math.floor(i / SIZE) === SIZE - 1 ? 1 : 2,
  ),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 4, y: 4 },
  stream: [],
};

describe('převod souřadnic minimapy', () => {
  it('střed krajiny je střed mapy, sever (+z) nahoře, západ (−x) vlevo', () => {
    expect(worldToMinimap(landscape, 0, 0, 200)).toEqual({ x: 100, y: 100 });
    expect(worldToMinimap(landscape, -60, 60, 200)).toEqual({ x: 0, y: 0 });
    expect(worldToMinimap(landscape, 60, -60, 200)).toEqual({ x: 200, y: 200 });
  });

  it('tam a zpět dá stejný bod, mimo mapu se ořízne do krajiny', () => {
    const p = worldToMinimap(landscape, 12.5, -33, 196);
    const back = minimapToWorld(landscape, p.x, p.y, 196);
    expect(back.x).toBeCloseTo(12.5);
    expect(back.z).toBeCloseTo(-33);
    expect(minimapToWorld(landscape, -50, 500, 196)).toEqual({ x: -60, z: -60 });
  });
});

describe('minimapImage', () => {
  it('voda modrá vlevo, les tmavě zelený nahoře, louka zelená', () => {
    const px = 16;
    const image = minimapImage(landscape, px);
    expect(image).toHaveLength(px * px * 4);
    const at = (x: number, y: number): number[] =>
      Array.from(image.slice((y * px + x) * 4, (y * px + x) * 4 + 4));
    const [wr, wg, wb, wa] = at(0, 8);
    expect(wb).toBeGreaterThan(wr!);
    expect(wb).toBeGreaterThan(wg!);
    expect(wa).toBe(255);
    const forest = at(8, 0);
    const meadow = at(8, 8);
    expect(forest[1]).toBeGreaterThan(forest[0]!);
    expect(meadow[1]).toBeGreaterThan(forest[1]!);
  });
});
