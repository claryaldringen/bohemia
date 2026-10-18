import { describe, it, expect } from 'vitest';
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  INITIAL_LAYER_VERSIONS,
} from '../../domain/landscape';
import { enterGame } from '../enter-game';
import type { LandscapeSource, SeedSource } from '../settlements';
import { InMemorySettlements } from './in-memory-settlements';

const seedsFrom = (...values: number[]): SeedSource => {
  let next = 0;
  return { nextSeed: () => values[next++ % values.length]! };
};

describe('enterGame', () => {
  it('první vstup založí sídelní sídlo s novým seedem a aktuálními verzemi vrstev', async () => {
    const settlements = new InMemorySettlements();
    const { settlement, landscape } = await enterGame(
      { settlements, seeds: seedsFrom(4242) },
      'hrac-1',
    );
    expect(settlement).toMatchObject({
      ownerId: 'hrac-1',
      isSeat: true,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    expect(settlements.settlements).toHaveLength(1);
    expect(landscape).toEqual(generateLandscape(4242));
  });

  it('další vstup vrátí totéž sídlo a stejnou krajinu', async () => {
    const deps = { settlements: new InMemorySettlements(), seeds: seedsFrom(1, 2, 3) };
    const first = await enterGame(deps, 'hrac-1');
    const second = await enterGame(deps, 'hrac-1');
    expect(second.settlement.id).toBe(first.settlement.id);
    expect(second.settlement.landscapeSeed).toBe(first.settlement.landscapeSeed);
    expect(second.landscape.heights).toEqual(first.landscape.heights);
    expect(deps.settlements.settlements).toHaveLength(1);
  });

  it('souběžné první vstupy založí jediné sídlo', async () => {
    const deps = { settlements: new InMemorySettlements(), seeds: seedsFrom(10, 20, 30) };
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
    await settlements.createSeat({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame({ settlements, seeds: seedsFrom(999) }, 'hrac-1');
    expect(landscape).toEqual(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS));
  });

  // Seed, jehož první pokus nepadne do pásma – generátor pro něj zkouší další pokusy.
  const seedNeedingRetry = (): number => {
    for (let seed = 0; seed < 2000; seed++) {
      const versions = CURRENT_LAYER_VERSIONS;
      if (!checkBand(generateLandscapeAttempt(seed, versions), versions).ok) return seed;
    }
    throw new Error('Žádný seed s opakovaným pokusem – test nemá co ověřit.');
  };

  it('nové sídlo uloží seed přijatého pokusu, ne vylosovaný seed', async () => {
    const drawn = seedNeedingRetry();
    const settlements = new InMemorySettlements();
    const { settlement, landscape } = await enterGame(
      { settlements, seeds: seedsFrom(drawn) },
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
    const stored = seedNeedingRetry();
    const settlements = new InMemorySettlements();
    await settlements.createSeat({
      ownerId: 'hrac-1',
      landscapeSeed: stored,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame({ settlements, seeds: seedsFrom(1) }, 'hrac-1');
    expect(landscape).toEqual(generateLandscapeAttempt(stored, CURRENT_LAYER_VERSIONS));
    expect(landscape.heights).not.toEqual(generateLandscape(stored).heights);
  }, 30_000);

  it('sídlo založené s původními verzemi vrstev si nechá původní krajinu', async () => {
    const settlements = new InMemorySettlements();
    await settlements.createSeat({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: INITIAL_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame({ settlements, seeds: seedsFrom(1) }, 'hrac-1');
    expect(landscape).toEqual(generateLandscapeAttempt(7, INITIAL_LAYER_VERSIONS));
    expect(landscape.surface).not.toEqual(
      generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS).surface,
    );
  });

  it('různí hráči dostanou různá sídla', async () => {
    const deps = { settlements: new InMemorySettlements(), seeds: seedsFrom(1, 2) };
    const a = await enterGame(deps, 'hrac-a');
    const b = await enterGame(deps, 'hrac-b');
    expect(a.settlement.id).not.toBe(b.settlement.id);
    expect(deps.settlements.settlements).toHaveLength(2);
  });

  it('krajinu uloženého sídla bere z LandscapeSource (mezipaměť webu)', async () => {
    const settlements = new InMemorySettlements();
    await settlements.createSeat({
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
      { settlements, seeds: seedsFrom(99), landscapes },
      'hrac-1',
    );
    expect(landscape).toBe(cached);
    expect(asked).toEqual([7]);
  });
});
