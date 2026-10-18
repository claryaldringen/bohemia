import { describe, expect, it } from 'vitest';
import { NEW_VILLAGE_MIN_DISTANCE_M } from '../rules';
import { distanceToVillages, freeVillageSite } from '../villages-apart';
import { makeLandscape } from './placement-fixtures';

// Víc vsí na téže mapě (migration.md): nová ves stojí nejméně 300 m od staveb jiných vsí.

describe('freeVillageSite', () => {
  it('bez jiných vsí vybere místo vsi krajiny, jinak nejbližší místo dost daleko', () => {
    const landscape = makeLandscape({ size: 48 });
    const free = freeVillageSite(landscape, []);
    expect(free).toEqual({ x: 7.5, z: 7.5, rotation: 0 });
    const village = [{ x: 0, z: 0 }];
    const away = freeVillageSite(landscape, village)!;
    expect(distanceToVillages(away, village)).toBeGreaterThanOrEqual(NEW_VILLAGE_MIN_DISTANCE_M);
    // deterministicky
    expect(freeVillageSite(landscape, village)).toEqual(away);
  });

  it('malá mapa s vsí uprostřed další ves nepustí', () => {
    const landscape = makeLandscape({ size: 16 });
    expect(freeVillageSite(landscape, [{ x: 0, z: 0 }])).toBeNull();
  });

  it('vzdálenost k vsi bez staveb je nekonečná', () => {
    expect(distanceToVillages({ x: 1, z: 2 }, [])).toBe(Number.POSITIVE_INFINITY);
    expect(distanceToVillages({ x: 3, z: 4 }, [{ x: 0, z: 0 }])).toBe(5);
  });
});
