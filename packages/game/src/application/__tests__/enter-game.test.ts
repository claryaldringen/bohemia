import { describe, it, expect } from 'vitest';
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  generateLandscapeAttempt,
  INITIAL_LAYER_VERSIONS,
} from '../../domain/landscape';
import { enterGame } from '../enter-game';
import { cellDistance, WORLD } from '../../domain/world';
import { settlementSeedOf } from '../settlement-seed';
import type { LandscapeSource } from '../settlements';
import { InMemorySettlements } from './in-memory-settlements';

const WORLD_SEED = 4242;
const ORIGIN = { x: 0, y: 0 };

describe('enterGame', () => {
  it('první vstup založí sídelní sídlo ve středu světa s krajinou z jeho políčka a aktuálními verzemi vrstev', async () => {
    const settlements = new InMemorySettlements();
    const { settlement, landscape } = await enterGame(
      { settlements, worldSeed: WORLD_SEED },
      'hrac-1',
    );
    expect(settlement).toMatchObject({
      ownerId: 'hrac-1',
      isSeat: true,
      worldCell: ORIGIN,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    expect(settlements.settlements).toHaveLength(1);
    expect(landscape).toEqual(generateLandscape(settlementSeedOf(WORLD_SEED, ORIGIN)));
  });

  it('další vstup vrátí totéž sídlo a stejnou krajinu', async () => {
    const deps = { settlements: new InMemorySettlements(), worldSeed: WORLD_SEED };
    const first = await enterGame(deps, 'hrac-1');
    const second = await enterGame(deps, 'hrac-1');
    expect(second.settlement.id).toBe(first.settlement.id);
    expect(second.settlement.landscapeSeed).toBe(first.settlement.landscapeSeed);
    expect(second.landscape.heights).toEqual(first.landscape.heights);
    expect(deps.settlements.settlements).toHaveLength(1);
  });

  it('souběžné první vstupy založí jediné sídlo', async () => {
    const deps = { settlements: new InMemorySettlements(), worldSeed: WORLD_SEED };
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
    const { landscape } = await enterGame({ settlements, worldSeed: WORLD_SEED }, 'hrac-1');
    expect(landscape).toEqual(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS));
  });

  // Seed světa, pro který první pokus krajiny středu světa nepadne do pásma – generátor pro něj
  // zkouší další pokusy.
  const worldSeedNeedingRetry = (): number => {
    for (let seed = 0; seed < 2000; seed++) {
      const versions = CURRENT_LAYER_VERSIONS;
      const attempt = generateLandscapeAttempt(settlementSeedOf(seed, ORIGIN), versions);
      if (!checkBand(attempt, versions).ok) return seed;
    }
    throw new Error('Žádný seed s opakovaným pokusem – test nemá co ověřit.');
  };

  it('nové sídlo uloží seed přijatého pokusu, ne seed odvozený z políčka', async () => {
    const worldSeed = worldSeedNeedingRetry();
    const drawn = settlementSeedOf(worldSeed, ORIGIN);
    const settlements = new InMemorySettlements();
    const { settlement, landscape } = await enterGame({ settlements, worldSeed }, 'hrac-1');
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
    const stored = settlementSeedOf(worldSeedNeedingRetry(), ORIGIN);
    const settlements = new InMemorySettlements();
    await settlements.seatAtOrigin({
      ownerId: 'hrac-1',
      landscapeSeed: stored,
      layerVersions: CURRENT_LAYER_VERSIONS,
    });
    const { landscape } = await enterGame({ settlements, worldSeed: WORLD_SEED }, 'hrac-1');
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
    const { landscape } = await enterGame({ settlements, worldSeed: WORLD_SEED }, 'hrac-1');
    expect(landscape).toEqual(generateLandscapeAttempt(7, INITIAL_LAYER_VERSIONS));
    expect(landscape.surface).not.toEqual(
      generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS).surface,
    );
  });

  it('různí hráči dostanou různá sídla na různých políčkách s odstupem', async () => {
    const deps = { settlements: new InMemorySettlements(), worldSeed: WORLD_SEED };
    const a = await enterGame(deps, 'hrac-a');
    const b = await enterGame(deps, 'hrac-b');
    expect(a.settlement.id).not.toBe(b.settlement.id);
    expect(deps.settlements.settlements).toHaveLength(2);
    const cellA = a.settlement.worldCell!;
    const cellB = b.settlement.worldCell!;
    expect(cellDistance(cellA, cellB)).toBeGreaterThanOrEqual(WORLD.independentGap);
    expect(b.settlement.landscapeSeed).not.toBe(a.settlement.landscapeSeed);
  });

  it('souběžní nováčci dostanou každý své políčko – poražený v souběhu to zkusí znovu', async () => {
    const deps = { settlements: new InMemorySettlements(), worldSeed: WORLD_SEED };
    const results = await Promise.all(['a', 'b', 'c'].map((id) => enterGame(deps, `hrac-${id}`)));
    const keys = results.map((r) => `${r.settlement.worldCell!.x},${r.settlement.worldCell!.y}`);
    expect(new Set(keys).size).toBe(3);
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
      { settlements, worldSeed: WORLD_SEED, landscapes },
      'hrac-1',
    );
    expect(landscape).toBe(cached);
    expect(asked).toEqual([7]);
  });
});
