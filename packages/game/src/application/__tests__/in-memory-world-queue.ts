import { isVillageAsleep } from '../../domain/village';
import { playerDay } from '../player-time';
import type { PlayerBehind, WorldQueue } from '../world-queue';
import type { InMemorySettlements } from './in-memory-settlements';
import type { InMemoryTimeOffsets } from './in-memory-time-offsets';
import type { InMemoryVillages } from './in-memory-villages';

/** Fronta workeru v paměti nad repozitáři v paměti – stejné pořadí jako dotaz v databázi. */
export class InMemoryWorldQueue implements WorldQueue {
  constructor(
    private readonly settlements: InMemorySettlements,
    private readonly villages: InMemoryVillages,
    private readonly offsets: InMemoryTimeOffsets,
  ) {}

  /** Vsi s tažením u nich (`priorityVillages`) – test je nastaví. */
  priority: string[] = [];

  async behind(
    worldDay: number,
    limit: number,
    holds: ReadonlyMap<string, number> = new Map(),
  ): Promise<PlayerBehind[]> {
    await Promise.resolve();
    const oldest = new Map<string, number>();
    const first = new Set<string>();
    for (const record of this.villages.records.values()) {
      if (isVillageAsleep(record.state)) continue;
      const settlement = this.settlements.settlements.find((s) => s.id === record.settlementId);
      if (!settlement || this.settlements.archived.has(settlement.id)) continue;
      const today = playerDay(worldDay, this.offsets.offsets.get(settlement.ownerId) ?? 0);
      const hold = holds.get(record.id);
      // ves na mezi bariéry není pozadu; hráč s přednostní vsí pod mezí jde první
      if (record.state.lastDay >= Math.min(today, hold ?? today)) continue;
      if (hold !== undefined) first.add(settlement.ownerId);
      const day = oldest.get(settlement.ownerId);
      oldest.set(settlement.ownerId, Math.min(day ?? Infinity, record.state.lastDay));
    }
    const lag = (p: PlayerBehind): number => p.today - p.oldestDay;
    const rank = (p: PlayerBehind): number => (first.has(p.playerId) ? 0 : 1);
    return [...oldest]
      .map(([playerId, oldestDay]) => ({
        playerId,
        today: playerDay(worldDay, this.offsets.offsets.get(playerId) ?? 0),
        oldestDay,
      }))
      .filter((p) => p.oldestDay < p.today)
      .sort((a, b) => rank(a) - rank(b) || lag(b) - lag(a) || (a.playerId < b.playerId ? -1 : 1))
      .slice(0, limit);
  }

  async priorityVillages(): Promise<string[]> {
    await Promise.resolve();
    return [...this.priority];
  }
}
