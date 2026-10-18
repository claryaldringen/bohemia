import { describe, expect, it } from 'vitest';
import { NO_OBSTACLE_CHANGES, packObstacles, type Landscape } from '@bohemia/game';
import { minimapImage, minimapToWorld, worldToMinimap } from '../minimap';
import { clearedForest } from '../scene/cleared-forest';

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
  obstacleLayer: null,
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

describe('minimapImage – vymýcený les', () => {
  const px = 16;
  const at = (image: Uint8ClampedArray, x: number, y: number): number[] =>
    Array.from(image.slice((y * px + x) * 4, (y * px + x) * 4 + 3));
  const layer = packObstacles([], SIZE, 15);

  it('vymýcené políčko lesa je světlejší paseka, ostatní les zůstane', () => {
    // horní řádek obrázku (sever) = řádek y = SIZE − 1 krajiny, políčko (4, 7) je pixely 8–9
    const cleared = clearedForest(landscape, layer, NO_OBSTACLE_CHANGES, [{ x: 4, y: SIZE - 1 }]);
    const plain = minimapImage(landscape, px);
    const image = minimapImage(landscape, px, cleared);
    const forest = at(plain, 8, 0);
    const clearing = at(image, 8, 0);
    expect(clearing[1]).toBeGreaterThan(forest[1]! + 20);
    expect(at(image, 12, 0)).toEqual(at(plain, 12, 0));
    expect(at(image, 8, 8)).toEqual(at(plain, 8, 8));
  });
});
