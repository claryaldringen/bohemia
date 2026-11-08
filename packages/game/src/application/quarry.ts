import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, orderQuarrying, type Position } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Lom a lámání kamene (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026).

export interface PlaceQuarryInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Bod na skalním výchozu a natočení značky lomu. */
  position: Position;
}

/**
 * Hráč zahájí stavbu lomu na skalním výchozu (ves se nejdřív dopočítá do dneška) – server místo
 * ověří znovu (`checkQuarryPlacement`); práce jde ze společné práce vsi, dřevo lom nechce.
 */
export function placeQuarry(
  deps: { villages: VillageRepository },
  input: PlaceQuarryInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'quarry',
        position: input.position,
      }),
  );
}

export interface OrderQuarryingInput {
  villageId: string;
  landscape: Landscape;
  today: number;
  /** Lom (id skalního výchozu). */
  outcropId: number;
  /** Kolik m³ kamene nalámat do zásoby (celé m³). */
  m3: number;
}

/**
 * Hráč zadá v lomu „nalámat do zásoby“ (pro obchod a dávky) – práce jde ze společné práce vsi
 * jako stavba, kámen pak leží na hromadě u cesty u dvorce.
 */
export function orderStoneQuarrying(
  deps: { villages: VillageRepository },
  input: OrderQuarryingInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => orderQuarrying(state, state.lastDay, input.outcropId, input.m3),
  );
}
