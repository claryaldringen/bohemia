import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { checkEscheatPlan, ESCHEAT_REASONS, type EscheatScope } from '../../domain/vassalage';
import type { Person, VillageFaith, VillageState } from '../../domain/village';
import { DAY, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import {
  acceptHolderTransfers,
  consentEscheat,
  escheatDialogs,
  giveEscheatPart,
  proposeEscheat,
  transferVillages,
} from '../escheat';
import {
  ACCEPTANCE_OUTBOX_GRACE_MS,
  acceptNegotiation,
  deliverPendingAcceptances,
  rejectNegotiation,
} from '../negotiate';
import { closeDynastyDay, type DynastyDeps } from '../restart-game';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryEscheats } from './in-memory-escheats';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryLoans } from './in-memory-loans';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Vymření rodu a odúmrť (vassalage.md – Vymření rodu – odúmrť; plán Ú4.10, Review bod 3).

const NOW = new Date('2027-03-01T00:00:00Z');
const DEAD = 'mrtvy';
const LORD = 'pan';
const LORD2 = 'pan2';
const VASSAL = 'vazal';
const GIFTEE = 'obdarovany';
const OTHER = 'soused';

/** Ženy rodu: vdova a dcera (`line`), muž rodu žádný – rod po meči vymřel. */
function widowVillage(extra: Partial<VillageState> = {}): VillageState {
  const people: Person[] = [
    { ...kin({ id: 1, age: 40, sex: 'female' }), line: true },
    { ...kin({ id: 2, age: 12, sex: 'female', mother: 1 }), line: true },
    kin({ id: 3, age: 30, sex: 'male' }),
  ];
  return village(people, undefined, {
    dynasty: { lordId: null, lords: [{ id: 9, fromDay: 0, toDay: DAY - 10 }], endedDay: DAY - 10 },
    ...extra,
  });
}

