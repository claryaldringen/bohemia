import type { Settlement, SettlementRepository } from '../settlements';
import type { LayerVersions } from '../../domain/landscape';

/** Repozitář sídel v paměti – createSeat se chová atomicky jako databáze (unikátní index). */
export class InMemorySettlements implements SettlementRepository {
  readonly settlements: Settlement[] = [];
  private nextId = 1;

  async findSeat(ownerId: string): Promise<Settlement | null> {
    return this.settlements.find((s) => s.ownerId === ownerId && s.isSeat) ?? null;
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
