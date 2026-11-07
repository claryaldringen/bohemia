import { describe, expect, it } from 'vitest';
import {
  routeLinesOf,
  keepSceneData,
  knownSceneData,
  lostSceneData,
  sceneRoutesKey,
  trimKnownSceneData,
} from '../scene-routes';
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

  it('zahozená data se poznají (pohled se uloží bez otisku)', () => {
    const before = scene('k1', 30);
    const trimmed = trimKnownSceneData(scene('k1', 30), knownSceneData(before));
    expect(lostSceneData(trimmed, keepSceneData(trimmed, before))).toBe(false);
    expect(lostSceneData(trimmed, keepSceneData(trimmed, scene('k0', 0)))).toBe(true);
    expect(lostSceneData(before, keepSceneData(before, undefined))).toBe(false);
  });

  it('stará ves bez vyšlapanosti nebo tras: bez čar tras (scéna kreslí čáry sítě)', () => {
    const old = { routes: { key: 'k1', list: [route as never] } } as unknown as SceneVillage;
    expect(routeLinesOf(old, 1)).toBeNull();
    const dropped = { ...scene('k1', 3), wear: { day: 3, cells: null } } as SceneVillage;
    expect(routeLinesOf(dropped, 1)).toBeNull();
    expect(routeLinesOf({} as SceneVillage, 1)).toBeNull();
    expect(
      routeLinesOf({ ...scene('k1', 3), wear: { day: 3, cells: '' } } as SceneVillage, 1),
    ).not.toBeNull();
  });

  it('klient bez tras neposílá klíče', () => {
    expect(knownSceneData(undefined)).toEqual({});
    expect(
      knownSceneData(trimKnownSceneData(scene('k1', 1), knownSceneData(scene('k1', 1)))),
    ).toEqual({});
  });

  it('vyšlapanost téhož dne s jinou stranou políčka (převod 7,5 → 3,75 m) se pošle znovu', () => {
    const old = scene('k1', 30);
    const known = knownSceneData(old);
    expect(known.wearCellM).toBeUndefined();
    const converted = { ...old, wear: { day: 30, cellM: 3.75, cells: 'abc' } } as SceneVillage;
    expect(trimKnownSceneData(converted, known).wear?.cells).toBe('abc');
    const again = knownSceneData(converted);
    expect(again.wearCellM).toBe(3.75);
    expect(trimKnownSceneData(converted, again).wear).toEqual({
      day: 30,
      cellM: 3.75,
      cells: null,
    });
  });

  it('klíč tras scény se změní i s převážením (otisk mapy stejný)', () => {
    const base = { day: 1, key: 'mapa', list: [route as never] };
    const key = sceneRoutesKey(base);
    expect(sceneRoutesKey({ ...base, list: [{ ...route, trips: 120 } as never] })).not.toBe(key);
    // převážení s týmž součtem cest
    const two = {
      ...base,
      list: [
        { ...route, trips: 60 },
        { ...route, to: 'b', trips: 40 },
      ],
    };
    const swapped = {
      ...base,
      list: [
        { ...route, trips: 40 },
        { ...route, to: 'b', trips: 60 },
      ],
    };
    expect(sceneRoutesKey(swapped as never)).not.toBe(sceneRoutesKey(two as never));
  });
});
