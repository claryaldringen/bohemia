import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { foundVillage, type ChronicleEvent } from '../../domain/village';
import { FAITH } from '../../domain/village/rules/rules-faith';
import {
  advanceChristianity,
  sendRodBaptized,
  type ChristianityDeps,
} from '../advance-christianity';
import type { House } from '../houses';
import { runWorldTasks } from '../succession-credits';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Objev křesťanství a křest NPC rodů – roční úloha světa (christianity.md – Objev křesťanství,
// Křest rodu; plán 2026-11-10 – K3, Review Focus 3).

const WORLD_SEED = 4242;
const firstDay = (year: number): number => dayIndexOf({ year, month: 1, day: 1 });
/** Herní den okamžiku v testu: 1 s = 1 herní den (composition root má `worldDayOf`). */
const dayOf = (at: Date): number => Math.floor(at.getTime() / 1000);
const atDay = (day: number): Date => new Date(day * 1000);

interface World {
  deps: ChristianityDeps;
  houses: InMemoryHouses;
  villages: InMemoryVillages;
  notices: InMemoryNotices;
  stewardships: InMemoryStewardships;
  players: House[];
  npcs: House[];
  /** Ves vojvody hráčova rodu (id rodu → id vsi). */
  seats: Map<string, string>;
}

/**
 * Svět s `players` rody hráčů a `npcs` NPC rody (každý spravuje ves držitele – prvního hráče
 * v pořadí), všechny založené ve dni `foundedDay`.
 */
async function world(players: number, npcs: number, foundedDay: number): Promise<World> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const vassalages = new InMemoryVassalages();
  const stewardships = new InMemoryStewardships();
  const notices = new InMemoryNotices();
  const seats = new Map<string, string>();
  const playerHouses: House[] = [];
  const npcHouses: House[] = [];
  let cell = 0;
  const village = async (ownerId: string): Promise<string> => {
    const settlement = await settlements.create({
      ownerId,
      landscapeSeed: 100 + cell,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: cell++, y: 0 },
    });
    const state = foundVillage({
      seed: cell,
      day: foundedDay,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    return (await villages.add(settlement!.id, `Ves ${cell}`, state)).id;
  };
  for (let i = 0; i < players; i++) {
    const house = await houses.create({
      playerId: `hrac-${i}`,
      kind: 'player',
      createdAt: atDay(foundedDay),
    });
    const villageId = await village(`hrac-${i}`);
    await houses.setLord(house.id, { villageId, personId: 1 });
    seats.set(house.id, villageId);
    playerHouses.push(house);
  }
  for (let i = 0; i < npcs; i++) {
    const holder = playerHouses[0]!;
    const npc = await houses.create({ playerId: null, kind: 'npc', createdAt: atDay(foundedDay) });
    const v = await vassalages.create({
      lordHouseId: holder.id,
      vassalHouseId: npc.id,
      terms: {},
      origin: 'ennoble',
      sinceAt: atDay(foundedDay),
      sinceDay: foundedDay,
    });
    await stewardships.start({
      villageId: await village(holder.playerId!),
      stewardHouseId: npc.id,
      holderHouseId: holder.id,
      kind: 'npc',
      vassalageId: v.id,
      since: atDay(foundedDay),
    });
    npcHouses.push(npc);
  }
  const deps: ChristianityDeps = {
    houses,
    settlements,
    villages,
    vassalages,
    stewardships,
    notices,
    worldSeed: WORLD_SEED,
    dayOf,
  };
  return {
    deps,
    houses,
    villages,
    notices,
    stewardships,
    players: playerHouses,
    npcs: npcHouses,
    seats,
  };
}

/** Víra rodů – co úloha zapisuje do rodu. */
function faithOf(w: World): { id: string; known: number | null; baptized: number | null }[] {
  return w.houses.houses.map((h) => ({
    id: h.id,
    known: h.christianityKnownYear,
    baptized: h.baptizedDay,
  }));
}

function chronicleEvents(w: World, kind: string): { villageId: string; event: ChronicleEvent }[] {
  return w.villages.inbox.events.flatMap((e) =>
    e.body.kind === 'chronicle' && e.body.event.kind === kind
      ? [{ villageId: e.villageId, event: e.body.event }]
      : [],
  );
}

describe('advanceChristianity – přehrání losu za rody, které už žijí', () => {
  it('jeden běh v roce 870 za rody z roku 520 = smyčka rok po roku', async () => {
    const founded = firstDay(520);
    const today = firstDay(870) + 40;
    const once = await world(30, 10, founded);
    const result = await advanceChristianity(once.deps, today);

    const yearly = await world(30, 10, founded);
    let known = 0;
    let npcBaptized = 0;
    for (let year = 520; year <= 870; year++) {
      const r = await advanceChristianity(yearly.deps, year === 870 ? today : firstDay(year));
      known += r.known;
      npcBaptized += r.npcBaptized;
    }

    expect(faithOf(once)).toEqual(faithOf(yearly));
    expect({ known, npcBaptized }).toEqual(result);
    // los dává smysl: v roce 870 zná většina rodů, ne však všechny; NPC rody se křtí
    expect(result.known).toBeGreaterThan(25);
    expect(result.known).toBeLessThan(40);
    expect(result.npcBaptized).toBeGreaterThan(0);
  });

  it('druhý běh téhož dne nic nezapíše ani nepošle (idempotence)', async () => {
    const w = await world(30, 10, firstDay(520));
    const today = firstDay(870) + 40;
    await advanceChristianity(w.deps, today);
    const houses = structuredClone(faithOf(w));
    const notices = w.notices.notices.length;
    const events = w.villages.inbox.events.length;

    expect(notices).toBeGreaterThan(0);
    expect(events).toBeGreaterThan(0);

    // nový proces workeru (bez paměti roku) – stačí zápisy v rodu
    expect(await advanceChristianity(w.deps, today)).toEqual({ known: 0, npcBaptized: 0 });
    expect(faithOf(w)).toEqual(houses);
    expect(w.notices.notices).toHaveLength(notices);
    expect(w.villages.inbox.events).toHaveLength(events);
  });

  it('rod založený během roku losuje poprvé příští 1. 1.', async () => {
    const w = await world(30, 0, firstDay(869) + 100);
    // los roku 869 platí jen pro rody, které 1. 1. 869 žily – v roce založení se nelosuje
    await advanceChristianity(w.deps, firstDay(869) + 200);
    expect(w.houses.houses.every((h) => h.christianityKnownYear === null)).toBe(true);
    await advanceChristianity(w.deps, firstDay(870));
    expect(w.houses.houses.every((h) => (h.christianityKnownYear ?? 870) === 870)).toBe(true);
  });

  it('upozornění a kronika ve vsi vojvody jen jednou, NPC rod upozornění ani kroniku nemá', async () => {
    const w = await world(30, 10, firstDay(520));
    const today = firstDay(870) + 40;
    await advanceChristianity(w.deps, today);
    await advanceChristianity(w.deps, today + 1);

    const knowing = w.players.filter(
      (p) => w.houses.houses.find((h) => h.id === p.id)?.christianityKnownYear !== null,
    );
    const notices = w.notices.notices.filter((n) => n.kind === 'christianity-known');
    expect(notices.map((n) => n.playerId).sort()).toEqual(knowing.map((p) => p.playerId).sort());
    expect(notices.every((n) => n.gameDay === today)).toBe(true);

    const chronicle = chronicleEvents(w, 'christianity-known');
    expect(chronicle.map((c) => c.villageId).sort()).toEqual(
      knowing.map((p) => w.seats.get(p.id)).sort(),
    );
  });

  it('paměť workeru: v témže roce úloha znovu nelosuje', async () => {
    const w = await world(3, 0, firstDay(520));
    const doneYear = { year: null as number | null };
    const deps = { ...w.deps, doneYear };
    await advanceChristianity(deps, firstDay(870));
    expect(doneYear.year).toBe(870);
    // rod, který mezitím přibyl (stejného dne), se losuje až příští rok
    const late = await w.houses.create({
      playerId: 'pozdni',
      kind: 'player',
      createdAt: atDay(firstDay(520)),
    });
    expect(await advanceChristianity(deps, firstDay(870) + 100)).toEqual({
      known: 0,
      npcBaptized: 0,
    });
    expect((await w.houses.byId(late.id))?.christianityKnownYear).toBeNull();
  });
});

describe('advanceChristianity – NPC křest', () => {
  it('NPC rod známý v roce X je pokřtěný nejdřív X + 1 a nejpozději X + 20', async () => {
    const w = await world(1, 40, firstDay(520));
    await advanceChristianity(w.deps, firstDay(900));
    const npcs = w.houses.houses.filter((h) => h.kind === 'npc');
    const known = npcs.filter((h) => h.christianityKnownYear !== null);
    expect(known.length).toBeGreaterThan(30);
    for (const h of known) {
      const x = h.christianityKnownYear!;
      if (x + FAITH.npcBaptismYears.max <= 900) expect(h.baptizedDay).not.toBeNull();
      if (h.baptizedDay === null) continue;
      const year = dateOfDayIndex(h.baptizedDay).year;
      expect(year).toBeGreaterThanOrEqual(x + FAITH.npcBaptismYears.min);
      expect(year).toBeLessThanOrEqual(x + FAITH.npcBaptismYears.max);
      expect(h.baptizedDay).toBe(firstDay(year));
    }
    // hráčův rod se sám nekřtí
    expect(
      w.houses.houses.filter((h) => h.kind === 'player').every((h) => h.baptizedDay === null),
    ).toBe(true);
  });

  it('v roce objevu NPC rod ještě pokřtěný není, pokřtí se v roce křtu', async () => {
    const w = await world(1, 40, firstDay(520));
    // první rok, kdy některý NPC rod zná
    let year = 600;
    for (; year <= 900; year++) {
      await advanceChristianity(w.deps, firstDay(year));
      if (w.houses.houses.some((h) => h.kind === 'npc' && h.christianityKnownYear === year)) break;
    }
    const npc = w.houses.houses.find((h) => h.kind === 'npc' && h.christianityKnownYear === year)!;
    expect(npc.baptizedDay).toBeNull();
    for (let y = year + 1; y <= year + FAITH.npcBaptismYears.max; y++) {
      await advanceChristianity(w.deps, firstDay(y) + 5);
    }
    expect(npc.baptizedDay).not.toBeNull();
  });

  it('pokřtěný NPC rod pošle událost rod-baptized do své vsi, jednou', async () => {
    const w = await world(1, 40, firstDay(520));
    await advanceChristianity(w.deps, firstDay(900));
    await advanceChristianity(w.deps, firstDay(900) + 1);
    const baptized = w.houses.houses.filter((h) => h.kind === 'npc' && h.baptizedDay !== null);
    expect(baptized.length).toBeGreaterThan(0);
    const events = w.villages.inbox.events.filter((e) => e.body.kind === 'rod-baptized');
    expect(events.length).toBe(baptized.length);
    for (const h of baptized) {
      const [steward] = await w.stewardships.listByStewardHouse(h.id);
      expect(events.filter((e) => e.villageId === steward!.villageId)).toHaveLength(1);
      expect(events.find((e) => e.villageId === steward!.villageId)?.body).toEqual({
        kind: 'rod-baptized',
        houseId: h.id,
        npc: true,
      });
    }
  });
});

describe('sendRodBaptized', () => {
  it('hráčův rod: událost do všech jeho vsí i vsí NPC rodů, vojvoda ve své vsi; jednou', async () => {
    const w = await world(1, 2, firstDay(520));
    const player = w.players[0]!;
    await sendRodBaptized(w.deps, player.id, firstDay(700));
    await sendRodBaptized(w.deps, player.id, firstDay(700));
    const events = w.villages.inbox.events.filter((e) => e.body.kind === 'rod-baptized');
    const seat = w.seats.get(player.id)!;
    const npcRun = await Promise.all(
      w.npcs.map(async (h) => (await w.stewardships.listByStewardHouse(h.id))[0]!.villageId),
    );
    expect(events.map((e) => e.villageId).sort()).toEqual([seat, ...npcRun].sort());
    for (const e of events) {
      expect(e.body).toEqual({
        kind: 'rod-baptized',
        houseId: player.id,
        ...(e.villageId === seat ? { lord: true } : {}),
      });
    }
  });
});

describe('runWorldTasks – zapojení', () => {
  it('úlohy světa pustí los křesťanství', async () => {
    const w = await world(30, 0, firstDay(520));
    await runWorldTasks(
      {
        invites: new InMemoryInvites(),
        activity: new InMemoryActivity(),
        credits: new InMemoryCredits(),
        notices: w.notices,
        houses: w.houses,
        christianity: w.deps,
      },
      { now: new Date('2027-06-01T00:00:00Z'), today: firstDay(870) },
    );
    expect(w.houses.houses.some((h) => h.christianityKnownYear !== null)).toBe(true);
  });
});
