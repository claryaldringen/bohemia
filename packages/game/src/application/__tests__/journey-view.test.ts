import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, type StreamPoint } from '../../domain/landscape';
import { horse, horseVillage } from '../../domain/village/__tests__/horse-fixtures';
import type { Dwelling } from '../../domain/village/types';
import {
  hoursPerTick,
  INTENT_LEAD_TICKS,
  JOURNEY,
  tickOfMs,
  type CampaignMap,
  type JourneyOrder,
  type JourneyParty,
  type JourneyState,
  type SeenCell,
  type SeenData,
} from '../../domain/war';
import { land } from '../../domain/war/__tests__/battle-fixtures';
import { InMemoryKnowledge } from './in-memory-knowledge';
import {
  commandJourney,
  expeditionVisitorsOn,
  journeyViewFor,
  visitorsOn,
  type JourneyCommandDeps,
  type VisitorsDeps,
} from '../journey-view';
import { launchJourney, type LaunchJourneyDeps } from '../launch-journey';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Rozkazy a pohled na výjezd (lord-control.md – Rozkazy, Na místě a návrat, Soused; plán
// 2026-11-13 – Úloha 5).

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
const NOW_MS = NOW.getTime();
const MAP: CampaignMap = { landscape: land(), obstacles: null, villageIds: [] };
// řeka bez brodu od severu k jihu (svět x ≈ 247,5 m) – skupina v ní nedojde nikam
const river: StreamPoint[] = Array.from({ length: 128 }, (_, y) => ({
  x: 80,
  y: 127 - y,
  halfWidthLeft: 1,
  halfWidthRight: 1,
  level: 5 - y / 127,
  shallow: false,
  bankLeft: 0,
  bankRight: 0,
}));
const RIVER_MAP: CampaignMap = {
  landscape: { ...land(() => false), rivers: [river] },
  obstacles: null,
  villageIds: [],
};

function ownVillage(): ReturnType<typeof horseVillage> {
  const s = horseVillage([{ ...horse(1, 6), riderId: 12 }], 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  s.people.find((p) => p.id === 12)!.name = 'Radim';
  s.dynasty = { lordId: 10, lords: [] };
  return s;
}

async function setup(map: CampaignMap = MAP): Promise<{
  deps: JourneyCommandDeps & VisitorsDeps & LaunchJourneyDeps;
  journeys: InMemoryJourneys;
  war: { value: boolean; asked: unknown[] };
  homeId: string;
  hostId: string;
  id: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const houseA = await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  await houses.create({ playerId: 'pb', kind: 'player', createdAt: NOW });
  const sa = await settlements.seatAtOrigin({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const sb = (await settlements.create({
    ownerId: 'pb',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  }))!;
  const home = await villages.add(sa.id, 'Lhota', ownVillage());
  // hlavou rodu (jeho jménem se rod jmenuje) je Radim, na výjezdu jede vojvoda Bořivoj
  await houses.setLord(houseA.id, { villageId: home.id, personId: 12 });
  const hostState = ownVillage();
  hostState.people.find((p) => p.id === 10)!.name = 'Mojmír';
  // jediný dům hostitele ve středu mapy
  hostState.dwellings = [
    { ...hostState.dwellings[0]!, position: { x: 0, z: 0, rotation: 0 } } as Dwelling,
  ];
  const host = await villages.add(sb.id, 'Kněžice', hostState);
  const journeys = new InMemoryJourneys();
  const war = { value: false, asked: [] as unknown[] };
  const deps: JourneyCommandDeps & VisitorsDeps & LaunchJourneyDeps = {
    houses,
    villages,
    settlements,
    campaigns: new InMemoryCampaigns(),
    journeys,
    cells: { mapOf: () => Promise.resolve(map) },
    world: OFFICIAL_WORLD,
    seeds: { nextSeed: () => 77 },
    newId: () => 'jny-1',
    atWar: (playerId, cell) => {
      war.asked.push([playerId, cell]);
      return Promise.resolve(war.value);
    },
  };
  const launched = await launchJourney(deps, {
    playerId: 'pa',
    villageId: home.id,
    retinue: [12],
    order: { kind: 'go', pos: { x: 100, z: 100 } },
    now: NOW,
  });
  if (!launched.ok) throw new Error(launched.reason);
  return { deps, journeys, war, homeId: home.id, hostId: host.id, id: launched.journeyId };
}

/** Přepíše uložený stav výjezdu. */
function patch(journeys: InMemoryJourneys, id: string, edit: (s: JourneyState) => void): void {
  const row = journeys.rows.get(id)!;
  const state = JSON.parse(row.state) as JourneyState;
  edit(state);
  row.state = JSON.stringify(state);
}

const cmd = (
  deps: Parameters<typeof commandJourney>[0],
  command: Parameters<typeof commandJourney>[1]['command'],
  playerId = 'pa',
): ReturnType<typeof commandJourney> => commandJourney(deps, { playerId, command, nowMs: NOW_MS });

describe('journeyViewFor', () => {
  it('hráč bez výjezdu a cizí hráč na můj výjezd – null', async () => {
    const w = await setup();
    expect(await journeyViewFor(w.deps, { playerId: 'pb' })).toBeNull();
    expect(await journeyViewFor(w.deps, { playerId: 'nikdo' })).toBeNull();
  });

  it('pohled na vlastní výjezd – muži, skupina, domov; vojvoda žije', async () => {
    const w = await setup();
    const v = (await journeyViewFor(w.deps, { playerId: 'pa' }))!;
    expect(v).toMatchObject({
      journeyId: w.id,
      phase: 'out',
      home: { x: 0, y: 0 },
      cell: { x: 0, y: 0 },
      waitDaysLeft: null,
      controllable: true,
    });
    expect(v.men).toEqual([
      { personId: 10, lord: true, mounted: false, wounded: false },
      { personId: 12, lord: false, mounted: true, wounded: false },
    ]);
    expect(v.group.arrived).toBe(false);
    expect(v.group.goal).not.toBeNull();
  });

  it('čekání na místě – zbývají celé dny 3, 2, 1; za jízdy a při návratu null', async () => {
    const w = await setup();
    const perDay = 24 / hoursPerTick(OFFICIAL_WORLD);
    const at = async (elapsedDays: number, phase: JourneyParty['phase'] = 'out') => {
      patch(w.journeys, w.id, (s) => {
        s.parties[0]!.arrivedTick = 1000;
        s.tick = 1000 + Math.round(elapsedDays * perDay);
        s.parties[0]!.phase = phase;
        s.groups[0]!.arrived = true;
      });
      return (await journeyViewFor(w.deps, { playerId: 'pa' }))!.waitDaysLeft;
    };
    expect(await at(0)).toBe(JOURNEY.waitDays);
    expect(await at(0.5)).toBe(3);
    expect(await at(1.2)).toBe(2);
    expect(await at(2.5)).toBe(1);
    expect(await at(0, 'returning')).toBeNull();
  });

  it('padlý vojvoda – nelze řídit, padlý muž se neukazuje', async () => {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      s.members[0]!.status = 'fallen';
      s.members[1]!.wounded = true;
    });
    const v = (await journeyViewFor(w.deps, { playerId: 'pa' }))!;
    expect(v.controllable).toBe(false);
    expect(v.men).toEqual([{ personId: 12, lord: false, mounted: true, wounded: true }]);
  });

  it('seen – co rod ví o mapě, na které skupina je; na domovské mapě null', async () => {
    const w = await setup();
    expect((await journeyViewFor(w.deps, { playerId: 'pa' }))!.seen).toBeNull();
    const east: SeenCell = { villageId: w.hostId, trail: [[-940, 0]], parts: [] };
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.cell = { x: 1, y: 0 };
      s.seen = { '1,0': east, '2,0': { trail: [[0, 0]], parts: [] } };
    });
    expect((await journeyViewFor(w.deps, { playerId: 'pa' }))!.seen).toEqual(east);
  });

  it('druhý výjezd na známou mapu – od prvního taktu stopa i stavby z prvního (Úloha 11)', async () => {
    const w = await setup();
    const knowledge = new InMemoryKnowledge();
    const deps = { ...w.deps, knowledge };
    const houseId = (JSON.parse(w.journeys.rows.get(w.id)!.state) as JourneyState).houseId;
    // první výjezd viděl dům hostitele – schránka bodu doručila znalost rodu (`deliverOutbox`)
    const first: SeenCell = {
      villageId: w.hostId,
      trail: [
        [-940, 0],
        [-920, 0],
      ],
      parts: [
        { key: 'dwelling:1', pos: { x: 0, z: 0 }, day: 3, data: { kind: 'dwelling' } as SeenData },
      ],
    };
    await knowledge.merge(houseId, { x: 1, y: 0 }, first);
    // cizí rod o téže mapě ví něco jiného – do pohledu nejde
    await knowledge.merge('cizi-rod', { x: 1, y: 0 }, { trail: [[0, 400]], parts: [] });
    // druhý výjezd: na domovské mapě znalost nečte, za okrajem ji má dřív, než se rozhlédne
    expect((await journeyViewFor(deps, { playerId: 'pa' }))!.seen).toBeNull();
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.cell = { x: 1, y: 0 };
      delete s.seen;
    });
    expect((await journeyViewFor(deps, { playerId: 'pa' }))!.seen).toEqual(first);
    // co výjezd viděl teď, se ke znalosti rodu přidá (`mergeKnowledge`)
    patch(w.journeys, w.id, (s) => {
      s.seen = { '1,0': { villageId: w.hostId, trail: [[-900, 0]], parts: [] } };
    });
    expect((await journeyViewFor(deps, { playerId: 'pa' }))!.seen).toEqual({
      ...first,
      trail: [
        [-940, 0],
        [-920, 0],
        [-900, 0],
      ],
    });
  });
});