async function world(options: { lords?: number; villages?: number; faith?: VillageFaith } = {}) {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const vassalages = new InMemoryVassalages();
  const loans = new InMemoryLoans();
  const dialogs = new InMemoryDialogs();
  const notices = new InMemoryNotices();
  const stewardships = new InMemoryStewardships();
  const escheats = new InMemoryEscheats();
  const negotiations = new InMemoryNegotiations(
    vassalages,
    notices,
    () => NOW,
    loans,
    stewardships,
  );
  const locks = new InMemoryPlayerLock();
  const house = (playerId: string): ReturnType<typeof houses.create> =>
    houses.create({ playerId, kind: 'player', createdAt: NOW });
  const dead = await house(DEAD);
  const lord = await house(LORD);
  const lord2 = await house(LORD2);
  const vassal = await house(VASSAL);
  const giftee = await house(GIFTEE);
  const other = await house(OTHER);
  const oath = (lordHouseId: string, vassalHouseId: string, sinceDay: number) =>
    vassalages.create({
      lordHouseId,
      vassalHouseId,
      terms: { tribute: { grainKg: 100 } } as never,
      origin: 'negotiation',
      sinceAt: NOW,
      sinceDay,
    });
  const lords = options.lords ?? 1;
  if (lords >= 1) await oath(lord.id, dead.id, 10);
  if (lords >= 2) await oath(lord2.id, dead.id, 20);
  const vassalOfDead = await oath(dead.id, vassal.id, 30);
  await oath(lord.id, giftee.id, 40);
  const seat = await settlements.seatAtOrigin({
    ownerId: DEAD,
    landscapeSeed: 5,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const extra = options.faith ? { faith: options.faith } : {};
  const first = await villages.add(seat.id, 'Vdovín', widowVillage(extra));
  const maps = [seat];
  const records = [first];
  for (let i = 1; i < (options.villages ?? 2); i++) {
    const map = await settlements.create({
      ownerId: DEAD,
      landscapeSeed: 6 + i,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: i, y: 0 },
    });
    maps.push(map!);
    records.push(await villages.add(map!.id, `Dcerov ${i}`, widowVillage(extra)));
  }
  const ending = {
    houses,
    vassalages,
    loans,
    dialogs,
    negotiations,
    stewardships,
    escheats,
    now: () => NOW,
  };
  const dynastyDeps: DynastyDeps = { settlements, villages, houses, negotiations, ending };
  const escheatDeps = {
    houses,
    escheats,
    vassalages,
    loans,
    dialogs,
    negotiations,
    settlements,
    villages,
    locks,
  };
  const close = async (): Promise<boolean> => {
    const active = await settlements.listActive(DEAD);
    const list = (await Promise.all(records.map((r) => villages.find(r.id)))).filter(
      (v) => v !== null,
    );
    return (await closeDynastyDay(dynastyDeps, { settlements: active, villages: list, today: DAY }))
      .gameOver;
  };
  return {
    houses,
    settlements,
    villages,
    vassalages,
    loans,
    dialogs,
    notices,
    stewardships,
    escheats,
    negotiations,
    locks,
    dead,
    lord,
    lord2,
    vassal,
    giftee,
    other,
    vassalOfDead,
    maps,
    records,
    dynastyDeps,
    escheatDeps,
    close,
  };
}

const negotiateDeps = (w: Awaited<ReturnType<typeof world>>) => ({
  houses: w.houses,
  negotiations: w.negotiations,
  villages: w.villages,
  worldDirectory: { entriesOf: () => Promise.resolve([]) },
  escheatGift: (input: Parameters<typeof giveEscheatPart>[1]) =>
    giveEscheatPart(w.escheatDeps, input),
});

describe('vymření rodu s pánem – rozběhnuté věci (Review bod 3)', () => {
  it('jednání skončí, zásilka dojde, dialogy zmizí, správa skončí; vsi přejdou pánovi', async () => {
    const w = await world();
    await w.negotiations.transaction((tx) =>
      tx.open({
        initiatorHouseId: w.dead.id,
        recipientHouseId: w.other.id,
        round: { authorHouseId: w.dead.id, items: [], message: null, at: NOW },
      }),
    );
    await w.villages.inbox.post({
      villageId: w.records[0]!.id,
      day: DAY + 5,
      ref: 'shipment:1',
      body: { kind: 'shipment', goods: {} } as never,
    });
    await w.dialogs.openOnce('levy:x:500', {
      playerId: DEAD,
      kind: 'levy',
      refId: 'x',
      year: 500,
      body: {},
    });
    const foreignSeat = await w.settlements.createSeat({
      ownerId: OTHER,
      landscapeSeed: 9,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 9, y: 9 },
    });
    const foreign = await w.villages.add(foreignSeat!.id, 'Cizí', village([]));
    await w.stewardships.start({
      villageId: foreign.id,
      stewardHouseId: w.dead.id,
      holderHouseId: w.other.id,
      kind: 'player',
      vassalageId: null,
      since: NOW,
    });

    expect(await w.close()).toBe(true);

    expect(w.negotiations.records.every((n) => n.status === 'ended')).toBe(true);
    // zásilka čeká ve schránce vsi – dojde do vsi, ať ji drží kdokoli
    expect(await w.villages.inbox.pending(w.records[0]!.id, DAY, DAY + 10)).toHaveLength(1);
    expect(w.dialogs.rows.find((d) => d.key === 'levy:x:500')?.status).toBe('dropped');
    expect(await w.stewardships.of(foreign.id)).toBeNull();
    expect((await w.houses.byId(w.dead.id))?.endedAt).toEqual(NOW);
    // vsi nezaniknou: ženy rodu zůstanou jako vesničanky, ves řídí správce, čeká na převzetí
    const kept = await w.villages.find(w.records[0]!.id);
    expect(kept?.state.abandonedDay).toBeUndefined();
    expect(kept?.state.people.some((p) => p.line)).toBe(false);
    expect(kept?.state.steward?.on).toBe(true);
    expect(await w.settlements.listActive(DEAD)).toEqual([]);
    expect(await w.settlements.listActive(LORD)).toEqual([]);
    expect((await w.settlements.acceptTransfers(LORD)).map((s) => s.id).sort()).toEqual(
      w.maps.map((m) => m.id).sort(),
    );
    expect((await w.settlements.listActive(LORD)).every((s) => !s.isSeat)).toBe(true);
    // pán dostal dialog odúmrti; vazal vymřelého zůstává do rozhodnutí na staré dohodě
    expect(w.dialogs.rows.filter((d) => d.kind === 'escheat' && d.playerId === LORD)).toHaveLength(
      1,
    );
    expect((await w.vassalages.byId(w.vassalOfDead.id))?.endedAt).toBeNull();
    // opakovaný konec rodu nic nezdvojí
    await w.close();
    expect(w.escheats.rows).toHaveLength(1);
    expect(w.dialogs.rows.filter((d) => d.kind === 'escheat')).toHaveLength(1);
  });
});

