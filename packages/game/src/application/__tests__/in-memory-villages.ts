import {
  villageDigest,
  type MerchantStop,
  type VillageState,
  type VillageYearRow,
} from '../../domain/village';
import type {
  VillageDigestRecord,
  VillageRecord,
  VillageRepository,
  VillageStamp,
} from '../villages';
import { InMemoryVillageInbox } from './in-memory-inbox';
import type { VillageHolds } from '../village-holds';
import { nearbyRefresh, type NearbyDeps, type NearbyRefresh } from '../nearby';

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
  /** Kolikrát se ptal dotaz na souhrny vsí (digestsOf). */
  digestQueries = 0;
  /** Vsi bez souhrnu (uložené před ním) – `digestsOf` je vynechá. */
  readonly withoutDigest = new Set<string>();
  /** Vsi se souhrnem uloženým před `openTrips` (25. 11. 2026) – `digestsOf` je vydá bez něj. */
  readonly withoutOpenTrips = new Set<string>();
  /** Zavolá se před porovnáním verze – test jím simuluje souběžný zápis jiného požadavku. */
  beforeSave: ((villageId: string) => void) | null = null;
  /** Seed počasí kraje po sídlech – sídlo bez záznamu je bez počasí (null). */
  readonly weatherSeeds = new Map<string, number>();
  /** Deník vsí: řádky podle vsi a roku. */
  readonly yearLog = new Map<string, Map<number, VillageYearRow>>();
  /** Schránka vsí – zápis zvedá verzi vsi tady (in-memory-inbox.ts). */
  readonly inbox: InMemoryVillageInbox = new InMemoryVillageInbox(this);
  /**
   * Meze bariéry ves × tažení (village-holds.ts) – test je nastaví v `holdLimits` a bariéru zapne
   * `withHolds()`. Bez ní `holds` chybí jako v kalibraci: dopočet se na mez neptá (souběžné testy
   * mají stejné prokládání jako dřív).
   */
  readonly holdLimits = new Map<string, number>();
  holds?: VillageHolds;
  /**
   * Sídla v archivu (Začít znovu) – `archivedOf` podle nich; test je doplní, nebo sem dá množinu
   * `InMemorySettlements.archived`.
   */
  archivedSettlements: Set<string> = new Set();

  async archivedOf(villageIds: readonly string[]): Promise<string[]> {
    await Promise.resolve();
    return villageIds.filter((id) => {
      const record = this.records.get(id);
      return record !== undefined && this.archivedSettlements.has(record.settlementId);
    });
  }

  withHolds(): this {
    this.holds = {
      limitOf: async (ids) => {
        await Promise.resolve();
        const limits = new Map<string, number>();
        for (const id of ids) {
          const limit = this.holdLimits.get(id);
          if (limit !== undefined) limits.set(id, limit);
        }
        return limits;
      },
    };
    return this;
  }

  /**
   * Okolí vsi v pevné dny (nearby.ts) – zapne ho `withNearby(sídla)` jako úložiště v DB. Bez něj
   * `nearby` chybí jako v kalibraci: dopočet okolí nezapisuje (testy jádra simulují jako dřív).
   */
  nearby?: NearbyRefresh;

  withNearby(settlements: NearbyDeps['settlements']): this {
    this.nearby = nearbyRefresh({ villages: this, settlements });
    return this;
  }

  /**
   * Zastávky stezek mapy (`VillageRepository.merchantStopsOf`) – test je dá jako úložiště v DB. Bez
   * nich port chybí jako v kalibraci: dopočet je nezjišťuje (testy jádra simulují jako dřív).
   */
  merchantStopsOf?: (settlementId: string) => Promise<readonly MerchantStop[] | null>;
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

  /**
   * Ves sídla pro testy (mimo port) – jako `create`, ale vrátí ji rovnou; sídlo, které už ves má,
   * je chyba testu (jedna ves, jedna mapa).
   */
  async add(settlementId: string, name: string, state: VillageState): Promise<VillageRecord> {
    const created = await this.create(settlementId, name, state);
    if (!created) throw new Error(`Sídlo ${settlementId} už ves má – jedna ves, jedna mapa.`);
    return created;
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
    // jedna ves, jedna mapa – sídlo s jinou vsí nic nezaloží
    if ([...this.records.values()].some((r) => r.settlementId === settlementId)) return null;
    return this.insert(settlementId, name, state);
  }

  async save(
    villageId: string,
    state: VillageState,
    expectedVersion: number,
    yearRows: readonly VillageYearRow[] = [],
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
    const log = this.yearLog.get(villageId) ?? new Map<number, VillageYearRow>();
    for (const row of yearRows) log.set(row.year, structuredClone(row));
    this.yearLog.set(villageId, log);
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
      .map(stampOf);
  }

  async stampsOfVillages(villageIds: readonly string[]): Promise<VillageStamp[]> {
    await Promise.resolve();
    this.stampQueries++;
    return [...this.records.values()].filter((r) => villageIds.includes(r.id)).map(stampOf);
  }

  async digestsOf(villageIds: readonly string[]): Promise<VillageDigestRecord[]> {
    await Promise.resolve();
    this.digestQueries++;
    return villageIds.flatMap((id) => {
      const r = this.records.get(id);
      if (!r || this.withoutDigest.has(id)) return [];
      // souhrn se v úložišti odvozuje ze stavu uložené verze – tady z téhož stavu
      const { settlementId, name, version, state } = r;
      const digest = villageDigest(structuredClone(state));
      if (this.withoutOpenTrips.has(id)) delete digest.openTrips;
      return [{ id, settlementId, name, version, digest }];
    });
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

/** Otisk vsi bez stavu – jako sloupce `last_day` a `asleep` v databázi. */
function stampOf(r: VillageRecord): VillageStamp {
  return {
    id: r.id,
    settlementId: r.settlementId,
    name: r.name,
    version: r.version,
    lastDay: r.state.lastDay,
    asleep: r.state.extinctDay !== undefined || r.state.abandonedDay !== undefined,
  };
}
