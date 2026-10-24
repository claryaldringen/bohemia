import { describe, expect, it } from 'vitest';
import { keepSceneData, knownSceneData, trimKnownSceneData } from '../scene-routes';
import type { SceneVillage } from '../village-view-scene-types';

const route = { from: 'd:1', to: 'water', purpose: 'water', trips: 100, start: [0, 0], steps: '' };

function scene(key: string, day: number): SceneVillage {
  return {
    routes: { key, list: [route as never] },
    wear: { day, cells: 'abc' },
  } as unknown as SceneVillage;
}

describe('trasy a vyšlapanost jen při změně klíče', () => {
  it('druhý dotaz se stejnými klíči trasy ani vyšlapanost neposílá', () => {
    const first = scene('k1', 30);
    const known = knownSceneData(first);
    expect(known).toEqual({ routesKey: 'k1', wearDay: 30 });
    const second = trimKnownSceneData(scene('k1', 30), known);
    expect(second.routes).toEqual({ key: 'k1', list: null });
    expect(second.wear).toEqual({ day: 30, cells: null });
  });

  it('po změně klíče pošle novou hodnotu', () => {
    const known = knownSceneData(scene('k1', 30));
    const next = trimKnownSceneData(scene('k2', 60), known);
    expect(next.routes?.list).toHaveLength(1);
    expect(next.wear?.cells).toBe('abc');
    const half = trimKnownSceneData(scene('k2', 30), known);
    expect(half.routes?.list).toHaveLength(1);
    expect(half.wear?.cells).toBeNull();
  });

  it('klient doplní vynechané z posledního pohledu, jinak údaj zahodí', () => {
    const before = scene('k1', 30);
    const trimmed = trimKnownSceneData(scene('k1', 30), knownSceneData(before));
    const merged = keepSceneData(trimmed, before);
    expect(merged.routes).toBe(before.routes);
    expect(merged.wear).toBe(before.wear);
    const lost = keepSceneData(trimmed, scene('k0', 0));
    expect(lost.routes).toBeUndefined();
    expect(lost.wear).toBeUndefined();
  });

  it('klient bez tras neposílá klíče', () => {
    expect(knownSceneData(undefined)).toEqual({});
    expect(
      knownSceneData(trimKnownSceneData(scene('k1', 1), knownSceneData(scene('k1', 1)))),
    ).toEqual({});
  });
});
