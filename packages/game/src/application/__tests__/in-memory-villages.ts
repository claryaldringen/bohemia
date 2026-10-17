import type { VillageState } from '../../domain/village';
import type { VillageRecord, VillageRepository } from '../villages';

/** Repozitář vsí v paměti – create a save se chovají atomicky jako databáze. */
export class InMemoryVillages implements VillageRepository {
  readonly records = new Map<string, VillageRecord>();
  saves = 0;
  /** Zavolá se před porovnáním verze – test jím simuluje souběžný zápis jiného požadavku. */
  beforeSave: ((settlementId: string) => void) | null = null;

  async find(settlementId: string): Promise<VillageRecord | null> {
    const record = this.records.get(settlementId);
    return record ? structuredClone(record) : null;
  }

  async create(
    settlementId: string,
    name: string,
    state: VillageState,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    if (this.records.has(settlementId)) return null;
    const record: VillageRecord = { settlementId, name, state: structuredClone(state), version: 1 };
    this.records.set(settlementId, record);
    return structuredClone(record);
  }

  async save(
    settlementId: string,
    state: VillageState,
    expectedVersion: number,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    this.beforeSave?.(settlementId);
    const current = this.records.get(settlementId);
    if (!current || current.version !== expectedVersion) return null;
    const record: VillageRecord = {
      ...current,
      state: structuredClone(state),
      version: current.version + 1,
    };
    this.records.set(settlementId, record);
    this.saves++;
    return structuredClone(record);
  }

  /** Přímá úprava uloženého stavu (příprava testu), zvýší verzi. */
  edit(settlementId: string, change: (state: VillageState) => void): void {
    const current = this.records.get(settlementId);
    if (!current) throw new Error(`Ves ${settlementId} neexistuje.`);
    change(current.state);
    current.version++;
  }
}
