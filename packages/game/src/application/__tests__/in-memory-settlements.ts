import type { Settlement, SettlementRepository } from '../settlements';
import type { LayerVersions } from '../../domain/landscape';

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
  }): Promise<Settlement> {
    // Mezera mezi „přečtu“ a „zapíšu“ jako u skutečné databáze – souběžné volání ji odhalí.
    await Promise.resolve();
    // Kontrola a zápis bez dalšího await – atomicky jako unikátní index v databázi.
    const existing = this.settlements.find((s) => s.ownerId === input.ownerId && s.isSeat);
    if (existing) return existing;
    const settlement: Settlement = {
      id: `settlement-${this.nextId++}`,
      isSeat: true,
      createdAt: new Date(0),
      ...input,
    };
    this.settlements.push(settlement);
    return settlement;
  }
}
