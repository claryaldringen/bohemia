import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  type House,
  type Settlement,
  type Stewardship,
  type VillageStamp,
} from '@bohemia/game';
import type { EventScope } from '../protocol';
import type { ScopeDeps } from '../scope';

vi.mock('server-only', () => ({}));

const { resolveConnectionScope } = await import('../scope');

const PLAYER = 'hrac';
const STRANGER = 'cizi';
const OWN_VILLAGE = '00000000-0000-4000-8000-000000000001';
const FOREIGN_VILLAGE = '00000000-0000-4000-8000-000000000002';
const STEWARDED_VILLAGE = '00000000-0000-4000-8000-000000000003';
const ISOLATED_VILLAGE = '00000000-0000-4000-8000-000000000004';
const NPC_STEWARDED = '00000000-0000-4000-8000-000000000005';
const OWN_CAMPAIGN = '00000000-0000-4000-8000-0000000000c1';
const FOREIGN_CAMPAIGN = '00000000-0000-4000-8000-0000000000c2';

function settlement(id: string, ownerId: string, worldCell: Settlement['worldCell']): Settlement {
  return {
    id,
    ownerId,
    isSeat: false,
    landscapeSeed: 1,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell,
    createdAt: new Date(0),
  };
}

function stamp(id: string, settlementId: string): VillageStamp {
  return { id, settlementId, name: id, version: 1, lastDay: 0, asleep: false };
}

function house(id: string, playerId: string): House {
  return {
    id,
    playerId,
    kind: 'player',
    createdAt: new Date(0),
    endedAt: null,
    endedDay: null,
    lord: null,
    senior: null,
    successionDay: null,
    pendingDeparture: null,
    lastEnnobleYear: null,
    language: 'cs',
    placedAt: new Date(0),
    newcomerSince: null,
    christianityKnownYear: null,
    baptizedDay: null,
  };
}

function stewardship(
  villageId: string,
  stewardHouseId: string,
  kind: 'player' | 'npc',
): Stewardship {
  return {
    id: `st-${villageId}`,
    villageId,
    stewardHouseId,
    holderHouseId: 'rod-ciziho',
    kind,
    vassalageId: null,
    since: new Date(0),
  };
}

/** Porty v paměti: vlastní ves, cizí ves, ves spravovaná domem hráče, odříznutá ves. */
function deps(): ScopeDeps {
  const settlements = new Map<string, Settlement>([
    ['s-own', settlement('s-own', PLAYER, { x: 3, y: -2 })],
    ['s-foreign', settlement('s-foreign', STRANGER, { x: 9, y: 9 })],
    ['s-isolated', settlement('s-isolated', PLAYER, null)],
  ]);
  const stamps = new Map<string, VillageStamp>([
    [OWN_VILLAGE, stamp(OWN_VILLAGE, 's-own')],
    [FOREIGN_VILLAGE, stamp(FOREIGN_VILLAGE, 's-foreign')],
    [STEWARDED_VILLAGE, stamp(STEWARDED_VILLAGE, 's-foreign')],
    [NPC_STEWARDED, stamp(NPC_STEWARDED, 's-foreign')],
    [ISOLATED_VILLAGE, stamp(ISOLATED_VILLAGE, 's-isolated')],
  ]);
  const stewardships = new Map<string, Stewardship>([
    [STEWARDED_VILLAGE, stewardship(STEWARDED_VILLAGE, 'rod-hrace', 'player')],
    // NPC správce s id rodu hráče by přístup dát neměl (jen správa hráče)
    [NPC_STEWARDED, stewardship(NPC_STEWARDED, 'rod-hrace', 'npc')],
  ]);
  const houses = new Map<string, House>([
    [PLAYER, house('rod-hrace', PLAYER)],
    [STRANGER, house('rod-ciziho', STRANGER)],
  ]);
  const campaigns = new Map<string, string[]>([
    [PLAYER, [OWN_CAMPAIGN]],
    [STRANGER, [FOREIGN_CAMPAIGN]],
  ]);
  return {
    villages: {
      stampsOfVillages: async (ids) =>
        ids.map((id) => stamps.get(id)).filter((s): s is VillageStamp => s !== undefined),
    },
    settlements: { find: async (id) => settlements.get(id) ?? null },
    stewardships: { of: async (villageId) => stewardships.get(villageId) ?? null },
    houses: { activeOf: async (playerId) => houses.get(playerId) ?? null },
    campaigns: { activeOf: async (playerId) => campaigns.get(playerId) ?? [] },
  };
}

function ask(over: Partial<EventScope>): EventScope {
  return { villageId: null, campaignId: null, scene: null, ...over };
}

describe('rozsah spojení – ověření při připojení', () => {
  it('vlastní ves dá rozsah se sídlem a políčkem', async () => {
    expect(await resolveConnectionScope(deps(), PLAYER, ask({ villageId: OWN_VILLAGE }))).toEqual({
      playerId: PLAYER,
      villageId: OWN_VILLAGE,
      settlementId: 's-own',
      cell: { x: 3, y: -2 },
      campaignId: null,
      scene: null,
    });
  });

  it('odříznutá ves nemá políčko', async () => {
    const scope = await resolveConnectionScope(
      deps(),
      PLAYER,
      ask({ villageId: ISOLATED_VILLAGE }),
    );
    expect(scope).toMatchObject({ settlementId: 's-isolated', cell: null });
  });

  it('cizí, neznámá i NPC spravovaná ves dá forbidden', async () => {
    const d = deps();
    expect(await resolveConnectionScope(d, PLAYER, ask({ villageId: FOREIGN_VILLAGE }))).toBe(
      'forbidden',
    );
    expect(
      await resolveConnectionScope(
        d,
        PLAYER,
        ask({ villageId: '00000000-0000-4000-8000-0000000000ff' }),
      ),
    ).toBe('forbidden');
    expect(await resolveConnectionScope(d, PLAYER, ask({ villageId: NPC_STEWARDED }))).toBe(
      'forbidden',
    );
  });

  it('ves spravovaná domem hráče dá rozsah', async () => {
    expect(
      await resolveConnectionScope(deps(), PLAYER, ask({ villageId: STEWARDED_VILLAGE })),
    ).toMatchObject({
      playerId: PLAYER,
      villageId: STEWARDED_VILLAGE,
      settlementId: 's-foreign',
      cell: { x: 9, y: 9 },
    });
  });

  it('cizí tažení v campaignId i scene se zahodí, vlastní běžící zůstane', async () => {
    const foreign = await resolveConnectionScope(
      deps(),
      PLAYER,
      ask({
        villageId: OWN_VILLAGE,
        campaignId: FOREIGN_CAMPAIGN,
        scene: { campaignId: FOREIGN_CAMPAIGN, cell: { x: 9, y: 9 } },
      }),
    );
    expect(foreign).toMatchObject({ villageId: OWN_VILLAGE, campaignId: null, scene: null });

    const own = await resolveConnectionScope(
      deps(),
      PLAYER,
      ask({ campaignId: OWN_CAMPAIGN, scene: { campaignId: OWN_CAMPAIGN, cell: { x: 9, y: 9 } } }),
    );
    expect(own).toEqual({
      playerId: PLAYER,
      villageId: null,
      settlementId: null,
      cell: null,
      campaignId: OWN_CAMPAIGN,
      scene: { campaignId: OWN_CAMPAIGN, cell: { x: 9, y: 9 } },
    });
  });
});
