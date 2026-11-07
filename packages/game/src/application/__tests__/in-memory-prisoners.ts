import type { PrisonerRecord, PrisonerRepository } from '../prisoners';

/** Rozhodnutí o zajatcích v paměti – klíč zajetí je jedinečný jako primární klíč v DB. */
export class InMemoryPrisoners implements PrisonerRepository {
  readonly records = new Map<string, PrisonerRecord>();

  claim(record: PrisonerRecord): Promise<boolean> {
    if (this.records.has(record.id)) return Promise.resolve(false);
    this.records.set(record.id, structuredClone(record));
    return Promise.resolve(true);
  }

  find(id: string): Promise<PrisonerRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null);
  }
}
