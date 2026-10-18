import type { VillageState } from '../../domain/village';
import type { VillageRecord, VillageRepository } from '../villages';

/**
 * Repozitář vsí v paměti – create a save se chovají atomicky jako databáze. Vsi dostávají id
 * `village-1`, `village-2`… v pořadí založení (i napříč sídly).
 */
export class InMemoryVillages implements VillageRepository {
  readonly records = new Map<string, VillageRecord>();
  saves = 0;
  /** Zavolá se před porovnáním verze – test jím simuluje souběžný zápis jiného požadavku. */
  beforeSave: ((villageId: string) => void) | null = null;
  private nextId = 1;

  async find(villageId: string): Promise<VillageRecord | null> {
    const record = this.records.get(villageId);
    return record ? structuredClone(record) : null;
  }

  async listBySettlement(settlementId: string): Promise<VillageRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.settlementId === settlementId)
      .map((r) => structuredClone(r));
  }

  async create(
    settlementId: string,
    name: string,
    state: VillageState,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    // Kontrola a zápis bez dalšího await – atomicky jako zámek řádku sídla v databázi.
    if ([...this.records.values()].some((r) => r.settlementId === settlementId)) return null;
    return this.insert(settlementId, name, state);
  }

  async add(settlementId: string, name: string, state: VillageState): Promise<VillageRecord> {
    await Promise.resolve();
    return this.insert(settlementId, name, state);
  }

  async save(
    villageId: string,
    state: VillageState,
    expectedVersion: number,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    this.beforeSave?.(villageId);
    const current = this.records.get(villageId);
    if (!current || current.version !== expectedVersion) return null;
    const record: VillageRecord = {
      ...current,
      state: structuredClone(state),
      version: current.version + 1,
    };
    this.records.set(villageId, record);
    this.saves++;
    return structuredClone(record);
  }

  async rename(villageId: string, name: string): Promise<boolean> {
    await Promise.resolve();
    const current = this.records.get(villageId);
    if (!current) return false;
    current.name = name;
    return true;
  }

  /** Přímá úprava uloženého stavu (příprava testu), zvýší verzi. */
  edit(villageId: string, change: (state: VillageState) => void): void {
    const current = this.records.get(villageId);
    if (!current) throw new Error(`Ves ${villageId} neexistuje.`);
    change(current.state);
    current.version++;
  }

  private insert(settlementId: string, name: string, state: VillageState): VillageRecord {
    const record: VillageRecord = {
      id: `village-${this.nextId++}`,
      settlementId,
      name,
      state: structuredClone(state),
      version: 1,
    };
    this.records.set(record.id, record);
    return structuredClone(record);
  }
}