describe('commandJourney', () => {
  const order = { kind: 'go' as const, pos: { x: 50, z: 50 } };

  it('zařadí záměr na takt teď + INTENT_LEAD_TICKS od hráče', async () => {
    const w = await setup();
    const r = await cmd(w.deps, order);
    const tick = tickOfMs(NOW_MS, OFFICIAL_WORLD) + INTENT_LEAD_TICKS;
    expect(r).toEqual({ queued: true, tick });
    expect(w.journeys.intents).toHaveLength(1);
    expect(w.journeys.intents[0]).toMatchObject({ tick, byPlayer: 'pa', body: order });
    expect((await cmd(w.deps, { kind: 'home' })).queued).toBe(true);
  });

  it('bez výjezdu a cizí hráč – refused, nic se nezapíše', async () => {
    const w = await setup();
    expect(await cmd(w.deps, order, 'pb')).toEqual({ queued: false, reason: 'refused' });
    w.journeys.rows.get(w.id)!.status = 'done';
    expect(await cmd(w.deps, order)).toEqual({ queued: false, reason: 'refused' });
    expect(w.journeys.intents).toHaveLength(0);
  });

  it('po smrti vojvody – refused', async () => {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      s.members[0]!.status = 'fallen';
    });
    expect(await cmd(w.deps, { kind: 'home' })).toEqual({ queued: false, reason: 'refused' });
    expect(w.journeys.intents).toHaveLength(0);
  });

  it('go mimo mapu nebo s nekonečným číslem a cross na nesousední políčko – refused', async () => {
    const w = await setup();
    const bad = [
      { kind: 'go' as const, pos: { x: Number.NaN, z: 0 } },
      { kind: 'go' as const, pos: { x: Infinity, z: 0 } },
      { kind: 'go' as const, pos: { x: 1e7, z: 0 } },
      { kind: 'cross' as const, cell: { x: 5, y: 5 } },
      { kind: 'cross' as const, cell: { x: 0, y: 0 } },
      { kind: 'cross' as const, cell: { x: Number.NaN, y: 0 } },
    ];
    for (const b of bad) expect(await cmd(w.deps, b)).toEqual({ queued: false, reason: 'refused' });
    expect(w.journeys.intents).toHaveLength(0);
  });

  it('rozkaz neznámého druhu – refused, atWar se neptá, nic se nezapíše', async () => {
    const w = await setup();
    const unknown = { kind: 'attack' } as unknown as JourneyOrder;
    w.war.asked.length = 0; // dotaz z vyslání
    expect(await cmd(w.deps, unknown)).toEqual({ queued: false, reason: 'refused' });
    expect(w.war.asked).toHaveLength(0);
    expect(w.journeys.intents).toHaveLength(0);
  });

  it('cross se měří od políčka, kde skupina právě je', async () => {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.cell = { x: 3, y: 3 };
    });
    expect((await cmd(w.deps, { kind: 'cross', cell: { x: 4, y: 3 } })).queued).toBe(true);
    expect(await cmd(w.deps, { kind: 'cross', cell: { x: 1, y: 0 } })).toEqual({
      queued: false,
      reason: 'refused',
    });
  });

  it('cross na políčko se vsí rodu ve válce – war-there; domů válka nebrání', async () => {
    const w = await setup();
    w.war.value = true;
    const cross = { kind: 'cross' as const, cell: { x: 1, y: 0 } };
    expect(await cmd(w.deps, cross)).toEqual({ queued: false, reason: 'war-there' });
    expect(w.war.asked).toContainEqual(['pa', { x: 1, y: 0 }]);
    expect(w.journeys.intents).toHaveLength(0);
    expect((await cmd(w.deps, { kind: 'home' })).queued).toBe(true);
  });

  it('go tam, kam skupina nedojde – unreachable', async () => {
    const w = await setup(RIVER_MAP);
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.pos = { x: 245, z: 0 };
    });
    expect(await cmd(w.deps, { kind: 'go', pos: { x: 245, z: 200 } })).toEqual({
      queued: false,
      reason: 'unreachable',
    });
    expect(w.journeys.intents).toHaveLength(0);
  });
});

