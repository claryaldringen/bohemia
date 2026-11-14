import { describe, expect, it, vi } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, type PremiumType } from '../../domain/landscape';
import { isLineMan, type Position, type VillageState } from '../../domain/village';
import { removePeople } from '../../domain/village/people/kinship';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  INTENT_LEAD_TICKS,
  msOfTick,
  newJourney,
  type CampaignMember,
  type JourneyMember,
  type JourneyState,
} from '../../domain/war';
import { campaign, LAUNCH, world } from '../../domain/war/__tests__/campaign-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { placeCemetery } from '../place-cemetery';
import { placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { placeOrchard } from '../place-orchard';
import { renameVillage } from '../rename-village';
import { DYNASTY_ALIVE, dynastyStatus, restartGame } from '../restart-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { VILLAGE_EXTINCT } from '../update-village';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryJourneys } from './in-memory-journeys';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

const TODAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const NOW = new Date('2026-11-05T12:00:00Z');
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
/** Ruční krajina testů pro každé sídlo – generátor by se jen zdržoval. */
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });

/** Seedy po řadě – nové sídlo po restartu dostane další. */
/** Hráč bez výjezdu a tažení – porty výjezdů, tažení a hodiny světa pro `restartGame`. */
function noArmies(): {
  journeys: InMemoryJourneys;
  campaigns: InMemoryCampaigns;
  world: typeof world;
} {
  return { journeys: new InMemoryJourneys(), campaigns: new InMemoryCampaigns(), world };
}

function seedsFrom(...values: number[]): SeedSource {
  let next = 0;
  return { nextSeed: () => values[next++ % values.length]! };
}

/**
 * Hráč se sídlem (seed krajiny 11, volitelně s prémiovým typem) a založenou vsí; `kill` ji nechá
 * vymřít.
 */
