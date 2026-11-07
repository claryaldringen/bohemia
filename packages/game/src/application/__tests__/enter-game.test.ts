import { describe, it, expect } from 'vitest';
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  INITIAL_LAYER_VERSIONS,
} from '../../domain/landscape';
import { enterGame } from '../enter-game';
import { isolatedLandscapeSeed } from '../../domain/world';
import type { LandscapeSource } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';

const WORLD_SEED = 4242;
const ORIGIN = { x: 0, y: 0 };

const NOW = new Date('2026-11-05T12:00:00Z');

describe('enterGame', () => {
  it('rod dostane jazyk účtu, bez portu češtinu', async () => {
    const houses = new InMemoryHouses();
    await enterGame(
      {
        settlements: new InMemorySettlements(),
        worldSeed: WORLD_SEED,
        houses,
        now: () => NOW,
        accountLanguage: async () => 'pl',
      },
      'hrac-1',
    );
    expect((await houses.activeOf('hrac-1'))?.language).toBe('pl');
    await enterGame(
      { settlements: new InMemorySettlements(), worldSeed: WORLD_SEED, houses, now: () => NOW },
      'hrac-2',
    );
    expect((await houses.activeOf('hrac-2'))?.language).toBe('cs');
  });

  it('první vstup bez pozvánky založí odříznuté sídlo – místní (0, 0), krajina z vlastního seedu, rod bez umístění', async () => {
    const settlements = new InMemorySettlements();
    const houses = new InMemoryHouses();
    const { settlement, landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses, now: () => NOW },
      'hrac-1',
    );
    expect(settlement).toMatchObject({
      ownerId: 'hrac-1',
      isSeat: true,
      worldCell: null,
      localCell: ORIGIN,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    expect(settlements.settlements).toHaveLength(1);
    expect(await settlements.occupiedCells()).toEqual([]);
    expect(landscape).toEqual(generateLandscape(isolatedLandscapeSeed(WORLD_SEED, 'hrac-1')));
    expect(houses.houses[0]).toMatchObject({ placedAt: null, newcomerSince: null });
  });

  it('další vstup vrátí totéž sídlo a stejnou krajinu', async () => {
    const deps = {
      settlements: new InMemorySettlements(),
      worldSeed: WORLD_SEED,
      houses: new InMemoryHouses(),
      now: () => NOW,
    };
    const first = await enterGame(deps, 'hrac-1');
    const second = await enterGame(deps, 'hrac-1');
    expect(second.settlement.id).toBe(first.settlement.id);
    expect(second.settlement.landscapeSeed).toBe(first.settlement.landscapeSeed);
    expect(second.landscape.heights).toEqual(first.landscape.heights);
    expect(deps.settlements.settlements).toHaveLength(1);
  });

  it('dvojí vstup založí jediný živý rod hráče, souběžné také', async () => {
    const houses = new InMemoryHouses();
    const deps = {
      settlements: new InMemorySettlements(),
      houses,
      now: () => NOW,
      worldSeed: WORLD_SEED,
    };
    await enterGame(deps, 'hrac-1');
    await enterGame(deps, 'hrac-1');
    await Promise.all([enterGame(deps, 'hrac-1'), enterGame(deps, 'hrac-1')]);
    expect(houses.houses).toHaveLength(1);
    expect(houses.houses[0]).toMatchObject({ playerId: 'hrac-1', kind: 'player', createdAt: NOW });
    expect(houses.houses[0]!.endedAt).toBeNull();
  });

  it('souběžné první vstupy založí jediné sídlo', async () => {
    const deps = {
      settlements: new InMemorySettlements(),
      worldSeed: WORLD_SEED,
      houses: new InMemoryHouses(),
      now: () => NOW,
    };
    const results = await Promise.all([
      enterGame(deps, 'hrac-1'),
      enterGame(deps, 'hrac-1'),
      enterGame(deps, 'hrac-1'),
    ]);
    expect(new Set(results.map((r) => r.settlement.id)).size).toBe(1);
    expect(deps.settlements.settlements).toHaveLength(1);
    expect(results[1]!.landscape.heights).toEqual(results[0]!.landscape.heights);
  });

  it('sídlo se vygeneruje přesně z uloženého seedu, ne z nového', async () => {
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    expect(landscape).toEqual(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS));
  });

  // Seed světa, pro který první pokus krajiny středu světa nepadne do pásma – generátor pro něj
  // zkouší další pokusy.
  const worldSeedNeedingRetry = (): number => {
    for (let seed = 0; seed < 2000; seed++) {
      const versions = CURRENT_LAYER_VERSIONS;
      const attempt = generateLandscapeAttempt(isolatedLandscapeSeed(seed, 'hrac-1'), versions);
      if (!checkBand(attempt, versions).ok) return seed;
    }
    throw new Error('Žádný seed s opakovaným pokusem – test nemá co ověřit.');
  };

  it('nové sídlo uloží seed přijatého pokusu, ne odvozený seed', async () => {
    const worldSeed = worldSeedNeedingRetry();
    const drawn = isolatedLandscapeSeed(worldSeed, 'hrac-1');
    const settlements = new InMemorySettlements();
    const { settlement, landscape } = await enterGame(
      { settlements, worldSeed, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    expect(settlement.landscapeSeed).not.toBe(drawn);
    expect(
      checkBand(
        generateLandscapeAttempt(settlement.landscapeSeed, CURRENT_LAYER_VERSIONS),
        CURRENT_LAYER_VERSIONS,
      ).ok,
    ).toBe(true);
    expect(landscape).toEqual(generateLandscape(drawn));
  }, 30_000);

  it('uložené sídlo se načte bez kontroly pásma – ladění pásma krajinu nezmění', async () => {
    const stored = isolatedLandscapeSeed(worldSeedNeedingRetry(), 'hrac-1');
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: stored,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    expect(landscape).toEqual(generateLandscapeAttempt(stored, CURRENT_LAYER_VERSIONS));
    expect(landscape.heights).not.toEqual(generateLandscape(stored).heights);
  }, 30_000);

  it('sídlo založené s původními verzemi vrstev si nechá původní krajinu', async () => {
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: INITIAL_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    expect(landscape).toEqual(generateLandscapeAttempt(7, INITIAL_LAYER_VERSIONS));
    expect(landscape.surface).not.toEqual(
      generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS).surface,
    );
  });

  it('různí odříznutí hráči mají každý svou krajinu a nikdo z nich mapu světa nezabere', async () => {
    const deps = {
      settlements: new InMemorySettlements(),
      worldSeed: WORLD_SEED,
      houses: new InMemoryHouses(),
      now: () => NOW,
    };
    const a = await enterGame(deps, 'hrac-a');
    const b = await enterGame(deps, 'hrac-b');
    expect(a.settlement.id).not.toBe(b.settlement.id);
    expect(deps.settlements.settlements).toHaveLength(2);
    expect(b.settlement.landscapeSeed).not.toBe(a.settlement.landscapeSeed);
    expect(await deps.settlements.occupiedCells()).toEqual([]);
  });

  it('souběžné vstupy odříznutých nováčků založí každému jediné sídlo', async () => {
    const deps = {
      settlements: new InMemorySettlements(),
      worldSeed: WORLD_SEED,
      houses: new InMemoryHouses(),
      now: () => NOW,
    };
    const ids = ['a', 'b', 'c', 'a', 'b'].map((id) => `hrac-${id}`);
    await Promise.all(ids.map((id) => enterGame(deps, id)));
    expect(deps.settlements.settlements).toHaveLength(3);
    expect(deps.houses.houses).toHaveLength(3);
  });

  it('krajinu uloženého sídla bere z LandscapeSource (mezipaměť webu)', async () => {
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const asked: number[] = [];
    const cached = generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS);
    const landscapes: LandscapeSource = {
      landscapeOf: (seed) => {
        asked.push(seed);
        return cached;
      },
    };
    const { landscape } = await enterGame(
      {
        settlements,
        worldSeed: WORLD_SEED,
        houses: new InMemoryHouses(),
        now: () => NOW,
        landscapes,
      },
      'hrac-1',
    );
    expect(landscape).toBe(cached);
    expect(asked).toEqual([7]);
  });
});
