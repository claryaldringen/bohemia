import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { horse, horseVillage, START } from '../../domain/village/__tests__/horse-fixtures';
import { sendAway } from '../../domain/vassalage';
import { villageHorses } from '../../domain/village/livestock/horses';
import type { VillageState } from '../../domain/village/types';
import { villageManor } from '../../domain/village/people/manor';
import {
  lineManStrength,
  stepJourney,
  WAR,
  type CampaignMap,
  type CampaignWorld,
  type JourneyIntent,
  type JourneyOrder,
  type JourneyState,
  type Pos,
} from '../../domain/war';
import { land } from '../../domain/war/__tests__/battle-fixtures';
import { campaign } from '../../domain/war/__tests__/campaign-fixtures';
import { houseAtWarOn } from '../journey-war';
import {
  journeyCandidates,
  launchJourney,
  type JourneyRefusal,
  type LaunchJourneyDeps,
} from '../launch-journey';
import {
  CAMPAIGN_REASONS,
  prepareCampaign,
  villagePlace,
  type CampaignPlan,
} from '../plan-campaign';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWars } from './in-memory-wars';

// Výběr družiny a vyslání výjezdu (lord-control.md – Kdo jede; plán 2026-11-13 – Úloha 2).

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
const MAP: CampaignMap = { landscape: land(), obstacles: null, villageIds: [] };

