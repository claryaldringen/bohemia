import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { at, horseVillage } from '../../domain/village/__tests__/horse-fixtures';
import { HUNT_FIGHT, WILDLIFE_LAND } from '../../domain/village/rules/rules-wildlife';
import type { VillageState } from '../../domain/village/types';
import { emptyHunt, pickQuarry } from '../../domain/village/wildlife/hunt';
import { freshWildlife } from '../../domain/village/wildlife/wildlife';
import {
  INTENT_LEAD_TICKS,
  newJourney,
  tickOfMs,
  type CampaignMap,
  type JourneyState,
} from '../../domain/war';
import { land } from '../../domain/war/__tests__/battle-fixtures';
import type { GridCell } from '../../domain/village/people/world-grid';
import { declareHuntInVillage, type DeclareHuntDeps } from '../declare-hunt';
import { musterExpedition, type ExpeditionCommand, type ExpeditionDeps } from '../expedition';
import { VILLAGE_ABANDONED, VILLAGE_EXTINCT, VILLAGE_TRAVELLING } from '../update-village';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Vyhlášení lovu (hunting.md – Pravidla 2, 3; plán 2026-11-22-hunting – Rozhodnutí 1, 4, Úloha 9):
// důvody odepření nic neuloží; jinak ves zaplatí honce zítra a lov běží ve výpravě domovské vsi –
// nové jen s lovem, nebo záměrem `hunt` výpravě, která už běží.

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
/** Hustý les na západě – dvorec stojí v počátku, les od x ≈ −210 m. */
const FOREST: CampaignMap = { landscape: land((tx) => tx < 50), obstacles: null, villageIds: [] };
/** Louka bez lesa. */
const MEADOW: CampaignMap = { landscape: land(), obstacles: null, villageIds: [] };
const SUMMER = at(601, 7, 10);

/** Lhota v létě: dvorec v počátku, vojvoda 10, vesničané 20 a 22, zvěř a díl mužů na stavby 20 čd. */
function lhota(day = SUMMER): VillageState {
  const s = horseVillage(null, 1, 4);
  s.dynasty = { lordId: 10, lords: [] };
  s.lastDay = day;
  s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  s.commonLaborHistory = [20];
  return s;
}

interface World {
  deps: DeclareHuntDeps;
  villages: InMemoryVillages;
  journeys: InMemoryJourneys;
  homeId: string;
  houseId: string;
}

/**
 * Odříznutý nováček: rod bez místa na mapě světa (`unplaced`), ves v místní mřížce rodu (`local` –
 * sídlo na (0, 0), nebo ves syna na zadaném místním políčku).
 */
interface Isolation {
  unplaced?: boolean;
  local?: boolean | GridCell;
}

async function setup(
  state: VillageState = lhota(),
  map: CampaignMap = FOREST,
  isolation: Isolation = {},
): Promise<World> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const house = await houses.create({
    playerId: 'pa',
    kind: 'player',
    createdAt: NOW,
    ...(isolation.unplaced ? { placedAt: null } : {}),
  });
  const place = { ownerId: 'pa', landscapeSeed: 1, layerVersions: CURRENT_LAYER_VERSIONS };
  const seat = isolation.local
    ? (await settlements.createSeat({ ...place, localCell: { x: 0, y: 0 } }))!
    : await settlements.seatAtOrigin(place);
  const son =
    typeof isolation.local === 'object'
      ? (await settlements.create({ ...place, landscapeSeed: 2, localCell: isolation.local }))!
      : null;
  const home = await villages.add((son ?? seat).id, 'Lhota', state);
  const journeys = new InMemoryJourneys();
  let n = 0;
  const deps: DeclareHuntDeps = {
    settlements,
    villages,
    houses,
    journeys,
    cells: {
      // políčko světa se stejnými čísly je cizí mapa – ves v místní mřížce má svou jen `villageMapOf`
      mapOf: () => Promise.resolve(isolation.local ? MEADOW : map),
      villageMapOf: (id) => Promise.resolve(isolation.local && id === home.id ? map : MEADOW),
    },
    world: OFFICIAL_WORLD,
    seeds: { nextSeed: () => 77 },
    newId: () => `jny-${++n}`,
  };
  return { deps, villages, journeys, homeId: home.id, houseId: house.id };
}

