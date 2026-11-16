import { describe, expect, it } from 'vitest';
import { NO_OBSTACLE_CHANGES, packObstacles, type Landscape } from '@bohemia/game';
import {
  drawMinimapPremium,
  drawMinimapView,
  drawMinimapVillage,
  minimapImage,
  minimapToWorld,
  premiumMinimapMarks,
  sacredMinimapMarks,
  worldToMinimap,
  type MinimapContext,
} from '../minimap';
import type { SceneVillage } from '../village-view';
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

describe('sacredMinimapMarks', () => {
  it('háj po čtvercích, dub tečkou, modla a svatyně půdorysem (aspoň 3,5 px)', () => {
    const marks = sacredMinimapMarks(
      landscape,
      {
        oaks: [{ id: 1, x: 0, z: 0 }],
        groves: [
          { id: 2, x: 7.5, z: 7.5, squares: [{ cell: { x: 4, y: 4 }, x: 7.5, z: 7.5, size: 15 }] },
        ],
        buildings: [
          { id: 3, kind: 'idol', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
          {
            id: 4,
            kind: 'shrine',
            position: { x: 0, z: 0, rotation: 0 },
            built: false,
            progress: 0,
          },
        ],
      },
      120,
    );
    expect(marks.map((m) => m.kind)).toEqual(['square', 'dot', 'footprint', 'footprint']);
    expect(marks[0]).toMatchObject({ x: 67.5, y: 52.5, size: 15 });
    expect(marks[2]).toMatchObject({ size: 4, built: true });
    expect(marks[3]).toMatchObject({ size: 30, built: false });
    expect(sacredMinimapMarks(landscape, undefined, 120)).toEqual([]);
  });
});

/** Plátno, které si zapisuje volání (fillRect, stroke…). */
function recorder(): MinimapContext & { calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(
        `${name}(${args.map((a) => (typeof a === 'number' ? a.toFixed(1) : a)).join(',')})`,
      );
    };
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    fill: record('fill'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    stroke: record('stroke'),
  };
}

describe('kreslení minimapy – ves ve vrstvě, záběr zvlášť', () => {
  const part = (x: number, y: number): SceneVillage['fields'][number]['parts'][number] => ({
    id: x * 10 + y,
    cell: { x, y },
    x: x * 15 - 52.5,
    z: y * 15 - 52.5,
    size: 15,
    stage: 'sown',
  });
  const village: SceneVillage = {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    ],
    fields: [{ id: 1, parts: [part(1, 1), part(2, 1), part(3, 1)] }],
  };

  it('vrstva vsi: čtverec na díl pole a obydlí s obrysem', () => {
    const context = recorder();
    drawMinimapVillage(context, landscape, village, 196);
    expect(context.calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(3 + 1);
    expect(context.calls.filter((c) => c.startsWith('strokeRect'))).toHaveLength(1);
  });

  it('záběr kamery je jen obrys – pole ani obydlí se při pohybu kamery nepřekreslují', () => {
    const context = recorder();
    drawMinimapView(
      context,
      landscape,
      {
        corners: [
          [-10, 10],
          [10, 10],
          [10, -10],
          [-10, -10],
        ],
      },
      196,
    );
    expect(context.calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(0);
    expect(context.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(3);
    expect(context.calls.at(-1)).toBe('stroke()');
    const empty = recorder();
    drawMinimapView(empty, landscape, null, 196);
    expect(empty.calls).toEqual([]);
  });
});

describe('minimapa – pokračování zemské stezky', () => {
  const axis = [
    { x: -40, z: 50 },
    { x: 0, z: 0 },
    { x: 30, z: -40 },
  ];
  const base: SceneVillage = { dwellings: [], fields: [] };

  it('pokračování se kreslí stejnou čarou jako pevná cesta', () => {
    const own = recorder();
    drawMinimapVillage(
      own,
      landscape,
      { ...base, roads: [{ id: 1, points: axis, grade: 'improved' }] },
      196,
    );
    const continued = recorder();
    drawMinimapVillage(
      continued,
      landscape,
      { ...base, trailContinuations: [{ id: -1, points: axis, grade: 'improved', swath: true }] },
      196,
    );
    expect(own.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(2);
    expect(continued.calls).toEqual(own.calls);
  });
});

describe('prvky prémiové krajiny na minimapě', () => {
  const features = {
    type: 'ford-hill' as const,
    sites: [
      {
        kind: 'river' as const,
        x: 0,
        z: 0,
        line: [
          [-60, 0],
          [60, 0],
        ] as [number, number][],
      },
      { kind: 'ford' as const, x: 10, z: 0 },
      {
        kind: 'route' as const,
        x: 0,
        z: 0,
        line: [
          [-60, -60],
          [0, 0],
          [60, 60],
        ] as [number, number][],
      },
      {
        kind: 'promontory' as const,
        x: 30,
        z: 30,
        outline: [
          [20, 20],
          [40, 20],
          [40, 40],
          [20, 40],
        ] as [number, number][],
      },
    ],
  };

  it('stezka čarou, ostrožna obrysem s výplní, brod bodem navrch; řeka bez značky', () => {
    const marks = premiumMinimapMarks(landscape, features, 120);
    expect(marks.map((m) => m.kind)).toEqual(['line', 'area', 'point']);
    expect(marks[1]).toMatchObject({ fill: true });
    const ford = marks[2]!;
    expect(ford).toMatchObject(worldToMinimap(landscape, 10, 0, 120));
    expect(premiumMinimapMarks(landscape, null, 120)).toEqual([]);
  });

  it('půda a les jen obrysem (bez výplně)', () => {
    const marks = premiumMinimapMarks(
      landscape,
      {
        type: 'south-slopes',
        sites: [
          {
            kind: 'slope',
            x: 0,
            z: 0,
            outline: [
              [0, 0],
              [10, 0],
              [10, 10],
            ],
          },
        ],
      },
      120,
    );
    expect(marks).toEqual([expect.objectContaining({ kind: 'area', fill: false })]);
  });

  it('kreslení: bod kosočtvercem s obrysem, plocha výplní a obrysem, čára tahem', () => {
    const context = recorder();
    drawMinimapPremium(context, premiumMinimapMarks(landscape, features, 120));
    expect(context.calls.filter((c) => c === 'fill()')).toHaveLength(2);
    expect(context.calls.filter((c) => c === 'stroke()')).toHaveLength(3);
  });
});