describe('jeden pán', () => {
  it('ponechat celé – vazalové přejdou s podmínkami a půjčkami', async () => {
    const w = await world();
    await w.loans.create({
      negotiationId: 'n-loan',
      creditorHouseId: w.dead.id,
      debtorHouseId: w.vassal.id,
      creditorVillageId: w.records[0]!.id,
      debtorVillageId: null,
      principal: { grainKg: 100, hayKg: 0, cattle: {}, horses: 0, logs: 0 } as never,
      schedule: [],
      sinceAt: NOW,
      sinceDay: DAY,
    });
    await w.close();
    const [view] = await escheatDialogs(w.escheatDeps, { playerId: LORD });
    expect(view?.villages).toHaveLength(2);
    const result = await proposeEscheat(w.escheatDeps, {
      playerId: LORD,
      escheatId: view!.id,
      parts: [
        {
          toHouseId: w.lord.id,
          villageIds: view!.villages.map((v) => v.id),
          vassalIds: [w.vassal.id],
        },
      ],
      now: NOW,
      today: DAY,
    });
    expect(result.ok && result.decided).toBe(true);
    const moved = (await w.vassalages.activeOf(w.vassal.id)).find(
      (v) => v.lordHouseId === w.lord.id,
    );
    expect(moved?.terms).toEqual({ tribute: { grainKg: 100 } });
    expect(moved?.origin).toBe('escheat');
    expect((await w.vassalages.byId(w.vassalOfDead.id))?.endedAt).not.toBeNull();
    expect(w.loans.loans[0]?.creditorHouseId).toBe(w.lord.id);
    expect(w.dialogs.rows.filter((d) => d.kind === 'escheat' && d.status === 'open')).toHaveLength(
      0,
    );
    expect(await escheatDialogs(w.escheatDeps, { playerId: LORD })).toEqual([]);
  });

  it('rozdělit – věnovaný díl platí po přijetí, odmítnutý zůstane pánovi', async () => {
    for (const answer of ['accept', 'reject'] as const) {
      const w = await world();
      await w.close();
      await w.settlements.acceptTransfers(LORD);
      const [view] = await escheatDialogs(w.escheatDeps, { playerId: LORD });
      expect(view?.recipients.map((r) => r.houseId)).toEqual([w.lord.id, w.giftee.id]);
      const [a, b] = view!.villages;
      const result = await proposeEscheat(w.escheatDeps, {
        playerId: LORD,
        escheatId: view!.id,
        parts: [
          { toHouseId: w.lord.id, villageIds: [a!.id], vassalIds: [] },
          { toHouseId: w.giftee.id, villageIds: [b!.id], vassalIds: [w.vassal.id] },
        ],
        now: NOW,
        today: DAY,
      });
      expect(result.ok).toBe(true);
      const gift = w.negotiations.records.find((n) => n.status === 'open');
      expect(gift?.rounds[0]?.items[0]?.kind).toBe('village-gift');
      const input = { playerId: GIFTEE, negotiationId: gift!.id, now: NOW, today: DAY };
      const done =
        answer === 'accept'
          ? await acceptNegotiation(negotiateDeps(w), input)
          : await rejectNegotiation(negotiateDeps(w), input);
      expect(done.ok).toBe(true);
      const owner = (await w.villages.find(b!.id))!.settlementId;
      const holder = w.settlements.settlements.find((s) => s.id === owner)?.ownerId;
      expect(holder).toBe(answer === 'accept' ? GIFTEE : LORD);
      const lordOfVassal = (await w.vassalages.activeOf(w.vassal.id)).map((v) => v.lordHouseId);
      expect(lordOfVassal).toEqual([answer === 'accept' ? w.giftee.id : w.lord.id]);
      // dohoda pána s obdarovaným se věnováním nezmění
      const giftee = (await w.vassalages.activeOf(w.giftee.id)).find(
        (v) => v.lordHouseId === w.lord.id,
      );
      expect(giftee?.terms).toEqual({ tribute: { grainKg: 100 } });
    }
  });
});

