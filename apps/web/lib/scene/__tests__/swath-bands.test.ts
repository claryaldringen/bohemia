import { OBSTACLE_KINDS, ROAD_SWATH, type ObstacleLayer } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneRoad, SceneVillage } from '../../village-view';
import {
  roadsWithContinuations,
  swathBands,
  swathBandsKey,
  swathDistance,
  swathObstacleIds,
} from '../swath-bands';
import { wildKey, wildPlants } from '../wild-growth';

// Průsek lesem ve scéně (roads.md – Průsek lesem): pás podél os úseků s průsekem – plocha korun
// nad ním zapadne a zarůstání do něj nevstoupí.

const road = (extra: Partial<SceneRoad> = {}): SceneRoad => ({
  id: 1,
  points: [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
  ],
  grade: 'improved',
  swath: true,
  ...extra,
});

describe('pásy průseků lesem', () => {
  it('jen úseky s průsekem; vzdálenost od okraje pásu (uvnitř záporná)', () => {
    expect(swathBands([road({ swath: undefined })])).toEqual([]);
    const bands = swathBands([road(), road({ id: 2, swath: undefined })]);
    expect(bands).toHaveLength(1);
    expect(swathDistance(bands, 50, 0, 5)).toBeCloseTo(-ROAD_SWATH.halfM, 9);
    expect(swathDistance(bands, 50, ROAD_SWATH.halfM + 2, 5)).toBeCloseTo(2, 9);
    expect(swathDistance(bands, 50, 30, 5)).toBe(Infinity);
    expect(swathBandsKey(bands)).toBe('0,0 1000,0');
    expect(swathBandsKey([])).toBe('');
  });

  it('zarůstání přílohu do průseku nevstoupí', () => {
    const village: Pick<SceneVillage, 'fields' | 'woods' | 'obstacles' | 'roads'> = {
      fields: [
        {
          id: 1,
          parts: [
            {
              cell: { x: 10, y: 10 },
              x: 7.5,
              z: 0,
              size: 15,
              stage: 'young-forest',
              overgrowth: 20,
            },
          ],
        },
      ],
    };
    const all = wildPlants(village);
    const cut = wildPlants({ ...village, roads: [road()] });
    expect(all.some((p) => Math.abs(p.z) <= ROAD_SWATH.halfM)).toBe(true);
    expect(cut.length).toBeLessThan(all.length);
    expect(cut.every((p) => Math.abs(p.z) > ROAD_SWATH.halfM || p.x < 0 || p.x > 100)).toBe(true);
    expect(wildKey(village)).not.toBe(wildKey({ ...village, roads: [road()] }));
  });
});

describe('pokračování zemské stezky – průsek na mapě souseda', () => {
  const continuation = road({ id: -1 });

  it('pokračování se přidá k cestám vsi a dá pás jako průsek', () => {
    const own = road({ id: 7 });
    const all = roadsWithContinuations({ roads: [own], trailContinuations: [continuation] });
    expect(all.map((r) => r.id)).toEqual([7, -1]);
    expect(roadsWithContinuations({})).toEqual([]);
    expect(swathBands(all)).toHaveLength(2);
  });

  it('skryje stromy a keře v pásu, pařezy, kameny a stromy mimo pás ne', () => {
    const kind = (name: string): number => OBSTACLE_KINDS.indexOf(name as never);
    const items = [
      { kind: 'tree', x: 50, z: 1 }, // v pásu
      { kind: 'shrub', x: 20, z: -3 }, // v pásu
      { kind: 'stump', x: 30, z: 0 }, // pařez zůstane
      { kind: 'stone', x: 40, z: 0 }, // kámen zůstane
      { kind: 'tree', x: 50, z: ROAD_SWATH.halfM + 1 }, // mimo pás
    ];
    const layer = {
      count: items.length,
      id: Uint32Array.from(items.map((_, i) => 100 + i)),
      x: Float32Array.from(items.map((o) => o.x)),
      z: Float32Array.from(items.map((o) => o.z)),
      kind: Uint8Array.from(items.map((o) => kind(o.kind))),
    } as unknown as ObstacleLayer;
    expect([...swathObstacleIds(layer, swathBands([continuation]))].sort()).toEqual([100, 101]);
    expect(swathObstacleIds(layer, []).size).toBe(0);
  });
});
