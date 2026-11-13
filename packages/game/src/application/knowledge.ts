import type { SeenCell } from '../domain/war';
import type { GridCell } from '../domain/village/people/world-grid';

// Port úložiště znalosti rodu (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 10):
// co muži při výjezdech (a později tažení) o cizích mapách viděli, se po návratu neztratí. Znalost
// je po políčcích světa a je soukromá – čte ji jen rod, kterému patří.

/** Port úložiště znalosti rodu. */
export interface KnowledgeRepository {
  /** Znalost rodu o mapě na políčku; `null` – rod o ní nic neví (cizí rod také ne). */
  of(houseId: string, cell: GridCell): Promise<SeenCell | null>;
  /** Políčka, o kterých rod něco ví. */
  cellsOf(houseId: string): Promise<GridCell[]>;
  /**
   * Přidá, co muži viděli (`mergeKnowledge`): čtení a zápis jednoho políčka rodu jsou jedna
   * transakce se zámkem řádku – výjezd a tažení smí zapisovat současně. Opakované volání s toutéž
   * znalostí nic nezmění (doručení schránky po pádu je bezpečné).
   */
  merge(houseId: string, cell: GridCell, seen: SeenCell): Promise<void>;
}
