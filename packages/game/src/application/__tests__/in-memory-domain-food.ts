import type { DomainFoodRepository, DomainFoodRound } from '../domain-food';

/** Kola jídla domény v paměti – řádek (ves, rok) jedinečný jako v databázi. */
export class InMemoryDomainFood implements DomainFoodRepository {
  readonly rows: DomainFoodRound[] = [];

  async decided(villageIds: readonly string[], year: number): Promise<Set<string>> {
    await Promise.resolve();
    const ids = new Set(villageIds);
    return new Set(
      this.rows.filter((r) => r.year === year && ids.has(r.villageId)).map((r) => r.villageId),
    );
  }

  async reserve(round: Omit<DomainFoodRound, 'finishedAt'>): Promise<DomainFoodRound> {
    await Promise.resolve();
    const found = this.rows.find((r) => r.villageId === round.villageId && r.year === round.year);
    if (found) return structuredClone(found);
    const row: DomainFoodRound = { ...structuredClone(round), finishedAt: null };
    this.rows.push(row);
    return structuredClone(row);
  }

  async unfinished(): Promise<DomainFoodRound[]> {
    await Promise.resolve();
    // nejstarší napřed: den, pak pořadí zápisu (stabilní řazení)
    return structuredClone(
      this.rows.filter((r) => r.finishedAt === null).sort((a, b) => a.day - b.day),
    );
  }

  async finish(villageId: string, year: number): Promise<void> {
    await Promise.resolve();
    const row = this.rows.find((r) => r.villageId === villageId && r.year === year);
    if (row && row.finishedAt === null) row.finishedAt = new Date(0);
  }
}