describe('visitorsOn', () => {
  /** Výjezd hráče `pa` stojí na mapě hostitele (1, 0) v poloze `x`. */
  async function visiting(x: number): Promise<Awaited<ReturnType<typeof setup>>> {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.cell = { x: 1, y: 0 };
      s.groups[0]!.pos = { x, z: 0 };
      s.groups[0]!.goal = { cell: { x: 1, y: 0 }, pos: { x: x + 10, z: 5 } };
    });
    return w;
  }

  it('cizí jezdec v dohledu domů hostitele – jméno vojvody a rodu, muži bez osobních údajů', async () => {
    const w = await visiting(40);
    const r = await visitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId });
    expect(r).toEqual([
      {
        journeyId: w.id,
        own: false,
        leader: 'Bořivoj',
        house: 'Radim',
        tick: expect.any(Number),
        pos: { x: 40, z: 0 },
        // cíl cizího výjezdu hostitel nedostane – návrh dovoluje jen jméno a rod
        goal: null,
        men: [
          { lord: true, mounted: false },
          { lord: false, mounted: true },
        ],
      },
    ]);
  });

  it('cizí jezdec za dohledem lidí a domů – neviditelný, vlastní vždy', async () => {
    const w = await visiting(900);
    expect(await visitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId })).toEqual([]);
    const own = await visitorsOn(w.deps, { playerId: 'pa', villageId: w.homeId });
    expect(own).toEqual([]); // vlastní výjezd je na cizí mapě, ne na mapě domovské vsi
  });

  it('vlastní výjezd na mapě vlastní vsi je vidět vždy, i daleko od domů', async () => {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      s.groups[0]!.pos = { x: 900, z: 0 };
    });
    const r = await visitorsOn(w.deps, { playerId: 'pa', villageId: w.homeId });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ own: true, leader: 'Bořivoj', pos: { x: 900, z: 0 } });
  });

  it('cizí ves hráče – prázdný seznam', async () => {
    const w = await visiting(40);
    expect(await visitorsOn(w.deps, { playerId: 'pa', villageId: w.hostId })).toEqual([]);
    expect(await visitorsOn(w.deps, { playerId: 'pb', villageId: w.homeId })).toEqual([]);
    expect(await visitorsOn(w.deps, { playerId: 'pb', villageId: 'neexistuje' })).toEqual([]);
  });

  it('hráč na vlastní mapě bez návštěvy – prázdno', async () => {
    const w = await setup();
    expect(await visitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId })).toEqual([]);
  });
});