function declare(w: World, playerId = 'pa'): ReturnType<typeof declareHuntInVillage> {
  return declareHuntInVillage(w.deps, { playerId, villageId: w.homeId, now: NOW });
}

async function villageOf(w: World): Promise<VillageState> {
  return (await w.villages.find(w.homeId))!.state;
}

async function journeyOf(w: World, id: string): Promise<JourneyState> {
  return (await w.journeys.checkpoint(id))!.state;
}

/** Odepřený lov: důvod, žádný zápis vsi ani výpravy. */
async function deniedWith(w: World, reason: string): Promise<void> {
  const saves = w.villages.saves;
  const rows = w.journeys.rows.size;
  const intents = w.journeys.intents.length;
  expect(await declare(w)).toEqual({ ok: false, reason });
  expect(w.villages.saves).toBe(saves);
  expect(w.journeys.rows.size).toBe(rows);
  expect(w.journeys.intents).toHaveLength(intents);
}

/** Běžící výprava Lhoty – vesničan 20 jde 300 m na východ (na domovské mapě). */
async function running(w: World): Promise<JourneyState> {
  const state = newJourney(
    {
      id: 'jny-0',
      seed: 3,
      playerId: 'pa',
      houseId: w.houseId,
      home: { villageId: w.homeId, name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } },
      recruits: [
        { ref: { villageId: w.homeId, personId: 20 }, lord: false, strength: 1, fight: 0 },
      ],
      startMs: NOW.getTime() - 10_000,
      order: { kind: 'go', pos: { x: 305, z: 5 } },
    },
    OFFICIAL_WORLD,
  );
  await w.journeys.create(state);
  w.villages.edit(w.homeId, (s) => {
    s.people.find((p) => p.id === 20)!.away = { kind: 'journey', refId: 'jny-0' };
  });
  return state;
}

