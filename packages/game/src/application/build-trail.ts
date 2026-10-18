import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  DIRECTIONS,
  planTrail,
  startTrail,
  villageRoadWalk,
  type Direction8,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface BuildTrailInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  direction: Direction8;
}

/** Neznámý směr stezky. */
export const UNKNOWN_DIRECTION = 'Neznámý směr stezky.';

/**
 * Hráč zadá ve dvorci stavbu zemské stezky ke kraji mapy (trade.md – Zemská stezka; ves se
 * nejdřív dopočítá do dneška). Server stezku naplánuje znovu (`planTrail` – trasa, úseky, dřevo
 * hatě a lávek) a vrátí důvod česky, když nejde; dřevo kácí chůzí po pevných cestách.
 */
export function buildTrail(
  deps: { villages: VillageRepository },
  input: BuildTrailInput,
): Promise<VillageResult> {
  if (!DIRECTIONS.includes(input.direction)) {
    return Promise.resolve({ ok: false, reason: UNKNOWN_DIRECTION });
  }
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const walk = villageRoadWalk(state, input.landscape);
      const plan = planTrail(state, input.direction, day, input.landscape, obstacles, walk);
      if (!plan.ok) return { ok: false, reason: plan.reason };
      return {
        ok: true,
        state: startTrail(state, day, input.direction, input.landscape, obstacles, walk),
      };
    },
  );
}
