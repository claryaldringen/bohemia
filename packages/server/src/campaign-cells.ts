import {
  createSkeletonCache,
  CURRENT_LAYER_VERSIONS,
  emptyCellLandscape,
  obstaclesOf,
  SEAT_CELL,
  settlementLandscape,
  trailEntriesOf,
  trailExitsOf,
  type CampaignCells,
  type CampaignMap,
  type GridCell,
  type LandscapeSource,
  type SettlementRepository,
  type TrailEntry,
  type TrailExit,
  type TrailExitSource,
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

/** Sousedních políček mapy (8 směrů) – výstupy stezek se čtou ze všech. */
const NEIGHBOURS = 8;

/**
 * Mapy políček světa pro tažení (war.md – Pohyb – mapu po mapě): políčko se sídlem má krajinu
 * z uloženého seedu a výřezu (sdílená mezipaměť krajin) a jeho vsi; prázdné políčko krajinu z
 * `cellLandscapeSeed` a výřezu kostry světa – generuje se jednou a drží v LRU (generování je
 * drahé), kostra má vlastní mezipaměť pro seed světa. Velikost LRU nastaví worker před kolem
 * (`reserve`); držitele a vsi políčka čte `mapOf` dál každé kolo.
 *
 * Vstupy zemských stezek sousedních vsí (`trailEntries` – trade.md, Pokračování na sousední mapě;
 * plán 2026-11-16-dense-forest – Rozhodnutí 13) se čtou při každém `mapOf` ze souhrnů vsí na
 * 8 sousedních políčkách (`trailExits` – jeden dotaz), LRU drží dál jen krajinu a překážky. Ves,
 * jejíž souhrn výstupy nenese (uložený dřív), se načte celá (`find` + `trailExitsOf`) jednou na
 * verzi – výstupy v paměti podle `id@verze`. Bez zdroje výstupů žádné vstupy.
 */
export function createCampaignCells(deps: {
  settlements: Pick<SettlementRepository, 'holderAt' | 'listActive'>;
  /** Otisky – id vsí sídla bez načtení jejich stavu; celá ves jen pro výstupy bez souhrnu. */
  villages: Pick<VillageRepository, 'stampsOf' | 'find'>;
  landscapes: LandscapeSource;
  worldSeed: number;
  capacity?: number;
  /** Výstupy stezek vsí sousedních políček ze souhrnů (`createTrailExitSource`). */
  trailExits?: TrailExitSource;
}): WorkerCampaignCells {
  const base = deps.capacity ?? CAMPAIGN_CELL_CACHE_SIZE;
  const empty = new LruCache<string, CampaignMap>(base);
  const skeleton = createSkeletonCache(deps.worldSeed);
  // výstupy vsí načtených celé (souhrn bez `trailExits`) podle `id@verze`
  const loaded = new LruCache<string, TrailExit[]>(base);

  /** Vstupy stezek sousedních vsí na mapu políčka – čtené pokaždé (stezku mohli mezitím dostavět). */
  async function entriesOf(source: TrailExitSource, cell: GridCell): Promise<TrailEntry[]> {
    const neighbours: { cell: GridCell; exits: readonly TrailExit[] }[] = [];
    for (const n of await source.trailExitsAround(cell)) {
      let exits = n.exits;
      if (exits === null) {
        const key = `${n.villageId}@${n.version}`;
        exits = loaded.get(key) ?? null;
        if (exits === null) {
          const record = await deps.villages.find(n.villageId);
          exits = record ? trailExitsOf(record.state) : [];
          loaded.set(key, exits);
        }
      }
      neighbours.push({ cell: n.cell, exits });
    }
    return trailEntriesOf(cell, neighbours);
  }

  /** Mapa políčka bez vstupů stezek (prázdné políčko z LRU). */
  async function landOf(cell: GridCell): Promise<CampaignMap> {
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
          trailEntries: [],
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
    const map: CampaignMap = { landscape, obstacles, villageIds: [], trailEntries: [] };
    empty.set(key, map);
    return map;
  }

  return {
    reserve(cells) {
      // krajina prázdného políčka je čistá funkce seedu světa a políčka – víc místa výsledek nemění
      empty.resize(Math.max(base, cells + base));
      // výstupy vsí bez souhrnu: každá mapa má až 8 sousedů – s menší pamětí by se souhrny bez
      // výstupů (vsi uložené dřív) dočítaly celé každé kolo
      loaded.resize(Math.max(base, NEIGHBOURS * cells + base));
    },
    async mapOf(cell) {
      const map = await landOf(cell);
      if (!deps.trailExits) return map;
      return { ...map, trailEntries: await entriesOf(deps.trailExits, cell) };
    },
  };
}
