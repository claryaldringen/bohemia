import { CURRENT_LAYER_VERSIONS, generateLandscape, type Landscape } from '../domain/landscape';
import type { SeedSource, Settlement, SettlementRepository } from './settlements';

export interface EnterGameDeps {
  settlements: SettlementRepository;
  seeds: SeedSource;
}

export interface EnterGameResult {
  settlement: Settlement;
  landscape: Landscape;
}

/** Vstup hráče do hry: najde jeho sídelní sídlo, nebo ho založí, a vrátí sídlo s krajinou. */
export async function enterGame(deps: EnterGameDeps, playerId: string): Promise<EnterGameResult> {
  const settlement =
    (await deps.settlements.findSeat(playerId)) ??
    (await deps.settlements.createSeat({
      ownerId: playerId,
      landscapeSeed: deps.seeds.nextSeed(),
      layerVersions: CURRENT_LAYER_VERSIONS,
    }));
  // Krajina vždy ze seedu uloženého u sídla – při souběhu mohl vyhrát jiný požadavek.
  const landscape = generateLandscape(settlement.landscapeSeed, settlement.layerVersions);
  return { settlement, landscape };
}
