import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { kin, village } from '../../domain/village/__tests__/kin-fixtures';
import { sameCell, type GridCell } from '../../domain/village/people/world-grid';
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
import { houseAtWarOn, recallJourneysAtWar, type RecallJourneysDeps } from '../journey-war';
import { newCampaignMemory, stepCampaigns } from '../step-campaigns';
import { stepJourneys, type StepJourneysDeps } from '../step-journeys';
import { InMemoryCampaignLock, InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemoryKnowledge } from './in-memory-knowledge';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWars } from './in-memory-wars';

// Smyčka výjezdů nad porty v paměti (plán 2026-11-13 – Úloha 4): výjezd dojede a vrátí se přes
// kola workeru (s restartem i s pamětí = vcelku), pád mezi uložením bodu a doručením doručí návrat
// i upozornění právě jednou (Review Focus 4), vjezd na mapu rodu ve válce i začátek války
// (`recallJourneysAtWar`) skupinu pošlou domů, chyba jednoho výjezdu nezastaví ostatní a zaniklá
// domovská ves výjezd ukončí.

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
  knowledge: InMemoryKnowledge;
  lock: InMemoryCampaignLock;
  houses: InMemoryHouses;
  wars: InMemoryWars;
  settlements: InMemorySettlements;
  /** Porty `recallJourneysAtWar` nad týmiž rody, sídly a výjezdy. */
  recall: RecallJourneysDeps;
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
  const knowledge = new InMemoryKnowledge();
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
    knowledge,
    world,
    atWar: (playerId, cell) => houseAtWarOn({ houses, wars, settlements }, playerId, cell),
  };
  const recall = { houses, settlements, journeys, world };
  return { deps, journeys, villages, notices, knowledge, lock, houses, wars, settlements, recall };
}

/** Id rodů hráčů `pa` a `pb`. */
async function warHouses(s: Setup): Promise<[string, string]> {
  const [a, b] = [await s.houses.activeOf('pa'), await s.houses.activeOf('pb')];
  return [a!.id, b!.id];
}

/** Válka rodů hráčů `pa` a `pb`. */
async function startWar(s: Setup): Promise<void> {
  await s.wars.start({
    houses: await warHouses(s),
    startedAt: NOW,
    startedDay: SUMMER,
    how: 'declared',
  });
}

/** Záměry výjezdů bez `seq` (takt, hráč, rozkaz). */
function queued(journeys: InMemoryJourneys): unknown[] {
  return journeys.intents.map(({ journeyId, tick, byPlayer, body }) => ({
    journeyId,
    tick,
    byPlayer,
    body,
  }));
}

