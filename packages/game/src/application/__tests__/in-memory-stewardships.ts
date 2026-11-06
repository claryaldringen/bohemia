import type { NewStewardship, Stewardship, StewardshipRepository } from '../stewardships';

/** Repozitář správ v paměti (sdílený s `InMemoryNegotiations`, jako tabulka v databázi). */
export class InMemoryStewardships implements StewardshipRepository {
  readonly all: (Stewardship & { endedAt: Date | null; endReason: string | null })[] = [];
  private nextId = 1;

  async of(villageId: string): Promise<Stewardship | null> {
    return this.all.find((s) => s.villageId === villageId && s.endedAt === null) ?? null;
  }

  async start(input: NewStewardship): Promise<Stewardship | null> {
    if (await this.of(input.villageId)) return null;
    const { since, ...rest } = input;
    const row = { ...rest, since, id: `stew-${this.nextId++}`, endedAt: null, endReason: null };
    this.all.push(row);
    return row;
  }

  async listByStewardHouse(houseId: string): Promise<Stewardship[]> {
    return this.all.filter((s) => s.stewardHouseId === houseId && s.endedAt === null);
  }

  async listByHolderHouse(houseId: string): Promise<Stewardship[]> {
    return this.all.filter((s) => s.holderHouseId === houseId && s.endedAt === null);
  }

  async end(villageId: string, reason: string, at: Date = new Date()): Promise<boolean> {
    const row = this.all.find((s) => s.villageId === villageId && s.endedAt === null);
    if (!row) return false;
    row.endedAt = at;
    row.endReason = reason;
    return true;
  }

  async endByVassalage(
    vassalageId: string,
    reason: string,
    at: Date = new Date(),
  ): Promise<string[]> {
    const ended: string[] = [];
    for (const row of this.all) {
      if (row.vassalageId !== vassalageId || row.endedAt !== null) continue;
      row.endedAt = at;
      row.endReason = reason;
      ended.push(row.villageId);
    }
    return ended;
  }
}
