import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  applyBuildIntent,
  DIRECTIONS,
  UNKNOWN_DIRECTION,
  type Direction8,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvod odmítnutí žije v doméně (build-intent.ts) – use-case ho dál exportuje pro web a testy
export { UNKNOWN_DIRECTION } from '../domain/village';

export interface BuildTrailInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  direction: Direction8;
}

/**
 * Hráč zadá ve dvorci stavbu zemské stezky ke kraji mapy (trade.md – Zemská stezka; ves se
 * nejdřív dopočítá do dneška). Server stezku naplánuje znovu (`planTrail` – trasa, úseky, dřevo
 * hatě a lávek) a vrátí důvod česky, když nejde; dřevo kácí chůzí po pevných cestách.
 */
export function buildTrail(
  deps: { villages: VillageRepository },
  input: BuildTrailInput,
): Promise<VillageResult> {
  // neznámý směr odmítne hned, bez načtení vsi
  if (!DIRECTIONS.includes(input.direction)) {
    return Promise.resolve({ ok: false, reason: UNKNOWN_DIRECTION });
  }
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'trail',
        direction: input.direction,
      }),
  );
}
