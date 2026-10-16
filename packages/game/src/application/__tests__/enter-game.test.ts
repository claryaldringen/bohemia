import { describe, it, expect } from 'vitest';
import { CURRENT_LAYER_VERSIONS, generateLandscape } from '../../domain/landscape';
import { enterGame } from '../enter-game';
import type { SeedSource } from '../settlements';
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
      landscapeSeed: 4242,
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

  it('sídlo se vygeneruje podle svého uloženého seedu, ne podle nového', async () => {
    const settlements = new InMemorySettlements();
    await settlements.createSeat({
      ownerId: 'hrac-1',
      landscapeSeed: 7,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame({ settlements, seeds: seedsFrom(999) }, 'hrac-1');
    expect(landscape).toEqual(generateLandscape(7));
  });

  it('různí hráči dostanou různá sídla', async () => {
    const deps = { settlements: new InMemorySettlements(), seeds: seedsFrom(1, 2) };
    const a = await enterGame(deps, 'hrac-a');
    const b = await enterGame(deps, 'hrac-b');
    expect(a.settlement.id).not.toBe(b.settlement.id);
    expect(deps.settlements.settlements).toHaveLength(2);
  });
});
