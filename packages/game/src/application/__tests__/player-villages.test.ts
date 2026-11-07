import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { Position } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { ALREADY_FOUNDED, foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { findPlayerVillage, firstPlayerVillage } from '../player-villages';
import { dynastyStatus, restartGame } from '../restart-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Víc vsí jednoho hráče (migration.md – fáze 2): vsi podle id, každá na vlastní mapě (jedna ves,
// jedna mapa – Martin 1. 11. 2026).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const PLAYER = 'hrac-1';
/** Krajina 48 × 48 políček (720 m). */
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });
const seeds = (): SeedSource => {
  let next = 4242;
  return { nextSeed: () => next++ };
};

async function playerWithVillage(): Promise<{
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
  settlementId: string;
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.seatAtOrigin({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: seeds() },
    { settlementId: seat.id, landscape, today: TODAY, name: 'Libice', dwelling: at(-200, -200) },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return { settlements, villages, settlementId: seat.id, villageId: founded.village.id };
}

/** Ves na nové mapě (sídle) hráče na políčku `x` mřížky. */
async function villageOnNewMap(
  settlements: InMemorySettlements,
  villages: InMemoryVillages,
  x: number,
  name: string,
): Promise<{ settlementId: string; villageId: string }> {
  const map = await settlements.create({
    ownerId: PLAYER,
    landscapeSeed: 90 + x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: seeds() },
    { settlementId: map!.id, landscape, today: TODAY, name, dwelling: at(0, 0) },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return { settlementId: map!.id, villageId: founded.village.id };
}

const NOW = new Date('2026-11-05T12:00:00Z');

describe('findPlayerVillage', () => {
  it('najde ves hráče s jejím sídlem – cizí, neznámou a archivovanou ne', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage();
    const found = await findPlayerVillage(
      { settlements, villages },
      { playerId: PLAYER, villageId },
    );
    expect(found?.settlement.id).toBe(settlementId);
    expect(found?.village.id).toBe(villageId);
    expect(
      await findPlayerVillage({ settlements, villages }, { playerId: 'cizi', villageId }),
    ).toBeNull();
    expect(
      await findPlayerVillage({ settlements, villages }, { playerId: PLAYER, villageId: 'nic' }),
    ).toBeNull();
    await settlements.archive(settlementId);
    expect(
      await findPlayerVillage({ settlements, villages }, { playerId: PLAYER, villageId }),
    ).toBeNull();
  });
});

describe('jedna ves, jedna mapa', () => {
  it('sídlo s vsí druhou ves nezaloží – ani daleko od první', async () => {
    const { villages, settlementId } = await playerWithVillage();
    const second = await foundVillageForSettlement(
      { villages, seeds: seeds() },
      { settlementId, landscape, today: TODAY, name: 'Budeč', dwelling: at(200, 200) },
    );
    expect(second).toEqual({ ok: false, reason: ALREADY_FOUNDED });
    expect(await villages.listBySettlement(settlementId)).toHaveLength(1);
  });
});

describe('víc vsí a konec hry', () => {
  it('vsi se načítají a dopočítávají každá zvlášť podle id', async () => {
    const { settlements, villages, villageId } = await playerWithVillage();
    const other = await villageOnNewMap(settlements, villages, 1, 'Budeč');
    const loaded = await loadVillage({ villages }, { villageId, today: TODAY + 30, landscape });
    expect(loaded?.name).toBe('Libice');
    expect(loaded?.state.lastDay).toBe(TODAY + 30);
    expect((await villages.find(other.villageId))!.state.lastDay).toBe(TODAY);
  });

  it('dynastyStatus projde všechny vsi všech sídel – konec hry, až vymřou všechny', async () => {
    const { settlements, villages, villageId } = await playerWithVillage();
    const second = await villageOnNewMap(settlements, villages, 1, 'Budeč');
    const third = await villageOnNewMap(settlements, villages, 2, 'Levý Hradec');
    const deps = { settlements, villages, landscapes };
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 1 });
    expect(status.villages.map((v) => v.name)).toEqual(['Libice', 'Budeč', 'Levý Hradec']);
    expect(status.villages.every((v) => v.state.lastDay === TODAY + 1)).toBe(true);
    expect(status.gameOver).toBe(false);

    for (const id of [villageId, second.villageId]) villages.edit(id, (s) => (s.people = []));
    expect((await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 2 })).gameOver).toBe(
      false,
    );
    villages.edit(third.villageId, (s) => (s.people = []));
    expect((await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 3 })).gameOver).toBe(true);
  });

  it('restartGame archivuje všechna sídla hráče a založí nové sídelní', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage();
    const map = await settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 99,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 0, y: 1 },
    });
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY + 1, abandon: true },
    );
    expect(result.ok).toBe(true);
    expect(settlements.archived).toEqual(new Set([settlementId, map!.id]));
    const active = await settlements.listActive(PLAYER);
    expect(active).toHaveLength(1);
    expect(active[0]!.isSeat).toBe(true);
    expect(await firstPlayerVillage({ settlements, villages }, PLAYER)).toBeNull();
    expect(villages.records.has(villageId)).toBe(true);
  });
});

describe('firstPlayerVillage', () => {
  it('první ves sídelního sídla; bez vsí null', async () => {
    const settlements = new InMemorySettlements();
    const villages = new InMemoryVillages();
    expect(await firstPlayerVillage({ settlements, villages }, PLAYER)).toBeNull();
    const { settlements: s2, villages: v2, villageId } = await playerWithVillage();
    expect((await firstPlayerVillage({ settlements: s2, villages: v2 }, PLAYER))?.village.id).toBe(
      villageId,
    );
  });
});
