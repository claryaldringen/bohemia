import type { GridCell } from '../../domain/village/people/world-grid';
import { mergeKnowledge, type SeenCell } from '../../domain/war';
import type { KnowledgeRepository, KnownCell } from '../knowledge';
import type { InMemoryHouses } from './in-memory-houses';
import type { InMemorySettlements } from './in-memory-settlements';
import type { InMemoryVillages } from './in-memory-villages';

/** Úložiště znalosti rodu v paměti – klíč `rod|x,y`, uložená hodnota je kopie (jako JSON). */
export class InMemoryKnowledge implements KnowledgeRepository {
  readonly cells = new Map<string, SeenCell>();
  /** Počet volání `merge` (i opakovaných). */
  merges = 0;
  /**
   * Svět pro `knownCellsOf` (sídla, vsi a rody v paměti) – test ho propojí; bez něj políčka nikdo
   * nedrží.
   */
  world: {
    settlements: InMemorySettlements;
    villages: InMemoryVillages;
    houses: InMemoryHouses;
  } | null = null;

  private key(houseId: string, cell: GridCell): string {
    return `${houseId}|${cell.x},${cell.y}`;
  }

  async of(houseId: string, cell: GridCell): Promise<SeenCell | null> {
    await Promise.resolve();
    const seen = this.cells.get(this.key(houseId, cell));
    return seen ? structuredClone(seen) : null;
  }

  async cellsOf(houseId: string): Promise<GridCell[]> {
    await Promise.resolve();
    return [...this.cells.keys()]
      .filter((k) => k.startsWith(`${houseId}|`))
      .map((k) => {
        const [x, y] = k.slice(houseId.length + 1).split(',');
        return { x: Number(x), y: Number(y) };
      });
  }

  async knownCellsOf(houseId: string): Promise<KnownCell[]> {
    const out: KnownCell[] = [];
    for (const cell of await this.cellsOf(houseId)) {
      const seen = this.cells.get(this.key(houseId, cell))!;
      // sídlo na políčku bez archivu, jeho vsi a živý rod držitele – jako spojení tabulek v DB
      const held = this.world?.settlements.settlements.find(
        (s) =>
          !this.world?.settlements.archived.has(s.id) &&
          s.worldCell?.x === cell.x &&
          s.worldCell.y === cell.y,
      );
      const villageIds = held
        ? [...this.world!.villages.records.values()]
            .filter((v) => v.settlementId === held.id)
            .map((v) => v.id)
        : [];
      const holder = held ? await this.world!.houses.activeOf(held.ownerId) : null;
      out.push({
        cell,
        seenVillageId: seen.villageId ?? null,
        seenParts: seen.parts.length,
        villageIds,
        holderHouseId: holder?.id ?? null,
      });
    }
    return out;
  }

  async merge(houseId: string, cell: GridCell, seen: SeenCell): Promise<void> {
    await Promise.resolve();
    this.merges++;
    const key = this.key(houseId, cell);
    this.cells.set(key, structuredClone(mergeKnowledge(this.cells.get(key) ?? null, seen)));
  }
}