describe('expeditionVisitorsOn', () => {
  /** Dvě skupiny výpravy hráče `pa` na mapě hostitele: vojvoda u domu (x = 40), Radim daleko (x = 900). */
  async function twoParties(): Promise<Awaited<ReturnType<typeof setup>>> {
    const w = await setup();
    patch(w.journeys, w.id, (s) => {
      const first = s.groups[0]!;
      first.cell = { x: 1, y: 0 };
      first.pos = { x: 40, z: 0 };
      first.goal = { cell: { x: 1, y: 0 }, pos: { x: 50, z: 5 } };
      const far = structuredClone(first);
      far.id = 9;
      far.party = 9;
      far.pos = { x: 900, z: 0 };
      s.groups.push(far);
      s.parties.push({ id: 9, phase: 'out', arrivedTick: null });
      s.members.find((m) => m.ref.personId === 12)!.group = 9;
      s.members.find((m) => m.ref.personId === 12)!.horse = 'led';
      s.nextId = 10;
    });
    return w;
  }

  it('hostitel vidí jen skupinu, jejíž hlouček je v dohledu; bez cíle a osobních údajů', async () => {
    const w = await twoParties();
    const r = await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: w.hostId });
    expect(r).toEqual([
      {
        journeyId: w.id,
        partyId: 0,
        own: false,
        leaderName: 'Bořivoj',
        houseName: 'Radim',
        tick: expect.any(Number),
        groups: [{ id: 0, pos: { x: 40, z: 0 }, goal: null }],
        people: [
          { personId: 10, lord: true, mounted: false, led: false, female: false, child: false },
        ],
      },
    ]);
  });

  it('vlastní skupina je vidět vždy i s cílem; ve výsledku jen hloučky na této mapě', async () => {
    const w = await twoParties();
    patch(w.journeys, w.id, (s) => {
      // druhá skupina má hlouček na domovské mapě (daleko od domů) a druhý na mapě hostitele
      const far = s.groups.find((g) => g.id === 9)!;
      far.cell = { x: 0, y: 0 };
      far.goal = { cell: { x: 0, y: 0 }, pos: { x: 910, z: 5 } };
      s.groups.push({ ...structuredClone(s.groups[0]!), id: 11, party: 9 });
    });
    const mine = await expeditionVisitorsOn(w.deps, { playerId: 'pa', villageId: w.homeId });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ partyId: 9, own: true });
    expect(mine[0]!.groups).toEqual([{ id: 9, pos: { x: 900, z: 0 }, goal: { x: 910, z: 5 } }]);
    expect(mine[0]!.people.map((p) => [p.personId, p.led])).toEqual([[12, true]]);
  });

  it('cizí ves hráče a ves bez návštěvy – prázdno', async () => {
    const w = await twoParties();
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pa', villageId: w.hostId })).toEqual([]);
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: w.homeId })).toEqual([]);
    expect(await expeditionVisitorsOn(w.deps, { playerId: 'pb', villageId: 'nic' })).toEqual([]);
  });
});
