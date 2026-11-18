import { describe, expect, it } from 'vitest';
import {
  DWELLING_CLEARING_M,
  dwellingFrame,
  dwellingShape,
  freeDwellingClearings,
  rotatedPlot,
  shapeRect,
  type Landscape,
} from '@bohemia/game';
import {
  TREE_LAND_RADIUS_M,
  buildingClearings,
  clearingMask,
  clearingsKey,
  clearingsNear,
  fieldClearings,
  hayBlockers,
} from '../building-clearings';
import { scenePlot, type SceneVillage } from '../../village-view';

// Obydlí na poli a v sadu (population.md): pod vyklízenou plochou obydlí bez pozemku scéna
// nekreslí obilí, obtisk pole ani jabloně – stejná plocha, jakou herní jádro z dílu odečte.

const dwelling = (x: number, z: number, extra: object = {}) => ({
  id: 1,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  ...extra,
});

describe('vyklízené plochy obydlí ve scéně', () => {
  it('obydlí bez pozemku má plochu jako v jádru, obydlí na pozemku žádnou', () => {
    const clearings = buildingClearings([
      dwelling(0, 0),
      dwelling(50, 0, {
        type: 'polozemnice',
        plot: { cell: { x: 11, y: 8 }, x: 52.5, z: 7.5, size: 15, variant: 'center' },
      }),
    ]);
    // vyklízená plocha s variantou rozměrů podle polohy (population.md – Varianty rozměrů)
    const at = { x: 0, z: 0, rotation: 0 };
    expect(clearings.map((c) => c.polygon)).toEqual(
      freeDwellingClearings('zemnice', at, dwellingShape({ type: 'zemnice', position: at })),
    );
    // zemnice: ≈ x −4,8 … 4,8, z −4,4 … 7,5 – jako `shapeRect` jádra
    const rect = shapeRect(
      dwellingFrame({ type: 'zemnice', position: at }),
      DWELLING_CLEARING_M.zemnice,
    );
    expect(clearings[0]!.minX).toBeCloseTo(rect.minX, 9);
    expect(clearings[0]!.maxX).toBeCloseTo(rect.maxX, 9);
    expect(clearings[0]!.minZ).toBeCloseTo(rect.minZ, 9);
    expect(clearings[0]!.maxZ).toBeCloseTo(rect.maxZ, 9);
  });

  it('pozemek se středem mimo políčko (D96) zabírá díly jen zčásti – plocha celého čtverce', () => {
    // 18. 11. 2026 – D96: pozemek bez natočení má střed kdekoli pod kurzorem
    const landscape: Landscape = {
      size: 16,
      cellSizeM: 15,
      heights: new Float32Array(256),
      surface: new Uint8Array(256),
      fertility: new Uint8Array(256),
      villageSite: { x: 8, y: 8 },
      stream: [],
      obstacleLayer: null,
    };
    const off = rotatedPlot(landscape, { x: 55.73, z: 9.1, rotation: 0 }, 'center')!;
    const plot = scenePlot(landscape, off);
    expect(plot).toMatchObject({ x: 55.73, z: 9.1, rotation: 0, free: true });
    const clearings = buildingClearings([dwelling(55.73, 9.1, { type: 'polozemnice', plot })]);
    expect(clearings).toHaveLength(1);
    expect(clearings[0]!.minX).toBeCloseTo(55.73 - 7.5, 9);
    expect(clearings[0]!.maxZ).toBeCloseTo(9.1 + 7.5, 9);
    // po 90° ve středu políčka zabírá pozemek celé políčko – plochu nemá jako dřív
    const tile = rotatedPlot(landscape, { x: 52.5, z: 7.5, rotation: Math.PI / 2 }, 'center')!;
    const onTile = scenePlot(landscape, tile);
    expect(onTile.free).toBeUndefined();
    expect(buildingClearings([dwelling(52.5, 7.5, { type: 'polozemnice', plot: onTile })])).toEqual(
      [],
    );
  });

  it('uhlíř je jen zemnice – milíř stojí zvlášť u skácených buků (crafts.md)', () => {
    expect(buildingClearings([dwelling(0, 0, { craft: 'burner' })])).toHaveLength(1);
  });

  it('maska: ve ploše 0, za okrajem plynule k 1; vzdálené plochy se vyřadí', () => {
    const clearings = buildingClearings([dwelling(0, 0)]);
    const mask = clearingMask(clearings, 2);
    expect(mask(0, 0)).toBe(0);
    // okraj vyklízené plochy (varianta rozměrů podle polohy) + polovina měkkého okraje
    expect(mask(clearings[0]!.maxX + 1, 0)).toBeCloseTo(0.5, 9);
    expect(mask(10, 0)).toBe(1);
    expect(clearingMask([], 2)(0, 0)).toBe(1);
    expect(clearingsNear(clearings, { minX: 20, maxX: 30, minZ: 0, maxZ: 10 }, 1)).toEqual([]);
    expect(clearingsNear(clearings, { minX: 5, maxX: 30, minZ: 0, maxZ: 10 }, 1)).toHaveLength(1);
    expect(clearingsKey(clearings)).toBe(clearingsKey(buildingClearings([dwelling(0, 0)])));
  });
});