async function playerWithVillage(
  kill: boolean,
  premiumType: PremiumType | null = null,
): Promise<{
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
  settlementId: string;
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.seatAtOrigin({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
    premiumType,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: seedsFrom(4242) },
    {
      settlementId: seat.id,
      landscape,
      today: TODAY - 40,
      name: 'Libice',
      dwelling: at(-50, -50),
      fieldCells: block(6, 6, 4, 4),
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  if (kill) villages.edit(founded.village.id, dieOut);
  return { settlements, villages, settlementId: seat.id, villageId: founded.village.id };
}

/** Zemřou všichni muži rodu (lord.md – Konec rodu) – rod vymře příští dopočítaný den. */
function lineDiesOut(state: VillageState): void {
  removePeople(state, new Set(state.people.filter(isLineMan).map((p) => p.id)));
}

/** Všichni zemřou – ves vymře příští dopočítaný den (jako ves uložená bez lidí). */
function dieOut(state: VillageState): void {
  state.people = [];
}

describe('dynastyStatus', () => {
  it('dopočítá vsi do dneška – ves bez lidí vymře, uloží se a hra končí', async () => {
    const { settlements, villages, villageId } = await playerWithVillage(true);
    const status = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(status.gameOver).toBe(true);
    expect(status.villages).toHaveLength(1);
    expect(status.villages[0]?.state.extinctDay).toBe(TODAY - 39);
    expect(villages.records.get(villageId)?.state.extinctDay).toBe(TODAY - 39);
  });

  it('stav každé vsi načte jednou – seznam vsí jen z otisků (bez stavu)', async () => {
    const living = await playerWithVillage(false);
    const list = vi.spyOn(living.villages, 'listBySettlement');
    const find = vi.spyOn(living.villages, 'find');
    const status = await dynastyStatus(
      { ...living, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(status.villages.map((v) => v.id)).toEqual([living.villageId]);
    // dřív i celé vsi sídla se stavem (listBySettlement) – jen kvůli id
    expect(list).not.toHaveBeenCalled();
    expect(find.mock.calls.every(([id]) => id === living.villageId)).toBe(true);
  });

  it('se živou vsí ani bez vsi hra nekončí', async () => {
    const living = await playerWithVillage(false);
    const alive = await dynastyStatus(
      { ...living, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(alive.gameOver).toBe(false);
    const fresh = await dynastyStatus(
      { settlements: new InMemorySettlements(), villages: new InMemoryVillages(), landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(fresh).toEqual({ settlements: [], villages: [], gameOver: false });
  });
});

describe('spící vsi se kvůli dni neukládají', () => {
  it('vymřelá ves: pozdější dopočet nic neuloží a konec hry zůstane', async () => {
    const { settlements, villages, villageId } = await playerWithVillage(true);
    const deps = { settlements, villages, landscapes };
    const first = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
    expect(first.gameOver).toBe(true);
    const saved = villages.records.get(villageId);
    const saves = villages.saves;
    const later = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY + 30 });
    expect(later.gameOver).toBe(true);
    expect(villages.saves).toBe(saves);
    expect(villages.records.get(villageId)?.version).toBe(saved?.version);
    expect(villages.records.get(villageId)?.state.lastDay).toBe(saved?.state.lastDay);
    expect(later.villages[0]?.state).toEqual(saved?.state);
  }, 30_000);

  it('načtení spící vsi verzi nemění', async () => {
    const { settlements, villages, villageId } = await playerWithVillage(true);
    await dynastyStatus({ settlements, villages, landscapes }, { playerId: PLAYER, today: TODAY });
    const version = villages.records.get(villageId)?.version;
    const loaded = await loadVillage({ villages }, { villageId, today: TODAY + 100, landscape });
    expect(loaded?.version).toBe(version);
    expect(villages.records.get(villageId)?.version).toBe(version);
  }, 30_000);
});

describe('konec rodu (lord.md – Konec rodu)', () => {
  it('rod vymřel – hra končí, ves s lidmi je opuštěná ode dne konce rodu a uložená', async () => {
    const { settlements, villages, villageId } = await playerWithVillage(false);
    villages.edit(villageId, lineDiesOut);
    const status = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(status.gameOver).toBe(true);
    const saved = villages.records.get(villageId)?.state;
    expect(saved?.dynasty?.endedDay).toBe(TODAY - 39);
    expect(saved?.abandonedDay).toBe(TODAY - 39);
    expect(saved?.extinctDay).toBeUndefined();
    expect(saved?.people.length).toBeGreaterThan(0);
    expect(saved?.chronicle.filter((e) => e.kind === 'village-abandoned')).toEqual([
      { day: TODAY - 39, kind: 'village-abandoned', reason: 'line-ended' },
    ]);
    expect(status.villages[0]?.state).toEqual(saved);
    // další dopočet nic nemění – ves se nedopočítává
    const version = villages.records.get(villageId)?.version;
    const again = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY + 20 },
    );
    expect(again.gameOver).toBe(true);
    expect(villages.records.get(villageId)?.state.people).toEqual(saved?.people);
    expect(villages.records.get(villageId)?.state.chronicle).toEqual(saved?.chronicle);
    // spící ves se kvůli dni neukládá (worker.md – Úloha 4)
    expect(villages.records.get(villageId)?.version).toBe(version);
  }, 30_000);

  it('restart bez abandon je po konci rodu povolen; se živým rodem odmítne', async () => {
    const alive = await playerWithVillage(false);
    expect(
      await restartGame(
        {
          ...alive,
          landscapes,
          worldSeed: 4242,
          houses: new InMemoryHouses(),
          ...noArmies(),
          now: () => NOW,
        },
        { playerId: PLAYER, today: TODAY },
      ),
    ).toEqual({ ok: false, reason: DYNASTY_ALIVE });
    alive.villages.edit(alive.villageId, lineDiesOut);
    const result = await restartGame(
      {
        ...alive,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result.ok).toBe(true);
    expect(alive.settlements.archived.has(alive.settlementId)).toBe(true);
  }, 30_000);
});

describe('restartGame', () => {
  it('po vymření archivuje sídlo a založí nové s novým seedem – bez vsi', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage(true);
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).not.toBe(settlementId);
    expect(result.settlement).toMatchObject({ ownerId: PLAYER, isSeat: true });
    expect(result.settlement.landscapeSeed).not.toBe(11);
    expect(settlements.archived.has(settlementId)).toBe(true);
    expect(await settlements.findSeat(PLAYER)).toEqual(result.settlement);
    expect(await settlements.listActive(PLAYER)).toEqual([result.settlement]);
    // vymřelá ves zůstane v archivu, nové sídlo zakládá ves jako nový hráč
    expect(villages.records.get(villageId)?.state.extinctDay).toBeDefined();
    expect(villages.records.has(result.settlement.id)).toBe(false);
    const after = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(after.gameOver).toBe(false);
    const again = await foundVillageForSettlement(
      { villages, seeds: seedsFrom(1) },
      {
        settlementId: result.settlement.id,
        landscape,
        today: TODAY,
        name: 'Nová Libice',
        dwelling: at(-50, -50),
      },
    );
    expect(again.ok).toBe(true);
  }, 30_000);

  it('Začít znovu nepřelosuje prémiový typ – nové sídlo má typ hráče, i když je ve světě vzácnější', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(true, 'iron-ore');
    // jiný hráč s jiným typem – nejméně zastoupený by byl kterýkoli třetí, ne železná ruda
    await settlements.create({
      ownerId: 'hrac-2',
      landscapeSeed: 5,
      layerVersions: CURRENT_LAYER_VERSIONS,
      premiumType: 'fertile',
      worldCell: { x: 9, y: 9 },
    });
    const asked: (PremiumType | undefined)[] = [];
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes: {
          landscapeOf: (_seed, _versions, premium) => {
            asked.push(premium);
            return landscape;
          },
        },
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).not.toBe(settlementId);
    expect(result.settlement).toMatchObject({
      isSeat: true,
      premiumType: 'iron-ore',
      layerVersions: { ...CURRENT_LAYER_VERSIONS, premium: 2 },
    });
    expect(result.landscape.premium).toBe('iron-ore');
    expect(asked.every((p) => p === 'iron-ore')).toBe(true);
    expect(await settlements.lastPremiumType(PLAYER)).toBe('iron-ore');
    expect(await settlements.premiumTypeCounts()).toEqual({ 'iron-ore': 1, fertile: 1 });
  }, 60_000);

  it('se živou vsí restart odmítne a nic nezmění', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(false);
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY },
    );
    expect(result).toEqual({ ok: false, reason: DYNASTY_ALIVE });
    expect(settlements.archived.size).toBe(0);
    expect((await settlements.findSeat(PLAYER))?.id).toBe(settlementId);
  });

  it('bez vsi vrátí sídlo beze změny (druhý restart po prvním)', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses: new InMemoryHouses(),
      ...noArmies(),
      now: () => NOW,
    };
    const first = await restartGame(deps, { playerId: PLAYER, today: TODAY });
    const second = await restartGame(deps, { playerId: PLAYER, today: TODAY });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.settlement).toEqual(first.settlement);
    expect(settlements.settlements).toHaveLength(2);
  }, 30_000);

  it('souběžné restarty založí jediné nové sídlo', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses: new InMemoryHouses(),
      ...noArmies(),
      now: () => NOW,
    };
    const results = await Promise.all(
      [1, 2, 3].map(() => restartGame(deps, { playerId: PLAYER, today: TODAY })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.settlement.id : '')));
    expect(ids.size).toBe(1);
    expect(await settlements.listActive(PLAYER)).toHaveLength(1);
  }, 60_000);
});

