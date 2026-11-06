import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { ENNOBLE_REASONS } from '../../domain/vassalage';
import { applyInboxDay, type VillageState } from '../../domain/village';
import {
  DAY,
  dwelling,
  kin,
  trackedVillage,
  village,
  type KinSpec,
} from '../../domain/village/__tests__/kin-fixtures';
import { ennobleVillager, NOT_NPC_VASSAL, onNpcHouseEnded, setNpcTerms } from '../ennoble';
import { dismissSteward } from '../stewardships';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Povýšení vesničana use-case (vassalage.md – Povýšení vesničana).

const PLAYER = 'hrac-1';
const FARMER: KinSpec[] = [
  { id: 1, age: 30, sex: 'male', spouse: 2 },
  { id: 2, age: 28, sex: 'female', spouse: 1 },
  { id: 3, age: 9, sex: 'male', father: 1, mother: 2 },
];

function sourceVillage(): VillageState {
  const state = trackedVillage([{ id: 10, age: 50, sex: 'male' }, ...FARMER]);
  state.storesKg = 800;
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

async function world() {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const vassalages = new InMemoryVassalages();
  const stewardships = new InMemoryStewardships();
  const house = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  const seat = await settlements.seatAtOrigin({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const far = (await settlements.create({
    ownerId: PLAYER,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 2, y: 0 },
  }))!;
  const from = await villages.add(seat.id, 'Dub', sourceVillage());
  const target = await villages.add(far.id, 'Lhota', waitingVillage());
  const deps = { houses, settlements, villages, vassalages, stewardships };
  const input = {
    playerId: PLAYER,
    fromVillageId: from.id,
    personId: 1,
    targetVillageId: target.id,
    today: DAY,
    at: new Date(0),
  };
  return { deps, houses, villages, vassalages, stewardships, house, from, target, input };
}

describe('ennobleVillager', () => {
  it('založí NPC rod, holou přísahu a správu; rodina přijede za 2 dny na políčko', async () => {
    const w = await world();
    const res = await ennobleVillager(w.deps, w.input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const npc = (await w.houses.byId(res.houseId))!;
    expect(npc).toMatchObject({ kind: 'npc', playerId: null });
    const [vassalage] = await w.vassalages.activeOf(npc.id);
    expect(vassalage).toMatchObject({
      lordHouseId: w.house.id,
      vassalHouseId: npc.id,
      origin: 'ennoble',
      terms: {},
    });
    const steward = await w.stewardships.of(w.target.id);
    expect(steward).toMatchObject({
      kind: 'npc',
      stewardHouseId: npc.id,
      holderHouseId: w.house.id,
    });
    const events = await w.villages.inbox.pending(w.target.id, 0, DAY + 100);
    expect(events).toHaveLength(1);
    expect(events[0]!.day).toBe(DAY + 4); // dvě mapy daleko
    expect(events[0]!.body.kind).toBe('noble-arrives');
    const source = (await w.villages.find(w.from.id))!;
    expect(source.state.people.map((p) => p.id)).toEqual([10]);
    // příjezd: ves dostane vojvodu z povýšeného a značku nobles
    const target = structuredClone((await w.villages.find(w.target.id))!.state);
    applyInboxDay(target, DAY + 4, events);
    expect(target.nobles?.houseId).toBe(npc.id);
    expect(target.people.filter((p) => p.noble)).toHaveLength(3);
  });

  it('druhé povýšení v témž roce je odmítnuto, v dalším roce znovu smí', async () => {
    const w = await world();
    expect((await ennobleVillager(w.deps, w.input)).ok).toBe(true);
    // roční limit hlídá rod (DAY je herní rok 100)
    expect(await w.houses.claimEnnoble(w.house.id, 100)).toBe(false);
    expect(await w.houses.claimEnnoble(w.house.id, 101)).toBe(true);
  });

  it('druhá čekající ves ve stejném roce: odmítnuto kvůli roku', async () => {
    const w = await world();
    const other = await w.deps.settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 13,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 0, y: 3 },
    });
    const second = await w.villages.add(other!.id, 'Brod', waitingVillage());
    const farmer2: KinSpec[] = [{ id: 30, age: 33, sex: 'male' }];
    const src = (await w.villages.find(w.from.id))!;
    src.state.people.push(...farmer2.map((k) => kin(k)));
    await w.villages.save(src.id, src.state, src.version);
    expect((await ennobleVillager(w.deps, w.input)).ok).toBe(true);
    const res = await ennobleVillager(w.deps, {
      ...w.input,
      personId: 30,
      targetVillageId: second.id,
    });
    expect(res).toEqual({ ok: false, reason: ENNOBLE_REASONS.perYear });
  });

  it('muže rodu vojvody povýšit nejde', async () => {
    const w = await world();
    const res = await ennobleVillager(w.deps, { ...w.input, personId: 10 });
    expect(res).toEqual({ ok: false, reason: ENNOBLE_REASONS.lineMan });
  });
});

describe('NPC rod', () => {
  async function ennobled() {
    const w = await world();
    const res = await ennobleVillager(w.deps, w.input);
    if (!res.ok) throw new Error(res.reason);
    const [vassalage] = await w.vassalages.activeOf(res.houseId);
    return { ...w, npcId: res.houseId, vassalage: vassalage! };
  }

  it('pán změní podmínky přímo – platí hned, bez jednání', async () => {
    const w = await ennobled();
    const terms = { service: { men: 2, days: 30 } };
    const res = await setNpcTerms(w.deps, {
      playerId: PLAYER,
      vassalageId: w.vassalage.id,
      terms,
    });
    expect(res).toEqual({ ok: true });
    const now = (await w.vassalages.byId(w.vassalage.id))!;
    expect(now.terms).toEqual(terms);
    expect(now.endedAt).toBeNull();
  });

  it('podmínky smí měnit jen pán NPC rodu', async () => {
    const w = await ennobled();
    const other = await w.houses.create({
      playerId: 'jiny',
      kind: 'player',
      createdAt: new Date(),
    });
    expect(other.id).not.toBe(w.house.id);
    const res = await setNpcTerms(w.deps, {
      playerId: 'jiny',
      vassalageId: w.vassalage.id,
      terms: {},
    });
    expect(res).toEqual({ ok: false, reason: NOT_NPC_VASSAL });
  });

  it('odvolání správce nechá NPC rod vazalem bez vsi', async () => {
    const w = await ennobled();
    const res = await dismissSteward(
      {
        settlements: w.deps.settlements,
        villages: w.villages,
        stewardships: w.stewardships,
      },
      { playerId: PLAYER, villageId: w.target.id },
    );
    expect(res).toEqual({ ok: true });
    expect(await w.stewardships.of(w.target.id)).toBeNull();
    const live = await w.vassalages.byId(w.vassalage.id);
    expect(live?.endedAt).toBeNull();
  });

  it('vymření NPC rodu vrátí správu držiteli a ukončí dohodu', async () => {
    const w = await ennobled();
    const at = new Date(5);
    const returned = await onNpcHouseEnded(w.deps, w.npcId, at);
    expect(returned).toEqual([w.target.id]);
    expect(await w.stewardships.of(w.target.id)).toBeNull();
    expect((await w.vassalages.byId(w.vassalage.id))?.endedAt).toEqual(at);
  });
});
