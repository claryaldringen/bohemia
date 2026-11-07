import { cellDistance, type OfferCandidate } from '../../domain/world';
import type { GridCell } from '../../domain/village';
import type { DirectoryEntry, WorldDirectory } from '../world-directory';

/** Adresář rodů v paměti – řazení a limit jako SQL v adaptéru. */
export class InMemoryWorldDirectory implements WorldDirectory {
  readonly entries: DirectoryEntry[] = [];

  async nearestHouses(
    center: GridCell,
    limit: number,
    excludeHouseId: string,
  ): Promise<DirectoryEntry[]> {
    await Promise.resolve();
    return this.entries
      .filter((e) => e.house.id !== excludeHouseId)
      .sort(
        (a, b) =>
          cellDistance(center, a.seat) - cellDistance(center, b.seat) ||
          (a.house.id < b.house.id ? -1 : 1),
      )
      .slice(0, limit);
  }

  async entriesOf(houseIds: string[]): Promise<DirectoryEntry[]> {
    await Promise.resolve();
    return this.entries.filter((e) => houseIds.includes(e.house.id));
  }

  async offerCandidates(): Promise<OfferCandidate[]> {
    await Promise.resolve();
    return this.entries
      .filter((e) => e.house.placedAt !== null)
      .map((e) => ({
        houseId: e.house.id,
        kind: e.house.kind,
        alive: e.house.endedAt === null,
        villages: e.digests.filter(
          (d) => d.digest.extinctDay === undefined && d.digest.abandonedDay === undefined,
        ).length,
        language: e.house.language,
      }));
  }
}
