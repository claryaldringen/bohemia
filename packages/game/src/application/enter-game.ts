import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  type Landscape,
} from '../domain/landscape';
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
  const existing = await deps.settlements.findSeat(playerId);
  if (existing) return { settlement: existing, landscape: landscapeOf(existing) };

  const accepted = generateAcceptedLandscape(deps.seeds.nextSeed());
  const settlement = await deps.settlements.createSeat({
    ownerId: playerId,
    landscapeSeed: accepted.seed,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  // Při souběhu mohl sídlo založit jiný požadavek s jiným seedem – platí uložené.
  const landscape =
    settlement.landscapeSeed === accepted.seed ? accepted.landscape : landscapeOf(settlement);
  return { settlement, landscape };
}

/** Uložené sídlo má seed přijatého pokusu – krajina se generuje přesně z něj, bez pásma. */
function landscapeOf(settlement: Settlement): Landscape {
  return generateLandscapeAttempt(settlement.landscapeSeed, settlement.layerVersions);
}
