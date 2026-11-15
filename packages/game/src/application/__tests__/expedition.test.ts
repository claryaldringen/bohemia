import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { dwellingGatePoint } from '../../domain/village/paths/network-grid';
import { villageManor } from '../../domain/village/people/manor';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { horse, horseVillage, START, YEAR } from '../../domain/village/__tests__/horse-fixtures';
import { isAway } from '../../domain/village/people/people';
import type { Person, VillageState } from '../../domain/village/types';
import { endAway } from '../../domain/vassalage/guests';
import {
  INTENT_LEAD_TICKS,
  stepJourney,
  tickOfMs,
  type CampaignMap,
  type CampaignWorld,
  type JourneyCommand,
  type JourneyOrder,
  type JourneyState,
} from '../../domain/war';
import { land } from '../../domain/war/__tests__/battle-fixtures';
import { campaign } from '../../domain/war/__tests__/campaign-fixtures';
import {
  commandParty,
  musterExpedition,
  type ExpeditionCommand,
  type ExpeditionDeps,
  type ExpeditionInput,
} from '../expedition';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Rozkaz vybraným lidem a přidání lidí ze vsi (expeditions.md – Kdo smí jít, Výběr a skupina;
// plán 2026-11-14 – Rozhodnutí 3, 11, Review Focus 2 a 5; Úloha 5): rozdělení výběru, ověření
// příkazu, záměr bez zámku vsi a přidání lidí ze vsi se souběhem s koncem výpravy.

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
const MAP: CampaignMap = { landscape: land(), obstacles: null, villageIds: [] };
const go = (x: number, z: number): ExpeditionCommand => ({
  kind: 'order',
  order: { kind: 'go', pos: { x, z } },
});
const GO = go(100, 100);

/**
 * Lhota: vojvoda Bořivoj 10 (40), žena 11, syn Radim 12 (17, jezdecký kůň 1 v ohradě), snacha 13,
 * syn 14 (11); vesničané 20 (muž 26), 21 (žena 27), 22 (muž 28), 23 (žena 29). Dvorec v počátku.
 */
function lhota(): VillageState {
  const s = horseVillage([{ ...horse(1, 6), riderId: 12 }], 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  s.people.find((p) => p.id === 12)!.name = 'Radim';
  s.dynasty = { lordId: 10, lords: [] };
  return s;
}

interface World {
  deps: ExpeditionDeps;
  villages: InMemoryVillages;
  journeys: InMemoryJourneys;
  campaigns: InMemoryCampaigns;
  homeId: string;
}

async function setup(change?: (s: VillageState) => void): Promise<World> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  const seat = await settlements.seatAtOrigin({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const state = lhota();
  change?.(state);
  const home = await villages.add(seat.id, 'Lhota', state);
  const journeys = new InMemoryJourneys();
  const campaigns = new InMemoryCampaigns();
  let n = 0;
  const deps: ExpeditionDeps = {
    houses,
    villages,
    settlements,
    campaigns,
    journeys,
    cells: { mapOf: () => Promise.resolve(MAP) },
    world: OFFICIAL_WORLD,
    seeds: { nextSeed: () => 77 },
    newId: () => `jny-${++n}`,
    atWar: () => Promise.resolve(false),
  };
  return { deps, villages, journeys, campaigns, homeId: home.id };
}

const input = (homeId: string, people: number[], command: ExpeditionCommand): ExpeditionInput => ({
  playerId: 'pa',
  villageId: homeId,
  people,
  command,
  now: NOW,
});

async function villageOf(w: World): Promise<VillageState> {
  return (await w.villages.find(w.homeId))!.state;
}
function personOf(s: VillageState, id: number): Person {
  return s.people.find((p) => p.id === id)!;
}
async function journeyOf(w: World, id: string): Promise<JourneyState> {
  return (await w.journeys.checkpoint(id))!.state;
}
/** Uložený bod výpravy upravený jako po kroku workeru. */
function rewrite(w: World, id: string, change: (s: JourneyState) => void): void {
  const row = w.journeys.rows.get(id)!;
  const s = JSON.parse(row.state) as JourneyState;
  change(s);
  row.state = JSON.stringify(s);
}
const AWAY_1 = { kind: 'journey', refId: 'jny-1' };

describe('musterExpedition – přidání lidí ze vsi', () => {
  it('založení: dva vesničané doma → nová výprava, oba pryč se stejným refId, jedna skupina s cílem', async () => {
    const w = await setup();
    expect(await musterExpedition(w.deps, input(w.homeId, [20, 22], GO))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    const v = await villageOf(w);
    expect(personOf(v, 20).away).toEqual(AWAY_1);
    expect(personOf(v, 22).away).toEqual(AWAY_1);
    expect(personOf(v, 21).away).toBeUndefined();
    const j = await journeyOf(w, 'jny-1');
    expect(j.parties).toHaveLength(1);
    expect(j.groups).toHaveLength(1);
    expect(j.members.map((m) => [m.ref, m.group, m.lord])).toEqual([
      [{ villageId: w.homeId, personId: 20 }, 0, false],
      [{ villageId: w.homeId, personId: 22 }, 0, false],
    ]);
    expect(j.groups[0]!.goal).toEqual({ cell: { x: 0, y: 0 }, pos: { x: 100, z: 100 } });
    // vyjíždí se brankou dvorce, ne ze středu domu (D49) – dvorec bez pozemku: před vchodem
    const manor = villageManor(v)!;
    const gate = dwellingGatePoint(MAP.landscape, manor);
    expect(gate.z).toBeGreaterThan(manor.position.z + 4);
    expect(j.home).toMatchObject({
      villageId: w.homeId,
      cell: { x: 0, y: 0 },
      pos: { x: gate.x, z: gate.z },
    });
  });

  it('další skupina: druhý příkaz jiným lidem → stejná výprava, záměr s recruits, žádné druhé create', async () => {
    const w = await setup();
    await musterExpedition(w.deps, input(w.homeId, [20, 22], GO));
    expect(await musterExpedition(w.deps, input(w.homeId, [21, 23], go(50, 50)))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    expect(w.journeys.rows.size).toBe(1);
    expect(w.journeys.intents).toHaveLength(1);
    const intent = w.journeys.intents[0]!;
    expect(intent.tick).toBe(tickOfMs(NOW.getTime(), OFFICIAL_WORLD) + INTENT_LEAD_TICKS);
    const body = intent.body as Extract<JourneyCommand, { kind: 'order' }>;
    expect(body).toMatchObject({ kind: 'order', order: { kind: 'go', pos: { x: 50, z: 50 } } });
    expect(body.people).toEqual([]);
    expect(body.recruits!.map((r) => [r.ref.personId, r.female])).toEqual([
      [21, true],
      [23, true],
    ]);
    const v = await villageOf(w);
    expect(personOf(v, 21).away).toEqual(AWAY_1);
    expect(personOf(v, 23).away).toEqual(AWAY_1);
  });

  it('nezpůsobilí zůstanou doma: {dítě 8 let, raněný, zdravý} → jde jen zdravý; jen dítě → young', async () => {
    const child = (s: VillageState): void => {
      s.people.push({ ...personOf(s, 14), id: 30, bornDay: START - Math.ceil(8 * YEAR) });
      personOf(s, 22).woundedUntil = START + 5;
    };
    const w = await setup(child);
    expect(await musterExpedition(w.deps, input(w.homeId, [30, 22, 20], GO))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    const v = await villageOf(w);
    expect([20, 22, 30].map((id) => personOf(v, id).away?.refId)).toEqual([
      'jny-1',
      undefined,
      undefined,
    ]);
    expect((await journeyOf(w, 'jny-1')).members.map((m) => m.ref.personId)).toEqual([20]);

    const w2 = await setup(child);
    const before = JSON.stringify(await villageOf(w2));
    expect(await musterExpedition(w2.deps, input(w2.homeId, [30], GO))).toEqual({
      ok: false,
      reason: 'young',
    });
    expect(await musterExpedition(w2.deps, input(w2.homeId, [22, 30], GO))).toEqual({
      ok: false,
      reason: 'wounded',
    });
    expect(JSON.stringify(await villageOf(w2))).toBe(before);
    expect(w2.journeys.rows.size).toBe(0);
  });

  it('výběr, který nedává smysl (duplicita, necelé číslo, prázdný, cizí člověk), → nobody', async () => {
    const w = await setup();
    for (const people of [[20, 20], [20.5], [], [999], Array.from({ length: 201 }, (_, i) => i)]) {
      expect(await musterExpedition(w.deps, input(w.homeId, people, GO))).toEqual({
        ok: false,
        reason: 'nobody',
      });
    }
    expect(await musterExpedition(w.deps, input('cizi', [20], GO))).toEqual({
      ok: false,
      reason: 'no-village',
    });
    expect(w.journeys.rows.size).toBe(0);
  });

  it('napadená ves: rekruti village-attacked, commandParty členům projde', async () => {
    const w = await setup();
    await musterExpedition(w.deps, input(w.homeId, [20], GO));
    await w.campaigns.create(campaign({ target: { ...campaign().target, villageId: w.homeId } }));
    expect(await musterExpedition(w.deps, input(w.homeId, [22], GO))).toEqual({
      ok: false,
      reason: 'village-attacked',
    });
    expect(personOf(await villageOf(w), 22).away).toBeUndefined();
    expect(await commandParty(w.deps, input(w.homeId, [20], go(60, 60)))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    expect(w.journeys.intents.map((i) => i.body)).toEqual([
      { kind: 'order', order: { kind: 'go', pos: { x: 60, z: 60 } }, people: [20] },
    ]);
  });

  it('nedosažitelný cíl a válka tam', async () => {
    const w = await setup();
    expect(await musterExpedition(w.deps, input(w.homeId, [20], go(1e7, 0)))).toEqual({
      ok: false,
      reason: 'unreachable',
    });
    const cross: ExpeditionCommand = {
      kind: 'order',
      order: { kind: 'cross', cell: { x: 5, y: 5 } },
    };
    expect(await musterExpedition(w.deps, input(w.homeId, [20], cross))).toEqual({
      ok: false,
      reason: 'unreachable',
    });
    // Jdi sem na mapu, na které nikdo z výběru nestojí
    const elsewhere: JourneyOrder = { kind: 'go', pos: { x: 10, z: 10 }, cell: { x: 1, y: 0 } };
    expect(
      await musterExpedition(w.deps, input(w.homeId, [20], { kind: 'order', order: elsewhere })),
    ).toEqual({ ok: false, reason: 'unreachable' });
    const asked: unknown[] = [];
    const war: ExpeditionDeps = {
      ...w.deps,
      atWar: (playerId, cell) => {
        asked.push([playerId, cell]);
        return Promise.resolve(true);
      },
    };
    const east: ExpeditionCommand = {
      kind: 'order',
      order: { kind: 'cross', cell: { x: 1, y: 0 } },
    };
    expect(await musterExpedition(war, input(w.homeId, [20], east))).toEqual({
      ok: false,
      reason: 'war-there',
    });
    expect(asked).toEqual([['pa', { x: 1, y: 0 }]]);
    expect(w.journeys.rows.size).toBe(0);
  });

  it('Osedlat: jezdec doma založí výpravu bez rozkazu a záměr saddle; venku s koněm v ohradě horse-home', async () => {
    const w = await setup();
    expect(await musterExpedition(w.deps, input(w.homeId, [12, 20], { kind: 'saddle' }))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    const j = await journeyOf(w, 'jny-1');
    // Osedlat bere z vsi jen jezdce (návrh Clauda) – vesničan 20 pracuje dál
    expect(j.members.map((m) => [m.ref.personId, m.horseId, m.mounted])).toEqual([[12, 1, false]]);
    expect(j.groups[0]!.goal).toBeNull();
    expect(w.journeys.intents.map((i) => i.body)).toEqual([{ kind: 'saddle', people: [12] }]);
    expect(personOf(await villageOf(w), 20).away).toBeUndefined();
    // vesničan bez koně – nikdo k osedlání
    expect(await musterExpedition(w.deps, input(w.homeId, [20], { kind: 'saddle' }))).toEqual({
      ok: false,
      reason: 'nobody',
    });

    const out = await setup();
    await musterExpedition(out.deps, input(out.homeId, [12], GO));
    rewrite(out, 'jny-1', (s) => (s.groups[0]!.cell = { x: 1, y: 0 }));
    const saddle = input(out.homeId, [12], { kind: 'saddle' });
    expect(await commandParty(out.deps, saddle)).toEqual({ ok: false, reason: 'horse-home' });
    expect(await musterExpedition(out.deps, saddle)).toEqual({ ok: false, reason: 'horse-home' });
    // Sesednout jen někomu na koni
    const dismount = input(out.homeId, [12], { kind: 'dismount' });
    expect(await commandParty(out.deps, dismount)).toEqual({ ok: false, reason: 'nobody' });
    rewrite(out, 'jny-1', (s) => {
      s.members[0]!.mounted = true;
      s.members[0]!.horse = 'ridden';
    });
    expect(await commandParty(out.deps, dismount)).toEqual({ ok: true, journeyId: 'jny-1' });
    expect(out.journeys.intents.map((i) => i.body)).toEqual([{ kind: 'dismount', people: [12] }]);
  });

  it('commandParty s rekrutem → recruits, nic se nezapíše', async () => {
    const w = await setup();
    expect(await commandParty(w.deps, input(w.homeId, [20], GO))).toEqual({
      ok: false,
      reason: 'recruits',
    });
    await musterExpedition(w.deps, input(w.homeId, [20], GO));
    const before = JSON.stringify(await villageOf(w));
    expect(await commandParty(w.deps, input(w.homeId, [20, 22], GO))).toEqual({
      ok: false,
      reason: 'recruits',
    });
    expect(w.journeys.intents).toHaveLength(0);
    expect(JSON.stringify(await villageOf(w))).toBe(before);
  });

  it('souběh: addIntent vrátí null → lidé vráceni a nová výprava; nikdo pryč se skončenou', async () => {
    const w = await setup();
    await musterExpedition(w.deps, input(w.homeId, [20], GO));
    // worker výpravu mezi zápisem vsi a záměrem ukončí – 20 je doma (away-ends posledního hloučku)
    let ended = false;
    const deps: ExpeditionDeps = {
      ...w.deps,
      journeys: {
        activeIn: (playerId, villageId) => w.journeys.activeIn(playerId, villageId),
        checkpoint: (id) => w.journeys.checkpoint(id),
        create: (state) => w.journeys.create(state),
        addIntent: async (id, intent) => {
          if (!ended) {
            ended = true;
            expect(personOf(await villageOf(w), 22).away).toEqual(AWAY_1);
            await w.journeys.end(id);
            w.villages.edit(w.homeId, (s) => delete personOf(s, 20).away);
          }
          return w.journeys.addIntent(id, intent);
        },
      },
    };
    expect(await musterExpedition(deps, input(w.homeId, [22], GO))).toEqual({
      ok: true,
      journeyId: 'jny-2',
    });
    const v = await villageOf(w);
    expect(v.people.filter((p) => p.away?.refId === 'jny-1')).toEqual([]);
    expect(personOf(v, 22).away).toEqual({ kind: 'journey', refId: 'jny-2' });
    expect((await journeyOf(w, 'jny-2')).members.map((m) => m.ref.personId)).toEqual([22]);
  });

  it('souběh: záměr přijat, výprava ale skončí dřív – poslední away-ends vrátí i nového člověka', async () => {
    const w = await setup();
    // hlouček stojí doma s rozkazem Domů – první takt výpravu ukončí
    const home: ExpeditionCommand = { kind: 'order', order: { kind: 'home' } };
    await musterExpedition(w.deps, input(w.homeId, [20], home));
    expect(await musterExpedition(w.deps, input(w.homeId, [22], GO))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    const point = (await w.journeys.checkpoint('jny-1'))!;
    const village = await villageOf(w);
    const world: CampaignWorld = {
      clock: OFFICIAL_WORLD,
      landscapeOf: () => MAP,
      villageAt: () => village,
    };
    const intents = await w.journeys.intentsAfter('jny-1', point.state.tick);
    const step = stepJourney(point.state, point.state.tick + 10, intents, world);
    expect(step.state.phase).toBe('done');
    expect(step.state.tick).toBeLessThan(intents[0]!.tick);
    const ends = step.villageEvents.map((e) => e.body).filter((b) => b.kind === 'away-ends');
    expect(ends).toEqual([{ kind: 'away-ends', refId: 'jny-1', untilDay: expect.any(Number) }]);
    const untilDay = (ends[0] as { untilDay: number }).untilDay;
    endAway(village, 'jny-1', untilDay);
    expect([20, 22].map((id) => isAway(personOf(village, id), untilDay))).toEqual([false, false]);
  });

  it('pád create → lidé zpět doma, chyba propadne', async () => {
    const w = await setup();
    w.journeys.failCreate = new Error('db');
    await expect(musterExpedition(w.deps, input(w.homeId, [20, 22], GO))).rejects.toThrow('db');
    expect((await villageOf(w)).people.some((p) => p.away !== undefined)).toBe(false);
    expect(w.journeys.rows.size).toBe(0);
  });

  it('člověk z hloučku, který právě došel domů → away; s dalšími jde jen zbytek', async () => {
    const w = await setup();
    await musterExpedition(w.deps, input(w.homeId, [20, 22], GO));
    // hlouček s 20 došel domů – v bodu už není, ves ho má pryč do away-ends
    rewrite(w, 'jny-1', (s) => (s.members = s.members.filter((m) => m.ref.personId !== 20)));
    expect(await commandParty(w.deps, input(w.homeId, [20], GO))).toEqual({
      ok: false,
      reason: 'away',
    });
    expect(await musterExpedition(w.deps, input(w.homeId, [20], GO))).toEqual({
      ok: false,
      reason: 'away',
    });
    expect(await commandParty(w.deps, input(w.homeId, [20, 22], GO))).toEqual({
      ok: true,
      journeyId: 'jny-1',
    });
    expect(w.journeys.intents.map((i) => (i.body as { people: number[] }).people)).toEqual([[22]]);
  });
});
