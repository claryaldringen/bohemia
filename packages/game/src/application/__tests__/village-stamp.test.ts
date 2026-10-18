import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { renameVillage } from '../rename-village';
import { dynastyStatus } from '../restart-game';
import type { LandscapeSource } from '../settlements';
import { currentVillageViewStamp, villageViewStamp } from '../village-stamp';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

const TODAY = dayIndexOf({ year: 540, month: 4, day: 12 });
const PLAYER = 'hrac-1';
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };

async function player(): Promise<{
  deps: {
    settlements: InMemorySettlements;
    villages: InMemoryVillages;
    landscapes: LandscapeSource;
  };
  villageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const seat = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: seat.id,
      landscape,
      today: TODAY - 3,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
      fieldCells: block(6, 6, 4, 4),
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return { deps: { settlements, villages, landscapes }, villageId: founded.village.id };
}

describe('villageViewStamp', () => {
  const a = { id: 'a', name: 'Libice', version: 3 };
  const b = { id: 'b', name: 'Kouřim', version: 7 };

  it('nezáleží na pořadí vsí, mění ho ves, den, verze i jméno', () => {
    const stamp = villageViewStamp('a', 100, [a, b]);
    expect(stamp).toMatch(/^[0-9a-f]{16}$/);
    expect(villageViewStamp('a', 100, [b, a])).toBe(stamp);
    expect(villageViewStamp('b', 100, [a, b])).not.toBe(stamp);
    expect(villageViewStamp('a', 101, [a, b])).not.toBe(stamp);
    expect(villageViewStamp('a', 100, [{ ...a, version: 4 }, b])).not.toBe(stamp);
    expect(villageViewStamp('a', 100, [a, { ...b, name: 'Čáslav' }])).not.toBe(stamp);
    expect(villageViewStamp('a', 100, [a])).not.toBe(stamp);
  });
});

describe('currentVillageViewStamp', () => {
  it('po dopočtu všech vsí sedí s otiskem z dopočítaných vsí – bez načtení stavů', async () => {
    const { deps, villageId } = await player();
    const input = { playerId: PLAYER, villageId, today: TODAY };
    // ves je dopočítaná jen do dne založení – dotaz by ji dopočítal, otisk nejde říct předem
    expect(await currentVillageViewStamp(deps, input)).toBeNull();
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
    const expected = villageViewStamp(villageId, TODAY, status.villages);
    const finds = deps.villages.finds;
    expect(await currentVillageViewStamp(deps, input)).toBe(expected);
    expect(deps.villages.finds).toBe(finds);
    expect(deps.villages.stampQueries).toBeGreaterThan(0);
  });

  it('nová verze, nové jméno, jiný den nebo cizí ves otisk změní / nedají', async () => {
    const { deps, villageId } = await player();
    const status = await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
    const known = villageViewStamp(villageId, TODAY, status.villages);
    const input = { playerId: PLAYER, villageId, today: TODAY };
    await renameVillage(deps, { villageId, today: TODAY, name: 'Kouřim', landscape });
    expect(await currentVillageViewStamp(deps, input)).not.toBe(known);
    deps.villages.edit(villageId, (s) => (s.storesKg += 1));
    expect(await currentVillageViewStamp(deps, input)).not.toBe(known);
    expect(await currentVillageViewStamp(deps, { ...input, today: TODAY + 1 })).toBeNull();
    expect(await currentVillageViewStamp(deps, { ...input, villageId: 'jina' })).toBeNull();
    expect(await currentVillageViewStamp(deps, { ...input, playerId: 'jiny-hrac' })).toBeNull();
  });
});
