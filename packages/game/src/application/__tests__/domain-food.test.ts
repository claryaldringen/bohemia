import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { cattleFoodKg, domainNeedKg } from '../../domain/vassalage';
import { foundVillage } from '../../domain/village/core/actions';
import type { VillageState } from '../../domain/village';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import {
  DOMAIN_FOOD_PURPOSE,
  domainFoodRef,
  sendDomainFood,
  type DomainFoodDeps,
} from '../domain-food';
import type { ShipmentRecord } from '../shipments';
import { runWorldTasks } from '../succession-credits';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryDomainFood } from './in-memory-domain-food';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';

// Jídlo domény – krok světa (hillfort.md – Jídlo domény; plán 2026-11-08-hillfort, Úloha 7).
// Vsi ze `foundVillage` dopočtené do dne kroku (`loadVillage` je jen najde).

const OWNER = 'drzitel';
const OCT_2 = dayIndexOf({ year: 600, month: 10, day: 2 });
const FEB_1 = dayIndexOf({ year: 600, month: 2, day: 1 });

/** Ves dopočtená do dne `day` se zásobou `storesKg`; společná práce nese dopravu. */
function village(day: number, storesKg: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = storesKg;
  s.commonLaborYearly = 40;
  return s;
}

/** Bohatý dárce a ves, které jídlo chybí. */
const RICH = 40_000;
const POOR = 10;

interface World {
  deps: DomainFoodDeps;
  villages: InMemoryVillages;
  shipments: InMemoryShipments;
  settlements: InMemorySettlements;
  rounds: InMemoryDomainFood;
  /** Id vsí v pořadí `states`. */
  ids: string[];
  /** Vsi, které krok dopočítal (`loadVillage`). */
  loaded: string[];
  log: string[];
}

/** Držitel `OWNER` s vsemi `states` na políčkách (i, 0); `others` – vsi jiných držitelů. */
async function world(
  states: VillageState[],
  others: { ownerId: string; state: VillageState }[] = [],
): Promise<World> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const rounds = new InMemoryDomainFood();
  const ids: string[] = [];
  for (const [i, state] of states.entries()) {
    const s =
      i === 0
        ? await settlements.seatAtOrigin({
            ownerId: OWNER,
            landscapeSeed: 11,
            layerVersions: CURRENT_LAYER_VERSIONS,
          })
        : (await settlements.create({
            ownerId: OWNER,
            landscapeSeed: 11 + i,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: { x: i, y: 0 },
          }))!;
    ids.push((await villages.add(s.id, `Ves ${i}`, state)).id);
  }
  for (const [i, other] of others.entries()) {
    const s = (await settlements.create({
      ownerId: other.ownerId,
      landscapeSeed: 50 + i,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 0, y: 10 + i },
    }))!;
    await villages.add(s.id, `Cizí ${i}`, other.state);
  }
  const loaded: string[] = [];
  const log: string[] = [];
  return {
    deps: {
      settlements,
      villages,
      loadVillage: async (villageId) => {
        loaded.push(villageId);
        return villages.find(villageId);
      },
      shipments: {
        shipments,
        villages,
        settlements,
        locks: new InMemoryPlayerLock(),
        now: () => new Date(0),
      },
      rounds,
      log: (message) => log.push(message),
    },
    villages,
    shipments,
    settlements,
    rounds,
    ids,
    loaded,
    log,
  };
}

/** Zásilky bez proměnných částí (id řádku) – na porovnání dvou světů. */
function sent(
  w: World,
): Pick<ShipmentRecord, 'fromVillageId' | 'toVillageId' | 'refId' | 'body'>[] {
  return w.shipments.rows.map(({ fromVillageId, toVillageId, refId, body }) => ({
    fromVillageId,
    toVillageId,
    refId,
    body,
  }));
}

/** Jídlo zásilky v kg obilí (obilí + dobytek k porážce). */
function foodKg(r: ShipmentRecord): number {
  return r.body.grainKg + cattleFoodKg(r.body.cattle);
}

