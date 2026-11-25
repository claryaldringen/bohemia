import { trailStops } from '../../domain/world';
import type { VillageRepository } from '../villages';
import type { InMemorySettlements } from './in-memory-settlements';

/**
 * Zastávky kupců z uloženého výřezu sídla jako úložiště v DB (`merchantStopsOf` ve
 * `village-repository.ts`): mapa bez stezky ve výřezu a odříznuté sídlo nic, neznámé sídlo null.
 */
export function merchantStopsFromSkeleton(
  settlements: InMemorySettlements,
  worldSeed: number,
): NonNullable<VillageRepository['merchantStopsOf']> {
  return async (settlementId) => {
    await Promise.resolve();
    const settlement = settlements.settlements.find((s) => s.id === settlementId);
    if (!settlement) return null;
    const trails = settlement.skeleton?.trails ?? [];
    if (settlement.worldCell === null || trails.length === 0) return [];
    return trailStops(worldSeed, settlement.worldCell);
  };
}
