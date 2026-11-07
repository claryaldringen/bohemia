import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { currentLord, isStewardOn, newSteward, type VillageState } from '../../domain/village';
import { DAY, trackedVillage, type KinSpec } from '../../domain/village/__tests__/kin-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { dynastyForVillage } from '../dynasty-for-village';
import { ensurePlayerLord, followPlayerLord, playerLordOf } from '../player-lord';
import type { LandscapeSource } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Hráčův muž a vlastní ves (seniorate.md – Převod rozehraných her): jednou a idempotentně.

const PLAYER = 'hrac-1';
const TODAY = DAY + 5;
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const FAMILY: KinSpec[] = [
  { id: 10, age: 40, sex: 'male', spouse: 11 },
  { id: 11, age: 36, sex: 'female', spouse: 10 },
];

/** Ves rodu s vojvodou `lordId`, založená v den `founded`, se správcem zapnutým / vypnutým. */
function state(founded: number, on: boolean, lordId = 10): VillageState {
  const s = trackedVillage(FAMILY, undefined, { steward: newSteward(DAY, on) });
  s.foundedDay = founded;
  s.lastDay = TODAY;
  s.dynasty = { lordId, lords: [{ id: lordId, fromDay: DAY }] };
  return s;
}

async function world(specs: { name: string; founded: number; on: boolean }[]): Promise<{
  deps: { houses: InMemoryHouses; settlements: InMemorySettlements; villages: InMemoryVillages };
  ids: string[];
}> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  const seat = await settlements.seatAtOrigin({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const ids: string[] = [];
  for (const [i, spec] of specs.entries()) {
    const settlement =
      i === 0
        ? seat
        : (await settlements.create({
            ownerId: PLAYER,
            landscapeSeed: 11 + i,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: { x: i, y: 0 },
          }))!;
    ids.push((await villages.add(settlement.id, spec.name, state(spec.founded, spec.on))).id);
  }
  return { deps: { houses, settlements, villages }, ids };
}

const stewardOf = (w: Awaited<ReturnType<typeof world>>, i: number): boolean =>
  isStewardOn(w.deps.villages.records.get(w.ids[i]!)!.state);

describe('ensurePlayerLord – převod rozehrané hry', () => {
  it('první ves se správcem vypnutým: její vojvoda, ostatním vsím zapne správce', async () => {
    const w = await world([
      { name: 'A', founded: 100, on: false },
      { name: 'B', founded: 50, on: false },
      { name: 'C', founded: 80, on: true },
    ]);
    const lord = await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    expect(lord).toEqual({ villageId: w.ids[0], personId: 10 });
    expect(await playerLordOf(w.deps, PLAYER)).toEqual(lord);
    expect([stewardOf(w, 0), stewardOf(w, 1), stewardOf(w, 2)]).toEqual([false, true, true]);
  });

  it('opakování nic nemění – ani když hráč mezitím správce vlastní vsi zapnul', async () => {
    const w = await world([
      { name: 'A', founded: 100, on: false },
      { name: 'B', founded: 50, on: false },
    ]);
    const first = await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    w.deps.villages.edit(w.ids[1]!, (s) => (s.steward = newSteward(DAY, false)));
    const again = await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    expect(again).toEqual(first);
    expect(stewardOf(w, 1)).toBe(false);
  });

  it('všechny správce zapnutí: vojvoda nejstarší vsi', async () => {
    const w = await world([
      { name: 'A', founded: 100, on: true },
      { name: 'B', founded: 50, on: true },
      { name: 'C', founded: 80, on: true },
    ]);
    const lord = await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    expect(lord?.villageId).toBe(w.ids[1]);
    expect(currentLord(w.deps.villages.records.get(w.ids[1]!)!.state)?.id).toBe(lord?.personId);
    expect([stewardOf(w, 0), stewardOf(w, 1), stewardOf(w, 2)]).toEqual([true, true, true]);
  });

  it('hráč bez rodu: nic', async () => {
    const w = await world([{ name: 'A', founded: 1, on: false }]);
    expect(await ensurePlayerLord(w.deps, { playerId: 'jiny', today: TODAY })).toBeNull();
  });

  it('dynastyForVillage převod provede a vrátí hráčova muže v pohledu', async () => {
    const w = await world([
      { name: 'A', founded: 100, on: false },
      { name: 'B', founded: 50, on: false },
    ]);
    const view = await dynastyForVillage(
      { ...w.deps, worldSeed: 4242, landscapes },
      { playerId: PLAYER, today: TODAY, villageId: w.ids[0]! },
    );
    expect(view.playerLord).toEqual({ villageId: w.ids[0], personId: 10 });
    expect(stewardOf(w, 1)).toBe(true);
  });
});

describe('followPlayerLord', () => {
  it('hráčův muž odešel: ves se přepíše, osoba zůstává', async () => {
    const w = await world([{ name: 'A', founded: 100, on: false }]);
    await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    await followPlayerLord(w.deps, {
      playerId: PLAYER,
      fromVillageId: w.ids[0]!,
      toVillageId: 'nova',
      personIds: [10, 12],
    });
    expect(await playerLordOf(w.deps, PLAYER)).toEqual({ villageId: 'nova', personId: 10 });
  });

  it('odešel někdo jiný, nebo z jiné vsi: beze změny', async () => {
    const w = await world([{ name: 'A', founded: 100, on: false }]);
    const lord = await ensurePlayerLord(w.deps, { playerId: PLAYER, today: TODAY });
    await followPlayerLord(w.deps, {
      playerId: PLAYER,
      fromVillageId: w.ids[0]!,
      toVillageId: 'nova',
      personIds: [12],
    });
    await followPlayerLord(w.deps, {
      playerId: PLAYER,
      fromVillageId: 'jina',
      toVillageId: 'nova',
      personIds: [10],
    });
    expect(await playerLordOf(w.deps, PLAYER)).toEqual(lord);
  });
});
