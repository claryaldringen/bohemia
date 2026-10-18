import type { TimeOffsetRepository } from '../player-time';

/** Posun času hráčů v paměti – `extend` se chová atomicky jako podmíněný UPSERT v databázi. */
export class InMemoryTimeOffsets implements TimeOffsetRepository {
  readonly offsets = new Map<string, number>();

  async offsetOf(playerId: string): Promise<number> {
    return this.offsets.get(playerId) ?? 0;
  }

  async extend(playerId: string, days: number, maxOffset: number): Promise<number> {
    await Promise.resolve();
    const current = this.offsets.get(playerId) ?? 0;
    const next = Math.max(current, Math.min(current + days, maxOffset));
    this.offsets.set(playerId, next);
    return next;
  }
}
