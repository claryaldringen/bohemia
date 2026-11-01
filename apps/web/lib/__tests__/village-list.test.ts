import { describe, expect, it } from 'vitest';
import {
  advanceVillage,
  dayIndexOf,
  foundVillage,
  isStewardOn,
  isVillageAbandoned,
  isVillageDormant,
  isVillageExtinct,
  isVillageTravelling,
  newSteward,
  summarizeVillage,
  threshingStatus,
  villageDigest,
  type VillageDigest,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import { otherVillageDisasters } from '../disasters-view';
import { keepShownVillage, villageListItem, type VillageListItem } from '../village-list';

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

describe('keepShownVillage', () => {
  const list = [{ id: 'a', steward: true as const }] as never[];
  const one = { id: 'v1', villages: [], marker: 1 };
  const two = { id: 'v2', villages: list, marker: 2 };
  it('odpověď o jiné vsi nechá pohled na zobrazené, vezme jen seznam vsí', () => {
    expect(keepShownVillage(one, two)).toEqual({ id: 'v1', villages: list, marker: 1 });
  });
  it('stejná ves nebo nic zobrazeného: odpověď beze změny', () => {
    expect(keepShownVillage(one, { ...one, marker: 3 }).marker).toBe(3);
    expect(keepShownVillage(null, two)).toBe(two);
  });
});

/** Položka přepínače přímo z celého stavu – jak ji počítal přepínač před souhrnem vsi. */
function fromFullState(record: VillageRecord, day: number): VillageListItem {
  const dormant = isVillageDormant(record.state);
  const summary = dormant ? null : summarizeVillage(record.state, day);
  const threshing = dormant ? null : threshingStatus(record.state, day);
  const disasters = dormant ? undefined : otherVillageDisasters(record.state, day);
  return {
    id: record.id,
    settlementId: record.settlementId,
    name: record.name,
    people: isVillageAbandoned(record.state) ? 0 : record.state.people.length,
    extinct: isVillageExtinct(record.state),
    abandoned: isVillageAbandoned(record.state),
    travelling: isVillageTravelling(record.state),
    hunger: summary?.hunger ?? 'fed',
    ...(threshing?.emergency ? { threshing: { emergency: true as const } } : {}),
    ...(disasters ? { disasters } : {}),
    ...(isStewardOn(record.state) ? { steward: true as const } : {}),
  };
}

describe('villageListItem – ze souhrnu vsi stejně jako z celého stavu', () => {
  it('hlad, humno, počasí, pohromy, správce, vymřelá, opuštěná i na cestě – i dny po dni vsi', () => {
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
    const base = advanceVillage(
      foundVillage({
        seed: 7,
        day: founded,
        dwellingPosition: { x: 0, z: 0, rotation: 0 },
        firstField: { outline, parts },
      }),
      at(600, 6, 9),
      null,
    );
    const variant = (change: (s: VillageState) => void): VillageState => {
      const s = structuredClone(base);
      change(s);
      return s;
    };
    const states: VillageState[] = [
      base,
      variant((s) => {
        s.hungry = true;
        s.ration = 0.5;
      }),
      variant((s) => (s.sheaves = { grainKg: 400, legumesKg: 0, work: { spring: 20 } })),
      variant((s) => (s.steward = newSteward(s.lastDay, true))),
      variant((s) => {
        s.chronicle.push({ day: s.lastDay - 3, kind: 'hail', partIds: [1], dwellingIds: [] });
      }),
      variant((s) => (s.extinctDay = s.lastDay)),
      variant((s) => (s.abandonedDay = s.lastDay)),
      variant((s) => {
        s.journey = { arrivalDay: s.lastDay + 5 } as unknown as NonNullable<
          VillageState['journey']
        >;
      }),
    ];
    // povodeň ve vsi (voda a bahno pár dní) a vynucené počasí roku; ochrana dílů souhrn nemění
    for (const after of [-2, 0, 1, 3]) {
      states.push(
        variant((s) => {
          s.disasters = {
            ...base.disasters,
            flood: { day: s.lastDay + after, level: 'twenty', heightM: 1.2 },
          };
        }),
      );
    }
    states.push(
      variant((s) => {
        s.lastDay = at(601, 7, 1);
        s.disasters = {
          override: { weather: { 601: { summer: 'drought', winter: 'blackFrost' } } },
        };
      }),
    );
    // zlé počasí a povodeň se odhalují postupně – projít celý rok s různými seedy kraje
    for (let seed = 1; seed <= 40; seed++) {
      for (let month = 1; month <= 12; month++) {
        states.push(
          variant((s) => {
            s.weatherSeed = seed;
            s.lastDay = at(601, month, 1);
          }),
        );
      }
    }
    const seen = { weather: 0, last: 0, hunger: 0, threshing: 0 };
    for (const state of states) {
      const full: VillageRecord = { ...record(state), state };
      const item = fromFullState(full, state.lastDay + 3);
      if (item.disasters?.weather) seen.weather++;
      if (item.disasters?.last) seen.last++;
      if (item.hunger !== 'fed') seen.hunger++;
      if (item.threshing) seen.threshing++;
      // souhrn uložený s vsí (přes JSON jako v DB) – den pohledu až o 3 dny po dni vsi i dál
      const brief = {
        id: full.id,
        settlementId: full.settlementId,
        name: full.name,
        version: full.version,
        digest: JSON.parse(JSON.stringify(villageDigest(state))) as VillageDigest,
      };
      for (let after = 0; after <= 5; after++) {
        const day = state.lastDay + after;
        expect(villageListItem(brief, day)).toEqual(fromFullState(full, day));
        expect(villageListItem(full, day)).toEqual(fromFullState(full, day));
      }
    }
    // test opravdu prošel počasí, pohromu, hlad i humno
    expect(Object.values(seen).every((n) => n > 0)).toBe(true);
  });
});