describe('restartGame a rod', () => {
  it('ukončí živý rod s herním dnem konce a další vstup založí nový', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const houses = new InMemoryHouses();
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses,
      ...noArmies(),
      now: () => NOW,
    };
    const first = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: NOW });
    const result = await restartGame(deps, { playerId: PLAYER, today: TODAY });
    expect(result.ok).toBe(true);
    expect(houses.houses).toHaveLength(2);
    expect(houses.houses[0]).toMatchObject({ id: first.id, endedAt: NOW, endedDay: TODAY });
    expect((await houses.activeOf(PLAYER))?.id).not.toBe(first.id);
    // druhý restart bez vsí rod nechá být
    await restartGame(deps, { playerId: PLAYER, today: TODAY });
    expect(houses.houses).toHaveLength(2);
  }, 30_000);
});

describe('restartGame s abandon (nabídka hry)', () => {
  it('se živou vsí archivuje sídlo i se vsí a založí nové s novým seedem', async () => {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage(false);
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY, abandon: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.id).not.toBe(settlementId);
    expect(result.settlement).toMatchObject({ ownerId: PLAYER, isSeat: true });
    expect(result.settlement.landscapeSeed).not.toBe(11);
    expect(settlements.archived.has(settlementId)).toBe(true);
    expect(await settlements.listActive(PLAYER)).toEqual([result.settlement]);
    // opuštěná ves zůstane v archivu, jak byla – živá, jen se dál nedopočítává
    const abandoned = villages.records.get(villageId)?.state;
    expect(abandoned?.extinctDay).toBeUndefined();
    expect(abandoned?.people.length).toBeGreaterThan(0);
    expect(villages.records.has(result.settlement.id)).toBe(false);
    const after = await dynastyStatus(
      { settlements, villages, landscapes },
      { playerId: PLAYER, today: TODAY },
    );
    expect(after).toMatchObject({ villages: [], gameOver: false });
  }, 30_000);

  it('bez abandon (i s abandon: false) se živou vsí dál odmítne', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(false);
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY, abandon: false },
    );
    expect(result).toEqual({ ok: false, reason: DYNASTY_ALIVE });
    expect(settlements.archived.size).toBe(0);
    expect((await settlements.findSeat(PLAYER))?.id).toBe(settlementId);
  });

  it('po vymření funguje jako restart z obrazovky porážky', async () => {
    const { settlements, villages, settlementId } = await playerWithVillage(true);
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        ...noArmies(),
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY, abandon: true },
    );
    expect(result.ok && result.settlement.id !== settlementId).toBe(true);
    expect(settlements.archived.has(settlementId)).toBe(true);
  }, 30_000);

  it('bez vsi vrátí sídlo beze změny – opakované potvrzení nezaloží další krajinu', async () => {
    const { settlements, villages } = await playerWithVillage(false);
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses: new InMemoryHouses(),
      ...noArmies(),
      now: () => NOW,
    };
    const first = await restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true });
    const second = await restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.settlement).toEqual(first.settlement);
    expect(settlements.settlements).toHaveLength(2);
    expect(settlements.archived.size).toBe(1);
  }, 30_000);

  it('souběžné restarty se živou vsí založí jediné nové sídlo', async () => {
    const { settlements, villages } = await playerWithVillage(false);
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses: new InMemoryHouses(),
      ...noArmies(),
      now: () => NOW,
    };
    const results = await Promise.all(
      [1, 2, 3].map(() => restartGame(deps, { playerId: PLAYER, today: TODAY, abandon: true })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.settlement.id : '')));
    expect(ids.size).toBe(1);
    expect(await settlements.listActive(PLAYER)).toHaveLength(1);
    expect(settlements.settlements).toHaveLength(2);
  }, 60_000);

  it('ukončí běžící výjezd hráče bez událostí a znalosti – nová hra smí vyslat', async () => {
    const { settlements, villages, villageId } = await playerWithVillage(false);
    const journeys = new InMemoryJourneys();
    await journeys.create(runningJourney(villageId));
    // nedoručené události bodu se už nedoručí
    journeys.rows.get('j1')!.outbox = JSON.stringify({ villageEvents: [], notices: [] });
    const result = await restartGame(
      {
        settlements,
        villages,
        landscapes,
        worldSeed: 4242,
        houses: new InMemoryHouses(),
        journeys,
        campaigns: new InMemoryCampaigns(),
        world,
        now: () => NOW,
      },
      { playerId: PLAYER, today: TODAY, abandon: true },
    );
    expect(result.ok).toBe(true);
    expect(await journeys.activeOf(PLAYER)).toBeNull();
    expect(await journeys.active()).toEqual([]);
    const point = await journeys.checkpoint('j1');
    expect(point?.state.phase).toBe('done');
    expect(point?.outbox).toBeNull();
    // souběžný worker s bodem z doby před restartem výjezd neoživí
    const save = await journeys.saveCheckpoint('j1', {
      fromTick: point!.state.tick,
      seenIntents: 0,
      state: { ...point!.state, phase: 'out', tick: point!.state.tick + 40 },
      outbox: null,
    });
    expect(save).toBe('stale');
    expect(await journeys.activeOf(PLAYER)).toBeNull();
  }, 30_000);
});

