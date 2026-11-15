import { describe, expect, it, vi } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, type PremiumType } from '../../domain/landscape';
import { departAppointee, isLineMan, type Position, type VillageState } from '../../domain/village';
import { removePeople } from '../../domain/village/people/kinship';
import {
  applyRefugeArrive,
  applyRefugeDepart,
} from '../../domain/village/fortification/state/refugees';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  INTENT_LEAD_TICKS,
  msOfTick,
  newJourney,
  type CampaignMember,
  type JourneyRecruit,
  type JourneyState,
} from '../../domain/war';
import { campaign, LAUNCH, world } from '../../domain/war/__tests__/campaign-fixtures';
import type { CampaignState } from '../../domain/war';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { placeCemetery } from '../place-cemetery';
import { placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { placeOrchard } from '../place-orchard';
import { renameVillage } from '../rename-village';
import { appointLords } from '../appoint-lord';
import { finishSurrendered } from '../cede-village';
import { acceptHolderTransfers } from '../escheat';
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
    villages.archivedSettlements = settlements.archived;
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
    expect(await journeys.activeOfPlayer(PLAYER)).toEqual([]);
    expect(await journeys.active()).toEqual([]);
    // domov v archivu – událost do vsi nejde
    expect(villages.inbox.events.filter((e) => e.body.kind === 'away-ends')).toEqual([]);
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
    expect(await journeys.activeOfPlayer(PLAYER)).toEqual([]);
  }, 30_000);
});

