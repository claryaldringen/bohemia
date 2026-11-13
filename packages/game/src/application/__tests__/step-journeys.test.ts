import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { kin, village } from '../../domain/village/__tests__/kin-fixtures';
import type { VillageState } from '../../domain/village/types';
import {
  INTENT_LEAD_TICKS,
  msOfTick,
  newJourney,
  stepJourney,
  type CampaignWorld,
  type JourneyMember,
  type JourneyState,
  type NewJourney,
} from '../../domain/war';
import { LAUNCH, MEADOW, SUMMER, world } from '../../domain/war/__tests__/campaign-fixtures';
import type { CampaignCells } from '../campaigns';
import { houseAtWarOn } from '../journey-war';
import { newCampaignMemory, stepCampaigns } from '../step-campaigns';
import { stepJourneys, type StepJourneysDeps } from '../step-journeys';
import { InMemoryCampaignLock, InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWars } from './in-memory-wars';

// Smyčka výjezdů nad porty v paměti (plán 2026-11-13 – Úloha 4): výjezd dojede a vrátí se přes
// kola workeru (s restartem i s pamětí = vcelku), pád mezi uložením bodu a doručením doručí návrat
// i upozornění právě jednou (Review Focus 4), válka na mapě skupiny ji pošle domů, chyba jednoho
// výjezdu nezastaví ostatní a zaniklá domovská ves výjezd ukončí.

const NOW = new Date(world.startMs + 400 * 86_400_000);
/** Domov – Lhota na políčku (0, 0), kde stojí i sídlo hráče `pa`. */
const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
/** Mapa rodu hráče `pb` na východ od domova. */
const EAST = { x: 1, y: 0 };
/** Konec běhů – výjezd s 3 dny čekání je dávno doma. */
const END = LAUNCH + 3000;
/** Rozkaz „Domů“ v taktu +300 – výjezd je doma dřív než v taktu +700. */
const HOMEWARD = { tick: LAUNCH + 300, byPlayer: 'pa', body: { kind: 'home' as const } };

/** Muž výjezdu – osoba 1 je vojvoda, oba na koni. */
function man(personId: number): JourneyMember {
  return {
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    mounted: true,
    strength: 2,
    fight: 50,
    health: 100,
    wounded: false,
    status: 'active',
  };
}

/** Lhota s muži výjezdu, dopočtená za konec běhů (bariéra vsí výjezd nezdrží). */
const HOME_STATE: VillageState = village(
  [1, 2].map((id) => kin({ id, age: 30, sex: 'male' })),
  undefined,
  { lastDay: SUMMER + 30 },
);

/** Výjezd hráče `pa` z Lhoty, první rozkaz 300 m na východ (na domovské mapě). */
function journey(overrides: Partial<NewJourney> = {}): JourneyState {
  return newJourney(
    {
      id: 'j1',
      seed: 42,
      playerId: 'pa',
      houseId: 'h-pa',
      leaderName: 'Bořivoj',
      home: HOME,
      members: [man(1), man(2)],
      startMs: msOfTick(LAUNCH, world),
      order: { kind: 'go', pos: { x: 305, z: 5 } },
      ...overrides,
    },
    world,
  );
}

/** Svět výpočtu vcelku – tytéž mapy a vsi jako porty v paměti. */
const WHOLE: CampaignWorld = {
  clock: world,
  landscapeOf: () => MEADOW,
  villageAt: (villageId) => (villageId === 'lhota' ? HOME_STATE : null),
  villageGone: (villageId) => villageId !== 'lhota',
};

interface Setup {
  deps: StepJourneysDeps;
  journeys: InMemoryJourneys;
  villages: InMemoryVillages;
  notices: InMemoryNotices;
  lock: InMemoryCampaignLock;
  houses: InMemoryHouses;
  wars: InMemoryWars;
}