/** Běžící výjezd hráče z jeho vsi `villageId` (vojvoda je osoba 1). */
function runningJourney(villageId: string): JourneyState {
  const member: JourneyMember = {
    ref: { villageId, personId: 1 },
    lord: true,
    mounted: false,
    strength: 2,
    fight: 50,
    health: 100,
    wounded: false,
    status: 'active',
  };
  return newJourney(
    {
      id: 'j1',
      seed: 1,
      playerId: PLAYER,
      houseId: 'h-1',
      leaderName: 'Bořivoj',
      home: { villageId, name: 'Libice', cell: { x: 0, y: 0 }, pos: { x: -50, z: -50 } },
      members: [member],
      startMs: msOfTick(LAUNCH, world),
      order: { kind: 'go', pos: { x: 100, z: -50 } },
    },
    world,
  );
}

describe('akce ve vymřelé vsi', () => {
  it('stavby i přejmenování odmítne česky, načíst ves jde', async () => {
    const { villages, villageId } = await playerWithVillage(true);
    const base = { villageId, landscape, today: TODAY };
    const deps = { villages };
    const dwelling = await placeDwelling(deps, {
      ...base,
      type: 'zemnice',
      position: at(-80, -50),
    });
    expect(dwelling).toEqual({ ok: false, reason: VILLAGE_EXTINCT });
    expect(await placeField(deps, { ...base, cells: block(10, 6, 3, 4) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await placeCemetery(deps, { ...base, cells: block(0, 12, 2, 2) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await placeOrchard(deps, { ...base, cells: block(0, 12, 2, 1) })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(await renameVillage(deps, { ...base, name: 'Jiná' })).toEqual({
      ok: false,
      reason: VILLAGE_EXTINCT,
    });
    expect(villages.records.get(villageId)?.name).toBe('Libice');
    const loaded = await loadVillage(deps, base);
    expect(loaded?.state.extinctDay).toBe(TODAY - 39);
  });
});

describe('restartGame a jednání', () => {
  it('konec rodu ukončí jeho otevřená jednání', async () => {
    const { settlements, villages } = await playerWithVillage(true);
    const houses = new InMemoryHouses();
    const negotiations = new InMemoryNegotiations(
      new InMemoryVassalages(),
      new InMemoryNotices(),
      () => NOW,
    );
    const mine = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: NOW });
    const other = await houses.create({ playerId: 'jiny', kind: 'player', createdAt: NOW });
    await negotiations.transaction(async (tx) => {
      await tx.open({
        initiatorHouseId: other.id,
        recipientHouseId: mine.id,
        round: { authorHouseId: other.id, items: [], message: null, at: NOW },
      });
    });
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses,
      ...noArmies(),
      negotiations,
      now: () => NOW,
    };
    expect((await restartGame(deps, { playerId: PLAYER, today: TODAY })).ok).toBe(true);
    expect(negotiations.records.map((r) => r.status)).toEqual(['ended']);
  }, 30_000);
});

describe('restartGame během nájezdu (war.md – Začít znovu během nájezdu)', () => {
  const RESTART = { kind: 'turn-back', restart: true } as const;
  const atTick = (tick: number): Date => new Date(msOfTick(tick, world));
  const input = { playerId: PLAYER, today: TODAY, abandon: true };
  /** Muži tažení: Lhota patří `lhota`, Brod `brod`. */
  const owned = (lhota: string, brod: string): CampaignMember[] =>
    campaign().members.map((m) => ({ ...m, playerId: m.ref.villageId === 'brod' ? brod : lhota }));

  /**
   * Hráč vede tažení c1 (s muži vazala), v tažení c2 pána jde jako vazal ve službě; c3 vede jiný
   * hráč bez jeho mužů.
   */
  async function raids(): Promise<{
    deps: Parameters<typeof restartGame>[0];
    campaigns: InMemoryCampaigns;
  }> {
    const { settlements, villages } = await playerWithVillage(false);
    const campaigns = new InMemoryCampaigns();
    await campaigns.create(campaign({ playerId: PLAYER, members: owned(PLAYER, 'vazal') }));
    await campaigns.create(campaign({ id: 'c2', playerId: 'pan', members: owned('pan', PLAYER) }));
    await campaigns.create(
      campaign({ id: 'c3', playerId: 'jiny', members: owned('jiny', 'jiny') }),
    );
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses: new InMemoryHouses(),
      ...noArmies(),
      campaigns,
      now: () => atTick(LAUNCH + 10),
    };
    return { deps, campaigns };
  }

  it('tažení, které hráč vede, dostane obrat domů na takt teď + 2; vazal ve službě ne', async () => {
    const { deps, campaigns } = await raids();
    expect((await restartGame(deps, input)).ok).toBe(true);
    expect(campaigns.intents).toEqual([
      {
        campaignId: 'c1',
        tick: LAUNCH + 10 + INTENT_LEAD_TICKS,
        seq: 1,
        byPlayer: PLAYER,
        body: RESTART,
      },
    ]);
  });

  it('restart vazala ve službě tažení pána neobrátí', async () => {
    const { deps, campaigns } = await raids();
    campaigns.rows.delete('c1');
    expect((await restartGame(deps, input)).ok).toBe(true);
    expect(campaigns.intents).toEqual([]);
  });

  it('takt odmítnutý úložištěm (bod je dál) – záměr na první takt za bodem', async () => {
    const { deps, campaigns } = await raids();
    // worker už tažení spočetl za teď + 2 (hodiny webu pozadu)
    const row = campaigns.rows.get('c1')!;
    row.tick = LAUNCH + 50;
    row.state = JSON.stringify({ ...JSON.parse(row.state), tick: LAUNCH + 50 });
    expect((await restartGame(deps, input)).ok).toBe(true);
    expect(campaigns.intents.map((i) => [i.campaignId, i.tick])).toEqual([['c1', LAUNCH + 51]]);
  });

  it('pád mezi archivem a záměry – opakovaný restart záměr dopíše, i když hráč už vsi nemá', async () => {
    const { deps, campaigns } = await raids();
    const crash = {
      activeOf: (playerId: string) => campaigns.activeOf(playerId),
      checkpoint: (id: string) => campaigns.checkpoint(id),
      addIntent: () => Promise.reject(new Error('pád')),
    };
    await expect(restartGame({ ...deps, campaigns: crash }, input)).rejects.toThrow('pád');
    expect(await deps.settlements.listActive(PLAYER)).toEqual([]);
    const again = await restartGame({ ...deps, now: () => atTick(LAUNCH + 12) }, input);
    expect(again.ok).toBe(true);
    expect(campaigns.intents.map((i) => [i.campaignId, i.tick, i.body])).toEqual([
      ['c1', LAUNCH + 14, RESTART],
    ]);
  }, 30_000);
});
