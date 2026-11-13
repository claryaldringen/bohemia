import type { SeenCell } from '../domain/war';
import type { GridCell } from '../domain/village/people/world-grid';

// Port úložiště znalosti rodu (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 10):
// co muži při výjezdech (a později tažení) o cizích mapách viděli, se po návratu neztratí. Znalost
// je po políčcích světa a je soukromá – čte ji jen rod, kterému patří.

/**
 * Známá mapa rodu a kdo ji teď drží – řádek `KnowledgeRepository.knownCellsOf` (známá mapa
 * z domova – `knownVillagesOf`). Ze znalosti jen id vsi a počet viděných staveb, ne celý JSON.
 */
export interface KnownCell {
  cell: GridCell;
  /** Ves, ke které patří viděné stavby (`SeenCell.villageId`); null – znalost ji nemá. */
  seenVillageId: string | null;
  /** Kolik staveb té vsi rod naposled viděl (`SeenCell.parts`). */
  seenParts: number;
  /** Vsi sídla, které na políčku teď stojí (bez archivu); prázdné – políčko nikdo nedrží. */
  villageIds: string[];
  /** Živý rod hráče, který to sídlo drží; null – nikdo, nebo hráč bez rodu. */
  holderHouseId: string | null;
}

/** Port úložiště znalosti rodu. */
export interface KnowledgeRepository {
  /** Znalost rodu o mapě na políčku; `null` – rod o ní nic neví (cizí rod také ne). */
  of(houseId: string, cell: GridCell): Promise<SeenCell | null>;
  /** Políčka, o kterých rod něco ví. */
  cellsOf(houseId: string): Promise<GridCell[]>;
  /**
   * Známé mapy rodu se současným držitelem jedním dotazem (sídlo na políčku bez archivu, jeho vsi
   * a živý rod držitele) – seznam pro oka v panelech; pravidlo, co se z toho smí ukázat, je
   * v `knownVillagesOf`.
   */
  knownCellsOf(houseId: string): Promise<KnownCell[]>;
  /**
   * Přidá, co muži viděli (`mergeKnowledge`): čtení a zápis jednoho políčka rodu jsou jedna
   * transakce se zámkem řádku – výjezd a tažení smí zapisovat současně. Opakované volání s toutéž
   * znalostí nic nezmění (doručení schránky po pádu je bezpečné).
   */
  merge(houseId: string, cell: GridCell, seen: SeenCell): Promise<void>;
}
