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

  async behind(worldDay: number, limit: number): Promise<PlayerBehind[]> {
    await Promise.resolve();
    const oldest = new Map<string, number>();
    for (const record of this.villages.records.values()) {
      if (isVillageAsleep(record.state)) continue;
      const settlement = this.settlements.settlements.find((s) => s.id === record.settlementId);
      if (!settlement || this.settlements.archived.has(settlement.id)) continue;
      const day = oldest.get(settlement.ownerId);
      oldest.set(settlement.ownerId, Math.min(day ?? Infinity, record.state.lastDay));
    }
    const lag = (p: PlayerBehind): number => p.today - p.oldestDay;
    return [...oldest]
      .map(([playerId, oldestDay]) => ({
        playerId,
        today: playerDay(worldDay, this.offsets.offsets.get(playerId) ?? 0),
        oldestDay,
      }))
      .filter((p) => p.oldestDay < p.today)
      .sort((a, b) => lag(b) - lag(a) || (a.playerId < b.playerId ? -1 : 1))
      .slice(0, limit);
  }
}
