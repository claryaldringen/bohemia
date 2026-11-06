import { describe, expect, it } from 'vitest';
import type { VillageDigest } from '../../domain/village';
import type { House } from '../houses';
import type { VillageDigestRecord } from '../villages';
import { housesNear } from '../world-directory';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryWorldDirectory } from './in-memory-world-directory';

// Adresář rodů (vassalage.md – Přehled pána): jen muži rodu od 16 let, nic o zásobách a lidech vsí.

const TODAY = 100_000;
const YEAR = 365.25;
const bornAgo = (years: number): number => TODAY - Math.floor(years * YEAR) - 1;

/** Souhrn s vlastností, která se cizímu hráči nesmí dostat do odpovědi. */
function digestRecord(
  id: string,
  name: string,
  men: { id: number; name?: string; bornDay: number }[],
): VillageDigestRecord {
  const digest = {
    v: 2,
    lastDay: TODAY,
    people: 40,
    publicLineMen: men,
    arms: 'kopí',
    horse: 3,
    stores: { grain: 900 },
    weatherSeed: 77,
  } as unknown as VillageDigest;
  return { id, settlementId: `s-${id}`, name, version: 1, digest };
}

async function setup(): Promise<{
  dir: InMemoryWorldDirectory;
  deps: Parameters<typeof housesNear>[0];
  entry: (x: number, y: number, digests: VillageDigestRecord[], lord?: House['lord']) => string;
}> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const dir = new InMemoryWorldDirectory();
  const mine = await houses.create({ playerId: 'me', kind: 'player', createdAt: new Date() });
  await settlements.createSeat({
    ownerId: 'me',
    landscapeSeed: 1,
    layerVersions: {} as never,
    worldCell: { x: 0, y: 0 },
  });
  let n = 0;
  const entry = (
    x: number,
    y: number,
    digests: VillageDigestRecord[],
    lord: House['lord'] = null,
  ): string => {
    const id = `h-${++n}`;
    dir.entries.push({
      house: {
        id,
        playerId: `p${n}`,
        kind: 'player',
        createdAt: new Date(),
        endedAt: null,
        endedDay: null,
        lord,
        senior: null,
        successionDay: null,
        lastEnnobleYear: null,
        pendingDeparture: null,
      },
      seat: { x, y },
      digests,
    });
    return id;
  };
  dir.entries.push({
    house: mine,
    seat: { x: 0, y: 0 },
    digests: [],
  });
  return { dir, deps: { houses, settlements, worldDirectory: dir }, entry };
}

describe('housesNear', () => {
  it('neprozradí zásoby, výzbroj ani lidi vsí', async () => {
    const { deps, entry } = await setup();
    entry(2, 1, [digestRecord('v1', 'Lhota', [{ id: 1, name: 'Jan', bornDay: bornAgo(30) }])]);
    const json = JSON.stringify(await housesNear(deps, { viewerId: 'me', today: TODAY, limit: 5 }));
    for (const key of ['arms', 'horse', 'stores', 'people', 'weatherSeed']) {
      expect(json).not.toContain(`"${key}"`);
    }
    expect(json).toContain('Jan');
  });

  it('muž 15 let chybí, 16 let je; jméno hlavy rodu z jeho vsi', async () => {
    const { deps, entry } = await setup();
    entry(
      1,
      1,
      [
        digestRecord('v1', 'Lhota', [
          { id: 1, name: 'Starý', bornDay: bornAgo(40) },
          { id: 2, name: 'Šestnáctiletý', bornDay: bornAgo(16) },
          { id: 3, name: 'Patnáctiletý', bornDay: bornAgo(15) },
        ]),
      ],
      { villageId: 'v1', personId: 1 },
    );
    const [house] = await housesNear(deps, { viewerId: 'me', today: TODAY, limit: 5 });
    expect(house?.men.map((m) => [m.name, m.age, m.villageName])).toEqual([
      ['Starý', 40, 'Lhota'],
      ['Šestnáctiletý', 16, 'Lhota'],
    ]);
    expect(house?.lordName).toBe('Starý');
    expect(house?.villages).toBe(1);
  });

  it('řadí podle vzdálenosti, nejvýš limit, vlastní rod vynechá', async () => {
    const { deps, entry } = await setup();
    const far = entry(9, 0, []);
    const near = entry(1, -1, []);
    const mid = entry(-3, 2, []);
    const all = await housesNear(deps, { viewerId: 'me', today: TODAY, limit: 5 });
    expect(all.map((h) => [h.houseId, h.distance])).toEqual([
      [near, 1],
      [mid, 3],
      [far, 9],
    ]);
    const two = await housesNear(deps, { viewerId: 'me', today: TODAY, limit: 2 });
    expect(two.map((h) => h.houseId)).toEqual([near, mid]);
  });

  it('divák bez rodu nebo sídla – prázdný seznam', async () => {
    const { deps, entry } = await setup();
    entry(1, 1, []);
    expect(await housesNear(deps, { viewerId: 'nobody', today: TODAY, limit: 5 })).toEqual([]);
  });
});
