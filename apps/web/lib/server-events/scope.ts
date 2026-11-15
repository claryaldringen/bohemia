import 'server-only';
import type {
  CampaignRepository,
  HouseRepository,
  SettlementRepository,
  StewardshipRepository,
  VillageRepository,
} from '@bohemia/game';
import type { EventScope } from './protocol';
import type { ConnectionScope } from './routing';

// Ověření rozsahu při připojení (docs/code/server-events.md – Spojení /api/events; plán 2026-11-15 –
// Rozhodnutí 4): hráč nedostane nic, co by přes route neviděl. Ves jen vlastní, nebo spravovaná
// hráčovým rodem (jako `stewardAccess` v `application/rights.ts`), jinak 403; tažení a cizí mapa
// jen mezi běžícími taženími hráče, jinak se ta část rozsahu tiše zahodí (tažení mohlo právě
// skončit). Stav vsi se nenačítá – stačí otisk a sídlo.

/** Porty pro ověření rozsahu – route je předá z `gameDeps()`. */
export interface ScopeDeps {
  villages: Pick<VillageRepository, 'stampsOfVillages'>;
  settlements: Pick<SettlementRepository, 'find'>;
  stewardships: Pick<StewardshipRepository, 'of'>;
  houses: Pick<HouseRepository, 'activeOf'>;
  campaigns: Pick<CampaignRepository, 'activeOf'>;
}

/** Spravuje ves hráčův rod (živá správa hráče, ne NPC)? */
async function stewards(deps: ScopeDeps, playerId: string, villageId: string): Promise<boolean> {
  const steward = await deps.stewardships.of(villageId);
  if (!steward || steward.kind !== 'player') return false;
  const house = await deps.houses.activeOf(playerId);
  return house !== null && steward.stewardHouseId === house.id;
}

/** Rozsah spojení ověřený pro hráče; cizí ves = `'forbidden'` (route 403). */
export async function resolveConnectionScope(
  deps: ScopeDeps,
  playerId: string,
  scope: EventScope,
): Promise<ConnectionScope | 'forbidden'> {
  let village: Pick<ConnectionScope, 'villageId' | 'settlementId' | 'cell'> = {
    villageId: null,
    settlementId: null,
    cell: null,
  };
  if (scope.villageId !== null) {
    const [stamp] = await deps.villages.stampsOfVillages([scope.villageId]);
    // archivované sídlo `find` nevrací – jako cizí ves
    const settlement = stamp ? await deps.settlements.find(stamp.settlementId) : null;
    if (!stamp || !settlement) return 'forbidden';
    if (settlement.ownerId !== playerId && !(await stewards(deps, playerId, stamp.id))) {
      return 'forbidden';
    }
    const cell = settlement.worldCell;
    village = {
      villageId: stamp.id,
      settlementId: settlement.id,
      cell: cell ? { x: cell.x, y: cell.y } : null,
    };
  }
  const wanted = scope.campaignId !== null || scope.scene !== null;
  const running = new Set(wanted ? await deps.campaigns.activeOf(playerId) : []);
  return {
    playerId,
    ...village,
    campaignId:
      scope.campaignId !== null && running.has(scope.campaignId) ? scope.campaignId : null,
    scene: scope.scene !== null && running.has(scope.scene.campaignId) ? scope.scene : null,
  };
}