describe('sendDomainFood', () => {
  it('(a) dárce po výmlatu pošle potřebné vsi jídlo domény a kolo uzavře', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    const [a, b] = w.ids as [string, string];
    const need = domainNeedKg((await w.villages.find(b))!.state, OCT_2);
    expect(need).toBeGreaterThan(25);
    await sendDomainFood(w.deps, { today: OCT_2 });

    expect(w.shipments.rows).toHaveLength(1);
    const row = w.shipments.rows[0]!;
    expect(row).toMatchObject({
      fromVillageId: a,
      toVillageId: b,
      purpose: DOMAIN_FOOD_PURPOSE,
      refId: domainFoodRef(600, a, b),
      sentDay: OCT_2,
    });
    expect(row.refId).toBe(`domain:600:${a}:${b}`);
    expect(row.body.domain).toBe(true);
    expect(row.body.grainKg).toBe(Math.floor(need));
    // událost ve schránce cílové vsi nese značku domény
    const events = await w.villages.inbox.pending(b, 0, OCT_2 + 100);
    expect(events).toHaveLength(1);
    expect(events[0]!.body).toMatchObject({ kind: 'shipment', shipment: { domain: true } });
    // dárce obilí poslal, obě vsi letos rozhodly (B s prázdným plánem) a kola jsou uzavřená
    expect((await w.villages.find(a))!.state.storesKg).toBe(RICH - Math.floor(need));
    expect(w.rounds.rows.map((r) => [r.villageId, r.deliveries.length])).toEqual([
      [a, 1],
      [b, 0],
    ]);
    expect(w.rounds.rows.every((r) => r.finishedAt !== null && r.year === 600)).toBe(true);
    expect(w.log).toEqual([]);
  });

  it('(b) druhé spuštění téhož dne nic nového nepošle ani nenačte', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    await sendDomainFood(w.deps, { today: OCT_2 });
    const rows = structuredClone(w.shipments.rows);
    const rounds = structuredClone(w.rounds.rows);
    w.loaded.length = 0;
    await sendDomainFood(w.deps, { today: OCT_2 });
    await sendDomainFood(w.deps, { today: OCT_2 + 3 });
    expect(w.shipments.rows).toEqual(rows);
    expect(w.rounds.rows).toEqual(rounds);
    expect(w.loaded).toEqual([]);
  });

  it('(c) plán zapsaný před pádem se pošle uložený a právě jednou', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    const [a, b] = w.ids as [string, string];
    // pád po zápisu plánu: řádek kola bez zásilky a bez `finish`
    const planned = {
      villageId: a,
      year: 600,
      day: OCT_2 - 1,
      deliveries: [
        { toVillageId: b, grainKg: 500, cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 } },
      ],
    };
    await w.rounds.reserve(planned);
    await sendDomainFood(w.deps, { today: OCT_2 });

    const fromA = w.shipments.rows.filter((r) => r.fromVillageId === a);
    expect(fromA).toHaveLength(1);
    // uložený plán (500 kg), ne nově spočítaná potřeba
    expect(fromA[0]).toMatchObject({ refId: domainFoodRef(600, a, b), sentDay: OCT_2 });
    expect(fromA[0]!.body.grainKg).toBe(500);
    expect(w.rounds.rows.find((r) => r.villageId === a)).toMatchObject({
      day: OCT_2 - 1,
      deliveries: planned.deliveries,
    });
    expect(w.rounds.rows.every((r) => r.finishedAt !== null)).toBe(true);

    // pád po odeslání a před `finish` → opakování zásilku nezdvojí
    w.rounds.rows.find((r) => r.villageId === a)!.finishedAt = null;
    await sendDomainFood(w.deps, { today: OCT_2 + 1 });
    expect(w.shipments.rows.filter((r) => r.fromVillageId === a)).toHaveLength(1);
    expect(await w.villages.inbox.pending(b, 0, OCT_2 + 100)).toHaveLength(1);
    expect(w.rounds.rows.every((r) => r.finishedAt !== null)).toBe(true);
  });

  it('(d) dva dárci v jednom kole – druhý vidí jídlo na cestě a potřebnou ves nepřekrmí', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, RICH), village(OCT_2, POOR)]);
    const [a1, a2, b] = w.ids as [string, string, string];
    const need = domainNeedKg((await w.villages.find(b))!.state, OCT_2);
    await sendDomainFood(w.deps, { today: OCT_2 });

    const toB = w.shipments.rows.filter((r) => r.toVillageId === b);
    const total = toB.reduce((sum, r) => sum + foodKg(r), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(need);
    // první dárce (nižší id) pokryl potřebu, druhý nic neposlal
    expect(toB.map((r) => r.fromVillageId)).toEqual([a1]);
    expect(w.rounds.rows.find((r) => r.villageId === a2)!.deliveries).toEqual([]);
  });

  it('(d) dárce, který potřebu nepokryje, nechá zbytek druhému', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, RICH), village(OCT_2, POOR)]);
    const [a1, a2, b] = w.ids as [string, string, string];
    const need = domainNeedKg((await w.villages.find(b))!.state, OCT_2);
    // první dárce dá jen 100 kg (uložený plán z dřívějšího dne kola)
    await w.rounds.reserve({
      villageId: a1,
      year: 600,
      day: OCT_2,
      deliveries: [
        { toVillageId: b, grainKg: 100, cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 } },
      ],
    });
    await sendDomainFood(w.deps, { today: OCT_2 });

    const toB = w.shipments.rows.filter((r) => r.toVillageId === b);
    expect(toB.map((r) => [r.fromVillageId, r.body.grainKg])).toEqual([
      [a1, 100],
      [a2, Math.floor(need - 100)],
    ]);
  });

  it('(e) pořadí, v jakém úložiště vrací držitele, sídla a souhrny, výsledek nemění', async () => {
    const states = (): VillageState[] => [
      village(OCT_2, RICH),
      village(OCT_2, POOR),
      village(OCT_2, RICH),
      village(OCT_2, 2_000),
    ];
    const straight = await world(states());
    await sendDomainFood(straight.deps, { today: OCT_2 });

    const reversed = await world(states());
    const { settlements, villages } = reversed.deps;
    reversed.deps.settlements = {
      ownersWithManyActive: async () => (await settlements.ownersWithManyActive()).reverse(),
      listActive: async (ownerId) => (await settlements.listActive(ownerId)).reverse(),
    };
    reversed.deps.villages = {
      stampsOf: async (ids) => (await villages.stampsOf([...ids].reverse())).reverse(),
      digestsOf: async (ids) => (await villages.digestsOf([...ids].reverse())).reverse(),
    };
    await sendDomainFood(reversed.deps, { today: OCT_2 });

    expect(sent(straight).length).toBeGreaterThan(0);
    expect(sent(reversed)).toEqual(sent(straight));
  });

  it('(f) držitel s jednou vsí, ves před výmlatem a spící příjemce – nic a bez dopočtu', async () => {
    // držitel s jedinou vsí (vedle domény s vsí před výmlatem)
    const single = await world(
      [village(FEB_1, RICH), village(FEB_1, POOR)],
      [{ ownerId: 'samotar', state: village(FEB_1, RICH) }],
    );
    await sendDomainFood(single.deps, { today: FEB_1 });
    expect(single.shipments.rows).toEqual([]);
    expect(single.rounds.rows).toEqual([]);
    expect(single.loaded).toEqual([]);

    // spící (vymřelá) ves se nepočítá – doména jedné vsi
    const extinct = village(OCT_2, POOR);
    extinct.extinctDay = OCT_2 - 10;
    const sleeping = await world([village(OCT_2, RICH), extinct]);
    await sendDomainFood(sleeping.deps, { today: OCT_2 });
    expect(sleeping.shipments.rows).toEqual([]);
    expect(sleeping.rounds.rows).toEqual([]);
    expect(sleeping.loaded).toEqual([]);
  });

  it('(g) dárce, který po dopočtu nevyjde, se zkusí znovu nejdřív další herní den', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    const attempts = new Map<string, number>();
    w.deps.attempts = attempts;
    let calls = 0;
    w.deps.loadVillage = async () => {
      calls += 1;
      return null; // ves se nenačetla
    };
    await sendDomainFood(w.deps, { today: OCT_2 });
    expect(calls).toBeGreaterThan(0);
    expect(w.rounds.rows).toEqual([]);
    expect(attempts.size).toBeGreaterThan(0);
    expect([...new Set(attempts.values())]).toEqual([OCT_2]);
    // další minuta téhož herního dne – bez dopočtu
    const before = calls;
    await sendDomainFood(w.deps, { today: OCT_2 });
    expect(calls).toBe(before);
    // další herní den se zkusí znovu
    await sendDomainFood(w.deps, { today: OCT_2 + 1 });
    expect(calls).toBeGreaterThan(before);
  });

  it('ves s jídlem na cestě, které potřebu kryje, nic nedostane', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR), village(OCT_2, RICH)]);
    const [a, b, c] = w.ids as [string, string, string];
    const need = domainNeedKg((await w.villages.find(b))!.state, OCT_2);
    // jídlo domény z dřívějška na cestě do B (třeba z vsi jiného držitele)
    await w.shipments.reserve({
      fromVillageId: c,
      toVillageId: b,
      body: {
        key: 'x',
        fromVillageId: c,
        fromName: 'C',
        direction: 'N',
        purpose: DOMAIN_FOOD_PURPOSE,
        domain: true,
        grainKg: Math.ceil(need),
        hayKg: 0,
        logs: 0,
        cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
        horses: [],
        groups: [],
      },
      purpose: DOMAIN_FOOD_PURPOSE,
      refId: 'jinde',
      sentDay: OCT_2 - 1,
      arrivesDay: OCT_2 + 3,
    });
    await w.shipments.markPosted(w.shipments.rows[0]!.id, new Date(0));
    await sendDomainFood(w.deps, { today: OCT_2 });
    expect(w.shipments.rows.filter((r) => r.refId !== 'jinde')).toEqual([]);
    expect(w.rounds.rows.find((r) => r.villageId === a)!.deliveries).toEqual([]);
  });
});