/** Rody `pa` (sídlo na domovském políčku) a `pb` (na východ), Lhota a porty v paměti. */
async function setup(): Promise<Setup> {
  const journeys = new InMemoryJourneys();
  const villages = new InMemoryVillages();
  villages.records.set('lhota', {
    id: 'lhota',
    settlementId: 's-lhota',
    name: 'Lhota',
    state: HOME_STATE,
    version: 1,
  });
  const notices = new InMemoryNotices();
  const lock = new InMemoryCampaignLock();
  const houses = new InMemoryHouses();
  const wars = new InMemoryWars();
  const settlements = new InMemorySettlements();
  await houses.create({ playerId: 'pa', kind: 'player', createdAt: NOW });
  await houses.create({ playerId: 'pb', kind: 'player', createdAt: NOW });
  await settlements.seatAtOrigin({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  await settlements.create({
    ownerId: 'pb',
    landscapeSeed: 2,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: EAST,
  });
  const cells: CampaignCells = { mapOf: () => Promise.resolve(MEADOW) };
  const deps: StepJourneysDeps = {
    journeys,
    campaignLock: lock,
    cells,
    villages,
    notices,
    world,
    atWar: (playerId, cell) => houseAtWarOn({ houses, wars, settlements }, playerId, cell),
  };
  return { deps, journeys, villages, notices, lock, houses, wars };
}

/** Kola smyčky po 1 s (4 takty, nebo `every`) od taktu `from` do `to`; výsledky kol. */
async function rounds(
  deps: StepJourneysDeps,
  from: number,
  to: number,
  every = 4,
): Promise<string[]> {
  const outcomes: string[] = [];
  for (let tick = from; tick <= to; tick += every) {
    for (const r of await stepJourneys(deps, { nowMs: msOfTick(tick, world) })) {
      outcomes.push(r.outcome);
    }
  }
  return outcomes;
}

async function stored(journeys: InMemoryJourneys, id = 'j1'): Promise<JourneyState> {
  return (await journeys.checkpoint(id))!.state;
}

/** Uložené kontrolní body (JSON) v pořadí uložení. */
function recordSaves(journeys: InMemoryJourneys): string[] {
  const saved: string[] = [];
  const realSave = journeys.saveCheckpoint.bind(journeys);
  journeys.saveCheckpoint = async (id, input): ReturnType<typeof realSave> => {
    const result = await realSave(id, input);
    if (result === 'saved') saved.push(JSON.stringify(input.state));
    return result;
  };
  return saved;
}

describe('stepJourneys', () => {
  const whole = stepJourney(journey(), END, [], WHOLE);
  const homeward = stepJourney(journey(), END, [{ ...HOMEWARD, seq: 1 }], WHOLE);

  it('výjezd dojede, počká a sám se vrátí přes kola s restartem = vcelku; návrat jednou', async () => {
    expect(whole.state.phase).toBe('done');
    const { deps, journeys, villages, notices } = await setup();
    await journeys.create(journey());
    const first = await rounds(deps, LAUNCH + 1, LAUNCH + 801);
    expect(first).toContain('computed');
    expect((await stored(journeys)).phase).toBe('out');
    // „restart“: nové porty (zámek, mapy, rody), stejné úložiště
    const restarted = { ...(await setup()).deps, journeys, villages, notices };
    await rounds(restarted, LAUNCH + 805, END);
    expect(JSON.stringify(await stored(journeys))).toBe(JSON.stringify(whole.state));
    expect(journeys.saves).toBeLessThan((END - LAUNCH) / 4 / 5);
    expect(villages.inbox.events.map((e) => e.body)).toEqual(
      whole.villageEvents.map((e) => e.body),
    );
    expect(villages.inbox.events.map((e) => e.body.kind)).toEqual(['away-ends']);
    expect(notices.notices.map((n) => n.kind)).toEqual(['journey-returned']);
    expect(await journeys.active()).toEqual([]);
  });

  it.each([1, 7])(
    'kola po %i taktech: s pamětí tytéž body i konec jako bez ní (= vcelku)',
    async (every) => {
      const runs: string[][] = [];
      for (const memory of [undefined, newCampaignMemory<JourneyState>()]) {
        const { deps, journeys } = await setup();
        await journeys.create(journey());
        await journeys.addIntent('j1', HOMEWARD);
        const saves = recordSaves(journeys);
        const used = { ...deps, ...(memory ? { memory } : {}) };
        const outcomes = await rounds(used, LAUNCH + 1, LAUNCH + 800, every);
        expect(outcomes).toContain('computed');
        expect(JSON.stringify(await stored(journeys))).toBe(JSON.stringify(homeward.state));
        // skončený výjezd z paměti zmizí (stav i co četl)
        expect(memory?.states.size ?? 0).toBe(0);
        expect(memory?.needs.size ?? 0).toBe(0);
        runs.push(saves);
      }
      expect(runs[1]).toEqual(runs[0]);
    },
  );

  it('druhé kolo pokračuje od zapamatovaného stavu; kolo tažení paměť výjezdů nezahodí', async () => {
    const { deps, journeys, villages, notices, lock } = await setup();
    await journeys.create(journey());
    const memory = newCampaignMemory<JourneyState>();
    const used = { ...deps, memory };
    // jako worker: v kole nejdřív tažení (vlastní paměť), pak výjezdy
    const campaignDeps = {
      campaigns: new InMemoryCampaigns(),
      campaignLock: lock,
      cells: deps.cells,
      villages,
      notices,
      world,
      memory: newCampaignMemory(),
    };
    const round = async (tick: number): Promise<string[]> => {
      const nowMs = msOfTick(tick, world);
      await stepCampaigns(campaignDeps, { nowMs });
      return (await stepJourneys(used, { nowMs })).map((r) => r.outcome);
    };
    expect(await round(LAUNCH + 4)).toEqual(['computed']);
    const memo = memory.states.get('j1')!;
    expect(memo.state.tick).toBe(LAUNCH + 4);
    // značka v zapamatovaném stavu – další kolo počítá od něj, ne znovu od kontrolního bodu
    memory.states.set('j1', { ...memo, state: { ...memo.state, leaderName: 'Z paměti' } });
    expect(await round(LAUNCH + 8)).toEqual(['computed']);
    expect(memory.states.get('j1')!.state).toMatchObject({
      tick: LAUNCH + 8,
      leaderName: 'Z paměti',
    });
    expect((await stored(journeys)).tick).toBe(LAUNCH);
  });

  it.each(['schránka vsi', 'upozornění'])(
    'pád mezi uložením bodu a doručením (%s) – další kolo doručí návrat i upozornění právě jednou',
    async (failing) => {
      const { deps, journeys, villages, notices } = await setup();
      await journeys.create(journey());
      await journeys.addIntent('j1', HOMEWARD);
      let crashed = false;
      const crash = (): Promise<never> => {
        crashed = true;
        return Promise.reject(new Error('spojení spadlo'));
      };
      if (failing === 'schránka vsi') {
        const post = villages.inbox.post.bind(villages.inbox);
        villages.inbox.post = (event) => (crashed ? post(event) : crash());
      } else {
        const post = notices.post.bind(notices);
        notices.post = (notice) => (crashed ? post(notice) : crash());
      }
      const outcomes = await rounds(deps, LAUNCH + 1, LAUNCH + 800);
      expect(outcomes.filter((o) => o === 'failed')).toHaveLength(1);
      const point = await journeys.checkpoint('j1');
      expect(point?.state.phase).toBe('done');
      expect(point?.outbox).toBeNull();
      expect(villages.inbox.events.map((e) => e.body)).toEqual(
        homeward.villageEvents.map((e) => e.body),
      );
      expect(villages.inbox.events.map((e) => e.body.kind)).toEqual(['away-ends']);
      expect(notices.notices.map((n) => n.kind)).toEqual(['journey-returned']);
      expect(await journeys.active()).toEqual([]);
    },
  );

  it('začne válka s rodem mapy, na které skupina stojí – kolo přidá „Domů“ jednou, při návratu už ne', async () => {
    const { deps, journeys, houses, wars, notices } = await setup();
    // přes okraj na mapu rodu `pb` a 300 m dál – návrat po ní trvá stovky taktů
    const deep = { x: -655, z: 5 };
    const go = { tick: LAUNCH + 1000, byPlayer: 'pa', body: { kind: 'go' as const, pos: deep } };
    await journeys.create(journey({ order: { kind: 'cross', cell: EAST } }));
    await journeys.addIntent('j1', go);
    await rounds(deps, LAUNCH + 1, LAUNCH + 1401);
    const there = await stored(journeys);
    expect(there.phase).toBe('out');
    expect(there.groups[0]).toMatchObject({ cell: EAST, pos: deep, arrived: true });
    const [a, b] = [await houses.activeOf('pa'), await houses.activeOf('pb')];
    await wars.start({
      houses: [a!.id, b!.id],
      startedAt: NOW,
      startedDay: SUMMER + 4,
      how: 'declared',
    });
    // kola po taktu: „Domů“ platí až za INTENT_LEAD_TICKS – mezitím se nepřidá podruhé; při
    // návratu po mapě rodu ve válce (body se mezitím uloží za rozkazem) už ne
    await rounds(deps, LAUNCH + 1405, LAUNCH + 1412, 1);
    await rounds(deps, LAUNCH + 1416, END);
    expect(journeys.intents.map(({ tick, byPlayer, body }) => ({ tick, byPlayer, body }))).toEqual([
      go,
      { tick: LAUNCH + 1405 + INTENT_LEAD_TICKS, byPlayer: 'pa', body: { kind: 'home' } },
    ]);
    const back = await stored(journeys);
    expect(back.phase).toBe('done');
    expect(back.groups[0]!.cell).toEqual(HOME.cell);
    expect(notices.notices.map((n) => n.kind)).toEqual(['journey-returned']);
  });

  it('chyba jednoho výjezdu nezastaví ostatní; výjezd s cizím zámkem se přeskočí', async () => {
    const { deps, journeys, lock } = await setup();
    for (const id of ['bad', 'busy', 'good']) await journeys.create(journey({ id }));
    journeys.rows.get('bad')!.state = '{"zkažený": true}';
    lock.held.add('busy');
    const results = await stepJourneys(deps, { nowMs: msOfTick(LAUNCH + 41, world) });
    expect(results.map((r) => [r.journeyId, r.outcome])).toEqual([
      ['bad', 'failed'],
      ['busy', 'busy'],
      ['good', 'saved'],
    ]);
    expect((await stored(journeys, 'good')).tick).toBe(LAUNCH + 41);
  });

  it('domovská ves zanikla – výjezd skončí bez událostí a nečeká na ni navždy', async () => {
    const { deps, journeys, villages, notices } = await setup();
    await journeys.create(journey({ home: { ...HOME, villageId: 'zanikla' } }));
    const outcomes = await rounds(deps, LAUNCH + 1, LAUNCH + 401);
    expect(outcomes).not.toContain('failed');
    expect((await stored(journeys)).phase).toBe('done');
    expect(villages.inbox.events).toEqual([]);
    expect(notices.notices).toEqual([]);
    expect(await journeys.active()).toEqual([]);
  });
});
