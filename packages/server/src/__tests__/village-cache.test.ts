import {
  CURRENT_LAYER_VERSIONS,
  dayIndexOf,
  dynastyStatus,
  findPlayerVillage,
  foundVillageForSettlement,
  placeField,
  type LandscapeSource,
  type Position,
} from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { InMemorySettlements } from '../../../game/src/application/__tests__/in-memory-settlements';
import { InMemoryVillages } from '../../../game/src/application/__tests__/in-memory-villages';
import {
  block,
  makeLandscape,
} from '../../../game/src/domain/village/__tests__/placement-fixtures';
import {
  cachedVillages,
  VillageMemory,
  withVillageCache,
  withVillageMemory,
} from '../village-cache';

const TODAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: () => 'meadow' });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });

/** Hráč se dvěma vsemi – každá na vlastní mapě (jedna ves, jedna mapa). */
async function world(): Promise<{
  settlements: InMemorySettlements;
  store: InMemoryVillages;
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const store = new InMemoryVillages();
  const seat = await settlements.seatAtOrigin({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const r = await foundVillageForSettlement(
    { villages: store, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: seat.id,
      landscape,
      today: TODAY - 20,
      name: 'Libice',
      dwelling: at(-50, -50),
      fieldCells: block(6, 6, 4, 4),
    },
  );
  if (!r.ok) throw new Error(r.reason);
  // druhá ves na mapě vedle (stačí kopie stavu) – stav rodu načítá i tu druhou
  const map = await settlements.create({
    ownerId: PLAYER,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  });
  await store.add(map!.id, 'Druhá', structuredClone(r.village.state));
  store.finds = 0;
  return { settlements, store, villageId: r.village.id };
}

/** Akce jako na serveru: ověření vsi, dopočet všech vsí, use-case, pohled (dopočet znovu). */
async function action(
  settlements: InMemorySettlements,
  villages: ReturnType<typeof cachedVillages>,
  villageId: string,
): Promise<unknown> {
  const deps = { settlements, villages, landscapes };
  await findPlayerVillage(deps, { playerId: PLAYER, villageId });
  await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
  const placed = await placeField(
    { villages },
    { villageId, today: TODAY, landscape, cells: block(-20, -20, 3, 3) },
  );
  const after = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
  return { placed, villages: after.villages };
}

describe('paměť vsí na jeden požadavek (village-cache.ts)', () => {
  it('akce načte každou ves jednou a výsledek je stejný jako bez paměti', async () => {
    const plain = await world();
    const before = await action(plain.settlements, cachedVillages(plain.store), plain.villageId);
    // bez rozsahu se nic nepamatuje – ověření vsi, 2× dopočet obou vsí, use-case
    expect(plain.store.finds).toBeGreaterThanOrEqual(6);

    const cached = await world();
    const after = await withVillageCache(() =>
      action(cached.settlements, cachedVillages(cached.store), cached.villageId),
    );
    // dvě vsi, každá načtená jednou (dál z paměti)
    expect(cached.store.finds).toBe(2);
    expect(after).toEqual(before);
    expect(cached.store.records).toEqual(plain.store.records);
  });

  it('ves změněná mimo paměť (jiná verze) i neúspěšné uložení se načtou znovu', async () => {
    const { store, villageId } = await world();
    await withVillageCache(async () => {
      const villages = cachedVillages(store);
      const first = await villages.find(villageId);
      expect(await villages.find(villageId)).toBe(first);
      expect(store.finds).toBe(1);
      store.edit(villageId, (s) => {
        s.lastDay -= 1;
      });
      const fresh = await villages.find(villageId);
      expect(fresh).not.toBe(first);
      expect(fresh!.state.lastDay).toBe(first!.state.lastDay - 1);
      expect(store.finds).toBe(2);
      // souběžný zápis jiného požadavku – uložení selže a paměť vsi se zahodí
      store.beforeSave = (id) => store.edit(id, () => undefined);
      expect(await villages.save(villageId, fresh!.state, fresh!.version)).toBeNull();
      store.beforeSave = null;
      expect((await villages.find(villageId))!.version).toBe(store.records.get(villageId)!.version);
      expect(store.finds).toBe(3);
      // přejmenování verzi nemění – paměť ho pozná podle jména
      await villages.rename(villageId, 'Nová');
      expect((await villages.find(villageId))!.name).toBe('Nová');
    });
  });

  it('paměť přes požadavky (VillageMemory): týž záznam, dokud sedí otisk, nejvýš `capacity` vsí', async () => {
    const { store, villageId } = await world();
    const villages = cachedVillages(store);
    const memory = new VillageMemory(1);
    const first = await withVillageMemory(memory, () => villages.find(villageId));
    // další požadavek – z paměti (jen otisk)
    expect(await withVillageMemory(memory, () => villages.find(villageId))).toBe(first);
    expect(store.finds).toBe(1);
    store.edit(villageId, (s) => {
      s.lastDay -= 1;
    });
    const fresh = await withVillageMemory(memory, () => villages.find(villageId));
    expect(fresh!.state.lastDay).toBe(first!.state.lastDay - 1);
    expect(store.finds).toBe(2);
    // druhá ves vytlačí první (kapacita 1)
    const other = [...store.records.keys()].find((id) => id !== villageId)!;
    await withVillageMemory(memory, () => villages.find(other));
    expect([...memory.keys()]).toEqual([other]);
    await withVillageMemory(memory, () => villages.find(villageId));
    expect(store.finds).toBe(4);
  });

  it('zastávky kupců jdou přímo z úložiště; úložiště bez nich je nemá ani s pamětí', async () => {
    const { store } = await world();
    expect(cachedVillages(store).merchantStopsOf).toBeUndefined();
    const stops = [{ key: '0,0,E', seed: 7, index: 0, length: 1 }];
    const asked: string[] = [];
    store.merchantStopsOf = async (settlementId) => {
      await Promise.resolve();
      asked.push(settlementId);
      return stops;
    };
    const villages = cachedVillages(store);
    await withVillageCache(async () => {
      expect(await villages.merchantStopsOf!('mapa')).toEqual(stops);
    });
    expect(asked).toEqual(['mapa']);
  });

  it('s pamětí dostane ves zastávky kupců při načtení jen jednou', async () => {
    const { store, settlements, villageId } = await world();
    const asked: string[] = [];
    store.merchantStopsOf = async (settlementId) => {
      await Promise.resolve();
      asked.push(settlementId);
      return [];
    };
    const villages = cachedVillages(store);
    await withVillageCache(() => action(settlements, villages, villageId));
    await withVillageCache(() => action(settlements, villages, villageId));
    for (const record of store.records.values()) expect(record.state.merchantStops).toEqual([]);
    // každá ves hráče se ptala jen při svém prvním načtení
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked).toHaveLength(store.records.size);
  });

  it('mimo rozsah se nic nepamatuje', async () => {
    const { store, villageId } = await world();
    const villages = cachedVillages(store);
    await villages.find(villageId);
    await villages.find(villageId);
    expect(store.finds).toBe(2);
  });
});
