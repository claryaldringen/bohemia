import type { GridCell } from '../../domain/village/people/world-grid';
import { mergeKnowledge, type SeenCell } from '../../domain/war';
import type { KnowledgeRepository } from '../knowledge';

/** Úložiště znalosti rodu v paměti – klíč `rod|x,y`, uložená hodnota je kopie (jako JSON). */
export class InMemoryKnowledge implements KnowledgeRepository {
  readonly cells = new Map<string, SeenCell>();
  /** Počet volání `merge` (i opakovaných). */
  merges = 0;

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

  async merge(houseId: string, cell: GridCell, seen: SeenCell): Promise<void> {
    await Promise.resolve();
    this.merges++;
    const key = this.key(houseId, cell);
    this.cells.set(key, structuredClone(mergeKnowledge(this.cells.get(key) ?? null, seen)));
  }
}
