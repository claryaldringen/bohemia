import { villageDigest, type VillageState } from '../../src/domain/village';
import type {
  VillageDigestRecord,
  VillageRecord,
  VillageRepository,
  VillageStamp,
} from '../../src/application/villages';
import { EMPTY_INBOX } from '../../src/application/inbox';

/**
 * Jednoduchý repozitář jedné vsi v paměti pro měřicí skripty – jen to, co potřebuje
 * `updateVillage` (find, save); ostatní metody k měření nepatří.
 */
export class SingleVillageRepository implements VillageRepository {
  record: VillageRecord;
  /** Měření bez schránky – žádné vnější události. */
  readonly inbox = EMPTY_INBOX;

  constructor(settlementId: string, name: string, state: VillageState) {
    this.record = { id: 'village-1', settlementId, name, state, version: 1 };
  }

  async find(villageId: string): Promise<VillageRecord | null> {
    await Promise.resolve();
    return villageId === this.record.id ? structuredClone(this.record) : null;
  }

  async listBySettlement(settlementId: string): Promise<VillageRecord[]> {
    await Promise.resolve();
    return settlementId === this.record.settlementId ? [structuredClone(this.record)] : [];
  }

  create(): Promise<VillageRecord | null> {
    return Promise.reject(new Error('Měřicí repozitář ves nezakládá.'));
  }

  add(): Promise<VillageRecord> {
    return Promise.reject(new Error('Měřicí repozitář ves nezakládá.'));
  }

  async findByOrigin(origin: string): Promise<VillageRecord | null> {
    await Promise.resolve();
    return this.record.state.origin === origin ? structuredClone(this.record) : null;
  }

  addOnce(): Promise<VillageRecord | null> {
    return Promise.reject(new Error('Měřicí repozitář ves nezakládá.'));
  }

  async save(
    villageId: string,
    state: VillageState,
    expectedVersion: number,
  ): Promise<VillageRecord | null> {
    await Promise.resolve();
    if (villageId !== this.record.id || this.record.version !== expectedVersion) return null;
    this.record = { ...this.record, state: structuredClone(state), version: expectedVersion + 1 };
    return structuredClone(this.record);
  }

  async rename(): Promise<boolean> {
    await Promise.resolve();
    return false;
  }

  async stampsOf(settlementIds: readonly string[]): Promise<VillageStamp[]> {
    await Promise.resolve();
    if (!settlementIds.includes(this.record.settlementId)) return [];
    return this.stamp();
  }

  async stampsOfVillages(villageIds: readonly string[]): Promise<VillageStamp[]> {
    await Promise.resolve();
    return villageIds.includes(this.record.id) ? this.stamp() : [];
  }

  private stamp(): VillageStamp[] {
    const { id, settlementId, name, version, state } = this.record;
    return [
      {
        id,
        settlementId,
        name,
        version,
        lastDay: state.lastDay,
        asleep: state.extinctDay !== undefined || state.abandonedDay !== undefined,
      },
    ];
  }

  async digestsOf(villageIds: readonly string[]): Promise<VillageDigestRecord[]> {
    await Promise.resolve();
    if (!villageIds.includes(this.record.id)) return [];
    const { id, settlementId, name, version, state } = this.record;
    return [{ id, settlementId, name, version, digest: villageDigest(state) }];
  }

  /** Měření běží bez počasí kraje – ves bez `weatherSeed` má všechny roky normální. */
  async weatherSeedOf(): Promise<number | null> {
    await Promise.resolve();
    return null;
  }
}
