import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { DAY, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import { announceSenior } from '../announce-senior';
import type { VillageRecord } from '../villages';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Kronika „Seniorem rodu je …“ (seniorate.md – Seniorát): jednou za změnu, do všech vsí rodu.

const PLAYER = 'hrac-1';

describe('announceSenior', () => {
  async function world(): Promise<{
    houses: InMemoryHouses;
    villages: InMemoryVillages;
    ids: string[];
  }> {
    const houses = new InMemoryHouses();
    const settlements = new InMemorySettlements();
    const villages = new InMemoryVillages();
    await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
    const ids: string[] = [];
    for (const [i, [id, age, name]] of (
      [
        [10, 40, 'Bořivoj'],
        [20, 55, 'Ctibor'],
      ] as const
    ).entries()) {
      const settlement =
        i === 0
          ? await settlements.seatAtOrigin({
              ownerId: PLAYER,
              landscapeSeed: 11,
              layerVersions: CURRENT_LAYER_VERSIONS,
            })
          : (await settlements.create({
              ownerId: PLAYER,
              landscapeSeed: 12,
              layerVersions: CURRENT_LAYER_VERSIONS,
              worldCell: { x: 1, y: 0 },
            }))!;
      const state = village([{ ...kin({ id, age, sex: 'male' }), line: true, name }]);
      ids.push((await villages.add(settlement.id, `Ves ${i}`, state)).id);
    }
    return { houses, villages, ids };
  }

  it('zapíše seniora do všech vsí rodu jednou; opakování ani stejný senior nic nepřidá', async () => {
    const w = await world();
    const deps = { houses: w.houses, villages: w.villages };
    const list = async (): Promise<VillageRecord[]> => {
      const found = await Promise.all(w.ids.map((id) => w.villages.find(id)));
      return found.filter((v): v is VillageRecord => v !== null);
    };
    await announceSenior(deps, { playerId: PLAYER, villages: await list(), today: DAY });
    expect(w.houses.houses[0]!.senior).toEqual({ villageId: w.ids[1], personId: 20 });
    for (const id of w.ids) {
      const pending = await w.villages.inbox.pending(id, 0, DAY + 5);
      expect(pending.map((e) => e.body)).toEqual([
        { kind: 'chronicle', event: { day: DAY, kind: 'senior', name: 'Ctibor' } },
      ]);
    }
    await announceSenior(deps, { playerId: PLAYER, villages: await list(), today: DAY + 1 });
    for (const id of w.ids) expect(await w.villages.inbox.pending(id, 0, DAY + 5)).toHaveLength(1);
  });
});
