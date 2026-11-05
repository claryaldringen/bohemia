import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  DAY,
  dwelling,
  trackedVillage,
  village,
  type KinSpec,
} from '../../domain/village/__tests__/kin-fixtures';
import type { VillageState } from '../../domain/village';
import { settleAppointee } from '../../domain/village';
import { appointLords } from '../appoint-lord';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Dosazení vojvody use-case (seniorate.md – Ves bez muže rodu – dosazení vojvody).

const PLAYER = 'hrac-1';

/** Ves rodu: vojvoda 10, nástupce 11 a (volitelně) další muži. */
function lordVillage(extra: KinSpec[]): VillageState {
  const state = trackedVillage([
    { id: 10, age: 50, sex: 'male' },
    { id: 11, age: 28, sex: 'male', father: 10 },
    ...extra,
  ]);
  state.storesKg = 500;
  return state;
}

function waitingVillage(): VillageState {
  return village([], [dwelling(1)], {
    manorId: 1,
    nextId: 500,
    dynasty: { lordId: null, lords: [{ id: 1, fromDay: 0, toDay: DAY - 3 }], endedDay: DAY - 3 },
    awaitingLord: { sinceDay: DAY - 3 },
  });
}

async function world(source: VillageState): Promise<{
  deps: { settlements: InMemorySettlements; villages: InMemoryVillages; houses: InMemoryHouses };
  houses: InMemoryHouses;
  villages: InMemoryVillages;
  waitingId: string;
  sourceId: string;
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
  const far = (await settlements.create({
    ownerId: PLAYER,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 3, y: 1 },
  }))!;
  const waiting = await villages.add(seat.id, 'Lhota', waitingVillage());
  const from = await villages.add(far.id, 'Dub', source);
  return {
    deps: { settlements, villages, houses },
    houses,
    villages,
    waitingId: waiting.id,
    sourceId: from.id,
  };
}

const ELDER: KinSpec = { id: 12, age: 20, sex: 'male', father: 10, spouse: 20 };
const WIFE: KinSpec = { id: 20, age: 18, sex: 'female', spouse: 12 };

describe('appointLords', () => {
  it('pošle nejstaršího vhodného muže; příjezd za 2 × vzdálenost dní, kronika obou vsí', async () => {
    const w = await world(lordVillage([ELDER, WIFE]));
    const sent = await appointLords(w.deps, { playerId: PLAYER, today: DAY });
    expect(sent).toBe(1);
    const target = (await w.villages.find(w.waitingId))!;
    // sídlo [0,0] a [3,1] – tři mapy daleko, 2 dny na mapu
    expect(target.state.awaitingLord?.appointee).toEqual({
      fromVillageId: w.sourceId,
      personId: 12,
      arrivesDay: DAY + 6,
    });
    const events = await w.villages.inbox.pending(w.waitingId, 0, DAY + 100);
    expect(events).toHaveLength(1);
    expect(events[0]!.day).toBe(DAY + 6);
    expect(events[0]!.body.kind).toBe('lord-arrives');
    const source = (await w.villages.find(w.sourceId))!;
    expect(source.state.people.map((p) => p.id)).toEqual([10, 11]);
    expect(source.state.chronicle.at(-1)).toMatchObject({
      kind: 'lord-sent',
      villageName: 'Lhota',
    });
    // po příjezdu je v cílové vsi vojvodou a kronika to řekne
    const body = events[0]!.body;
    if (body.kind !== 'lord-arrives') throw new Error('čekal se příjezd');
    const state = structuredClone(target.state);
    const chronicle = settleAppointee(state, DAY + 6, body.party);
    expect(chronicle).toEqual([{ day: DAY + 6, kind: 'lord' }]);
    expect(state.dynasty?.lordId).not.toBeNull();
  });

  it('opakované volání nic nezdvojí', async () => {
    const w = await world(lordVillage([ELDER, WIFE]));
    expect(await appointLords(w.deps, { playerId: PLAYER, today: DAY })).toBe(1);
    expect(await appointLords(w.deps, { playerId: PLAYER, today: DAY })).toBe(0);
    expect(await appointLords(w.deps, { playerId: PLAYER, today: DAY + 1 })).toBe(0);
    expect(await w.villages.inbox.pending(w.waitingId, 0, DAY + 100)).toHaveLength(1);
    const source = (await w.villages.find(w.sourceId))!;
    expect(source.state.chronicle.filter((e) => e.kind === 'lord-sent')).toHaveLength(1);
  });

  it('přerušení po zápisu čekání dokončí další volání (muž odejde, družina se neposílá dvakrát)', async () => {
    const w = await world(lordVillage([ELDER, WIFE]));
    // simulovaný pád: cílová ves už vyslance má, ale muž dosud nevyrazil
    const target = (await w.villages.find(w.waitingId))!;
    await w.villages.save(
      w.waitingId,
      {
        ...target.state,
        awaitingLord: {
          sinceDay: DAY - 3,
          appointee: { fromVillageId: w.sourceId, personId: 12, arrivesDay: DAY + 6 },
        },
      },
      target.version,
    );
    await appointLords(w.deps, { playerId: PLAYER, today: DAY });
    await appointLords(w.deps, { playerId: PLAYER, today: DAY });
    expect(await w.villages.inbox.pending(w.waitingId, 0, DAY + 100)).toHaveLength(1);
    const source = (await w.villages.find(w.sourceId))!;
    expect(source.state.people.some((p) => p.id === 12)).toBe(false);
  });

  it('nevybere vojvodu, nástupce ani hráčova muže; bez kandidáta ves čeká a zkusí se znovu', async () => {
    const w = await world(lordVillage([]));
    expect(await appointLords(w.deps, { playerId: PLAYER, today: DAY })).toBe(0);
    expect((await w.villages.find(w.waitingId))!.state.awaitingLord).toEqual({ sinceDay: DAY - 3 });
    expect(await w.villages.inbox.pending(w.waitingId, 0, DAY + 100)).toHaveLength(0);
    // hráčův muž (12) je v ochraně
    const w2 = await world(lordVillage([ELDER, WIFE]));
    await w2.houses.setLord(w2.houses.houses[0]!.id, { villageId: w2.sourceId, personId: 12 });
    expect(await appointLords(w2.deps, { playerId: PLAYER, today: DAY })).toBe(0);
    // později někdo dospěje / hráčův muž se změní – ves se při dalším dopočtu obsloužila
    await w2.houses.setLord(w2.houses.houses[0]!.id, { villageId: w2.sourceId, personId: 11 });
    expect(await appointLords(w2.deps, { playerId: PLAYER, today: DAY + 1 })).toBe(1);
  });

  it('ves, která nečeká, se nedotkne', async () => {
    const w = await world(lordVillage([ELDER, WIFE]));
    const target = (await w.villages.find(w.waitingId))!;
    const rest: VillageState = { ...target.state };
    delete rest.awaitingLord;
    await w.villages.save(
      w.waitingId,
      { ...rest, dynasty: { lordId: 1, lords: [{ id: 1, fromDay: 0 }] } },
      target.version,
    );
    expect(await appointLords(w.deps, { playerId: PLAYER, today: DAY })).toBe(0);
  });
});
