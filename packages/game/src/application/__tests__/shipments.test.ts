import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { advanceVillage } from '../../domain/village/core/simulate';
import { applyInboxDay } from '../../domain/village/core/inbox';
import type { Person, VillageState } from '../../domain/village';
import {
  DAY,
  bundle,
  receiver,
  sender,
  stock,
} from '../../domain/vassalage/__tests__/shipment-fixtures';
import { reconcileShipments, sendShipment, type ShipmentDeps } from '../shipments';
import { runWorldTasks } from '../succession-credits';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Zásilky mezi vsemi hráčů – use-case (vassalage.md – Doprava a cílová ves; plán – Úloha 4.3).

const FROM_PLAYER = 'hrac-od';
const TO_PLAYER = 'hrac-do';
const REF = 'levy:1:a';

async function world(toState: VillageState = receiver()): Promise<{
  deps: ShipmentDeps;
  villages: InMemoryVillages;
  shipments: InMemoryShipments;
  settlements: InMemorySettlements;
  fromId: string;
  toId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const a = await settlements.seatAtOrigin({
    ownerId: FROM_PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const b = (await settlements.create({
    ownerId: TO_PLAYER,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 3, y: 1 },
  }))!;
  const from = await villages.add(a.id, 'Dub', sender());
  const to = await villages.add(b.id, 'Lhota', toState);
  return {
    deps: {
      shipments,
      villages,
      settlements,
      locks: new InMemoryPlayerLock(),
      now: () => new Date(0),
    },
    villages,
    shipments,
    settlements,
    fromId: from.id,
    toId: to.id,
  };
}

const SMALL = bundle({
  grainKg: 400,
  logs: 6,
  cattle: { cows: 2, youngOxen: 0, trainedOxen: 0 },
  people: { families: 1, men: 0, women: 0 },
});

/** Použije událost zásilky v cílové vsi (jako dopočet) a vrátí stav. */
async function deliver(
  w: Awaited<ReturnType<typeof world>>,
  id: string,
  toDay: number,
): Promise<VillageState> {
  const record = (await w.villages.find(id))!;
  const events = await w.villages.inbox.pending(id, record.state.lastDay, toDay);
  const state = structuredClone(record.state);
  for (let day = state.lastDay + 1; day <= toDay; day++) {
    state.chronicle.push(...applyInboxDay(state, day, events));
  }
  return state;
}

describe('sendShipment', () => {
  it('příjezd za 2 × vzdálenost dní; bilance obou vsí je nulová, lidé mají nová id', async () => {
    const w = await world();
    const before = [stock(sender()), stock(receiver())];
    const result = await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    // vzdálenost (0,0) → (3,1) je 3 políčka
    expect(result).toMatchObject({ ok: true, arrivesDay: DAY + 6 });
    const events = await w.villages.inbox.pending(w.toId, 0, DAY + 100);
    expect(events).toHaveLength(1);
    expect(events[0]!.day).toBe(DAY + 6);
    const from = (await w.villages.find(w.fromId))!.state;
    expect(from.trade!.expeditions[0]).toMatchObject({
      kind: 'shipment',
      days: 12,
      direction: 'NE',
    });
    const to = await deliver(w, w.toId, DAY + 6);
    const after = [stock(from), stock(to)];
    for (const key of Object.keys(before[0]!)) {
      expect(after[0]![key]! + after[1]![key]!, key).toBe(before[0]![key]! + before[1]![key]!);
    }
    expect(to.people.filter((p) => p.id >= 2_000)).toHaveLength(4);
    expect(w.shipments.rows[0]!.postedAt).not.toBeNull();
  });

  it('jídlo domény: tělo v řádku i ve schránce nese domain, v cíli se dobytek porazí', async () => {
    const w = await world();
    const result = await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: bundle({ grainKg: 300, cattle: { cows: 2, youngOxen: 0, trainedOxen: 0 } }),
      purpose: 'domain-food',
      refId: 'domain-food:1',
      today: DAY,
      domain: true,
    });
    expect(result).toMatchObject({ ok: true });
    expect(w.shipments.rows[0]!.body.domain).toBe(true);
    const events = await w.villages.inbox.pending(w.toId, 0, DAY + 100);
    const body = events[0]!.body;
    expect(body.kind === 'shipment' && body.shipment.domain).toBe(true);
    const to = await deliver(w, w.toId, DAY + 6);
    expect(to.domainFoodDay).toBe(DAY + 6);
    expect(to.meatKg ?? 0).toBeGreaterThanOrEqual(240);
    expect(to.livestock?.herds.cow ?? 0).toBe(receiver().livestock?.herds.cow ?? 0);
  });

  it('opakované odeslání se stejným refId nic nezdvojí', async () => {
    const w = await world();
    const input = {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    };
    const first = await sendShipment(w.deps, input);
    const again = await sendShipment(w.deps, input);
    expect(again).toEqual(first);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.villages.inbox.events).toHaveLength(1);
    expect((await w.villages.find(w.fromId))!.state.storesKg).toBe(sender().storesKg - 400);
  });

  it('nedostatek: důvod česky, nic se nezapíše', async () => {
    const w = await world();
    const result = await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: bundle({ grainKg: 1e9 }),
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    expect(result).toEqual({ ok: false, reason: 'Ves tolik obilí nemá.' });
    expect(w.shipments.rows).toHaveLength(0);
    expect(w.villages.inbox.events).toHaveLength(0);
  });

  it('pád po uložení vsi, před zápisem do schránky: reconcileShipments doručí právě jednou', async () => {
    const w = await world();
    // schránka cíle selže při prvním zápisu (pád procesu mezi uložením vsi a zápisem)
    const post = w.villages.inbox.post.bind(w.villages.inbox);
    let failures = 1;
    w.villages.inbox.post = (event) => {
      if (failures-- > 0) return Promise.reject(new Error('pád'));
      return post(event);
    };
    await expect(
      sendShipment(w.deps, {
        fromVillageId: w.fromId,
        toVillageId: w.toId,
        bundle: SMALL,
        purpose: 'levy',
        refId: REF,
        today: DAY,
      }),
    ).rejects.toThrow('pád');
    expect(w.villages.inbox.events).toHaveLength(0);
    expect(w.shipments.rows[0]!.postedAt).toBeNull();
    // ves odesílatele už zboží nemá
    expect((await w.villages.find(w.fromId))!.state.storesKg).toBe(sender().storesKg - 400);
    expect(await reconcileShipments(w.deps, DAY)).toBe(1);
    expect(await reconcileShipments(w.deps, DAY)).toBe(0);
    expect(await reconcileShipments(w.deps, DAY + 1)).toBe(0);
    expect(w.villages.inbox.events).toHaveLength(1);
    expect(w.shipments.rows[0]!.postedAt).not.toBeNull();
    // opakované odeslání po pádu taky nic nezdvojí
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    expect(w.villages.inbox.events).toHaveLength(1);
  });

  it('pád před uložením vsi: rezervace se zruší, zboží ve vsi zůstalo a nic nedojde', async () => {
    const w = await world();
    const sent = await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: 'ref-pad',
      today: DAY,
    });
    expect(sent.ok).toBe(true);
    // řádek bez uložené vsi (jako po pádu hned po rezervaci)
    await w.shipments.reserve({
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      body: w.shipments.rows[0]!.body,
      purpose: 'levy',
      refId: 'ref-sirotek',
      sentDay: DAY,
      arrivesDay: DAY + 6,
    });
    expect(w.shipments.rows).toHaveLength(2);
    expect(await reconcileShipments(w.deps, DAY)).toBe(0);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.villages.inbox.events).toHaveLength(1);
  });

  it('co je na cestě, dojde i po konci vazalství', async () => {
    const w = await world();
    const houses = new InMemoryHouses();
    const vassalages = new InMemoryVassalages();
    const lord = await houses.create({
      playerId: TO_PLAYER,
      kind: 'player',
      createdAt: new Date(0),
    });
    const vassal = await houses.create({
      playerId: FROM_PLAYER,
      kind: 'player',
      createdAt: new Date(0),
    });
    const edge = await vassalages.create({
      lordHouseId: lord.id,
      vassalHouseId: vassal.id,
      terms: {},
      origin: 'invite',
      sinceAt: new Date(0),
      sinceDay: DAY,
    });
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    expect(await vassalages.end(edge.id, 'renounce', new Date(0))).toBe(true);
    const to = await deliver(w, w.toId, DAY + 6);
    expect(to.storesKg).toBe(receiver().storesKg + 400);
  });

  it('dopočet po kouscích na obou stranách: 1 / 3 / 10 dní dají totéž', async () => {
    const run = async (chunks: number[]): Promise<{ from: VillageState; to: VillageState }> => {
      const w = await world();
      await sendShipment(w.deps, {
        fromVillageId: w.fromId,
        toVillageId: w.toId,
        bundle: SMALL,
        purpose: 'levy',
        refId: REF,
        today: DAY,
      });
      let from = (await w.villages.find(w.fromId))!.state;
      let to = (await w.villages.find(w.toId))!.state;
      const events = await w.villages.inbox.pending(w.toId, 0, DAY + 100);
      let day = DAY;
      for (const n of chunks) {
        from = advanceVillage(from, day + n, null, null);
        to = advanceVillage(to, day + n, null, null, events);
        day += n;
      }
      return { from, to };
    };
    const whole = await run([10]);
    expect(await run([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual(whole);
    expect(await run([3, 3, 4])).toEqual(whole);
    // zboží dorazilo právě jednou, nosiči se (za 12 dní) ještě nevrátili
    expect(whole.to.chronicle.filter((e) => e.kind === 'shipment-received')).toHaveLength(1);
    expect(whole.from.trade!.expeditions.some((e) => e.kind === 'shipment')).toBe(true);
  });
});

/** Pohlaví a den narození všech lidí, seřazené (porovnání bez ohledu na id). */
function sexAndBirth(people: readonly Person[]): string[] {
  return people.map((p) => `${p.sex}:${p.bornDay}`).sort();
}

describe('zásilka do zaniklé vsi', () => {
  it('cíl zanikl před příjezdem: zboží se vrátí odesílateli (bilance zůstane)', async () => {
    const w = await world();
    const fromBefore = (await w.villages.find(w.fromId))!.state;
    const before = stock(fromBefore);
    const kinBefore = sexAndBirth(fromBefore.people);
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    // cíl vymře
    const target = (await w.villages.find(w.toId))!;
    await w.villages.save(w.toId, { ...target.state, extinctDay: DAY + 1 }, target.version);
    expect(await reconcileShipments(w.deps, DAY + 2)).toBe(1);
    expect(await reconcileShipments(w.deps, DAY + 3)).toBe(0);
    const back = (await w.villages.inbox.pending(w.fromId, 0, DAY + 100)).filter(
      (e) => e.body.kind === 'shipment',
    );
    expect(back).toHaveLength(1);
    expect(back[0]!.day).toBe(DAY + 2 + 6);
    const from = await deliver(w, w.fromId, DAY + 20);
    expect(stock(from)).toEqual({ ...before, people: before.people! });
    // vrátili se tytéž lidé (pohlaví a den narození), ne nově vylosovaní
    expect(sexAndBirth(from.people)).toEqual(kinBefore);
    expect(from.chronicle.some((e) => e.kind === 'shipment-received' && e.returned)).toBe(true);
    expect(w.shipments.rows[0]!.settledAt).not.toBeNull();
  });

  it('cíl už zanikl při odeslání: zásilka se nepošle', async () => {
    const dead = receiver();
    dead.extinctDay = DAY - 5;
    const w = await world(dead);
    const result = await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    expect(result).toEqual({ ok: false, reason: 'Cílová ves zanikla.' });
  });

  it('doručená zásilka se v obnově vyřídí a nevrací', async () => {
    const w = await world();
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    // cíl zásilku použil (dopočet do příjezdu) a pak vymřel
    const target = (await w.villages.find(w.toId))!;
    const events = await w.villages.inbox.pending(w.toId, 0, DAY + 100);
    const arrived = advanceVillage(target.state, DAY + 7, null, null, events);
    await w.villages.save(w.toId, { ...arrived, extinctDay: DAY + 8 }, target.version);
    expect(await reconcileShipments(w.deps, DAY + 9)).toBe(0);
    expect(w.shipments.rows[0]!.settledAt).not.toBeNull();
    expect(
      (await w.villages.inbox.pending(w.fromId, 0, DAY + 100)).filter(
        (e) => e.body.kind === 'shipment',
      ),
    ).toHaveLength(0);
  });
});

describe('runWorldTasks', () => {
  it('obnova zásilek je součástí úloh světa', async () => {
    const w = await world();
    const post = w.villages.inbox.post.bind(w.villages.inbox);
    let failures = 1;
    w.villages.inbox.post = (event) =>
      failures-- > 0 ? Promise.reject(new Error('pád')) : post(event);
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    }).catch(() => undefined);
    const houses = new InMemoryHouses();
    await runWorldTasks(
      {
        invites: new InMemoryInvites(),
        activity: new InMemoryActivity(),
        credits: new InMemoryCredits(),
        notices: new InMemoryNotices(),
        houses,
        shipments: w.deps,
      },
      { now: new Date(0), today: DAY },
    );
    expect(w.villages.inbox.events).toHaveLength(1);
  });
});

describe('obnova zásilek s posunem času hráče', () => {
  it('vrácená zásilka vyrazí zpět dnes ve dni držitele odesílatele', async () => {
    const w = await world();
    await sendShipment(w.deps, {
      fromVillageId: w.fromId,
      toVillageId: w.toId,
      bundle: SMALL,
      purpose: 'levy',
      refId: REF,
      today: DAY,
    });
    const target = (await w.villages.find(w.toId))!;
    await w.villages.save(w.toId, { ...target.state, extinctDay: DAY + 1 }, target.version);
    const sender = (await w.villages.find(w.fromId))!;
    const owner = (await w.deps.settlements.find(sender.settlementId))!.ownerId;
    const offsets = new InMemoryTimeOffsets();
    offsets.offsets.set(owner, 40);
    // den světa DAY − 38 je pro držitele odesílatele DAY + 2
    expect(await reconcileShipments({ ...w.deps, offsets }, DAY - 38)).toBe(1);
    const back = (await w.villages.inbox.pending(w.fromId, 0, DAY + 100)).filter(
      (e) => e.body.kind === 'shipment',
    );
    expect(back.map((e) => e.day)).toEqual([DAY + 2 + 6]);
  });
});
