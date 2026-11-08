import type { LanguageGroup, OccupiedCell } from '../../domain/world';
import type { PlacementTx } from '../newcomers';
import type { WorldCell } from '../settlements';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';

/**
 * Umístění nováčka v paměti nad sdílenými in-memory rody a sídly – podmíněný zápis `placedAt`
 * jako `placed_at IS NULL` v databázi; zámek umisťování nahrazuje sériový běh transakcí.
 */
export class InMemoryPlacement implements PlacementTx {
  constructor(
    readonly settlements: InMemorySettlements = new InMemorySettlements(),
    readonly houses: InMemoryHouses = new InMemoryHouses(),
  ) {}

  async lockPlacement(): Promise<void> {
    await Promise.resolve();
  }

  async lockIsolated(houseId: string): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.houses.find((h) => h.id === houseId);
    return house !== undefined && house.endedAt === null && house.placedAt === null;
  }

  async claim(houseId: string, at: Date): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.houses.find((h) => h.id === houseId);
    if (!house || house.endedAt !== null || house.placedAt !== null) return false;
    house.placedAt = at;
    return true;
  }

  async isolatedCells(ownerId: string): Promise<WorldCell[]> {
    return (await this.settlements.listActive(ownerId)).flatMap((s) =>
      s.localCell ? [{ x: s.localCell.x, y: s.localCell.y }] : [],
    );
  }

  occupiedCells(): Promise<OccupiedCell[]> {
    return this.settlements.occupiedCells();
  }

  async languageCells(language: LanguageGroup): Promise<WorldCell[]> {
    const owners = new Set(
      this.houses.houses
        .filter(
          (h) =>
            h.kind === 'player' &&
            h.endedAt === null &&
            h.placedAt !== null &&
            h.language === language,
        )
        .map((h) => h.playerId),
    );
    return (await this.settlements.occupiedCells())
      .filter((o) => owners.has(o.ownerId))
      .map((o) => o.cell);
  }

  async seatCell(ownerId: string): Promise<WorldCell | null> {
    return (await this.settlements.findSeat(ownerId))?.worldCell ?? null;
  }

  async moveIsolated(ownerId: string, shift: WorldCell): Promise<void> {
    await Promise.resolve();
    this.settlements.moveIsolated(ownerId, shift);
  }
}
