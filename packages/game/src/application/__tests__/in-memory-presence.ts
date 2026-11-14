import type { PresenceRepository } from '../presence';

/** Přítomnost hráčů v paměti (ms) – starší zápis nepřepíše novější; `asks` = dotazy `lastSeen`. */
export class InMemoryPresence implements PresenceRepository {
  readonly seen = new Map<string, number>();
  readonly asks: string[][] = [];

  note(playerId: string, at: Date): Promise<void> {
    const known = this.seen.get(playerId);
    if (known === undefined || known < at.getTime()) this.seen.set(playerId, at.getTime());
    return Promise.resolve();
  }

  lastSeen(playerIds: readonly string[]): Promise<Map<string, number>> {
    this.asks.push([...playerIds]);
    const found = new Map<string, number>();
    for (const id of playerIds) {
      const ms = this.seen.get(id);
      if (ms !== undefined) found.set(id, ms);
    }
    return Promise.resolve(found);
  }
}
