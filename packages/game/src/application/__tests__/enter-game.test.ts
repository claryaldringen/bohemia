import { describe, it, expect } from 'vitest';
import {
  checkBand,
  choosePremiumType,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  INITIAL_LAYER_VERSIONS,
} from '../../domain/landscape';
import { landscapeHash } from '../../domain/landscape/__tests__/landscape-checks';
import { enterGame } from '../enter-game';
import { isolatedLandscapeSeed, SLOT_TYPES } from '../../domain/world';
import type { LandscapeSource } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';

const WORLD_SEED = 4242;
const ORIGIN = { x: 0, y: 0 };

const NOW = new Date('2026-11-05T12:00:00Z');

/** Verze vrstev prémiového sídelního sídla (odříznuté – suchá mapa bez `skeleton`). */
const PREMIUM_VERSIONS = { ...CURRENT_LAYER_VERSIONS, premium: 2 } as const;

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
    const seed = isolatedLandscapeSeed(WORLD_SEED, 'hrac-1');
    // krajina vzniká dřív než místo ve světě – suchá, typ jen z 15 bez kostry (world-skeleton.md)
    const premium = choosePremiumType(seed, {}, SLOT_TYPES.dry);
    expect(SLOT_TYPES.dry).toContain(settlement.premiumType);
    expect(settlement.skeleton ?? null).toBeNull();
    expect(settlement).toMatchObject({
      ownerId: 'hrac-1',
      isSeat: true,
      worldCell: null,
      localCell: ORIGIN,
      layerVersions: PREMIUM_VERSIONS,
      premiumType: premium,
    });
    expect(settlements.settlements).toHaveLength(1);
    expect(await settlements.occupiedCells()).toEqual([]);
    expect(landscape.premium).toBe(premium);
    expect(landscapeHash(landscape)).toBe(
      landscapeHash(generateLandscape(seed, PREMIUM_VERSIONS, premium)),
    );
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
    const premium = settlement.premiumType ?? undefined;
    expect(premium).toBeDefined();
    expect(settlement.landscapeSeed).not.toBe(drawn);
    expect(
      checkBand(
        generateLandscapeAttempt(settlement.landscapeSeed, PREMIUM_VERSIONS, premium),
        PREMIUM_VERSIONS,
      ).ok,
    ).toBe(true);
    expect(landscapeHash(landscape)).toBe(
      landscapeHash(generateLandscape(drawn, PREMIUM_VERSIONS, premium)),
    );
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
  it('sídlo bez prémiového typu (před prémiemi) se načte jako dřív a typ nedostane', async () => {
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { settlement, landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    expect(settlement.premiumType ?? null).toBeNull();
    expect(landscape.premium).toBeUndefined();
    expect(landscapeHash(landscape)).toBe(
      landscapeHash(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS)),
    );
  });

  it('prémiové sídlo dá krajinu s typem i přes LandscapeSource (mezipaměť webu)', async () => {
    const settlements = new InMemorySettlements();
    const first = await enterGame(
      { settlements, worldSeed: WORLD_SEED, houses: new InMemoryHouses(), now: () => NOW },
      'hrac-1',
    );
    const asked: (string | undefined)[] = [];
    const landscapes: LandscapeSource = {
      landscapeOf: (seed, versions, premium) => {
        asked.push(premium);
        return generateLandscapeAttempt(seed, versions, premium);
      },
    };
    const again = await enterGame(
      {
        settlements,
        worldSeed: WORLD_SEED,
        houses: new InMemoryHouses(),
        now: () => NOW,
        landscapes,
      },
      'hrac-1',
    );
    expect(asked).toEqual([first.settlement.premiumType]);
    expect(landscapeHash(again.landscape)).toBe(landscapeHash(first.landscape));
  });

  it('typy se rozdělí rovnoměrně – 15 odříznutých nováčků dostane 15 různých typů bez kostry', async () => {
    const deps = {
      settlements: new InMemorySettlements(),
      worldSeed: WORLD_SEED,
      houses: new InMemoryHouses(),
      now: () => NOW,
    };
    const types = new Set<string>();
    for (let i = 0; i < SLOT_TYPES.dry.length; i++) {
      const { settlement, landscape } = await enterGame(deps, `hrac-${i}`);
      expect(landscape.premium).toBe(settlement.premiumType);
      types.add(settlement.premiumType ?? 'průměrná');
    }
    expect([...types].sort()).toEqual([...SLOT_TYPES.dry].sort());
    expect(Object.values(await deps.settlements.premiumTypeCounts())).toEqual(
      SLOT_TYPES.dry.map(() => 1),
    );
  }, 120_000);
});
