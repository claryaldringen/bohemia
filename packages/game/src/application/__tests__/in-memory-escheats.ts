import type { Escheat, EscheatRepository, NewEscheat } from '../escheat';

/** Repozitář odúmrtí v paměti – jedna odúmrť na rod, `update` podmíněný verzí jako databáze. */
export class InMemoryEscheats implements EscheatRepository {
  readonly rows: Escheat[] = [];
  private nextId = 1;

  async create(input: NewEscheat): Promise<Escheat> {
    await Promise.resolve();
    const existing = this.rows.find((e) => e.deadHouseId === input.deadHouseId);
    if (existing) return structuredClone(existing);
    const row: Escheat = {
      id: `escheat-${this.nextId++}`,
      ...structuredClone(input),
      status: 'open',
      plan: null,
      consents: [],
      version: 0,
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async byId(id: string): Promise<Escheat | null> {
    await Promise.resolve();
    const row = this.rows.find((e) => e.id === id);
    return row ? structuredClone(row) : null;
  }

  async openOfLord(lordHouseId: string): Promise<Escheat[]> {
    await Promise.resolve();
    return this.rows
      .filter((e) => e.status === 'open' && e.lordHouseIds.includes(lordHouseId))
      .map((e) => structuredClone(e));
  }

  async update(
    id: string,
    patch: Pick<Escheat, 'plan' | 'consents' | 'status'>,
    expectedVersion: number,
  ): Promise<Escheat | null> {
    await Promise.resolve();
    const row = this.rows.find((e) => e.id === id);
    if (!row || row.version !== expectedVersion) return null;
    Object.assign(row, structuredClone(patch), { version: row.version + 1 });
    return structuredClone(row);
  }
}