describe('runWorldTasks – jídlo domény', () => {
  it('(g) bez `domainFood` beze změny, s ním pošle jídlo domény', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    const base = {
      invites: new InMemoryInvites(),
      activity: new InMemoryActivity(),
      credits: new InMemoryCredits(),
      notices: new InMemoryNotices(),
      houses: new InMemoryHouses(),
    };
    await runWorldTasks(base, { now: new Date(0), today: OCT_2 });
    expect(w.shipments.rows).toEqual([]);
    expect(w.rounds.rows).toEqual([]);
    expect(w.loaded).toEqual([]);

    await runWorldTasks({ ...base, domainFood: w.deps }, { now: new Date(0), today: OCT_2 });
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]!.purpose).toBe(DOMAIN_FOOD_PURPOSE);
  });
});

describe('sendDomainFood s posunem času hráče', () => {
  it('dárce pošle jídlo v den a rok svého držitele', async () => {
    const w = await world([village(OCT_2, RICH), village(OCT_2, POOR)]);
    const [a, b] = w.ids as [string, string];
    const offsets = new InMemoryTimeOffsets();
    offsets.offsets.set(OWNER, 400);
    await sendDomainFood({ ...w.deps, offsets }, { today: OCT_2 - 400 });
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]).toMatchObject({
      fromVillageId: a,
      toVillageId: b,
      refId: domainFoodRef(600, a, b),
      sentDay: OCT_2,
    });
  });
});
