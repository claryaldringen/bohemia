import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  buildAffordability,
  checkSacredBuildingPlacement,
  hasShrine,
  placementVillageOf,
  startSacredBuilding,
  type Position,
  type SacredBuildingKind,
} from '../domain/village';
import { CANNOT_AFFORD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceSacredBuildingInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  kind: SacredBuildingKind;
  position: Position;
}

/** Na modlu nebo svatyni chybí dospělý dub ke kácení (happiness.md). */
export const NO_OAKS = 'Na stavbu chybí dospělé duby ke kácení.';
/** Svatyně je jedna na ves (happiness.md). */
export const SHRINE_EXISTS = 'Ves už svatyni má – svatyně je jedna na ves.';

/**
 * Hráč zahájí stavbu dřevěné modly nebo svatyně (happiness.md; ves se nejdřív dopočítá do
 * dneška). Server umístění ověří znovu; stavba vyhradí nejbližší dospělé duby a skácí je jako
 * první část práce, překážky na půdorysu osadníci odstraní hned.
 */
export function placeSacredBuilding(
  deps: { villages: VillageRepository },
  input: PlaceSacredBuildingInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      const day = state.lastDay;
      if (input.kind === 'shrine' && hasShrine(state)) return { ok: false, reason: SHRINE_EXISTS };
      const obstacles = obstaclesOf(input.landscape);
      const { affordable, missing } = buildAffordability(state, input.kind, obstacles);
      if (!affordable) return { ok: false, reason: missing.oaks ? NO_OAKS : CANNOT_AFFORD };
      const check = checkSacredBuildingPlacement(
        input.landscape,
        placementVillageOf(state, day),
        input.kind,
        input.position,
        obstacles,
      );
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem stavba nepatří.' };
      try {
        return {
          ok: true,
          state: startSacredBuilding(
            state,
            day,
            input.kind,
            { ...input.position },
            check.obstacleCost,
            check.obstacleIds,
            { obstacles, clearedTrees: check.clearedTrees },
          ),
        };
      } catch (error) {
        // duby nestačí ke kácení (vyhradila je mezitím jiná stavba)
        if (error instanceof RangeError) return { ok: false, reason: NO_OAKS };
        throw error;
      }
    },
  );
}
