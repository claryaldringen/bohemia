import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { renameVillage } from '../rename-village';
import { dynastyForVillage, WORKER_LAG_DAYS } from '../dynasty-for-village';
import { dynastyStatus } from '../restart-game';
import type { LandscapeSource } from '../settlements';
import { currentVillageViewStamp, villageViewStamp } from '../village-stamp';
import { isFullVillage } from '../villages';
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

  it('spící ves se zaostalým dnem otisk nezdrží', async () => {
    const { deps, villageId } = await player();
    deps.villages.edit(villageId, (s) => (s.people = []));
    await dynastyStatus(deps, { playerId: PLAYER, today: TODAY });
    const later = TODAY + 50;
    const input = { playerId: PLAYER, villageId, today: later };
    const stamps = await deps.villages.stampsOf(
      [...deps.villages.records.values()].map((r) => r.settlementId),
    );
    expect(stamps[0]).toMatchObject({ asleep: true });
    expect(stamps[0]?.lastDay).toBeLessThan(later);
    expect(await currentVillageViewStamp(deps, input)).toBe(
      villageViewStamp(villageId, later, stamps),
    );
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

describe('currentVillageViewStamp – ostatní vsi drží worker', () => {
  /** Hráč s druhou vsí na mapě vedle, dopočítanou jen do dne `otherDay` (worker zaostává). */
  async function twoVillages(otherDay: number): Promise<{
    deps: Awaited<ReturnType<typeof player>>['deps'] & { seeds: { nextSeed: () => number } };
    villageId: string;
    otherId: string;
  }> {
    const { deps, villageId } = await player();
    const next = await deps.settlements.create({
      ownerId: PLAYER,
      landscapeSeed: 12,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x: 1, y: 0 },
    });
    const other = await foundVillageForSettlement(
      { villages: deps.villages, seeds: { nextSeed: () => 4343 } },
      {
        settlementId: next!.id,
        landscape,
        today: otherDay,
        name: 'Lhota',
        dwelling: { x: -50, z: -50, rotation: 0 },
        fieldCells: block(6, 6, 4, 4),
      },
    );
    if (!other.ok) throw new Error(other.reason);
    return {
      deps: { ...deps, seeds: { nextSeed: () => 4444 } },
      villageId,
      otherId: other.village.id,
    };
  }

  it(`jiná ves nejvýš ${WORKER_LAG_DAYS} dny pozadu otisk nezdrží – sedí s pohledem`, async () => {
    const { deps, villageId, otherId } = await twoVillages(TODAY - WORKER_LAG_DAYS);
    const input = { playerId: PLAYER, villageId, today: TODAY };
    // zobrazená ves není na dnešku – pohled by ji dopočítal
    expect(await currentVillageViewStamp(deps, input)).toBeNull();
    const status = await dynastyForVillage(deps, input);
    // jiná ves z jiné mapy jen souhrnem – bez načtení stavu
    const other = status.villages.find((v) => v.id === otherId);
    expect(other && !isFullVillage(other) ? other.digest.lastDay : null).toBe(
      TODAY - WORKER_LAG_DAYS,
    );
    const finds = deps.villages.finds;
    expect(await currentVillageViewStamp(deps, input)).toBe(
      villageViewStamp(villageId, TODAY, status.villages),
    );
    expect(deps.villages.finds).toBe(finds);
  });

  it('jiná ves víc pozadu nebo zobrazená ves pozadu – otisk nejde říct předem', async () => {
    const { deps, villageId, otherId } = await twoVillages(TODAY - WORKER_LAG_DAYS);
    const input = { playerId: PLAYER, villageId, today: TODAY };
    await dynastyForVillage(deps, input);
    expect(await currentVillageViewStamp(deps, input)).not.toBeNull();
    // worker zaostal o den víc, než smí – pohled by jinou ves dopočítal
    deps.villages.edit(otherId, (s) => (s.lastDay = TODAY - WORKER_LAG_DAYS - 1));
    expect(await currentVillageViewStamp(deps, input)).toBeNull();
    // jiná ves na dnešku, zobrazená den pozadu – pohled ji dopočte
    deps.villages.edit(otherId, (s) => (s.lastDay = TODAY));
    deps.villages.edit(villageId, (s) => (s.lastDay = TODAY - 1));
    expect(await currentVillageViewStamp(deps, input)).toBeNull();
  });
});
