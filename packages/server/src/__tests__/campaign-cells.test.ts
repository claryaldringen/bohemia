import { describe, expect, it } from 'vitest';
import { cellsInNeed, newCampaignMemory } from '@bohemia/game';
import { createCampaignCells } from '../campaign-cells';

// Mezipaměť prázdných map pro tažení a výjezdy (závěrečná recenze – Important 4): worker před kolem
// zvětší LRU podle map, které kolo čte (`reserve(cellsInNeed(...))`) – krajina mapy, na které
// skupina stojí, se mezi koly negeneruje znovu, ať je skupin kolik chce.

const CELLS = [0, 1, 2, 3].map((i) => ({ x: 40 + 3 * i, y: -30 }));

function cells(): ReturnType<typeof createCampaignCells> {
  return createCampaignCells({
    settlements: { holderAt: () => Promise.resolve(null), listActive: () => Promise.resolve([]) },
    villages: { stampsOf: () => Promise.resolve([]) },
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
