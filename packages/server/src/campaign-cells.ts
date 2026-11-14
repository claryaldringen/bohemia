import {
  createSkeletonCache,
  CURRENT_LAYER_VERSIONS,
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

/** Mapy políček pro tažení a výjezdy s velikostí mezipaměti prázdných map podle potřeby kola. */
export interface WorkerCampaignCells extends CampaignCells {
  /**
   * Kolo workeru bude číst `cells` map (`cellsInNeed` – políčka z paměti tažení i výjezdů): LRU
   * prázdných map pojme všechny a k tomu `CAMPAIGN_CELL_CACHE_SIZE` nových (nejméně tolik), takže
   * se krajina mapy, na které skupina stojí, mezi koly negeneruje znovu (≈ 250–350 ms za mapu), ať
   * je skupin kolik chce. Po ústupu potřeby se LRU zmenší zpět.
   */
  reserve(cells: number): void;
}

/**
 * Mapy políček světa pro tažení (war.md – Pohyb – mapu po mapě): políčko se sídlem má krajinu
 * z uloženého seedu a výřezu (sdílená mezipaměť krajin) a jeho vsi; prázdné políčko krajinu z
 * `cellLandscapeSeed` a výřezu kostry světa – generuje se jednou a drží v LRU (generování je
 * drahé), kostra má vlastní mezipaměť pro seed světa. Velikost LRU nastaví worker před kolem
 * (`reserve`); držitele a vsi políčka čte `mapOf` dál každé kolo.
 */
export function createCampaignCells(deps: {
  settlements: Pick<SettlementRepository, 'holderAt' | 'listActive'>;
  /** Jen otisky – id vsí sídla bez načtení jejich stavu. */
  villages: Pick<VillageRepository, 'stampsOf'>;
  landscapes: LandscapeSource;
  worldSeed: number;
  capacity?: number;
}): WorkerCampaignCells {
  const base = deps.capacity ?? CAMPAIGN_CELL_CACHE_SIZE;
  const empty = new LruCache<string, CampaignMap>(base);
  const skeleton = createSkeletonCache(deps.worldSeed);
  return {
    reserve(cells) {
      // krajina prázdného políčka je čistá funkce seedu světa a políčka – víc místa výsledek nemění
      empty.resize(Math.max(base, cells + base));
    },
    async mapOf(cell) {
      const same = (c: { x: number; y: number }): boolean => c.x === cell.x && c.y === cell.y;
      // držitel jen tohoto políčka (index políčka) – worker se ptá každé kolo na každou mapu
      // tažení a výjezdů, čtení všech sídel světa by rostlo s jeho velikostí
      const holder = await deps.settlements.holderAt(cell);
      if (holder !== null) {
        const settlement = (await deps.settlements.listActive(holder)).find((s) =>
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
      const { landscape, obstacles } = emptyCellLandscape(
        deps.worldSeed,
        cell,
        CURRENT_LAYER_VERSIONS,
        skeleton,
      );
      const map: CampaignMap = { landscape, obstacles, villageIds: [] };
      empty.set(key, map);
      return map;
    },
  };
}
