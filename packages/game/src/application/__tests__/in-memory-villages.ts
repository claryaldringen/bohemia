import type { VillageState } from '../../domain/village';
import type { VillageRecord, VillageRepository, VillageStamp } from '../villages';

/**
 * Repozitář vsí v paměti – create a save se chovají atomicky jako databáze. Vsi dostávají id
 * `village-1`, `village-2`… v pořadí založení (i napříč sídly).
 */
export class InMemoryVillages implements VillageRepository {
  readonly records = new Map<string, VillageRecord>();
  saves = 0;
  /** Kolikrát se ptal levný dotaz na otisky vsí (stampsOf). */
  stampQueries = 0;
  /** Kolikrát se načítaly celé vsi i se stavem (find, listBySettlement). */
  finds = 0;
  /** Zavolá se před porovnáním verze – test jím simuluje souběžný zápis jiného požadavku. */
  beforeSave: ((villageId: string) => void) | null = null;
  /** Seed počasí kraje po sídlech – sídlo bez záznamu je bez počasí (null). */
  readonly weatherSeeds = new Map<string, number>();
  private nextId = 1;

  async weatherSeedOf(settlementId: string): Promise<number | null> {
    await Promise.resolve();
    return this.weatherSeeds.get(settlementId) ?? null;
  }

  async find(villageId: string): Promise<VillageRecord | null> {
    this.finds++;
    const record = this.records.get(villageId);
    return record ? structuredClone(record) : null;
  }

  async listBySettlement(settlementId: string): Promise<VillageRecord[]> {
    this.finds++;
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

  async findByOrigin(origin: string): Promise<VillageRecord | null> {
    await Promise.resolve();
    const record = [...this.records.values()].find((r) => r.state.origin === origin);
    return record ? structuredClone(record) : null;
  }

  /** Sídla, která úložiště zná – addOnce do jiného vrátí null (prázdné = všechna). */
  readonly knownSettlements = new Set<string>();

  async addOnce(
    settlementId: string,
    name: string,
    state: VillageState,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    if (this.knownSettlements.size > 0 && !this.knownSettlements.has(settlementId)) return null;
    // kontrola a zápis bez dalšího await – atomicky jako zámek řádku sídla v databázi
    const existing = [...this.records.values()].find((r) => r.state.origin === state.origin);
    if (existing) return structuredClone(existing);
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

  async stampsOf(settlementIds: readonly string[]): Promise<VillageStamp[]> {
    await Promise.resolve();
    this.stampQueries++;
    return [...this.records.values()]
      .filter((r) => settlementIds.includes(r.settlementId))
      .map((r) => ({
        id: r.id,
        settlementId: r.settlementId,
        name: r.name,
        version: r.version,
        lastDay: r.state.lastDay,
        asleep: r.state.extinctDay !== undefined || r.state.abandonedDay !== undefined,
      }));
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
