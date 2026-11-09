import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { Fortification } from '../../domain/village/fortification/types';
import { village } from '../../domain/village/__tests__/kin-fixtures';
import type { CampaignState } from '../../domain/war';
import { wallPosts } from '../../domain/war/wall-defense';
import {
  attacker,
  battle,
  DAY,
  defender,
  field,
  land,
  palisade,
} from '../../domain/war/__tests__/battle-fixtures';
import { campaign, member } from '../../domain/war/__tests__/campaign-fixtures';
import { orderBreakout, type OrderBreakoutDeps } from '../order-breakout';
import { NOT_PLAYER_VILLAGE } from '../player-villages';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Rozkaz „Probít se“ (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení): držitel
// napadené vsi (p9) zapíše záměr `breakout` do cizího tažení (p1) – jen s právem `war`, při boji,
// s opevněním s branou a obránci za hradbou.

const WALKWAY: Fortification = { ...palisade(true), kind: 'walkway' };
const world = OFFICIAL_WORLD;

/** Útok p1 na ves `villageId` (políčko (1, 0)): obránci na stanovištích hradby. */
function raiding(villageId: string): CampaignState {
  const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
  const posts = wallPosts(field([WALKWAY]).forts, 4);
  return {
    ...base,
    phase: 'raiding',
    target: { ...base.target, villageId, cell: { x: 1, y: 0 } },
    groups: base.groups.map((g) => ({ ...g, cell: { x: 1, y: 0 }, pos: { x: 0, z: 70 } })),
    battle: battle({
      attackers: [attacker(0, { x: 0, z: 70 }, { line: true }), attacker(1, { x: 5, z: 70 })],
      defenders: posts.map((p, i) => defender(301 + i, p, { post: p, onWall: true })),
      commander: 0,
    }),
  };
}

async function setup(
  o: { forts?: Fortification[]; state?: (villageId: string) => CampaignState } = {},
): Promise<{ deps: OrderBreakoutDeps; campaigns: InMemoryCampaigns; villageId: string }> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const campaigns = new InMemoryCampaigns();
  await houses.create({ playerId: 'p9', kind: 'player', createdAt: new Date(0) });
  const seat = await settlements.create({
    ownerId: 'p9',
    landscapeSeed: 9,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 1, y: 0 },
  });
  const state = village([], [], { fortifications: o.forts ?? [WALKWAY], lastDay: DAY });
  const record = await villages.add(seat!.id, 'Kněžice', state);
  await campaigns.create((o.state ?? raiding)(record.id));
  const deps: OrderBreakoutDeps = {
    houses,
    settlements,
    villages,
    campaigns,
    cells: { mapOf: () => Promise.resolve({ landscape: land(), obstacles: null, villageIds: [] }) },
    world,
  };
  return { deps, campaigns, villageId: record.id };
}

/** Skutečný čas v taktu kontrolního bodu tažení. */
const nowOf = (s: CampaignState): number => world.startMs + s.tick * 250 + 10;

describe('orderBreakout', () => {
  it('držitel vsi zapíše záměr „Probít se“ do cizího tažení na takt teď + 2', async () => {
    const { deps, campaigns, villageId } = await setup();
    const tick = raiding(villageId).tick;
    const result = await orderBreakout(deps, {
      playerId: 'p9',
      villageId,
      today: DAY,
      nowMs: nowOf(raiding(villageId)),
    });
    expect(result).toEqual({ ok: true, campaignId: 'c1' });
    expect(campaigns.intents).toEqual([
      expect.objectContaining({
        campaignId: 'c1',
        byPlayer: 'p9',
        tick: tick + 2,
        body: { kind: 'breakout', fort: 0 },
      }),
    ]);
  });

  it('cizí hráč (i útočník) ves nemá – nic se nezapíše', async () => {
    const { deps, campaigns, villageId } = await setup();
    const nowMs = nowOf(raiding(villageId));
    for (const playerId of ['p1', 'p5']) {
      const result = await orderBreakout(deps, { playerId, villageId, today: DAY, nowMs });
      expect(result).toEqual({ ok: false, reason: NOT_PLAYER_VILLAGE });
    }
    expect(campaigns.intents).toEqual([]);
  });

  it('důvody: boj neběží, opevnění bez brány, obránci po bodu zlomu, nikdo nebrání', async () => {
    const ask = async (o: Parameters<typeof setup>[0]): Promise<unknown> => {
      const { deps, villageId } = await setup(o);
      return orderBreakout(deps, {
        playerId: 'p9',
        villageId,
        today: DAY,
        nowMs: nowOf(raiding(villageId)),
      });
    };
    const reason = (text: string): unknown => ({ ok: false, reason: text });
    // vojsko teprve táhne – boj u vsi není
    expect(await ask({ state: (id) => ({ ...raiding(id), phase: 'marching' }) })).toEqual(
      reason('Boj neběží.'),
    );
    expect(await ask({ forts: [{ ...WALKWAY, gates: [] }] })).toEqual(
      reason('Opevnění nemá bránu.'),
    );
    const routed = (id: string): CampaignState => {
      const s = raiding(id);
      s.battle!.routed = [0];
      return s;
    };
    expect(await ask({ state: routed })).toEqual(reason('Obránci utíkají.'));
    const fled = (id: string): CampaignState => {
      const s = raiding(id);
      for (const f of s.battle!.fighters) if (f.side === 'defend') f.state = 'fled';
      return s;
    };
    expect(await ask({ state: fled })).toEqual(reason('Nikdo nebrání hradbu.'));
  });
});
