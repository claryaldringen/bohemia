import type {
  NewSettlement,
  Settlement,
  SettlementOwners,
  SettlementRepository,
  WorldCell,
} from '../settlements';
import type { LayerVersions, PremiumType } from '../../domain/landscape';
import type { OccupiedCell } from '../../domain/world';

/**
 * Repozitář sídel v paměti – createSeat a archive se chovají atomicky jako databáze (unikátní
 * index, podmíněný UPDATE). Archivovaná sídla zůstávají v `settlements`, jejich id v `archived`.
 */
export class InMemorySettlements implements SettlementRepository, SettlementOwners {
  readonly settlements: Settlement[] = [];
  readonly archived = new Set<string>();
  /** Prémiové sídlo → hráč, kterému typ patří (převod sídla na jiného držitele ho nemění). */
  private readonly premiumOwners = new Map<string, string>();
  private nextId = 1;

  async findSeat(ownerId: string): Promise<Settlement | null> {
    return this.settlements.find((s) => s.ownerId === ownerId && s.isSeat) ?? null;
  }

  /** Sídlo → čekající držitel (1. krok převodu – `transferHolder`). */
  readonly pending = new Map<string, string>();

  async transferHolder(
    settlementId: string,
    fromOwnerId: string,
    toOwnerId: string,
  ): Promise<boolean> {
    await Promise.resolve();
    const s = this.settlements.find((x) => x.id === settlementId);
    if (!s || s.ownerId !== fromOwnerId || this.pending.has(settlementId)) return false;
    if (this.archived.has(settlementId)) return false;
    this.pending.set(settlementId, toOwnerId);
    // sídlo přestane být sídelní (vymřelý hráč dostane při novém začátku nové)
    this.settlements[this.settlements.indexOf(s)] = { ...s, isSeat: false };
    return true;
  }

  async acceptTransfers(ownerId: string): Promise<Settlement[]> {
    await Promise.resolve();
    const out: Settlement[] = [];
    for (const [id, to] of [...this.pending]) {
      if (to !== ownerId) continue;
      const index = this.settlements.findIndex((s) => s.id === id);
      const s = this.settlements[index];
      this.pending.delete(id);
      if (!s) continue;
      this.settlements[index] = { ...s, ownerId, isSeat: false };
      out.push(this.settlements[index]);
    }
    return out;
  }

  async listActive(ownerId: string): Promise<Settlement[]> {
    return this.settlements
      .filter((s) => s.ownerId === ownerId && !this.archived.has(s.id) && !this.pending.has(s.id))
      .sort((a, b) => Number(b.isSeat) - Number(a.isSeat));
  }

  async ownersWithManyActive(): Promise<string[]> {
    await Promise.resolve();
    const counts = new Map<string, number>();
    for (const s of this.settlements) {
      if (this.archived.has(s.id) || this.pending.has(s.id)) continue;
      counts.set(s.ownerId, (counts.get(s.ownerId) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, n]) => n >= 2)
      .map(([ownerId]) => ownerId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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

  async createSeat(input: NewSettlement): Promise<Settlement | null> {
    // Mezera mezi „přečtu“ a „zapíšu“ jako u skutečné databáze – souběžné volání ji odhalí.
    await Promise.resolve();
    // Kontrola a zápis bez dalšího await – atomicky jako unikátní index v databázi.
    const existing = this.settlements.find((s) => s.ownerId === input.ownerId && s.isSeat);
    if (existing) return existing;
    return this.insert(input, true);
  }

  async create(input: NewSettlement): Promise<Settlement | null> {
    await Promise.resolve();
    return this.insert(input, false);
  }

  /** Vloží sídlo; obsazené políčko světa (nebo místní mřížky hráče) → null jako unikátní index. */
  private insert(input: NewSettlement, isSeat: boolean): Settlement | null {
    const worldCell = 'worldCell' in input ? input.worldCell : null;
    const localCell = 'localCell' in input ? input.localCell : null;
    if (worldCell && this.cellTaken(worldCell)) return null;
    if (localCell && this.localTaken(input.ownerId, localCell)) return null;
    const settlement: Settlement = {
      id: `settlement-${this.nextId++}`,
      ownerId: input.ownerId,
      isSeat,
      landscapeSeed: input.landscapeSeed,
      layerVersions: input.layerVersions,
      worldCell: worldCell ? { x: worldCell.x, y: worldCell.y } : null,
      localCell: localCell ? { x: localCell.x, y: localCell.y } : null,
      ...(input.premiumType ? { premiumType: input.premiumType } : {}),
      createdAt: new Date(0),
    };
    this.settlements.push(settlement);
    if (settlement.premiumType) this.premiumOwners.set(settlement.id, input.ownerId);
    return settlement;
  }

  async premiumTypeCounts(): Promise<Partial<Record<PremiumType, number>>> {
    await Promise.resolve();
    const players = new Map<PremiumType, Set<string>>();
    for (const s of this.settlements) {
      const owner = this.premiumOwners.get(s.id);
      if (!s.premiumType || owner === undefined) continue;
      const set = players.get(s.premiumType) ?? new Set<string>();
      set.add(owner);
      players.set(s.premiumType, set);
    }
    return Object.fromEntries([...players].map(([type, set]) => [type, set.size]));
  }

  async lastPremiumType(playerId: string): Promise<PremiumType | null> {
    await Promise.resolve();
    // nejnovější = poslední vložené (createdAt je v paměti pro všechna stejné)
    for (let i = this.settlements.length - 1; i >= 0; i--) {
      const s = this.settlements[i]!;
      if (s.premiumType && this.premiumOwners.get(s.id) === playerId) return s.premiumType;
    }
    return null;
  }

  private localTaken(ownerId: string, cell: WorldCell): boolean {
    return this.settlements.some(
      (s) =>
        !this.archived.has(s.id) &&
        s.ownerId === ownerId &&
        s.localCell?.x === cell.x &&
        s.localCell.y === cell.y,
    );
  }

  /**
   * Umístí odříznutá sídla hráče na mapu světa (posun `shift` k místní poloze) – jako podmíněný
   * UPDATE; obsazené políčko → výjimka (unikátní index), nic se nezmění.
   */
  moveIsolated(ownerId: string, shift: WorldCell): number {
    const moving = this.settlements.filter(
      (s) => s.ownerId === ownerId && !this.archived.has(s.id) && s.localCell,
    );
    for (const s of moving) {
      const local = s.localCell;
      if (local && this.cellTaken({ x: local.x + shift.x, y: local.y + shift.y })) {
        throw new Error('settlement_grid_idx');
      }
    }
    for (const s of moving) {
      const local = s.localCell;
      if (!local) continue;
      const index = this.settlements.indexOf(s);
      this.settlements[index] = {
        ...s,
        worldCell: { x: local.x + shift.x, y: local.y + shift.y },
        localCell: null,
      };
    }
    return moving.length;
  }

  /** Testovací zkratka: sídelní sídlo hráče na políčku (0, 0) – zakládá se vždy. */
  async seatAtOrigin(input: {
    ownerId: string;
    landscapeSeed: number;
    layerVersions: LayerVersions;
    premiumType?: PremiumType | null;
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