describe('dva páni – spravují všichni', () => {
  it('technický držitel je pán s nejstarší dohodou, dělení platí až po druhém souhlasu', async () => {
    const w = await world({ lords: 2 });
    await w.close();
    expect(w.dialogs.rows.filter((d) => d.kind === 'escheat').map((d) => d.playerId)).toEqual([
      LORD,
      LORD2,
    ]);
    expect(await w.settlements.acceptTransfers(LORD2)).toEqual([]);
    expect(await w.settlements.acceptTransfers(LORD)).toHaveLength(2);
    const [view] = await escheatDialogs(w.escheatDeps, { playerId: LORD2 });
    const [a, b] = view!.villages;
    const proposed = await proposeEscheat(w.escheatDeps, {
      playerId: LORD2,
      escheatId: view!.id,
      parts: [
        { toHouseId: w.lord.id, villageIds: [a!.id], vassalIds: [w.vassal.id] },
        { toHouseId: w.lord2.id, villageIds: [b!.id], vassalIds: [] },
      ],
      now: NOW,
      today: DAY,
    });
    expect(proposed.ok && proposed.decided).toBe(false);
    const mapB = (await w.villages.find(b!.id))!.settlementId;
    const ownerB = (): string | undefined =>
      w.settlements.settlements.find((s) => s.id === mapB)?.ownerId;
    expect(ownerB()).toBe(LORD);
    // souhlas se starou verzí návrhu neprojde
    const stale = await consentEscheat(w.escheatDeps, {
      playerId: LORD,
      escheatId: view!.id,
      version: 0,
      now: NOW,
      today: DAY,
    });
    expect(stale).toEqual({ ok: false, reason: ESCHEAT_REASONS.changed });
    const consented = await consentEscheat(w.escheatDeps, {
      playerId: LORD,
      escheatId: view!.id,
      version: proposed.ok ? proposed.escheat.version : -1,
      now: NOW,
      today: DAY,
    });
    expect(consented.ok && consented.decided).toBe(true);
    expect(ownerB()).toBe(LORD2);
    expect((await w.vassalages.activeOf(w.vassal.id)).map((v) => v.lordHouseId)).toEqual([
      w.lord.id,
    ]);
    // cizí rod o odúmrti nerozhoduje
    const foreign = await proposeEscheat(w.escheatDeps, {
      playerId: OTHER,
      escheatId: view!.id,
      parts: [],
      now: NOW,
      today: DAY,
    });
    expect(foreign).toEqual({ ok: false, reason: ESCHEAT_REASONS.notLord });
  });
});

