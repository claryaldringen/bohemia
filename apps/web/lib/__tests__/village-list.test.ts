import { describe, expect, it } from 'vitest';
import { advanceVillage, dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { villageListItem } from '../village-list';

// Položka přepínače vsí (migration.md – Víc vsí jednoho hráče): humno pro upozornění z jiné vsi
// (production-chains.md – Humno).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

const record = (state: VillageState): Parameters<typeof villageListItem>[0] => ({
  id: 'v-2',
  settlementId: 's-1',
  name: 'Budeč',
  state,
  version: 1,
});

describe('villageListItem – humno', () => {
  it('ves bez humna před žněmi, snopy čekají; s humnem nic', () => {
    const founded = at(600, 3, 15);
    const parts = Array.from({ length: 40 }, (_, i) => ({
      areaM2: 225,
      distanceM: 50 + i,
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    }));
    const outline: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const s = advanceVillage(
      foundVillage({
        seed: 7,
        day: founded,
        dwellingPosition: { x: 0, z: 0, rotation: 0 },
        firstField: { outline, parts },
      }),
      at(600, 6, 9),
      null,
    );
    // před žní bez snopů se nic nehlásí
    expect(villageListItem(record(s), at(600, 6, 10)).threshing).toBeUndefined();
    const waiting = structuredClone(s);
    waiting.lastDay = at(600, 9, 9);
    waiting.sheaves = { grainKg: 400, legumesKg: 0, work: { spring: 20 } };
    // po žni bez humna se mlátí nouzově
    expect(villageListItem(record(waiting), at(600, 9, 10)).threshing).toEqual({ emergency: true });
    const floor = structuredClone(waiting);
    floor.threshingFloors = [
      { id: 900, position: { x: 50, z: 0, rotation: 0 }, builtDay: founded },
    ];
    expect(villageListItem(record(floor), at(600, 9, 10)).threshing).toBeUndefined();
  });
});

describe('villageListItem – správce', () => {
  it('zapnutý správce nese značku, vypnutý a ves bez stavu ne', () => {
    const parts = Array.from({ length: 40 }, (_, i) => ({
      areaM2: 225,
      distanceM: 50 + i,
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    }));
    const outline: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const s = foundVillage({
      seed: 7,
      day: at(600, 3, 15),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: { outline, parts },
    });
    const on = structuredClone(s);
    on.steward = { on: true, sinceDay: on.lastDay, built: [] };
    const off = structuredClone(s);
    off.steward = { on: false, sinceDay: off.lastDay, built: [] };
    expect(villageListItem(record(on), on.lastDay).steward).toBe(true);
    expect(villageListItem(record(off), off.lastDay).steward).toBeUndefined();
  });
});
