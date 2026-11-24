import { describe, expect, it, vi } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { VillageEvent, VillageNearby } from '../../domain/village';
import { D, homeVillage } from '../../domain/village/trade/__tests__/market-fixtures';
import { advanceDynasty } from '../advance-dynasty';
import { dynastyForVillage } from '../dynasty-for-village';
import {
  NEARBY_REFRESH_DAYS,
  nearbyStale,
  nearbyVillages,
  refreshNearby,
  refreshNearbySafely,
} from '../nearby';
import { H_PLAYER, M_PLAYER, marketWorld, type MarketWorld } from './market-world';

// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): vsi na 8 sousedních mapách – i vsi vlastního
// hráče, bez spících, archivovaných a odříznutých. Svět `marketWorld()`: Vlkov (H, 0,0) a Lhota
// (M, 1,0) na sousedních mapách.

/** Události `nearby` ve schránce vsi (všechny dny). */
async function nearbyEvents(w: MarketWorld, villageId: string): Promise<VillageEvent[]> {
  const all = await w.villages.inbox.pending(villageId, -1, TOTAL_GAME_DAYS);
  return all.filter((e) => e.body.kind === 'nearby');
}

/** Sídlo hráče `ownerId` s živou vsí `name` na políčku mapy světa (x, y). */
async function addVillage(
  w: MarketWorld,
  ownerId: string,
  name: string,
  cell: { x: number; y: number },
): Promise<string> {
  const settlement = (await w.settlements.create({
    ownerId,
    landscapeSeed: 30 + cell.x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: cell,
  }))!;
  return (await w.villages.add(settlement.id, name, homeVillage())).id;
}

/** Sídlo vsi `villageId` se stane odříznutým (nováček – jen místní mřížka). */
function isolate(w: MarketWorld, villageId: string): void {
  const settlementId = w.villages.records.get(villageId)!.settlementId;
  const i = w.settlements.settlements.findIndex((s) => s.id === settlementId);
  const settlement = w.settlements.settlements[i]!;
  w.settlements.settlements[i] = {
    ...settlement,
    localCell: settlement.worldCell,
    worldCell: null,
  };
}

describe('nearbyVillages – vsi na 8 sousedních mapách', () => {
  it('soused na sousední mapě s políčky a prvním krokem, den lastDay + 1, jméno vsi', async () => {
    const w = await marketWorld();
    expect(await nearbyVillages(w.deps, w.h)).toEqual({
      day: D + 1,
      self: { villageId: w.h, name: 'Vlkov' },
      villages: [{ villageId: w.m, name: 'Lhota', cells: 1, firstStep: 'E' }],
    });
    // M je dopočtená do D − 1
    expect(await nearbyVillages(w.deps, w.m)).toEqual({
      day: D,
      self: { villageId: w.m, name: 'Lhota' },
      villages: [{ villageId: w.h, name: 'Vlkov', cells: 1, firstStep: 'W' }],
    });
  });

  it('i vsi vlastního hráče, jen prstenec 1, řazeno podle políček, pak id vsi', async () => {
    const w = await marketWorld();
    const own = await addVillage(w, H_PLAYER, 'Dolní', { x: 0, y: 1 });
    const other = await addVillage(w, 'hrac-x', 'Hora', { x: -1, y: -1 });
    await addVillage(w, 'hrac-y', 'Daleká', { x: 2, y: 0 });
    const nearby = (await nearbyVillages(w.deps, w.h))!;
    // id vsí: M village-2, Dolní village-3, Hora village-4 (prstenec jde od severu, jména jinak)
    expect([w.m, own, other]).toEqual(['village-2', 'village-3', 'village-4']);
    expect(nearby.villages).toEqual([
      { villageId: w.m, name: 'Lhota', cells: 1, firstStep: 'E' },
      { villageId: own, name: 'Dolní', cells: 1, firstStep: 'N' },
      { villageId: other, name: 'Hora', cells: 1, firstStep: 'SW' },
    ]);
  });

  it('vymřelá, archivovaná a odříznutá ves v okolí není', async () => {
    const extinct = await marketWorld();
    extinct.state(extinct.m).extinctDay = D - 3;
    expect((await nearbyVillages(extinct.deps, extinct.h))!.villages).toEqual([]);

    const archived = await marketWorld();
    archived.settlements.archived.add(archived.villages.records.get(archived.m)!.settlementId);
    expect((await nearbyVillages(archived.deps, archived.h))!.villages).toEqual([]);

    const isolated = await marketWorld();
    isolate(isolated, isolated.m);
    expect((await nearbyVillages(isolated.deps, isolated.h))!.villages).toEqual([]);
  });

  it('spící nebo odříznutá ves sama nedostane nic', async () => {
    const asleep = await marketWorld();
    asleep.state(asleep.h).extinctDay = D - 1;
    expect(await nearbyVillages(asleep.deps, asleep.h)).toBeNull();
    expect(await nearbyVillages(asleep.deps, 'village-99')).toBeNull();
    expect(await refreshNearby(asleep.deps, asleep.h)).toBe(false);
    expect(await nearbyEvents(asleep, asleep.h)).toEqual([]);

    const isolated = await marketWorld();
    isolate(isolated, isolated.h);
    expect(await nearbyVillages(isolated.deps, isolated.h)).toBeNull();
    expect(await refreshNearby(isolated.deps, isolated.h)).toBe(false);
  });
});