describe('dohody a rod bez pána', () => {
  it('smrt vojvody dohody nemění – rod žije dál synem', async () => {
    const w = await world();
    const record = w.records[0]!;
    const son: Person = { ...kin({ id: 7, age: 20, sex: 'male' }), line: true };
    await w.villages.save(
      record.id,
      { ...widowVillage(), people: [...widowVillage().people, son] },
      record.version,
    );
    expect(await w.close()).toBe(false);
    expect((await w.vassalages.activeOf(w.dead.id)).map((v) => v.id).sort()).toHaveLength(2);
    expect(w.escheats.rows).toHaveLength(0);
    expect((await w.houses.byId(w.dead.id))?.endedAt).toBeNull();
  });

  it('bez pána – vazalové nezávislí, dluhy zaniknou, vsi zaniknou', async () => {
    const w = await world({ lords: 0 });
    await w.loans.create({
      negotiationId: 'n-debt',
      creditorHouseId: w.other.id,
      debtorHouseId: w.dead.id,
      creditorVillageId: 'x',
      debtorVillageId: null,
      principal: { grainKg: 100, hayKg: 0, cattle: {}, horses: 0, logs: 0 } as never,
      schedule: [],
      sinceAt: NOW,
      sinceDay: DAY,
    });
    expect(await w.close()).toBe(true);
    expect(await w.vassalages.activeOf(w.vassal.id)).toEqual([]);
    expect(w.loans.loans[0]?.status).toBe('cancelled');
    expect(w.escheats.rows).toHaveLength(0);
    expect((await w.villages.find(w.records[0]!.id))?.state.abandonedDay).toBe(DAY - 10);
  });

  it('NPC rod bez mužů skončí – ves se vrátí pod rod hráče, ženy zůstanou vesničankami', async () => {
    const w = await world();
    const npc = await w.houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
    const agreement = await w.vassalages.create({
      lordHouseId: w.dead.id,
      vassalHouseId: npc.id,
      terms: {},
      origin: 'ennoble',
      sinceAt: NOW,
      sinceDay: DAY,
    });
    const record = w.records[0]!;
    const state = widowVillage({ nobles: { houseId: npc.id, headId: 5 } });
    state.people.push({ ...kin({ id: 5, age: 50, sex: 'female' }), noble: { houseId: npc.id } });
    // rod hráče žije (muž rodu ve vsi), jen NPC rod nemá muže
    state.people.push({ ...kin({ id: 8, age: 30, sex: 'male' }), line: true });
    await w.villages.save(record.id, state, record.version);
    await w.stewardships.start({
      villageId: record.id,
      stewardHouseId: npc.id,
      holderHouseId: w.dead.id,
      kind: 'npc',
      vassalageId: agreement.id,
      since: NOW,
    });
    expect(await w.close()).toBe(false);
    const after = await w.villages.find(record.id);
    expect(after?.state.nobles).toBeUndefined();
    expect(after?.state.people.find((p) => p.id === 5)?.noble).toBeUndefined();
    expect((await w.houses.byId(npc.id))?.endedAt).toEqual(NOW);
    expect(await w.stewardships.of(record.id)).toBeNull();
    expect((await w.vassalages.byId(agreement.id))?.endedAt).not.toBeNull();
  });
});

describe('dělení odúmrti (doména)', () => {
  const scope: EscheatScope = {
    lordHouseIds: ['L1', 'L2'],
    villageIds: ['a', 'b', 'c'],
    vassalIds: ['V'],
    mapOf: { a: 'm1', b: 'm1', c: 'm2' },
    giftFrom: { G: 'L1' },
  };
  it('celé vsi a vazalové právě jednou, vsi jedné mapy spolu, příjemce pán nebo jeho vazal', () => {
    expect(
      checkEscheatPlan(scope, [
        { toHouseId: 'L1', villageIds: ['a', 'b'], vassalIds: [] },
        { toHouseId: 'G', villageIds: ['c'], vassalIds: ['V'] },
      ]),
    ).toBeNull();
    expect(
      checkEscheatPlan(scope, [{ toHouseId: 'L1', villageIds: ['a', 'b', 'c'], vassalIds: [] }]),
    ).toBe(ESCHEAT_REASONS.missingItem);
    expect(
      checkEscheatPlan(scope, [
        { toHouseId: 'L1', villageIds: ['a'], vassalIds: ['V'] },
        { toHouseId: 'L2', villageIds: ['b', 'c'], vassalIds: [] },
      ]),
    ).toBe(ESCHEAT_REASONS.sameMap);
    expect(
      checkEscheatPlan(scope, [{ toHouseId: 'X', villageIds: ['a', 'b', 'c'], vassalIds: ['V'] }]),
    ).toBe(ESCHEAT_REASONS.badRecipient);
    expect(
      checkEscheatPlan({ ...scope, villageIds: ['a'], mapOf: { a: 'm1' } }, [
        { toHouseId: 'L1', villageIds: ['a'], vassalIds: [] },
        { toHouseId: 'L2', villageIds: [], vassalIds: ['V'] },
      ]),
    ).toBe(ESCHEAT_REASONS.oneVillage);
  });
});

