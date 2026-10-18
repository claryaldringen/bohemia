import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  type Landscape,
} from '../domain/landscape';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';

export interface EnterGameDeps {
  settlements: SettlementRepository;
  seeds: SeedSource;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
}

export interface EnterGameResult {
  settlement: Settlement;
  landscape: Landscape;
}

/** Vstup hráče do hry: najde jeho sídelní sídlo, nebo ho založí, a vrátí sídlo s krajinou. */
export async function enterGame(deps: EnterGameDeps, playerId: string): Promise<EnterGameResult> {
  const existing = await deps.settlements.findSeat(playerId);
  const landscapeOf = (settlement: Settlement): Landscape =>
    settlementLandscape(settlement, deps.landscapes);
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
const GENERATED: LandscapeSource = { landscapeOf: generateLandscapeAttempt };

/** Krajina uloženého sídla – z mezipaměti vstupního bodu, nebo vygenerovaná ze seedu. */
export function settlementLandscape(
  settlement: Settlement,
  landscapes?: LandscapeSource,
): Landscape {
  return (landscapes ?? GENERATED).landscapeOf(settlement.landscapeSeed, settlement.layerVersions);
}
