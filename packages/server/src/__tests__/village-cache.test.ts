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
import { cachedVillages, withVillageCache } from '../village-cache';

const TODAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: () => 'meadow' });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });

/** Hráč se sídlem a dvěma vsemi na téže mapě (druhá má sousedku – `neighboursOf`). */
async function world(): Promise<{
  settlements: InMemorySettlements;
  store: InMemoryVillages;
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const store = new InMemoryVillages();
  const seat = await settlements.createSeat({
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
  // druhá ves téže mapy (stačí kopie stavu) – dopočet každé vsi načítá i tu druhou
  await store.add(seat.id, 'Druhá', structuredClone(r.village.state));
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
    // bez rozsahu se nic nepamatuje – ověření vsi, 2× dopočet, use-case, sousedé
    expect(plain.store.finds).toBeGreaterThanOrEqual(6);

    const cached = await world();
    const after = await withVillageCache(() =>
      action(cached.settlements, cachedVillages(cached.store), cached.villageId),
    );
    // dvě vsi, každá načtená jednou (sousedé z paměti)
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

  it('mimo rozsah se nic nepamatuje', async () => {
    const { store, villageId } = await world();
    const villages = cachedVillages(store);
    await villages.find(villageId);
    await villages.find(villageId);
    expect(store.finds).toBe(2);
  });
});