describe('víra vsi při změně držitele (christianity.md – Vsi rodu)', () => {
  it('ves nese křest nového držitele – nepokřtěný příznak smaže, pokřtěný dá svůj den; zničená místa zůstanou', async () => {
    const desecrated = { oaksOrGroves: 1, cemeteries: 0 };
    const w = await world({ faith: { rodBaptizedDay: DAY - 100, desecrated } });
    const faiths = async (): Promise<(VillageFaith | undefined)[]> =>
      Promise.all(w.records.map(async (r) => (await w.villages.find(r.id))?.state.faith));

    // odúmrť: sídla čekají na technického držitele (pán, nepokřtěný), převezme je jeho dopočet
    await w.close();
    expect(await faiths()).toEqual([
      { rodBaptizedDay: DAY - 100, desecrated },
      { rodBaptizedDay: DAY - 100, desecrated },
    ]);
    expect(await acceptHolderTransfers(w.escheatDeps, LORD)).toHaveLength(2);
    expect(await faiths()).toEqual([{ desecrated }, { desecrated }]);

    // pán vsi postoupí pokřtěnému rodu
    await w.houses.markChristianityKnown(w.giftee.id, 600);
    await w.houses.markBaptized(w.giftee.id, DAY - 5);
    await transferVillages(
      w.escheatDeps,
      w.records.map((r) => r.id),
      LORD,
      GIFTEE,
    );
    expect((await w.settlements.find(w.maps[0]!.id))?.ownerId).toBe(GIFTEE);
    expect(await faiths()).toEqual([
      { rodBaptizedDay: DAY - 5, desecrated },
      { rodBaptizedDay: DAY - 5, desecrated },
    ]);

    // opakování nic nepřevezme ani nezapíše
    const versions = await Promise.all(
      w.records.map(async (r) => (await w.villages.find(r.id))?.version),
    );
    expect(await acceptHolderTransfers(w.escheatDeps, GIFTEE)).toEqual([]);
    expect(
      await Promise.all(w.records.map(async (r) => (await w.villages.find(r.id))?.version)),
    ).toEqual(versions);
  });
});

// Schránka účinků jednání (audit A2): věnování se po pádu dokončí krokem workeru právě jednou.
describe('věnování po pádu (A2)', () => {
  it('pád uprostřed převodu vazala: krok workeru dohodu nezdvojí a převod dokončí', async () => {
    const w = await world();
    await w.close();
    await w.settlements.acceptTransfers(LORD);
    const [view] = await escheatDialogs(w.escheatDeps, { playerId: LORD });
    const [a, b] = view!.villages;
    await proposeEscheat(w.escheatDeps, {
      playerId: LORD,
      escheatId: view!.id,
      parts: [
        { toHouseId: w.lord.id, villageIds: [a!.id], vassalIds: [] },
        { toHouseId: w.giftee.id, villageIds: [b!.id], vassalIds: [w.vassal.id] },
      ],
      now: NOW,
      today: DAY,
    });
    const gift = w.negotiations.records.find((n) => n.status === 'open')!;
    // pád mezi novou dohodou vazala s obdarovaným a koncem staré
    const end = w.vassalages.end.bind(w.vassalages);
    let crashes = 1;
    w.vassalages.end = async (...args: Parameters<typeof end>) => {
      if (args[1] === 'escheat' && crashes-- > 0) throw new Error('pád');
      return end(...args);
    };
    // paměťové vazalství dvojici samo nezdvojí (databáze ano) – počítají se pokusy o založení
    const create = w.vassalages.create.bind(w.vassalages);
    let created = 0;
    w.vassalages.create = async (input: Parameters<typeof create>[0]) => {
      if (input.lordHouseId === w.giftee.id && input.vassalHouseId === w.vassal.id) created++;
      return create(input);
    };
    const input = { playerId: GIFTEE, negotiationId: gift.id, now: NOW, today: DAY };
    await expect(acceptNegotiation(negotiateDeps(w), input)).rejects.toThrow('pád');
    const later = new Date(NOW.getTime() + ACCEPTANCE_OUTBOX_GRACE_MS + 1000);
    expect(await deliverPendingAcceptances(negotiateDeps(w), { now: later, today: DAY })).toBe(1);
    const lordOfVassal = (await w.vassalages.activeOf(w.vassal.id)).map((v) => v.lordHouseId);
    expect(lordOfVassal).toEqual([w.giftee.id]);
    expect(created).toBe(1);
    const owner = (await w.villages.find(b!.id))!.settlementId;
    expect(w.settlements.settlements.find((s) => s.id === owner)?.ownerId).toBe(GIFTEE);
  });
});
