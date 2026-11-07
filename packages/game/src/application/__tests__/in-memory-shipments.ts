import type { ShipmentRecord, ShipmentRepository } from '../shipments';

/** Zásilky v paměti – jedinečný `refId` jako v databázi. */
export class InMemoryShipments implements ShipmentRepository {
  readonly rows: ShipmentRecord[] = [];
  private nextId = 1;

  async reserve(
    input: Omit<ShipmentRecord, 'id' | 'postedAt' | 'settledAt'>,
  ): Promise<{ record: ShipmentRecord; created: boolean }> {
    await Promise.resolve();
    const found = this.rows.find((r) => r.refId === input.refId);
    if (found) return { record: structuredClone(found), created: false };
    const record: ShipmentRecord = {
      ...structuredClone(input),
      id: `ship-${this.nextId++}`,
      postedAt: null,
      settledAt: null,
    };
    this.rows.push(record);
    return { record: structuredClone(record), created: true };
  }

  async findByRef(refId: string): Promise<ShipmentRecord | null> {
    await Promise.resolve();
    const found = this.rows.find((r) => r.refId === refId);
    return found ? structuredClone(found) : null;
  }

  async unposted(): Promise<ShipmentRecord[]> {
    await Promise.resolve();
    return structuredClone(this.rows.filter((r) => r.postedAt === null));
  }

  async open(): Promise<ShipmentRecord[]> {
    await Promise.resolve();
    return structuredClone(this.rows.filter((r) => r.postedAt !== null && r.settledAt === null));
  }

  async onTheWay(toVillageId: string): Promise<ShipmentRecord[]> {
    return (await this.open()).filter((r) => r.toVillageId === toVillageId);
  }

  async markPosted(id: string, at: Date): Promise<void> {
    await Promise.resolve();
    const row = this.rows.find((r) => r.id === id);
    if (row && row.postedAt === null) row.postedAt = at;
  }

  async settle(id: string, at: Date): Promise<void> {
    await Promise.resolve();
    const row = this.rows.find((r) => r.id === id);
    if (row && row.settledAt === null) row.settledAt = at;
  }

  async remove(id: string): Promise<void> {
    await Promise.resolve();
    const i = this.rows.findIndex((r) => r.id === id && r.postedAt === null);
    if (i >= 0) this.rows.splice(i, 1);
  }
}
