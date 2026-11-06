import type { Settlement, SettlementRepository, WorldCell } from '../settlements';
import type { LayerVersions } from '../../domain/landscape';
import type { OccupiedCell } from '../../domain/world';

/**
 * Repozitář sídel v paměti – createSeat a archive se chovají atomicky jako databáze (unikátní
 * index, podmíněný UPDATE). Archivovaná sídla zůstávají v `settlements`, jejich id v `archived`.
 */
export class InMemorySettlements implements SettlementRepository {
  readonly settlements: Settlement[] = [];
  readonly archived = new Set<string>();
  private nextId = 1;

  async findSeat(ownerId: string): Promise<Settlement | null> {
    return this.settlements.find((s) => s.ownerId === ownerId && s.isSeat) ?? null;
  }

  async listActive(ownerId: string): Promise<Settlement[]> {
    return this.settlements
      .filter((s) => s.ownerId === ownerId && !this.archived.has(s.id))
      .sort((a, b) => Number(b.isSeat) - Number(a.isSeat));
  }

  async archive(settlementId: string): Promise<boolean> {
    await Promise.resolve();
    const index = this.settlements.findIndex((s) => s.id === settlementId);
    const settlement = this.settlements[index];
    if (!settlement || this.archived.has(settlementId)) return false;
    // archivované sídlo přestane být sídelní – uvolní místo pro nové (jako unikátní index)
    this.settlements[index] = { ...settlement, isSeat: false };
    this.archived.add(settlementId);
    return true;
  }

  async createSeat(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    worldCell: WorldCell;
  }): Promise<Settlement | null> {
    // Mezera mezi „přečtu“ a „zapíšu“ jako u skutečné databáze – souběžné volání ji odhalí.
    await Promise.resolve();
    // Kontrola a zápis bez dalšího await – atomicky jako unikátní index v databázi.
    const existing = this.settlements.find((s) => s.ownerId === input.ownerId && s.isSeat);
    if (existing) return existing;
    if (this.cellTaken(input.worldCell)) return null;
    const settlement: Settlement = {
      id: `settlement-${this.nextId++}`,
      isSeat: true,
      createdAt: new Date(0),
      ...input,
    };
    this.settlements.push(settlement);
    return settlement;
  }

  async create(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    worldCell: WorldCell;
  }): Promise<Settlement | null> {
    await Promise.resolve();
    // políčko mřížky je jedno na celý svět (jako unikátní index v databázi)
    if (this.cellTaken(input.worldCell)) return null;
    const settlement: Settlement = {
      id: `settlement-${this.nextId++}`,
      isSeat: false,
      createdAt: new Date(0),
      ...input,
    };
    this.settlements.push(settlement);
    return settlement;
  }

  /** Testovací zkratka: sídelní sídlo hráče na políčku (0, 0) – zakládá se vždy. */
  async seatAtOrigin(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
  }): Promise<Settlement> {
    const seat = await this.createSeat({ ...input, worldCell: { x: 0, y: 0 } });
    if (!seat) throw new Error('Políčko (0, 0) je obsazené.');
    return seat;
  }

  async occupiedCells(): Promise<OccupiedCell[]> {
    return this.settlements.flatMap((s) =>
      s.worldCell && !this.archived.has(s.id)
        ? [{ ownerId: s.ownerId, cell: { x: s.worldCell.x, y: s.worldCell.y } }]
        : [],
    );
  }

  private cellTaken(cell: WorldCell): boolean {
    return this.settlements.some(
      (s) => !this.archived.has(s.id) && s.worldCell?.x === cell.x && s.worldCell.y === cell.y,
    );
  }

  async find(settlementId: string): Promise<Settlement | null> {
    await Promise.resolve();
    const found = this.settlements.find((s) => s.id === settlementId);
    return found && !this.archived.has(settlementId) ? found : null;
  }

  async assignWorldCell(settlementId: string, cell: WorldCell): Promise<Settlement | null> {
    await Promise.resolve();
    const index = this.settlements.findIndex((s) => s.id === settlementId);
    const settlement = this.settlements[index];
    if (!settlement || this.archived.has(settlementId)) return null;
    if (settlement.worldCell !== null) return settlement;
    const placed = { ...settlement, worldCell: { x: cell.x, y: cell.y } };
    this.settlements[index] = placed;
    return placed;
  }
}
