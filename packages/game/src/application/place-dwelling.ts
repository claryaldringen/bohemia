import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  applyBuildIntent,
  type DwellingPlot,
  type BuildableDwellingType,
  type Position,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvody odmítnutí žijí v doméně (build-intent.ts) – use-case je dál exportuje pro web a testy
export { BAD_PLOT, CANNOT_AFFORD, NO_PLOT, NO_WOOD } from '../domain/village';

export interface PlaceDwellingInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  type: BuildableDwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/**
 * Hráč zahájí stavbu nového obydlí – kdykoli, když ves má dřevo předem (i bez lidí k osídlení –
 * demolition.md) (ves se nejdřív dopočítá do dneška). Pravidlo stavby je doménové `applyBuildIntent`.
 */
export function placeDwelling(
  deps: { villages: VillageRepository },
  input: PlaceDwellingInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'dwelling',
        type: input.type,
        position: input.position,
        plot: input.plot,
      }),
  );
}
