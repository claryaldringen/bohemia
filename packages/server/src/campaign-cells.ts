import {
  emptyCellLandscape,
  obstaclesOf,
  SEAT_CELL,
  settlementLandscape,
  type CampaignCells,
  type CampaignMap,
  type LandscapeSource,
  type SettlementRepository,
  type VillageRepository,
} from '@bohemia/game';
import { LruCache } from './landscape-cache';

/** Kolik krajin prázdných políček držet pro tažení (krajina s vrstvou překážek ≈ 2 MB). */
export const CAMPAIGN_CELL_CACHE_SIZE = 16;

/**
 * Mapy políček světa pro tažení (war.md – Pohyb – mapu po mapě): políčko se sídlem má krajinu
 * z uloženého seedu (sdílená mezipaměť krajin) a jeho vsi; prázdné políčko krajinu z
 * `cellLandscapeSeed` – generuje se jednou a drží v LRU (generování je drahé).
 */
export function createCampaignCells(deps: {
  settlements: Pick<SettlementRepository, 'occupiedCells' | 'listActive'>;
  /** Jen otisky – id vsí sídla bez načtení jejich stavu. */
  villages: Pick<VillageRepository, 'stampsOf'>;
  landscapes: LandscapeSource;
  worldSeed: number;
  capacity?: number;
}): CampaignCells {
  const empty = new LruCache<string, CampaignMap>(deps.capacity ?? CAMPAIGN_CELL_CACHE_SIZE);
  return {
    async mapOf(cell) {
      const same = (c: { x: number; y: number }): boolean => c.x === cell.x && c.y === cell.y;
      const occupied = (await deps.settlements.occupiedCells()).find((c) => same(c.cell));
      if (occupied) {
        const settlement = (await deps.settlements.listActive(occupied.ownerId)).find((s) =>
          same(s.worldCell ?? SEAT_CELL),
        );
        if (settlement) {
          const landscape = settlementLandscape(settlement, deps.landscapes);
          const villages = await deps.villages.stampsOf([settlement.id]);
          return {
            landscape,
            obstacles: obstaclesOf(landscape),
            villageIds: villages.map((v) => v.id),
          };
        }
      }
      const key = `${cell.x},${cell.y}`;
      const cached = empty.get(key);
      if (cached) return cached;
      const { landscape, obstacles } = emptyCellLandscape(deps.worldSeed, cell);
      const map: CampaignMap = { landscape, obstacles, villageIds: [] };
      empty.set(key, map);
      return map;
    },
  };
}