describe('declareHuntInVillage – vyhlášení lovu (plán 2026-11-22-hunting, Úloha 9)', () => {
  it('bez výpravy: nová výprava jen s lovem, ves zaplatí honce zítra a zapíše pořadí vyhlášení', async () => {
    const w = await setup();
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    const v = await villageOf(w);
    expect(v.wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 6 });
    expect(v.wildlife?.hunt?.declared).toBe(1);
    const j = await journeyOf(w, 'jny-1');
    expect(j).toMatchObject({ playerId: 'pa', houseId: w.houseId, groups: [], members: [] });
    expect(j.home).toMatchObject({ villageId: w.homeId, cell: { x: 0, y: 0 } });
    expect(j.hunt).toMatchObject({ id: 1, day: SUMMER, dogs: 0 });
    // honci ze dvorce k dveřím hustého lesa na západě, zvíře zatím v lese
    const hunt = j.hunt!;
    expect(hunt.beaters.from).toEqual(j.home.pos);
    expect(hunt.beaters.door.x).toBeLessThan(-200);
    expect(
      Math.hypot(hunt.out.x - hunt.beaters.door.x, hunt.out.z - hunt.beaters.door.z),
    ).toBeCloseTo(HUNT_FIGHT.emergeM, 6);
    expect(hunt.fight.quarry.state).toBe('hidden');
    // los zvířete ze seedu vsi, dne vyhlášení a pořadí vyhlášení
    expect(hunt.fight.quarry.kind).toBe(pickQuarry(v.wildlife!, v.seed, SUMMER, 1));
    expect(w.journeys.intents).toEqual([]);
  });

  it('výprava venku: záměr „hunt“ na takt teď + INTENT_LEAD_TICKS, skupiny beze změny', async () => {
    const w = await setup();
    const before = await running(w);
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-0' });
    expect(w.journeys.rows.size).toBe(1);
    const [intent, ...rest] = w.journeys.intents;
    expect(rest).toEqual([]);
    expect(intent).toMatchObject({
      journeyId: 'jny-0',
      tick: tickOfMs(NOW.getTime(), OFFICIAL_WORLD) + INTENT_LEAD_TICKS,
      byPlayer: 'pa',
      body: { kind: 'hunt', start: { day: SUMMER, dogs: 0 } },
    });
    const body = intent!.body;
    if (body.kind !== 'hunt') throw new Error('záměr lovu');
    expect(body.start.door.x).toBeLessThan(-200);
    const after = await journeyOf(w, 'jny-0');
    expect(after.groups).toEqual(before.groups);
    expect(after.members).toEqual(before.members);
    expect(after.hunt).toBeUndefined();
    const v = await villageOf(w);
    expect(v.wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 6 });
    expect(v.people.find((p) => p.id === 20)!.away).toEqual({ kind: 'journey', refId: 'jny-0' });
  });

  it('already – lov vsi už běží ve výpravě', async () => {
    const w = await setup();
    expect((await declare(w)).ok).toBe(true);
    await deniedWith(w, 'already');
  });

  it('already – lidé venku a záměr prvního lovu ještě čeká: ves zaplatí honce jen jednou', async () => {
    const w = await setup();
    await running(w);
    // práce vsi stačí na honce dvou lovů – odmítne je jen čekající záměr
    w.villages.edit(w.homeId, (s) => {
      s.commonLaborHistory = [40];
    });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-0' });
    // worker záměr ještě neuplatnil – bod výpravy lov nemá
    expect((await journeyOf(w, 'jny-0')).hunt).toBeUndefined();
    await deniedWith(w, 'already');
    expect(w.journeys.intents).toHaveLength(1);
    const hunt = (await villageOf(w)).wildlife?.hunt;
    expect(hunt?.beaters).toEqual({ day: SUMMER + 1, men: 6 });
    expect(hunt?.declared).toBe(1);
  });

  it('odříznutý nováček (rod bez místa na mapě světa, sídlo v místní mřížce) – lov ve výpravě místní mřížky z krajiny vsi', async () => {
    const w = await setup(lhota(), FOREST, { unplaced: true, local: true });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    expect((await villageOf(w)).wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 6 });
    const j = await journeyOf(w, 'jny-1');
    expect(j.localGrid).toBe(true);
    expect(j.home).toMatchObject({ villageId: w.homeId, cell: { x: 0, y: 0 } });
    // dveře hustého lesa z krajiny vsi (`villageMapOf`) – políčko světa (0, 0) je louka bez lesa
    expect(j.hunt?.beaters.door.x).toBeLessThan(-200);
    // lov běží – druhé vyhlášení už ne
    await deniedWith(w, 'already');
  });

  it('ves syna v místní mřížce: domov na jejím místním políčku, mapa z její krajiny', async () => {
    const w = await setup(lhota(), FOREST, { unplaced: true, local: { x: 1, y: -1 } });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    const j = await journeyOf(w, 'jny-1');
    expect(j).toMatchObject({ localGrid: true, home: { cell: { x: 1, y: -1 } } });
    expect(j.hunt?.beaters.door.x).toBeLessThan(-200);
  });

  it('odříznutý nováček s lovem: ostatní výpravy dál unreachable, útok na zvíře ne', async () => {
    const w = await setup(lhota(), FOREST, { unplaced: true, local: true });
    const deps: ExpeditionDeps = {
      ...w.deps,
      campaigns: new InMemoryCampaigns(),
      atWar: () => Promise.resolve(true),
    };
    const send = (command: ExpeditionCommand): ReturnType<typeof musterExpedition> =>
      musterExpedition(deps, {
        playerId: 'pa',
        villageId: w.homeId,
        people: [20],
        command,
        now: NOW,
      });
    const go = { kind: 'order', order: { kind: 'go', pos: { x: 105, z: 5 } } } as const;
    // bez lovu výprava nemá odkud vyjet
    expect(await send(go)).toEqual({ ok: false, reason: 'unreachable' });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    // s lovem: lidé ze vsi s rozkazem i přes okraj dál unreachable, nikdo neodešel
    expect(await send(go)).toEqual({ ok: false, reason: 'unreachable' });
    const east = { kind: 'order', order: { kind: 'cross', cell: { x: 1, y: 0 } } } as const;
    expect(await send(east)).toEqual({ ok: false, reason: 'unreachable' });
    expect((await villageOf(w)).people.find((p) => p.id === 20)?.away).toBeUndefined();
    // útok na zvíře zatím v lese – důvod lovu, ne místní mřížky
    expect(await send({ kind: 'strike' })).toEqual({ ok: false, reason: 'no-quarry' });
  });

  it('rod bez místa na mapě světa se sídlem na políčku světa – unreachable jako výprava, nic se neuloží', async () => {
    await deniedWith(await setup(lhota(), FOREST, { unplaced: true }), 'unreachable');
  });

  it('víc lovů za den: hráč i správce na zítřek, honci obou se sečtou', async () => {
    const w = await setup();
    w.villages.edit(w.homeId, (s) => {
      // správce vyhlásil lov na zítřek (jeho honci a lovec jsou v rezervaci)
      s.wildlife!.hunt = {
        ...emptyHunt(),
        npc: { day: SUMMER + 1 },
        beaters: { day: SUMMER + 1, men: 7 },
      };
      s.commonLaborHistory = [40];
    });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    const v = await villageOf(w);
    expect(v.wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 13 });
    expect(v.wildlife?.hunt?.npc).toEqual({ day: SUMMER + 1 });
  });

  it('dva lovy hráče po sobě týž den: první skončil, druhý projde a rezervace se sečte', async () => {
    const w = await setup();
    w.villages.edit(w.homeId, (s) => {
      s.commonLaborHistory = [40];
    });
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    w.journeys.rows.get('jny-1')!.status = 'done';
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-2' });
    const v = await villageOf(w);
    expect(v.wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 12 });
    expect(v.wildlife?.hunt?.declared).toBe(2);
  });

  it('nežijící ves lov nevyhlásí a nic neuloží – vymřelá, opuštěná, na cestě', async () => {
    const cases: [(s: VillageState) => void, string][] = [
      [(s) => (s.extinctDay = SUMMER - 5), VILLAGE_EXTINCT],
      [(s) => (s.abandonedDay = SUMMER - 5), VILLAGE_ABANDONED],
      [
        (s) => (s.journey = { startDay: SUMMER - 1 } as unknown as VillageState['journey']),
        VILLAGE_TRAVELLING,
      ],
    ];
    for (const [mark, reason] of cases) {
      const state = lhota();
      mark(state);
      await deniedWith(await setup(state), reason);
    }
  });

  it('zápis výpravy selže: ves honce i pořadí vyhlášení vrátí', async () => {
    const w = await setup();
    w.journeys.failCreate = new Error('db');
    await expect(declare(w)).rejects.toThrow('db');
    const hunt = (await villageOf(w)).wildlife?.hunt;
    expect(hunt?.beaters).toBeUndefined();
    expect(hunt?.declared ?? 0).toBe(0);
  });

  it('výprava mezitím skončila (záměr nevyšel): lov dostane novou výpravu se stejným domovem', async () => {
    const w = await setup();
    await running(w);
    w.journeys.addIntent = () => {
      w.journeys.rows.get('jny-0')!.status = 'done';
      return Promise.resolve(null);
    };
    expect(await declare(w)).toEqual({ ok: true, journeyId: 'jny-1' });
    expect((await journeyOf(w, 'jny-1')).home).toMatchObject({
      villageId: w.homeId,
      pos: { x: 5, z: 5 },
    });
    expect((await journeyOf(w, 'jny-1')).hunt).toBeDefined();
    expect((await villageOf(w)).wildlife?.hunt?.beaters).toEqual({ day: SUMMER + 1, men: 6 });
  });

  it('closed-season – v dubnu hájení', async () => {
    await deniedWith(await setup(lhota(at(601, 4, 10))), 'closed-season');
  });

  it('no-beaters – ves zítra neuvolní 6 mužů na honce', async () => {
    const small = lhota();
    small.commonLaborHistory = [1];
    await deniedWith(await setup(small), 'no-beaters');
  });

  it('no-game – mapa bez hustého lesa, nebo v lese vsi není zvěř', async () => {
    await deniedWith(await setup(lhota(), MEADOW), 'no-game');
    const empty = lhota();
    delete empty.wildlife;
    await deniedWith(await setup(empty), 'no-game');
  });

  it('cizí ves – no-village; souběžné zápisy vsi – busy, výprava nevznikne', async () => {
    const w = await setup();
    expect(await declare(w, 'pb')).toEqual({ ok: false, reason: 'no-village' });
    w.villages.beforeSave = (id) => w.villages.edit(id, () => {});
    expect(await declare(w)).toEqual({ ok: false, reason: 'busy' });
    expect(w.journeys.rows.size).toBe(0);
  });
});