describe('refreshNearby – událost `nearby` do schránky vsi', () => {
  it('zapíše snímek na lastDay + 1, druhý zápis téhož dne se zahodí', async () => {
    const w = await marketWorld();
    const versionBefore = w.version(w.h);
    expect(await refreshNearby(w.deps, w.h)).toBe(true);
    const nearby: VillageNearby = {
      day: D + 1,
      self: { villageId: w.h, name: 'Vlkov' },
      villages: [{ villageId: w.m, name: 'Lhota', cells: 1, firstStep: 'E' }],
    };
    const events = await nearbyEvents(w, w.h);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ villageId: w.h, day: D + 1 });
    expect(events[0]!.body).toEqual({ kind: 'nearby', nearby });
    expect(w.version(w.h)).toBe(versionBefore + 1);
    expect(await refreshNearby(w.deps, w.h)).toBe(false);
    expect(await nearbyEvents(w, w.h)).toHaveLength(1);
    expect(w.version(w.h)).toBe(versionBefore + 1);
  });

  it('prázdné okolí se zapíše také (vymřelý soused) – snímek nahradí starý', async () => {
    const w = await marketWorld();
    w.state(w.m).extinctDay = D - 3;
    expect(await refreshNearby(w.deps, w.h)).toBe(true);
    const events = await nearbyEvents(w, w.h);
    expect(events.map((e) => e.body)).toEqual([
      {
        kind: 'nearby',
        nearby: { day: D + 1, self: { villageId: w.h, name: 'Vlkov' }, villages: [] },
      },
    ]);
  });

  it('refreshNearbySafely – chyba do logu a false', async () => {
    const w = await marketWorld();
    const failure = new Error('DB spadla');
    vi.spyOn(w.villages, 'find').mockRejectedValueOnce(failure);
    const log = vi.fn();
    expect(await refreshNearbySafely(w.deps, w.h, log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(w.h), failure);
    expect(await refreshNearbySafely(w.deps, w.h, log)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('nearbyStale – technická mez obnovy', () => {
  it('bez okolí ano, lastDay − den 29 ne, 30 ano', () => {
    expect(NEARBY_REFRESH_DAYS).toBe(30);
    const s = homeVillage();
    expect(nearbyStale(s)).toBe(true);
    s.nearby = { day: D - 29, self: { villageId: 'h', name: 'Vlkov' }, villages: [] };
    expect(nearbyStale(s)).toBe(false);
    s.nearby.day = D - 30;
    expect(nearbyStale(s)).toBe(true);
  });
});

describe('okolí po dopočtu ve webu (s poštou – advanceDynasty, dynastyForVillage)', () => {
  it('dynastyForVillage zapíše okolí zobrazené vsi, podruhé už ne', async () => {
    const w = await marketWorld();
    await dynastyForVillage(w.deps, { playerId: H_PLAYER, villageId: w.h, today: D });
    expect(await nearbyEvents(w, w.h)).toEqual([expect.objectContaining({ day: D + 1 })]);
    await dynastyForVillage(w.deps, { playerId: H_PLAYER, villageId: w.h, today: D });
    expect(await nearbyEvents(w, w.h)).toHaveLength(1);
  });

  it('advanceDynasty zapíše okolí po dopočtu vsi rodu', async () => {
    const w = await marketWorld();
    await advanceDynasty(w.deps, { playerId: M_PLAYER, today: D });
    expect(w.state(w.m).lastDay).toBe(D);
    const events = await nearbyEvents(w, w.m);
    expect(events).toEqual([expect.objectContaining({ day: D + 1 })]);
    expect(events[0]!.body).toMatchObject({
      nearby: { villages: [{ villageId: w.h, name: 'Vlkov', cells: 1, firstStep: 'W' }] },
    });
  });
});
