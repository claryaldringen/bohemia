import { describe, expect, it } from 'vitest';
import {
  cellsInNeed,
  newCampaignMemory,
  trailEntriesOf,
  trailExitsOf,
  type NeighbourTrailExits,
  type TrailExit,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import { createCampaignCells } from '../campaign-cells';

// Mezipaměť prázdných map pro tažení a výjezdy (závěrečná recenze – Important 4): worker před kolem
// zvětší LRU podle map, které kolo čte (`reserve(cellsInNeed(...))`) – krajina mapy, na které
// skupina stojí, se mezi koly negeneruje znovu, ať je skupin kolik chce.

const CELLS = [0, 1, 2, 3].map((i) => ({ x: 40 + 3 * i, y: -30 }));

function cells(): ReturnType<typeof createCampaignCells> {
  return createCampaignCells({
    settlements: { holderAt: () => Promise.resolve(null), listActive: () => Promise.resolve([]) },
    villages: { stampsOf: () => Promise.resolve([]), find: () => Promise.resolve(null) },
    landscapes: {
      landscapeOf: () => {
        throw new Error('bez sídel');
      },
    },
    worldSeed: 4242,
    capacity: 2,
  });
}

describe('createCampaignCells – velikost mezipaměti podle kola', () => {
  it('bez reserve se víc map než LRU generuje každé kolo znovu, s reserve jednou', async () => {
    const plain = cells();
    const first = await Promise.all(CELLS.map((c) => plain.mapOf(c)));
    const again = await plain.mapOf(CELLS[0]!);
    expect(again).not.toBe(first[0]);
    expect(again).toEqual(first[0]);

    const sized = cells();
    sized.reserve(CELLS.length);
    const round1: unknown[] = [];
    for (const c of CELLS) round1.push(await sized.mapOf(c));
    const round2: unknown[] = [];
    for (const c of CELLS) round2.push(await sized.mapOf(c));
    round2.forEach((map, i) => expect(map).toBe(round1[i]));
  }, 60_000);

  it('cellsInNeed – různá políčka z paměti tažení i výjezdů', () => {
    const campaigns = newCampaignMemory();
    const journeys = newCampaignMemory();
    campaigns.needs.set('c1', { cells: [CELLS[0]!, CELLS[1]!], villageIds: [] });
    campaigns.needs.set('c2', { cells: [CELLS[1]!], villageIds: [] });
    journeys.needs.set('j1', { cells: [CELLS[1]!, CELLS[2]!], villageIds: [] });
    expect(cellsInNeed(campaigns, journeys)).toBe(3);
    expect(cellsInNeed()).toBe(0);
  });
});

describe('createCampaignCells – vstupy zemských stezek sousedů (plán 2026-11-16-dense-forest – Rozhodnutí 13)', () => {
  const CELL = { x: 1, y: 0 };
  const EAST: TrailExit = {
    direction: 'E',
    end: { x: 935, z: 120 },
    edge: { x: 960, z: 120 },
    builtDay: 3,
  };
  /** Stav vsi s hotovou stezkou E (jen stezky a cesty – víc `trailExitsOf` nečte). */
  const state = {
    trails: [
      {
        id: 1,
        direction: 'E',
        pieces: [{ roadId: 1, grade: 'improved', manDays: 1 }],
        lengthM: 935,
        startedDay: 0,
        builtDay: 3,
      },
    ],
    roads: {
      nextId: 2,
      roads: [
        {
          id: 1,
          points: [
            { x: 0, z: 120 },
            { x: 935, z: 120 },
          ],
          bornDay: 0,
          grade: 'improved',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    },
  } as unknown as VillageState;

  /** Mapy s výstupy sousedů `around` (mění se mezi voláními) a počítadlem `find`. */
  function withExits(around: { list: NeighbourTrailExits[] }): {
    cells: ReturnType<typeof createCampaignCells>;
    finds: string[];
  } {
    const finds: string[] = [];
    const cells = createCampaignCells({
      settlements: { holderAt: () => Promise.resolve(null), listActive: () => Promise.resolve([]) },
      villages: {
        stampsOf: () => Promise.resolve([]),
        find: (id): Promise<VillageRecord | null> => {
          finds.push(id);
          return Promise.resolve({ id, settlementId: 's', name: 'Ves', state, version: 7 });
        },
      },
      landscapes: {
        landscapeOf: () => {
          throw new Error('bez sídel');
        },
      },
      worldSeed: 4242,
      trailExits: { trailExitsAround: () => Promise.resolve(around.list) },
    });
    return { cells, finds };
  }

  it('výstup E souseda (0; 0) – vstup na mapě (1; 0) jako `trailEntriesOf`', async () => {
    const neighbour = { villageId: 'v', version: 1, cell: { x: 0, y: 0 }, exits: [EAST] };
    const { cells, finds } = withExits({ list: [neighbour] });
    const map = await cells.mapOf(CELL);
    expect(map.trailEntries).toEqual(trailEntriesOf(CELL, [neighbour]));
    expect(map.trailEntries).toHaveLength(1);
    expect(finds).toEqual([]);
  }, 60_000);

  it('souhrn bez výstupů – ves se načte jednou na verzi a výstupy dá `trailExitsOf`', async () => {
    const neighbour = { villageId: 'v', version: 7, cell: { x: 0, y: 0 }, exits: null };
    const { cells, finds } = withExits({ list: [neighbour] });
    const first = await cells.mapOf(CELL);
    const exits = trailExitsOf(state);
    expect(exits).toHaveLength(1);
    expect(first.trailEntries).toEqual(trailEntriesOf(CELL, [{ cell: neighbour.cell, exits }]));
    expect(finds).toEqual(['v']);
    const again = await cells.mapOf(CELL);
    expect(again.trailEntries).toEqual(first.trailEntries);
    expect(finds).toEqual(['v']);
  }, 60_000);

  it('reserve: výstupy 8 sousedů bez souhrnu se drží celé kolo (paměť 8 × mapy + základ)', async () => {
    const finds: string[] = [];
    const around: NeighbourTrailExits[] = Array.from({ length: 8 }, (_, k) => ({
      villageId: `v${k}`,
      version: 1,
      cell: { x: k, y: 1 },
      exits: null,
    }));
    const cells = createCampaignCells({
      settlements: { holderAt: () => Promise.resolve(null), listActive: () => Promise.resolve([]) },
      villages: {
        stampsOf: () => Promise.resolve([]),
        find: (id): Promise<VillageRecord | null> => {
          finds.push(id);
          return Promise.resolve({ id, settlementId: 's', name: 'Ves', state, version: 1 });
        },
      },
      landscapes: {
        landscapeOf: () => {
          throw new Error('bez sídel');
        },
      },
      worldSeed: 4242,
      capacity: 1,
      trailExits: { trailExitsAround: () => Promise.resolve(around) },
    });
    cells.reserve(1);
    await cells.mapOf(CELL);
    await cells.mapOf(CELL);
    expect(finds).toHaveLength(8);
  }, 60_000);

  it('prázdné políčko: výstup souseda přidaný po prvním `mapOf` je ve druhém', async () => {
    const around = { list: [] as NeighbourTrailExits[] };
    const { cells } = withExits(around);
    const before = await cells.mapOf(CELL);
    expect(before.trailEntries).toEqual([]);
    around.list = [{ villageId: 'v', version: 1, cell: { x: 0, y: 0 }, exits: [EAST] }];
    const after = await cells.mapOf(CELL);
    expect(after.landscape).toBe(before.landscape);
    expect(after.trailEntries).toHaveLength(1);
  }, 60_000);

  it('bez zdroje výstupů žádné vstupy', async () => {
    expect((await cells().mapOf(CELL)).trailEntries).toEqual([]);
  }, 60_000);
});