/** První takt, kdy skupina výjezdu `start` (bez rozkazů, vcelku) stojí na políčku `cell`. */
function firstTickOn(start: JourneyState, cell: GridCell, limit: number): number {
  let [lo, hi] = [start.tick, limit];
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sameCell(stepJourney(start, mid, [], WHOLE).state.groups[0]!.cell, cell)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
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

  describe('znalost rodu (Úloha 10)', () => {
    const crossing = (): JourneyState => journey({ order: { kind: 'cross', cell: EAST } });
    const wholeCross = stepJourney(crossing(), END, [], WHOLE);

    it('po dojetí na cizí mapu je znalost v úložišti rodu a bod nemá nedoručenou schránku', async () => {
      const { deps, journeys, knowledge } = await setup();
      await journeys.create(crossing());
      await rounds(deps, LAUNCH + 1, LAUNCH + 1200);
      const seen = (await stored(journeys)).seen!['1,0']!;
      expect(await knowledge.of('h-pa', EAST)).toEqual(seen);
      expect(await knowledge.cellsOf('h-pa')).toEqual([EAST]);
      // cizí rod nic nevidí
      expect(await knowledge.of('h-pb', EAST)).toBeNull();
      expect(await knowledge.cellsOf('h-pb')).toEqual([]);
      expect((await journeys.checkpoint('j1'))?.outbox).toBeNull();
    });

    it('na konci výjezdu je v úložišti totéž, co ve stavu výjezdu', async () => {
      const { deps, journeys, knowledge } = await setup();
      await journeys.create(crossing());
      await rounds(deps, LAUNCH + 1, END);
      expect((await stored(journeys)).phase).toBe('done');
      expect(await knowledge.of('h-pa', EAST)).toEqual(wholeCross.state.seen!['1,0']);
    });

    it('pád mezi uložením bodu a doručením znalosti – další kolo ji doručí; opakované doručení nic nezmění', async () => {
      const { deps, journeys, knowledge } = await setup();
      await journeys.create(crossing());
      let crashed = false;
      const merge = knowledge.merge.bind(knowledge);
      knowledge.merge = (houseId, cell, seen) => {
        if (crashed) return merge(houseId, cell, seen);
        crashed = true;
        return Promise.reject(new Error('spojení spadlo'));
      };
      const outcomes = await rounds(deps, LAUNCH + 1, END);
      expect(outcomes.filter((o) => o === 'failed')).toHaveLength(1);
      expect(await knowledge.of('h-pa', EAST)).toEqual(wholeCross.state.seen!['1,0']);
      // doručení téže schránky znovu (pád po doručení, před smazáním) – znalost se nemění
      const before = JSON.stringify(await knowledge.of('h-pa', EAST));
      const seen = wholeCross.state.seen!['1,0']!;
      await knowledge.merge('h-pa', EAST, seen);
      expect(JSON.stringify(await knowledge.of('h-pa', EAST))).toBe(before);
      expect((await journeys.checkpoint('j1'))?.outbox).toBeNull();
    });
  });

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

  it('kolo, ve kterém skupina mapu nezměnila, se na válku neptá; přejezd na jinou mapu jednou', async () => {
    const { deps, journeys } = await setup();
    const asked: GridCell[] = [];
    const used: StepJourneysDeps = {
      ...deps,
      memory: newCampaignMemory<JourneyState>(),
      atWar: (_playerId, cell) => {
        asked.push(cell);
        return Promise.resolve(false);
      },
    };
    // j1 jezdí jen po domovské mapě; j2 přejede na mapu na východ, počká a vrátí se
    await journeys.create(journey());
    await journeys.create(journey({ id: 'j2', order: { kind: 'cross', cell: EAST } }));
    await rounds(used, LAUNCH + 1, END);
    expect((await stored(journeys)).phase).toBe('done');
    expect((await stored(journeys, 'j2')).phase).toBe('done');
    // jediný dotaz – vjezd j2 na východní mapu; návrat domů (fáze returning) se neptá
    expect(asked).toEqual([EAST]);
  });

  it('vjezd na mapu rodu ve válce zapíše „Domů“ za hráče jednou a skupina se vrátí', async () => {
    const s = await setup();
    await startWar(s);
    const start = journey({ order: { kind: 'cross', cell: EAST } });
    const crossed = firstTickOn(start, EAST, LAUNCH + 1000);
    await s.journeys.create(start);
    // kola po taktu kolem vjezdu: „Domů“ platí až za INTENT_LEAD_TICKS – mezitím se nepřidá podruhé
    await rounds(s.deps, LAUNCH + 1, crossed - 9);
    await rounds(s.deps, crossed - 8, crossed + 8, 1);
    await rounds(s.deps, crossed + 12, END);
    expect(queued(s.journeys)).toEqual([
      {
        journeyId: 'j1',
        tick: crossed + INTENT_LEAD_TICKS,
        byPlayer: 'pa',
        body: { kind: 'home' },
      },
    ]);
    const back = await stored(s.journeys);
    expect(back.phase).toBe('done');
    expect(back.groups[0]!.cell).toEqual(HOME.cell);
    expect(s.notices.notices.map((n) => n.kind)).toEqual(['journey-returned']);
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

  it('domovská ves v archivu (Začít znovu) – záznam zůstal, den stojí – výjezd skončí bez událostí', async () => {
    const { deps, journeys, villages, notices } = await setup();
    // sídlo Lhoty je v archivu: záznam vsi zůstal, ale worker ji dál nedopočítá – den stojí před
    // druhým dnem výjezdu
    villages.records.set('lhota', {
      ...villages.records.get('lhota')!,
      state: { ...HOME_STATE, lastDay: SUMMER - 1 },
    });
    villages.archivedSettlements.add('s-lhota');
    await journeys.create(journey());
    const outcomes = await rounds(deps, LAUNCH + 1, LAUNCH + 401);
    expect(outcomes).not.toContain('failed');
    expect((await stored(journeys)).phase).toBe('done');
    expect(villages.inbox.events).toEqual([]);
    expect(notices.notices).toEqual([]);
    expect(await journeys.active()).toEqual([]);
  });

  it.each([
    ['vymřelá', { extinctDay: SUMMER - 1 }],
    ['opuštěná', { abandonedDay: SUMMER - 1 }],
  ])('%s ves na mapě skupiny je hotová – výjezd se nezasekne (Ruling 40)', async (_name, mark) => {
    const { deps, journeys, villages } = await setup();
    // spící ves je první na domovské mapě; její den stojí daleko před dneškem
    villages.records.set('spici', {
      id: 'spici',
      settlementId: 's-spici',
      name: 'Spící',
      state: village([], [], { lastDay: SUMMER - 1, ...mark }),
      version: 1,
    });
    const cells: CampaignCells = {
      mapOf: () => Promise.resolve({ ...MEADOW, villageIds: ['spici', 'lhota'] }),
    };
    await journeys.create(journey());
    const outcomes = await rounds({ ...deps, cells }, LAUNCH + 1, LAUNCH + 801);
    expect(outcomes).not.toContain('waiting');
    expect(outcomes).toContain('computed');
    expect((await stored(journeys)).phase).toBe('out');
  });

  it('ves bez značky se starým dnem dál skupinu zdrží', async () => {
    const { deps, journeys, villages } = await setup();
    villages.records.set('zivy', {
      id: 'zivy',
      settlementId: 's-zivy',
      name: 'Živý',
      state: village([], [], { lastDay: SUMMER - 1 }),
      version: 1,
    });
    const cells: CampaignCells = {
      mapOf: () => Promise.resolve({ ...MEADOW, villageIds: ['zivy', 'lhota'] }),
    };
    await journeys.create(journey());
    const outcomes = await rounds({ ...deps, cells }, LAUNCH + 1, LAUNCH + 801);
    expect(outcomes.at(-1)).toBe('waiting');
  });

  it('ves, která jen čeká na dopočet (sídlo není v archivu), výjezd neukončí', async () => {
    const { deps, journeys, villages } = await setup();
    villages.records.set('lhota', {
      ...villages.records.get('lhota')!,
      state: { ...HOME_STATE, lastDay: SUMMER - 1 },
    });
    await journeys.create(journey());
    const outcomes = await rounds(deps, LAUNCH + 1, LAUNCH + 401);
    expect(outcomes.at(-1)).toBe('waiting');
    expect((await stored(journeys)).phase).toBe('out');
  });
});

describe('recallJourneysAtWar', () => {
  /** Začátek války rodů hráčů `pa` a `pb` v taktu `tick`. */
  const recallAt = async (s: Setup, tick: number): Promise<void> => {
    await recallJourneysAtWar(s.recall, {
      houses: await warHouses(s),
      nowMs: msOfTick(tick, world),
    });
  };
  /** Rozkaz „Domů“ za hráče s taktem jako jeho rozkaz (začátek války v taktu `tick`). */
  const home = (journeyId: string, tick: number, byPlayer = 'pa'): unknown => ({
    journeyId,
    tick: tick + INTENT_LEAD_TICKS,
    byPlayer,
    body: { kind: 'home' },
  });

  it('skupina stojí na mapě protivníka – „Domů“ za hráče', async () => {
    const s = await setup();
    const start = journey({ order: { kind: 'cross', cell: EAST } });
    const there = stepJourney(start, LAUNCH + 1000, [], WHOLE).state;
    expect(there.groups[0]).toMatchObject({ cell: EAST, arrived: true });
    await s.journeys.create(there);
    await recallAt(s, LAUNCH + 1004);
    expect(queued(s.journeys)).toEqual([home('j1', LAUNCH + 1004)]);
  });

  it('skupina tam teprve jede s rozkazem „Přes okraj“ – „Domů“; platí pro výjezdy obou rodů', async () => {
    const s = await setup();
    await s.journeys.create(journey({ order: { kind: 'cross', cell: EAST } }));
    // výjezd hráče `pb` z jeho mapy na východě přes okraj na mapu hráče `pa`
    const brod = { ...HOME, villageId: 'brod', cell: EAST };
    await s.journeys.create(
      journey({ id: 'jb', playerId: 'pb', home: brod, order: { kind: 'cross', cell: HOME.cell } }),
    );
    await recallAt(s, LAUNCH + 10);
    expect(queued(s.journeys)).toEqual([home('j1', LAUNCH + 10), home('jb', LAUNCH + 10, 'pb')]);
  });

  it('„Přes okraj“ zapsaný po kontrolním bodu (bod je starší než výpočet workeru) – „Domů“', async () => {
    const s = await setup();
    await s.journeys.create(journey());
    const cross = {
      tick: LAUNCH + 2,
      byPlayer: 'pa',
      body: { kind: 'cross' as const, cell: EAST },
    };
    await s.journeys.addIntent('j1', cross);
    await recallAt(s, LAUNCH + 40);
    expect(queued(s.journeys)).toEqual([{ journeyId: 'j1', ...cross }, home('j1', LAUNCH + 40)]);
  });

  it('výjezd jinde – na vlastní mapě i na mapě rodu mimo válku – nezapíše nic', async () => {
    const s = await setup();
    await s.houses.create({ playerId: 'pc', kind: 'player', createdAt: NOW });
    const north = { x: 0, y: 1 };
    await s.settlements.create({
      ownerId: 'pc',
      landscapeSeed: 3,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: north,
    });
    await s.journeys.create(journey());
    await s.journeys.create(journey({ id: 'j2', order: { kind: 'cross', cell: north } }));
    await recallAt(s, LAUNCH + 10);
    expect(s.journeys.intents).toEqual([]);
  });
});
