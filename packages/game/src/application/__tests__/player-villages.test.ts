import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, tileCenterWorld, type Landscape } from '../../domain/landscape';
import {
  NEW_VILLAGE_MIN_DISTANCE_M,
  distanceToVillages,
  villagePoints,
  type Position,
} from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  foundAnotherVillage,
  foundVillageForSettlement,
  TOO_CLOSE_TO_VILLAGE,
} from '../found-village';
import { loadVillage } from '../load-village';
import {
  DEV_VILLAGE_ONLY,
  NOT_PLAYER_VILLAGE,
  findPlayerVillage,
  firstPlayerVillage,
  foundDevVillage,
} from '../player-villages';
import { dynastyStatus, restartGame } from '../restart-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Víc vsí jednoho hráče (migration.md – fáze 2): vsi podle id, víc vsí na téže mapě i víc map.

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const PLAYER = 'hrac-1';
/** Krajina 48 × 48 políček (720 m) – na jedné mapě se vejdou dvě vsi 300 m od sebe. */
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
  const seat = await settlements.createSeat({
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

const points = (
  l: Landscape,
  state: Parameters<typeof villagePoints>[0],
): ReturnType<typeof villagePoints> => villagePoints(state, (x, y) => tileCenterWorld(l, x, y));

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

describe('foundAnotherVillage', () => {
  it('další ves téhož sídla musí stát aspoň 300 m od staveb první', async () => {
    const { villages, settlementId } = await playerWithVillage();
    const deps = { villages, seeds: seeds() };
    const base = { settlementId, landscape, today: TODAY, name: 'Budeč' };
    const near = await foundAnotherVillage(deps, { ...base, dwelling: at(-100, -100) });
    expect(near).toEqual({ ok: false, reason: TOO_CLOSE_TO_VILLAGE });
    const far = await foundAnotherVillage(deps, { ...base, dwelling: at(200, 200) });
    expect(far.ok).toBe(true);
    if (!far.ok) return;
    expect(far.village).toMatchObject({ settlementId, name: 'Budeč' });
    expect((await villages.listBySettlement(settlementId)).map((v) => v.name)).toEqual([
      'Libice',
      'Budeč',
    ]);
    // první ves sídla už zakládat nejde
    const again = await foundVillageForSettlement(deps, { ...base, dwelling: at(0, 300) });
    expect(again.ok).toBe(false);
  });
});

describe('foundDevVillage', () => {
  it('jen ve vývojovém režimu a jen ve vlastní vsi', async () => {
    const { settlements, villages, villageId } = await playerWithVillage();
    const deps = { settlements, villages, seeds: seeds(), landscapes };
    const input = { playerId: PLAYER, villageId, today: TODAY };
    expect(await foundDevVillage(deps, { ...input, devMode: false })).toEqual({
      ok: false,
      reason: DEV_VILLAGE_ONLY,
    });
    expect(await foundDevVillage(deps, { ...input, devMode: true, playerId: 'cizi' })).toEqual({
      ok: false,
      reason: NOT_PLAYER_VILLAGE,
    });
  });

  it('založí druhou ves na téže mapě daleko od první, bez lidí ze staré vsi', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage();
    const deps = { settlements, villages, seeds: seeds(), landscapes };
    const before = (await villages.find(villageId))!.state;
    const result = await foundDevVillage(deps, {
      playerId: PLAYER,
      villageId,
      today: TODAY,
      devMode: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.settlementId).toBe(settlementId);
    expect(result.village.id).not.toBe(villageId);
    expect(result.village.name).not.toBe('');
    expect(result.village.state.people).toHaveLength(4);
    const site = result.village.state.constructions[0]!.position!;
    expect(distanceToVillages(site, points(landscape, before))).toBeGreaterThanOrEqual(
      NEW_VILLAGE_MIN_DISTANCE_M,
    );
    // stará ves se nezměnila
    expect((await villages.find(villageId))!.state).toEqual(before);
  });
});

describe('víc vsí a konec hry', () => {
  it('vsi se načítají a dopočítávají každá zvlášť podle id', async () => {
    const { villages, settlementId, villageId } = await playerWithVillage();
    const other = await foundAnotherVillage(
      { villages, seeds: seeds() },
      { settlementId, landscape, today: TODAY, name: 'Budeč', dwelling: at(200, 200) },
    );
    if (!other.ok) throw new Error(other.reason);
    const loaded = await loadVillage({ villages }, { villageId, today: TODAY + 30, landscape });
    expect(loaded?.name).toBe('Libice');
    expect(loaded?.state.lastDay).toBe(TODAY + 30);
    expect((await villages.find(other.village.id))!.state.lastDay).toBe(TODAY);
  });

  it('dynastyStatus projde všechny vsi všech sídel – konec hry, až vymřou všechny', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage();
    const second = await foundAnotherVillage(
      { villages, seeds: seeds() },
      { settlementId, landscape, today: TODAY, name: 'Budeč', dwelling: at(200, 200) },
    );
    if (!second.ok) throw new Error(second.reason);
    const map = await settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 99,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    const third = await foundVillageForSettlement(
      { villages, seeds: seeds() },
      { settlementId: map!.id, landscape, today: TODAY, name: 'Levý Hradec', dwelling: at(0, 0) },
    );
    if (!third.ok) throw new Error(third.reason);
    const deps = { settlements, villages, landscapes };
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 1 });
    expect(status.villages.map((v) => v.name)).toEqual(['Libice', 'Budeč', 'Levý Hradec']);
    expect(status.villages.every((v) => v.state.lastDay === TODAY + 1)).toBe(true);
    expect(status.gameOver).toBe(false);

    for (const id of [villageId, second.village.id]) villages.edit(id, (s) => (s.people = []));
    expect((await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 2 })).gameOver).toBe(
      false,
    );
    villages.edit(third.village.id, (s) => (s.people = []));
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
      { settlements, villages, landscapes, seeds: seeds() },
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
