import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { foundVillage } from '../../domain/village';
import type { SeenCell } from '../../domain/war';
import { knownMapFor, knownVillagesOf, type KnownMapDeps } from '../known-map';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryKnowledge } from './in-memory-knowledge';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Známá mapa z domova (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 12a).

const NOW = new Date('2027-01-01T00:00:00Z');
const seenOf = (villageId: string, x: number): SeenCell => ({
  villageId,
  trail: [[x, 0]],
  parts: [],
});

async function setup(): Promise<{
  deps: KnownMapDeps & { knowledge: InMemoryKnowledge };
  mine: string;
  theirs: string;
  theirVillage: string;
  theirSettlement: string;
}> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const knowledge = new InMemoryKnowledge();
  const villages = new InMemoryVillages();
  const a = await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  const b = await houses.create({ playerId: 'pb', kind: 'player', createdAt: NOW });
  await settlements.createSeat({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  });
  const seatB = await settlements.createSeat({
    ownerId: 'pb',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  });
  // ves a sídlo mají každé své id – znalost drží id vsi (CampaignMap.villageIds)
  const village = await villages.add(
    seatB?.id ?? '',
    'Ves B',
    foundVillage({ seed: 2, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  return {
    deps: { houses, settlements, knowledge, villages },
    mine: a.id,
    theirs: b.id,
    theirVillage: village.id,
    theirSettlement: seatB?.id ?? '',
  };
}

describe('knownMapFor', () => {
  it('neznámá mapa → null', async () => {
    const { deps } = await setup();
    expect(await knownMapFor(deps, { playerId: 'pa', cell: { x: 1, y: 0 } })).toBeNull();
  });

  it('známá mapa → znalost rodu', async () => {
    const { deps, mine } = await setup();
    await deps.knowledge.merge(mine, { x: 1, y: 0 }, seenOf('v-b', 10));
    const known = await knownMapFor(deps, { playerId: 'pa', cell: { x: 1, y: 0 } });
    expect(known?.seen.villageId).toBe('v-b');
    expect(known?.seen.trail).toEqual([[10, 0]]);
  });

  it('hráč nedostane znalost cizího rodu ani bez rodu', async () => {
    const { deps, theirs } = await setup();
    await deps.knowledge.merge(theirs, { x: 5, y: 5 }, seenOf('v-x', 1));
    expect(await knownMapFor(deps, { playerId: 'pa', cell: { x: 5, y: 5 } })).toBeNull();
    expect(await knownMapFor(deps, { playerId: 'nikdo', cell: { x: 5, y: 5 } })).toBeNull();
  });
});

describe('knownVillagesOf', () => {
  it('ves viděná a stále stejného držitele → houseId toho rodu; prázdné políčko null', async () => {
    const { deps, mine, theirs, theirVillage } = await setup();
    await deps.knowledge.merge(mine, { x: 1, y: 0 }, seenOf(theirVillage, 10));
    await deps.knowledge.merge(mine, { x: 4, y: 4 }, seenOf('v-x', 20));
    const list = await knownVillagesOf(deps, { playerId: 'pa' });
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ cell: { x: 1, y: 0 }, houseId: theirs });
    expect(list).toContainEqual({ cell: { x: 4, y: 4 }, houseId: null });
  });

  it('id sídla ve znalosti místo id vsi → houseId null', async () => {
    const { deps, mine, theirSettlement, theirVillage } = await setup();
    expect(theirSettlement).not.toBe(theirVillage);
    await deps.knowledge.merge(mine, { x: 1, y: 0 }, seenOf(theirSettlement, 10));
    const list = await knownVillagesOf(deps, { playerId: 'pa' });
    expect(list).toEqual([{ cell: { x: 1, y: 0 }, houseId: null }]);
  });

  it('změněný držitel políčka (rod viděl jinou ves) → houseId null', async () => {
    const { deps, mine } = await setup();
    await deps.knowledge.merge(mine, { x: 1, y: 0 }, seenOf('stara-ves', 10));
    const list = await knownVillagesOf(deps, { playerId: 'pa' });
    expect(list).toEqual([{ cell: { x: 1, y: 0 }, houseId: null }]);
  });

  it('stopa bez vsi vedle cizí vsi → houseId null (políčko zůstává ve znalosti)', async () => {
    const { deps, mine } = await setup();
    await deps.knowledge.merge(mine, { x: 1, y: 0 }, { trail: [[10, 0]], parts: [] });
    const list = await knownVillagesOf(deps, { playerId: 'pa' });
    expect(list).toEqual([{ cell: { x: 1, y: 0 }, houseId: null }]);
  });

  it('cizí znalost se nevrací; hráč bez rodu dostane prázdný seznam', async () => {
    const { deps, theirs } = await setup();
    await deps.knowledge.merge(theirs, { x: 0, y: 0 }, seenOf('v-a', 1));
    expect(await knownVillagesOf(deps, { playerId: 'pa' })).toEqual([]);
    expect(await knownVillagesOf(deps, { playerId: 'nikdo' })).toEqual([]);
  });
});
