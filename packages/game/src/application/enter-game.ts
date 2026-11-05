import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  type Landscape,
} from '../domain/landscape';
import { cellLandscapeSeed, placeNewPlayer } from '../domain/world';
import type { HouseRepository } from './houses';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';

export interface EnterGameDeps {
  settlements: SettlementRepository;
  houses: HouseRepository;
  /** Skutečný čas – den založení rodu (doména čas nezná, přichází zvenku). */
  now: () => Date;
  /** Seed světa – krajina každého políčka mřížky se z něj odvozuje (`cellLandscapeSeed`). */
  worldSeed: number;
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
  if (existing) {
    await ensureHouse(deps, playerId);
    return { settlement: existing, landscape: landscapeOf(existing) };
  }

  // Nováček dostane nejbližší volné políčko společné mřížky; souběh dvou nováčků na témže
  // políčku rozhodne unikátní index – poražený zkusí znovu s čerstvou mapou obsazení.
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const cell = placeNewPlayer(await deps.settlements.occupiedCells(), { kind: 'independent' });
    const accepted = generateAcceptedLandscape(cellLandscapeSeed(deps.worldSeed, cell));
    const settlement = await deps.settlements.createSeat({
      ownerId: playerId,
      landscapeSeed: accepted.seed,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: cell,
    });
    if (!settlement) continue;
    await ensureHouse(deps, playerId);
    // Při souběhu mohl sídlo založit jiný požadavek téhož hráče – platí uložené.
    const landscape =
      settlement.landscapeSeed === accepted.seed ? accepted.landscape : landscapeOf(settlement);
    return { settlement, landscape };
  }
  throw new Error(`Hráči ${playerId} se nepodařilo najít volné místo ve světě.`);
}

/** Hráč má vždy živý rod – chybějící (nový hráč, po restartu) se založí; souběh dá jeden. */
async function ensureHouse(deps: EnterGameDeps, playerId: string): Promise<void> {
  if (await deps.houses.activeOf(playerId)) return;
  await deps.houses.create({ playerId, kind: 'player', createdAt: deps.now() });
}

/** Kolikrát se nováček pokusí o místo, než se vzdá (souběh s jinými nováčky). */
const PLACEMENT_ATTEMPTS = 5;

/** Uložené sídlo má seed přijatého pokusu – krajina se generuje přesně z něj, bez pásma. */
const GENERATED: LandscapeSource = { landscapeOf: generateLandscapeAttempt };

/** Krajina uloženého sídla – z mezipaměti vstupního bodu, nebo vygenerovaná ze seedu. */
export function settlementLandscape(
  settlement: Settlement,
  landscapes?: LandscapeSource,
): Landscape {
  return (landscapes ?? GENERATED).landscapeOf(settlement.landscapeSeed, settlement.layerVersions);
}