describe('co pole pod sebou nekreslí (pole jako krajina)', () => {
  it('obydlí, modla a kruh 20 m² pod stromem u cesty a jabloní – jen ty na poli', () => {
    const village = {
      dwellings: [dwelling(0, 0)],
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          {
            id: 9,
            kind: 'idol' as const,
            position: { x: 30, z: 0, rotation: 0 },
            built: true,
            progress: 1,
          },
        ],
      },
      roadTrees: [{ id: 1, x: 50, z: 0, species: 'oak' as const, stage: 'tree' as const, size: 1 }],
      roadApples: [
        { id: 2, roadId: 1, x: 60, z: 0, stage: 'tree' as const, growth: 1, fruit: false },
        { id: 3, roadId: 1, x: 200, z: 0, stage: 'tree' as const, growth: 1, fruit: false },
      ],
    };
    const clearings = fieldClearings(village as never, (x) => x < 100);
    expect(clearings).toHaveLength(4);
    const mask = clearingMask(clearings, 1);
    expect(mask(30, 0)).toBe(0);
    expect(mask(50, TREE_LAND_RADIUS_M - 0.2)).toBe(0);
    expect(mask(60, 0)).toBe(0);
    expect(mask(200, 0)).toBe(1);
    expect(Math.PI * TREE_LAND_RADIUS_M ** 2).toBeCloseTo(20, 9);
  });
});

describe('maska ploch s rejstříkem (mnoho ploch pod velkým polem)', () => {
  it('= nejmenší z masek jednotlivých ploch', () => {
    const clearings = Array.from({ length: 60 }, (_, i) => {
      const x = (i * 37) % 300;
      const z = (i * 53) % 200;
      const r = 2 + (i % 5);
      const polygon: [number, number][] = [
        [x - r, z - r],
        [x + r, z - r * 0.5],
        [x + r * 0.7, z + r],
        [x - r * 0.4, z + r * 0.8],
      ];
      return {
        polygon,
        minX: Math.min(...polygon.map((p) => p[0])),
        maxX: Math.max(...polygon.map((p) => p[0])),
        minZ: Math.min(...polygon.map((p) => p[1])),
        maxZ: Math.max(...polygon.map((p) => p[1])),
      };
    });
    const soft = 1.5;
    const mask = clearingMask(clearings, soft);
    const singles = clearings.map((c) => clearingMask([c], soft));
    let partial = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = -10 + ((i * 1.37) % 320);
      const z = -10 + ((i * 0.91) % 220);
      const value = mask(x, z);
      expect(value).toBe(Math.min(1, ...singles.map((m) => m(x, z))));
      if (value > 0 && value < 1) partial++;
    }
    expect(partial).toBeGreaterThan(50);
  });
});

describe('kam seno nesmí (hayBlockers, issue #3)', () => {
  const empty = { dwellings: [], fields: [] } as unknown as SceneVillage;
  const blockedAt = (village: Partial<SceneVillage>, x: number, z: number): boolean =>
    clearingMask(hayBlockers({ ...empty, ...village }), 1.2)(x, z) < 1;

  it('ohrada blokuje celý čtverec, i kus od plotu', () => {
    const pen = { id: 1, cell: { x: 5, y: 5 }, x: 82.5, z: 82.5, size: 15 };
    const village = { pens: [pen] } as unknown as Partial<SceneVillage>;
    expect(blockedAt(village, 82.5, 82.5)).toBe(true);
    expect(blockedAt(village, 76, 89)).toBe(true);
    expect(blockedAt(village, 100, 82.5)).toBe(false);
  });

  it('humno, pozemek i dvorek polozemnice, jáma a hřbitov', () => {
    const village = {
      dwellings: [
        dwelling(0, 0, {
          type: 'polozemnice',
          plot: {
            cell: { x: 0, y: 0 },
            x: 0,
            z: 0,
            size: 15,
            variant: 'center',
            yard: { cell: { x: 1, y: 0 }, x: 15, z: 0 },
          },
        }),
      ],
      threshingFloors: [
        { id: 1, position: { x: 100, z: 0, rotation: 0 }, built: true, progress: 1 },
      ],
      grainPits: [{ id: 1, x: 200, z: 0, fill: 0.5 }],
      cemeteries: [{ squares: [{ cell: { x: 3, y: 3 }, x: 300, z: 0, size: 15 }] }],
    } as unknown as Partial<SceneVillage>;
    expect(blockedAt(village, 6, 6)).toBe(true); // zahrádka (pozemek)
    expect(blockedAt(village, 20, 0)).toBe(true); // dvorek
    expect(blockedAt(village, 100, 3)).toBe(true); // humno
    expect(blockedAt(village, 200, 1)).toBe(true); // jáma
    expect(blockedAt(village, 305, 5)).toBe(true); // hřbitov
    expect(blockedAt(village, 150, 50)).toBe(false); // louka
  });
});