/** Ves s vojvodou Bořivojem (40), synem rodu (17, na vlastním koni) a mladším synem (11). */
function ownVillage(): VillageState {
  const s = horseVillage([{ ...horse(1, 6), riderId: 12 }], 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  s.people.find((p) => p.id === 12)!.name = 'Radim';
  s.people.find((p) => p.id === 12)!.arms = { bow: 20, combat: 60, riding: 40, best: {} } as never;
  s.dynasty = { lordId: 10, lords: [] };
  return s;
}

async function setup(): Promise<{
  deps: LaunchJourneyDeps;
  villages: InMemoryVillages;
  journeys: InMemoryJourneys;
  campaigns: InMemoryCampaigns;
  wars: InMemoryWars;
  settlements: InMemorySettlements;
  houses: InMemoryHouses;
  homeId: string;
  foreignId: string;
  atWar: { value: boolean; asked: unknown[] };
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const wars = new InMemoryWars();
  await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  await houses.create({
    playerId: 'pb',
    kind: 'player',
    createdAt: new Date(NOW.getTime() - 30 * DAY_MS),
  });
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
  const foreignState = ownVillage();
  foreignState.foundedDay = START - 4000;
  const foreign = await villages.add(sb.id, 'Kněžice', foreignState);
  const journeys = new InMemoryJourneys();
  const campaigns = new InMemoryCampaigns();
  const atWar = { value: false, asked: [] as unknown[] };
  let n = 0;
  const deps: LaunchJourneyDeps = {
    houses,
    villages,
    settlements,
    campaigns,
    journeys,
    cells: { mapOf: () => Promise.resolve(MAP) },
    world: OFFICIAL_WORLD,
    seeds: { nextSeed: () => 77 },
    newId: () => `jny-${++n}`,
    atWar: (playerId, cell) => {
      atWar.asked.push([playerId, cell]);
      return Promise.resolve(atWar.value);
    },
  };
  return {
    deps,
    villages,
    journeys,
    campaigns,
    wars,
    settlements,
    houses,
    homeId: home.id,
    foreignId: foreign.id,
    atWar,
  };
}

const go = (x: number, z: number) => ({ kind: 'go' as const, pos: { x, z } });

const launchInput = (
  homeId: string,
  extra: Partial<Parameters<typeof launchJourney>[1]> = {},
): Parameters<typeof launchJourney>[1] => ({
  playerId: 'pa',
  villageId: homeId,
  retinue: [12],
  order: go(100, 100),
  now: NOW,
  ...extra,
});

const candidatesInput = (
  homeId: string,
): { playerId: string; villageId: string; today: number } => ({
  playerId: 'pa',
  villageId: homeId,
  today: START,
});

describe('journeyCandidates', () => {
  it('vojvoda a muži rodu od 16 let, kdo je doma a zdravý; kůň podle vlastního koně', async () => {
    const w = await setup();
    const r = await journeyCandidates(w.deps, candidatesInput(w.homeId));
    expect(r.refusal).toBeNull();
    expect(r.lord).toMatchObject({ personId: 10, name: 'Bořivoj', age: 40, lord: true });
    expect(r.lord!.mounted).toBe(false);
    expect(r.men.map((m) => m.personId)).toEqual([12]);
    const state = (await w.villages.find(w.homeId))!.state;
    const son = state.people.find((p) => p.id === 12)!;
    expect(r.men[0]).toMatchObject({ name: 'Radim', age: 17, lord: false, mounted: true });
    expect(r.men[0]!.strength).toBe(
      lineManStrength(
        son,
        villageHorses(state).find((h) => h.riderId === 12)!,
      ),
    );
  });

  it('raněný, na tažení, zajatý a mladší muži chybí', async () => {
    const w = await setup();
    w.villages.edit(w.homeId, (s) => {
      s.people.find((p) => p.id === 12)!.woundedUntil = START + 5;
      // další muži rodu: mladší (14), na tažení (30), zajatý (31)
      const base = s.people.find((p) => p.id === 10)!;
      s.people.push(
        { ...base, id: 14, bornDay: START - 11 * 366 },
        { ...base, id: 30, bornDay: START - 30 * 366 },
        { ...base, id: 31, bornDay: START - 31 * 366 },
        { ...base, id: 32, bornDay: START - 32 * 366 },
      );
      s.people.find((p) => p.id === 14)!.line = true;
      sendAway(s, START, [30], { kind: 'campaign', refId: 'c1' });
      sendAway(s, START, [31], { kind: 'captive', refId: 'x' });
    });
    const r = await journeyCandidates(w.deps, candidatesInput(w.homeId));
    expect(r.men.map((m) => m.personId)).toEqual([32]);
  });

  it('důvody odmítnutí', async () => {
    const reasons: [string, (s: VillageState) => void, JourneyRefusal][] = [
      ['no-lord', (s) => (s.dynasty = { lordId: null, lords: [] }), 'no-lord'],
      [
        'lord-young',
        (s) => (s.people.find((p) => p.id === 10)!.bornDay = START - 15 * 366),
        'lord-young',
      ],
      [
        'lord-wounded',
        (s) => (s.people.find((p) => p.id === 10)!.woundedUntil = START + 3),
        'lord-wounded',
      ],
      [
        'lord-away',
        (s) => sendAway(s, START, [10], { kind: 'campaign', refId: 'c1' }),
        'lord-away',
      ],
    ];
    for (const [, change, expected] of reasons) {
      const w = await setup();
      w.villages.edit(w.homeId, change);
      const r = await journeyCandidates(w.deps, candidatesInput(w.homeId));
      expect(r.refusal).toBe(expected);
    }
  });

  it('cizí ves, cizí vojsko na mapě vsi a běžící výjezd', async () => {
    const w = await setup();
    expect((await journeyCandidates(w.deps, candidatesInput(w.foreignId))).refusal).toBe('no-lord');
    const attack = campaign({ target: { ...campaign().target, villageId: w.homeId } });
    await w.campaigns.create(attack);
    expect((await journeyCandidates(w.deps, candidatesInput(w.homeId))).refusal).toBe(
      'village-attacked',
    );
    const w2 = await setup();
    expect((await launchJourney(w2.deps, launchInput(w2.homeId))).ok).toBe(true);
    w2.villages.edit(w2.homeId, (s) => {
      for (const p of s.people) delete p.away;
    });
    expect((await journeyCandidates(w2.deps, candidatesInput(w2.homeId))).refusal).toBe(
      'journey-active',
    );
  });
});

describe('launchJourney', () => {
  it('pošle vojvodu a družinu pryč a založí výjezd s prvním rozkazem', async () => {
    const w = await setup();
    const r = await launchJourney(w.deps, launchInput(w.homeId));
    expect(r).toEqual({ ok: true, journeyId: 'jny-1' });
    const state = (await w.villages.find(w.homeId))!.state;
    for (const id of [10, 12]) {
      expect(state.people.find((p) => p.id === id)!.away).toEqual({
        kind: 'journey',
        refId: 'jny-1',
      });
    }
    expect(state.people.find((p) => p.id === 14)!.away).toBeUndefined();
    const j = (await w.journeys.checkpoint('jny-1'))!.state as JourneyState;
    expect(j).toMatchObject({
      id: 'jny-1',
      seed: 77,
      playerId: 'pa',
      home: { villageId: w.homeId, name: 'Lhota', cell: { x: 0, y: 0 } },
    });
    // jméno vojvody nese člověk výpravy (dřív `leaderName` stavu)
    expect(j.members.map((m) => m.name)).toEqual(['Bořivoj', expect.any(String)]);
    expect(j.members.map((m) => [m.ref.personId, m.lord, m.mounted, m.health, m.wounded])).toEqual([
      [10, true, false, WAR.combat.health, false],
      [12, false, true, WAR.combat.health, false],
    ]);
    const son = state.people.find((p) => p.id === 12)!;
    expect(j.members[1]).toMatchObject({ fight: 60 });
    expect(j.members[1]!.strength).toBeGreaterThan(lineManStrength(son, null));
    expect(j.groups[0]!.goal).toEqual({ cell: { x: 0, y: 0 }, pos: { x: 100, z: 100 } });
    expect(await w.journeys.activeIn('pa', w.homeId)).toBe('jny-1');
  });

  it('vojvoda sám, bez družiny', async () => {
    const w = await setup();
    const r = await launchJourney(w.deps, launchInput(w.homeId, { retinue: [] }));
    expect(r.ok).toBe(true);
    const state = (await w.villages.find(w.homeId))!.state;
    expect(state.people.find((p) => p.id === 12)!.away).toBeUndefined();
  });

  it('odmítnutí nechá ves beze změny', async () => {
    const w = await setup();
    const before = JSON.stringify((await w.villages.find(w.homeId))!.state);
    const refused = async (
      deps: LaunchJourneyDeps,
      id: string,
      extra: Partial<Parameters<typeof launchJourney>[1]> = {},
    ): Promise<JourneyRefusal | null> => {
      const r = await launchJourney(deps, launchInput(id, extra));
      return r.ok ? null : r.reason;
    };
    expect(await refused(w.deps, w.foreignId)).toBe('no-lord');
    expect(await refused(w.deps, w.homeId, { retinue: [14] })).toBe('bad-retinue');
    expect(await refused(w.deps, w.homeId, { retinue: [10] })).toBe('bad-retinue');
    expect(await refused(w.deps, w.homeId, { retinue: [12, 12] })).toBe('bad-retinue');
    expect(await refused(w.deps, w.homeId, { retinue: [999] })).toBe('bad-retinue');
    expect(
      await refused(w.deps, w.homeId, { order: { kind: 'attack' } as unknown as JourneyOrder }),
    ).toBe('unreachable');
    expect(await refused(w.deps, w.homeId, { order: go(Number.NaN, 0) })).toBe('unreachable');
    expect(await refused(w.deps, w.homeId, { order: go(Infinity, 0) })).toBe('unreachable');
    expect(await refused(w.deps, w.homeId, { order: go(1e7, 0) })).toBe('unreachable');
    expect(
      await refused(w.deps, w.homeId, { order: { kind: 'cross', cell: { x: 5, y: 5 } } }),
    ).toBe('unreachable');
    expect(
      await refused(w.deps, w.homeId, { order: { kind: 'cross', cell: { x: 0, y: 0 } } }),
    ).toBe('unreachable');
    expect(JSON.stringify((await w.villages.find(w.homeId))!.state)).toBe(before);
    expect(w.journeys.rows.size).toBe(0);
  });

  it('první rozkaz do země, kde je válka, odmítne (war-there) a zeptá se na políčko cíle', async () => {
    const w = await setup();
    w.atWar.value = true;
    const r = await launchJourney(
      w.deps,
      launchInput(w.homeId, { order: { kind: 'cross', cell: { x: 1, y: 0 } } }),
    );
    expect(r).toEqual({ ok: false, reason: 'war-there' });
    expect(w.atWar.asked).toEqual([['pa', { x: 1, y: 0 }]]);
    expect(w.journeys.rows.size).toBe(0);
  });

  it('rozkaz „domů“ projde', async () => {
    const w = await setup();
    const r = await launchJourney(w.deps, launchInput(w.homeId, { order: { kind: 'home' } }));
    expect(r.ok).toBe(true);
  });

  it('běžící výjezd, vojvoda na tažení a cizí vojsko na mapě odmítne', async () => {
    const w = await setup();
    expect((await launchJourney(w.deps, launchInput(w.homeId))).ok).toBe(true);
    expect(await launchJourney(w.deps, launchInput(w.homeId, { retinue: [] }))).toEqual({
      ok: false,
      reason: 'lord-away',
    });
    // výjezd ještě běží, ale ves dostala muže zpět (jiná cesta ke druhému výjezdu)
    w.villages.edit(w.homeId, (s) => {
      for (const p of s.people) delete p.away;
    });
    expect(await launchJourney(w.deps, launchInput(w.homeId))).toEqual({
      ok: false,
      reason: 'journey-active',
    });
    const w2 = await setup();
    w2.villages.edit(w2.homeId, (s) => sendAway(s, START, [10], { kind: 'campaign', refId: 'c1' }));
    expect(await launchJourney(w2.deps, launchInput(w2.homeId))).toEqual({
      ok: false,
      reason: 'lord-away',
    });
    const w3 = await setup();
    await w3.campaigns.create(campaign({ target: { ...campaign().target, villageId: w3.homeId } }));
    expect(await launchJourney(w3.deps, launchInput(w3.homeId))).toEqual({
      ok: false,
      reason: 'village-attacked',
    });
  });

  it('mladý nebo raněný vojvoda', async () => {
    const w = await setup();
    w.villages.edit(w.homeId, (s) => (s.people.find((p) => p.id === 10)!.woundedUntil = START + 9));
    expect(await launchJourney(w.deps, launchInput(w.homeId))).toEqual({
      ok: false,
      reason: 'lord-wounded',
    });
    const w2 = await setup();
    w2.villages.edit(
      w2.homeId,
      (s) => (s.people.find((p) => p.id === 10)!.bornDay = START - 15 * 366),
    );
    expect(await launchJourney(w2.deps, launchInput(w2.homeId))).toEqual({
      ok: false,
      reason: 'lord-young',
    });
  });

  it('člen družiny, který mezi výběrem a odjezdem přestal být doma, odmítne a ves zůstane', async () => {
    const w = await setup();
    // výběr proběhl; syn mezitím odešel na tažení
    w.villages.edit(w.homeId, (s) => sendAway(s, START, [12], { kind: 'campaign', refId: 'c1' }));
    const r = await launchJourney(w.deps, launchInput(w.homeId));
    expect(r).toEqual({ ok: false, reason: 'bad-retinue' });
    const state = (await w.villages.find(w.homeId))!.state;
    expect(state.people.find((p) => p.id === 10)!.away).toBeUndefined();
  });

  it('selže-li založení výjezdu po uložení vsi, muži jsou zpět doma', async () => {
    const w = await setup();
    w.journeys.failCreate = new Error('db');
    await expect(launchJourney(w.deps, launchInput(w.homeId))).rejects.toThrow('db');
    const state = (await w.villages.find(w.homeId))!.state;
    expect(state.people.some((p) => p.away !== undefined)).toBe(false);
    expect(w.journeys.rows.size).toBe(0);
  });

  it('muž na výjezdu nejde na tažení ani za velitele', async () => {
    const w = await setup();
    await launchJourney(w.deps, launchInput(w.homeId));
    const plan: CampaignPlan = {
      commander: { villageId: w.homeId, personId: 12 },
      deputy: null,
      villages: [{ villageId: w.homeId, lineMen: [12], villagers: [], forced: [] }],
      assemblyVillageId: w.homeId,
      targetVillageId: w.foreignId,
      groups: 'together',
      surrendered: 'lead',
      food: 0,
    } as unknown as CampaignPlan;
    const prepared = await prepareCampaign(
      {
        ...w.deps,
        houses: w.houses,
        wars: w.wars,
        landscapes: { landscapeOf: () => MAP.landscape },
      },
      { playerId: 'pa', plan, today: START, now: NOW },
    );
    expect(prepared).toBe(CAMPAIGN_REASONS.badMan);
  });
});

// Hráč staví ves, kde chce – Martinův Vlkov stojí ≈ 430 m od místa vsi krajiny (`villageSite`).
// Výjezd z něj vyjíždí a Domů se k němu vrací (lord-control.md – Rozkazy: „Domů – nejkratší cestou
// do vlastní vsi“; Ve scéně: odjezd branou dvorce); dřív jádro skupinu vysílalo z místa vsi
// krajiny a Domů ji tam vracelo (Martin 14. 11. 2026: „jde někam do prdele“).
describe('domov výjezdu', () => {
  /** Mapa, jejíž místo vsi krajiny leží ≈ 640 m od dvorce (dvorec stojí v počátku). */
  const FAR: CampaignMap = {
    ...MAP,
    landscape: { ...MAP.landscape, villageSite: { x: 30, y: 90 } },
  };
  const near = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.z - b.z);

  it('skupina vyjede od dvorce a Domů ji vrátí ke dvorci, ne na místo vsi krajiny', async () => {
    const w = await setup();
    const deps: LaunchJourneyDeps = { ...w.deps, cells: { mapOf: () => Promise.resolve(FAR) } };
    const r = await launchJourney(deps, launchInput(w.homeId, { order: go(60, 0) }));
    expect(r.ok).toBe(true);
    const village = (await w.villages.find(w.homeId))!.state;
    const manor = villageManor(village)!.position;
    const site = villagePlace({ x: 0, y: 0 }, FAR.landscape).pos;
    expect(near(manor, site)).toBeGreaterThan(500);
    const j = (await w.journeys.checkpoint('jny-1'))!.state as JourneyState;
    expect(j.home.pos).toEqual({ x: manor.x, z: manor.z });
    expect(j.groups[0]!.pos).toEqual({ x: manor.x, z: manor.z });

    // skupina vyjede k cíli a po rozkazu Domů dojede zpět ke dvorci – tam výjezd skončí
    const world: CampaignWorld = {
      clock: OFFICIAL_WORLD,
      landscapeOf: () => FAR,
      villageAt: () => village,
    };
    const out = stepJourney(j, j.tick + 160, [], world).state;
    expect(near(out.groups[0]!.pos, manor)).toBeGreaterThan(30);
    const home: JourneyIntent = {
      tick: out.tick + 1,
      seq: 1,
      byPlayer: 'pa',
      body: { kind: 'home' },
    };
    const back = stepJourney(out, out.tick + 1500, [home], world).state;
    expect(back.phase).toBe('done');
    // hlouček, který došel domů, ze stavu zmizí – naposled je vidět takt před koncem
    const last = stepJourney(out, back.tick - 1, [home], world).state;
    expect(near(last.groups[0]!.pos, manor)).toBeLessThan(20);
  });
});

describe('houseAtWarOn', () => {
  it('válka s rodem, kterému patří ves na políčku', async () => {
    const w = await setup();
    const deps = { houses: w.houses, wars: w.wars, settlements: w.settlements };
    const [a, b] = [await w.houses.activeOf('pa'), await w.houses.activeOf('pb')];
    expect(await houseAtWarOn(deps, 'pa', { x: 1, y: 0 })).toBe(false);
    await w.wars.start({
      houses: [a!.id, b!.id],
      startedAt: NOW,
      startedDay: START,
      how: 'declared',
    });
    expect(await houseAtWarOn(deps, 'pa', { x: 1, y: 0 })).toBe(true);
    expect(await houseAtWarOn(deps, 'pb', { x: 0, y: 0 })).toBe(true);
    // vlastní mapa, prázdné políčko a hráč bez rodu
    expect(await houseAtWarOn(deps, 'pa', { x: 0, y: 0 })).toBe(false);
    expect(await houseAtWarOn(deps, 'pa', { x: 7, y: 7 })).toBe(false);
    expect(await houseAtWarOn(deps, 'nobody', { x: 1, y: 0 })).toBe(false);
  });
});