/** Běžící výjezd hráče z jeho vsi `villageId` (vojvoda je osoba 1). */
function runningJourney(villageId: string, id = 'j1'): JourneyState {
  const member: JourneyRecruit = {
    ref: { villageId, personId: 1 },
    lord: true,
    strength: 2,
    fight: 50,
    name: 'Bořivoj',
  };
  return newJourney(
    {
      id,
      seed: 1,
      playerId: PLAYER,
      houseId: 'h-1',
      home: { villageId, name: 'Libice', cell: { x: 0, y: 0 }, pos: { x: -50, z: -50 } },
      recruits: [member],
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
      activeAgainst: (villageId: string) => campaigns.activeAgainst(villageId),
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

describe('Začít znovu obránce – ves pod nájezdem připadne útočníkovi (war.md)', () => {
  const SURRENDER = { kind: 'turn-back', restart: true, surrender: true } as const;
  const LEADER = 'utocnik';
  const atTick = (tick: number): Date => new Date(msOfTick(tick, world));
  const input = { playerId: PLAYER, today: TODAY, abandon: true };
  const NO_HERD = { sheep: 0, goat: 0, pig: 0, cow: 0 };

  /**
   * Obránce (`PLAYER`) s Libicí na sídelní mapě a nájezdy na ni ve fázích `phases` – první vede
   * `LEADER`, další `druhy` (založené později). Volitelně druhá mapa obránce s hradištěm Hradec, kam
   * odešli tři lidé Libice se 300 kg a stádem (došli – pobyt u hostitele).
   */
  async function defended(phases: CampaignState['phase'][], refuge = false) {
    const { settlements, villages, settlementId, villageId } = await playerWithVillage(false);
    const houses = new InMemoryHouses();
    await houses.create({ playerId: PLAYER, kind: 'player', createdAt: NOW });
    const leaders = [LEADER, 'druhy'];
    const ids: string[] = [];
    for (const playerId of leaders) {
      ids.push((await houses.create({ playerId, kind: 'player', createdAt: NOW })).id);
    }
    const campaigns = new InMemoryCampaigns();
    for (const [i, phase] of phases.entries()) {
      const base = campaign({
        id: `c${i + 1}`,
        playerId: leaders[i]!,
        target: { ...campaign().target, villageId },
      });
      await campaigns.create({ ...base, phase, houseId: ids[i]! });
    }
    let hostId: string | null = null;
    if (refuge) {
      const map = await settlements.create({
        ownerId: PLAYER,
        landscapeSeed: 12,
        layerVersions: CURRENT_LAYER_VERSIONS,
        worldCell: { x: 3, y: 0 },
      });
      const hostState = (await villages.find(villageId))!.state;
      const host = await villages.add(map!.id, 'Hradec', structuredClone(hostState));
      hostId = host.id;
      const herd = { ...NO_HERD, sheep: 4 };
      villages.edit(villageId, (state) => {
        state.livestock = { herds: { ...herd }, young: { ...NO_HERD } };
        state.storesKg = Math.max(state.storesKg, 1000);
        const people = state.people.filter((p) => !isLineMan(p)).slice(0, 2);
        applyRefugeDepart(state, state.lastDay, {
          kind: 'refuge-depart',
          campaignId: 'c1',
          refId: 'c1:a1',
          mode: 'all',
          hostVillageId: host.id,
          people: people.map((p) => p.id),
          carriedKg: 300,
          herd,
        });
      });
      const away = (await villages.find(villageId))!.state.people.filter((p) => p.away);
      villages.edit(host.id, (state) => {
        applyRefugeArrive(state, state.lastDay, {
          kind: 'refuge-arrive',
          campaignId: 'c1',
          refId: 'c1:a1',
          fromVillageId: villageId,
          fromName: 'Libice',
          people: away.map((p) => ({ id: p.id, bornDay: p.bornDay, man: false, line: false })),
          foodKg: 280,
          herd,
        });
      });
    }
    const notices = new InMemoryNotices();
    const deps = {
      settlements,
      villages,
      landscapes,
      worldSeed: 4242,
      houses,
      ...noArmies(),
      campaigns,
      notices,
      now: () => atTick(LAUNCH + 10),
    };
    return { deps, campaigns, settlements, villages, notices, settlementId, villageId, hostId };
  }

  /** Upozornění „ves se vzdala“ (hráč, jméno vsi). */
  const surrendered = (notices: InMemoryNotices): unknown[] =>
    notices.notices
      .filter((n) => n.kind === 'village-surrendered')
      .map((n) => [n.playerId, n.payload.name]);

  it.each([
    ['ve shromaždišti', 'assembling'],
    ['na pochodu', 'marching'],
    ['v boji', 'raiding'],
  ] as const)(
    '%s: celá mapa připadne vůdci, lidé zůstanou bez rodu obránce, správce, obrat a upozornění jednou',
    async (_name, phase) => {
      const w = await defended([phase]);
      const before = (await w.villages.find(w.villageId))!.state;
      const lordId = before.dynasty?.lordId ?? null;
      expect(lordId).not.toBeNull();
      const restarted = await restartGame(w.deps, input);
      expect(restarted.ok).toBe(true);
      expect(restarted.ok && restarted.surrendered).toEqual([
        { settlementId: w.settlementId, toPlayerId: LEADER, villageIds: [w.villageId] },
      ]);
      // mapa do archivu nejde – 1. krok převodu; vůdce ji převezme pod svým zámkem
      expect(w.settlements.archived.has(w.settlementId)).toBe(false);
      await w.settlements.acceptTransfers(LEADER);
      expect((await w.settlements.listActive(LEADER)).map((s) => s.id)).toEqual([w.settlementId]);
      const after = (await w.villages.find(w.villageId))!.state;
      // bývalý vojvoda žije ve vsi dál jako obyčejný člověk, rod obránce ves nevede
      expect(after.people.some((p) => p.id === lordId)).toBe(true);
      expect(after.people.filter((p) => p.line)).toEqual([]);
      expect(after.dynasty?.lordId).toBeNull();
      expect(after.steward?.on).toBe(true);
      expect(w.campaigns.intents.map((i) => [i.campaignId, i.byPlayer, i.body])).toEqual([
        ['c1', PLAYER, SURRENDER],
      ]);
      expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
      // nová hra obránce má jen nové sídlo
      expect((await w.settlements.listActive(PLAYER)).map((s) => s.id)).not.toContain(
        w.settlementId,
      );
    },
    30_000,
  );

  it('výjezd vojvody s domovem ve vzdané vsi – členové jsou doma, událost jednou', async () => {
    const w = await defended(['marching']);
    w.villages.archivedSettlements = w.settlements.archived;
    const journeys = new InMemoryJourneys();
    await journeys.create(runningJourney(w.villageId));
    const deps = { ...w.deps, journeys };
    expect((await restartGame(deps, input)).ok).toBe(true);
    const ends = (): unknown[] =>
      w.villages.inbox.events
        .filter((e) => e.body.kind === 'away-ends')
        .map((e) => [e.villageId, e.body.kind === 'away-ends' ? e.body.refId : null]);
    expect(ends()).toEqual([[w.villageId, 'j1']]);
    expect(await journeys.activeOfPlayer(PLAYER)).toEqual([]);
    // opakovaný restart (pád po převodu) nic nezdvojí
    expect((await restartGame(deps, input)).ok).toBe(true);
    expect(ends()).toHaveLength(1);
    // upozornění o návratu nikomu nejde
    expect(w.notices.notices.filter((n) => n.kind === 'journey-returned')).toEqual([]);
  }, 30_000);

  it('dvě výpravy hráče z různých vsí – restart ukončí obě a obě vsi dostanou away-ends', async () => {
    const w = await defended(['marching']);
    w.villages.archivedSettlements = w.settlements.archived;
    const first = (await w.villages.find(w.villageId))!;
    const second = await w.villages.add('settlement-hora', 'Hora', structuredClone(first.state));
    const journeys = new InMemoryJourneys();
    await journeys.create(runningJourney(w.villageId, 'j1'));
    await journeys.create(runningJourney(second.id, 'j2'));
    expect(await journeys.activeOfPlayer(PLAYER)).toEqual(['j1', 'j2']);
    expect((await restartGame({ ...w.deps, journeys }, input)).ok).toBe(true);
    expect(await journeys.activeOfPlayer(PLAYER)).toEqual([]);
    expect(await journeys.active()).toEqual([]);
    const ends = w.villages.inbox.events
      .filter((e) => e.body.kind === 'away-ends')
      .map((e) => [e.villageId, e.body.kind === 'away-ends' ? e.body.refId : null]);
    expect(ends).toEqual(
      expect.arrayContaining([
        [w.villageId, 'j1'],
        [second.id, 'j2'],
      ]),
    );
    expect(ends).toHaveLength(2);
  }, 30_000);

  it('nájezd už na zpáteční cestě – ves jde do archivu jako dřív', async () => {
    const w = await defended(['returning']);
    const restarted = await restartGame(w.deps, input);
    expect(restarted.ok && restarted.surrendered).toEqual([]);
    expect(w.settlements.archived.has(w.settlementId)).toBe(true);
    expect(w.campaigns.intents).toEqual([]);
    expect(surrendered(w.notices)).toEqual([]);
  }, 30_000);

  it('dva nájezdy na tutéž ves – dostane ji vůdce staršího, obrátí se oba', async () => {
    const w = await defended(['raiding', 'marching']);
    const restarted = await restartGame(w.deps, input);
    expect(restarted.ok && restarted.surrendered.map((m) => m.toPlayerId)).toEqual([LEADER]);
    expect(w.campaigns.intents.map((i) => [i.campaignId, i.byPlayer, i.body])).toEqual([
      ['c1', PLAYER, SURRENDER],
      ['c2', PLAYER, SURRENDER],
    ]);
    expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
  }, 30_000);

  it('uprchlíci vzdané vsi v hradišti vsi obránce (jde do archivu) se vrátí domů i se zásobami', async () => {
    const w = await defended(['raiding'], true);
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    const hostMap = (await w.villages.find(w.hostId!))!.settlementId;
    expect(w.settlements.archived.has(hostMap)).toBe(true);
    const back = w.villages.inbox.events.filter((e) => e.body.kind === 'refuge-back');
    expect(back).toHaveLength(1);
    expect(back[0]!.villageId).toBe(w.villageId);
    // stádo i zbytek jídla z pobytu (hosté z něj do dneška jedli)
    expect(back[0]!.body).toMatchObject({ refId: 'c1:a1', herd: { sheep: 4 } });
    const foodKg = back[0]!.body.kind === 'refuge-back' ? back[0]!.body.foodKg : 0;
    expect(foodKg).toBeGreaterThan(0);
    expect(foodKg).toBeLessThanOrEqual(280);
    // pobyt z hradiště odešel – podruhé ho nikdo nevrátí
    expect((await w.villages.find(w.hostId!))!.state.refugeStays ?? []).toEqual([]);
  }, 30_000);

  it('pád po převodu, před archivem – opakovaný restart dá týž výsledek, nic se nezdvojí', async () => {
    const w = await defended(['raiding'], true);
    const failing = {
      ...w.deps,
      settlements: Object.assign(Object.create(w.settlements) as typeof w.settlements, {
        archive: () => Promise.reject(new Error('pád')),
      }),
    };
    await expect(restartGame(failing, input)).rejects.toThrow('pád');
    expect(w.settlements.pending.get(w.settlementId)).toBe(LEADER);
    const again = await restartGame({ ...w.deps, now: () => atTick(LAUNCH + 12) }, input);
    expect(again.ok).toBe(true);
    await w.settlements.acceptTransfers(LEADER);
    expect((await w.settlements.listActive(LEADER)).map((s) => s.id)).toEqual([w.settlementId]);
    expect(w.campaigns.intents).toHaveLength(1);
    expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
    expect(w.villages.inbox.events.filter((e) => e.body.kind === 'refuge-back')).toHaveLength(1);
    const hostMap = (await w.villages.find(w.hostId!))!.settlementId;
    expect(w.settlements.archived.has(hostMap)).toBe(true);
  }, 30_000);
  /**
   * Libice čeká na muže rodu z Hradce (`appointee`); s `departed` je už na cestě (`lord-arrives`
   * na den TODAY + 3 – Hradec ho v testu nepustí, ať rod obránce žije a restart ves vzdá).
   */
  async function awaitingFromHradec(w: Awaited<ReturnType<typeof defended>>, departed: boolean) {
    const source = (await w.villages.find(w.hostId!))!;
    const lordId = source.state.dynasty?.lordId;
    const man =
      source.state.people.find((p) => isLineMan(p) && p.id !== lordId) ??
      source.state.people.find(isLineMan)!;
    if (departed) {
      const departure = departAppointee(source.state, source.state.lastDay, man.id, 'Libice');
      await w.villages.inbox.post({
        villageId: w.villageId,
        day: TODAY + 3,
        ref: 'appoint:test',
        body: { kind: 'lord-arrives', party: departure.party, fromVillageId: source.id },
      });
    }
    w.villages.edit(w.villageId, (state) => {
      state.awaitingLord = {
        sinceDay: TODAY - 1,
        appointee: { fromVillageId: source.id, personId: man.id, arrivesDay: TODAY + 3 },
      };
    });
    return { source, man };
  }

  it('vojvoda na cestě z jiné vsi obránce se ve vzdané vsi vojvodou nestane – přijde bez rodu (I1)', async () => {
    const w = await defended(['raiding'], true);
    const { source, man } = await awaitingFromHradec(w, true);
    const party = departAppointee(source.state, source.state.lastDay, man.id, 'Libice').party.people
      .length;
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    const before = (await w.villages.find(w.villageId))!.state.people.length;
    await acceptHolderTransfers(w.deps, LEADER);
    const after = await loadVillage(w.deps, {
      villageId: w.villageId,
      today: TODAY + 6,
      landscape,
    });
    expect(after!.state.people.filter((p) => p.line)).toEqual([]);
    expect(after!.state.dynasty?.lordId).toBeNull();
    // muž s rodinou ve vsi žije jako obyčejný člověk – jeho domov je v archivu
    expect(after!.state.lastDay).toBe(TODAY + 6);
    expect(after!.state.people.length).toBe(before + party);
  }, 30_000);

  it('putující ves na vzdané mapě se vzdá také – její muži rod obránce novému držiteli nepřinesou (I1)', async () => {
    const w = await defended(['raiding']);
    const libice = (await w.villages.find(w.villageId))!.state;
    expect(libice.people.some((p) => p.line)).toBe(true);
    // lidé obránce na cestě na novou mapu; nájezd míří i na ni
    const map = await w.settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 14,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 6, y: 0 },
    });
    const travelling = await w.villages.add(map!.id, 'Putim', {
      ...structuredClone(libice),
      journey: { direction: 'N', departedDay: TODAY - 1, arrivalDay: TODAY + 5 },
    });
    const raid = (await w.campaigns.checkpoint('c1'))!.state;
    await w.campaigns.create({
      ...raid,
      id: 'c5',
      target: { ...raid.target, villageId: travelling.id },
    });
    const restarted = await restartGame(w.deps, input);
    expect(restarted.ok && restarted.surrendered.map((m) => m.settlementId)).toContain(map!.id);
    await acceptHolderTransfers(w.deps, LEADER);
    const after = (await w.villages.find(travelling.id))!.state;
    expect(after.journey).toBeDefined();
    expect(after.people.filter((p) => p.line)).toEqual([]);
    expect(after.dynasty?.lordId ?? null).toBeNull();
  }, 30_000);

  it('vyslanec z archivované vsi obránce: útočník do ní nezapíše a ves si vybere jiného (I1)', async () => {
    const w = await defended(['raiding'], true);
    const { source } = await awaitingFromHradec(w, false);
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    // pád převzetí před zápisem vsí – ves pořád čeká na vyslance dřívějšího držitele
    await w.settlements.acceptTransfers(LEADER);
    const archived = (await w.villages.find(source.id))!;
    await appointLords(w.deps, { playerId: LEADER, today: TODAY });
    expect((await w.villages.find(source.id))!.version).toBe(archived.version);
    expect((await w.villages.find(w.villageId))!.state.awaitingLord?.appointee).toBeUndefined();
  }, 30_000);

  it('uprchlíci jiné vsi obránce (archiv) ve vzdaném hradišti skončí, muži pána z ochrany jdou domů – jednou (I3)', async () => {
    const w = await defended(['raiding'], true);
    // uprchlíci Hradce (jde do archivu) v hradišti Libice (vzdá se)
    const herd = { ...NO_HERD, goat: 2 };
    w.villages.edit(w.hostId!, (state) => {
      state.livestock = { herds: { ...herd }, young: { ...NO_HERD } };
      state.storesKg = Math.max(state.storesKg, 500);
      const people = state.people.filter((p) => !isLineMan(p) && !p.away).slice(0, 2);
      applyRefugeDepart(state, state.lastDay, {
        kind: 'refuge-depart',
        campaignId: 'c9',
        refId: 'c9:h',
        mode: 'all',
        hostVillageId: w.villageId,
        people: people.map((p) => p.id),
        carriedKg: 100,
        herd,
      });
    });
    const away = (await w.villages.find(w.hostId!))!.state.people.filter(
      (p) => p.away?.refId === 'c9:h',
    );
    // muži pána (jiný hráč) z ochrany Libice
    const lordMap = await w.settlements.create({
      ownerId: 'pan',
      landscapeSeed: 13,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 5, y: 0 },
    });
    const libice = (await w.villages.find(w.villageId))!.state;
    const lord = await w.villages.add(lordMap!.id, 'Hrad', structuredClone(libice));
    const guards = lord.state.people.filter((p) => !p.away && p.sex === 'male').slice(0, 2);
    w.villages.edit(lord.id, (state) => {
      for (const p of state.people) {
        if (guards.some((g) => g.id === p.id)) p.away = { kind: 'protection', refId: 'prot:1' };
      }
    });
    w.villages.edit(w.villageId, (state) => {
      applyRefugeArrive(state, state.lastDay, {
        kind: 'refuge-arrive',
        campaignId: 'c9',
        refId: 'c9:h',
        fromVillageId: w.hostId!,
        fromName: 'Hradec',
        people: away.map((p) => ({ id: p.id, bornDay: p.bornDay, man: false, line: false })),
        foodKg: 90,
        herd,
      });
      state.guests = [
        ...(state.guests ?? []),
        ...guards.map((g) => ({
          ref: { villageId: lord.id, personId: g.id },
          kind: 'protection' as const,
          untilDay: TODAY + 1000,
          adult: true as const,
        })),
      ];
    });
    const fromHradec = (state: VillageState): unknown[] => [
      ...(state.guests ?? []).filter((g) => g.ref.villageId === w.hostId),
      ...(state.refugeStays ?? []).filter((r) => r.fromVillageId === w.hostId),
    ];
    expect(fromHradec((await w.villages.find(w.villageId))!.state)).not.toEqual([]);
    const failing = {
      ...w.deps,
      settlements: Object.assign(Object.create(w.settlements) as typeof w.settlements, {
        archive: () => Promise.reject(new Error('pád')),
      }),
    };
    await expect(restartGame(failing, input)).rejects.toThrow('pád');
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    // uprchlíci Hradce nejsou hosté ani pobyt – vzdaná ves je dál nekrmí
    expect(fromHradec((await w.villages.find(w.villageId))!.state)).toEqual([]);
    const events = (kind: string, villageId: string): unknown[] =>
      w.villages.inbox.events.filter((e) => e.body.kind === kind && e.villageId === villageId);
    expect(events('refuge-back', w.hostId!)).toHaveLength(1);
    // muži pána: vzdaná ves je propustí, doma jsou za dny cesty (2 políčka – jako odvolání)
    const leave = events('guests-leave', w.villageId);
    expect(leave).toHaveLength(1);
    expect(leave[0]).toMatchObject({
      body: {
        away: 'protection',
        guests: guards.map((g) => ({ villageId: lord.id, personId: g.id })),
      },
    });
    const home = events('away-ends', lord.id);
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ body: { refId: 'prot:1' } });
  }, 30_000);

  it('značka vzdání platí jen pro toho, kdo ves vzdal – restart nového držitele při vracejícím se nájezdu třetího: archiv (I2)', async () => {
    const w = await defended(['raiding', 'marching']);
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    await acceptHolderTransfers(w.deps, LEADER);
    // nájezd hráče `druhy` se ves vzdala a vrací se domů
    const c2 = (await w.campaigns.checkpoint('c2'))!.state;
    await w.campaigns.create({
      ...c2,
      phase: 'returning',
      yielded: { byPlayer: PLAYER, villageId: w.villageId },
    });
    const again = await restartGame(w.deps, { playerId: LEADER, today: TODAY, abandon: true });
    expect(again.ok && again.surrendered).toEqual([]);
    expect(w.settlements.archived.has(w.settlementId)).toBe(true);
    expect(w.notices.notices.filter((n) => n.playerId === 'druhy')).toEqual([]);
  }, 30_000);

  it('pád po převodu, před vzdáním – ves vede dál rod obránce; převzetí ji dovzdá a upozorní jednou (M3, M2)', async () => {
    const w = await defended(['raiding']);
    const failing = {
      ...w.deps,
      settlements: Object.assign(Object.create(w.settlements) as typeof w.settlements, {
        transferHolder: async (id: string, from: string, to: string) => {
          await w.settlements.transferHolder(id, from, to);
          throw new Error('pád');
        },
      }),
    };
    await expect(restartGame(failing, input)).rejects.toThrow('pád');
    expect(w.settlements.pending.get(w.settlementId)).toBe(LEADER);
    expect((await w.villages.find(w.villageId))!.state.dynasty?.lordId).not.toBeNull();
    expect(surrendered(w.notices)).toEqual([]);
    // převzetí (worker) v jiný den – ves se dovzdá, upozornění jednou
    await acceptHolderTransfers(w.deps, LEADER);
    const after = (await w.villages.find(w.villageId))!.state;
    expect(after.people.filter((p) => p.line)).toEqual([]);
    expect(after.dynasty?.lordId).toBeNull();
    expect(after.steward?.on).toBe(true);
    expect(after.surrender).toBeUndefined();
    expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
    expect((await restartGame({ ...w.deps, now: () => atTick(LAUNCH + 40) }, input)).ok).toBe(true);
    expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
    expect(w.campaigns.intents).toHaveLength(1);
  }, 30_000);

  it('pád před převodem a nájezd mezitím skončil – opakovaný restart mapu dovzdá podle značky (M3)', async () => {
    const w = await defended(['raiding']);
    const failing = {
      ...w.deps,
      settlements: Object.assign(Object.create(w.settlements) as typeof w.settlements, {
        transferHolder: () => Promise.reject(new Error('pád')),
      }),
    };
    await expect(restartGame(failing, input)).rejects.toThrow('pád');
    // ves obránci zůstala celá – rod ji vede, převod neproběhl
    const kept = (await w.villages.find(w.villageId))!.state;
    expect(kept.people.some((p) => p.line)).toBe(true);
    expect(kept.surrender).toMatchObject({
      byPlayer: PLAYER,
      toPlayerId: LEADER,
      campaignId: 'c1',
    });
    const c1 = (await w.campaigns.checkpoint('c1'))!.state;
    await w.campaigns.create({ ...c1, phase: 'done' });
    const again = await restartGame(w.deps, input);
    expect(again.ok && again.surrendered.map((m) => m.toPlayerId)).toEqual([LEADER]);
    expect(w.settlements.archived.has(w.settlementId)).toBe(false);
    expect(surrendered(w.notices)).toEqual([[LEADER, 'Libice']]);
  }, 30_000);

  it('vítěz mezitím dal Začít znovu – mapu nová hra nedostane, jde do archivu (M4)', async () => {
    const w = await defended(['raiding']);
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    const old = (await w.deps.houses.activeOf(LEADER))!;
    await w.deps.houses.end(old.id, NOW, TODAY);
    await w.deps.houses.create({ playerId: LEADER, kind: 'player', createdAt: NOW });
    expect(await acceptHolderTransfers(w.deps, LEADER)).toEqual([]);
    expect(w.settlements.archived.has(w.settlementId)).toBe(true);
    expect(await w.settlements.listActive(LEADER)).toEqual([]);
  }, 30_000);

  it('převzetí vzdané mapy po restartu selže – chyba se předá k zalogování, restart platí (M9)', async () => {
    const w = await defended(['raiding']);
    const restarted = await restartGame(w.deps, input);
    const maps = restarted.ok ? restarted.surrendered : [];
    expect(maps).toHaveLength(1);
    const errors: string[] = [];
    const locks = { run: (): Promise<never> => Promise.reject(new Error('pád')) };
    await finishSurrendered({ ...w.deps, locks } as never, [...maps, ...maps], TODAY, (to, e) => {
      errors.push(`${to}: ${(e as Error).message}`);
    });
    expect(errors).toEqual([`${LEADER}: pád`, `${LEADER}: pád`]);
    // převzetí dokončí worker
    expect((await acceptHolderTransfers(w.deps, LEADER)).map((m) => m.id)).toEqual([
      w.settlementId,
    ]);
  }, 30_000);

  it('mapa bez živé vsi se nevzdá – jde do archivu (M7)', async () => {
    const w = await defended(['raiding']);
    w.villages.edit(w.villageId, dieOut);
    await loadVillage(w.deps, { villageId: w.villageId, today: TODAY, landscape });
    const restarted = await restartGame(w.deps, input);
    expect(restarted.ok && restarted.surrendered).toEqual([]);
    expect(w.settlements.archived.has(w.settlementId)).toBe(true);
    expect(surrendered(w.notices)).toEqual([]);
  }, 30_000);

  it('kronika vzdané vsi: bez „konce rodu“, jména předků obránce synům nového rodu nezůstanou (M8)', async () => {
    const w = await defended(['raiding']);
    w.villages.edit(w.villageId, (state) => {
      state.dynasty!.deceased = [{ id: 900, name: 'Předek' }];
    });
    expect((await restartGame(w.deps, input)).ok).toBe(true);
    await acceptHolderTransfers(w.deps, LEADER);
    const after = await loadVillage(w.deps, {
      villageId: w.villageId,
      today: TODAY + 3,
      landscape,
    });
    const ended = after!.state.chronicle.filter((e) => e.kind === 'line-ended' && e.day >= TODAY);
    expect(ended).toEqual([]);
    expect(after!.state.dynasty?.deceased).toBeUndefined();
    expect(after!.state.dynasty?.lords.at(-1)?.toDay).toBe(TODAY);
  }, 30_000);
});
