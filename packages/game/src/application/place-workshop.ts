import { obstaclesOf, tileOfWorldPoint, type Landscape } from '../domain/landscape';
import {
  villageRoadWalk,
  CRAFTS,
  buildAffordability,
  checkWorkshopPlacement,
  forestEdgeDistanceM,
  placementVillageOf,
  startWorkshop,
  waterDistanceM,
  type Craft,
  type Position,
} from '../domain/village';
import { CANNOT_AFFORD, NO_SETTLERS, NO_WOOD } from './place-dwelling';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface PlaceWorkshopInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  craft: Craft;
  /** Volná poloha dílny jako u zemnice (u uhlíře milíř kus od ní – MILIR). */
  position: Position;
}

/** Neznámé řemeslo (vstup z klienta). */
export const UNKNOWN_CRAFT = 'Takové řemeslo ves nezná.';

/**
 * Hráč zahájí stavbu řemeslné dílny (crafts.md – Budovy) – jako nové obydlí: ves musí mít dřevo
 * a mladý pár, který se do dílny nastěhuje; místo ověří `checkWorkshopPlacement` (i milíř
 * uhlíře). Vzdálenost k lesu (palivo) a k potoku (ruda, hlína) se změří z krajiny.
 */
export function placeWorkshop(
  deps: { villages: VillageRepository },
  input: PlaceWorkshopInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.settlementId,
    input.today,
    input.landscape,
    (state) => {
      if (!CRAFTS.includes(input.craft)) return { ok: false, reason: UNKNOWN_CRAFT };
      // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const { affordable, missing } = buildAffordability(state, input.craft, obstacles);
      if (!affordable) {
        const reason = missing.settlers ? NO_SETTLERS : missing.wood ? NO_WOOD : CANNOT_AFFORD;
        return { ok: false, reason };
      }
      const village = placementVillageOf(state, day);
      const position = { ...input.position };
      const check = checkWorkshopPlacement(
        input.landscape,
        village,
        input.craft,
        position,
        obstacles,
      );
      if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem dílna nepatří.' };
      const tile = tileOfWorldPoint(input.landscape, position.x, position.z);
      return {
        ok: true,
        state: startWorkshop(
          state,
          day,
          input.craft,
          position,
          check.obstacleCost,
          check.obstacleIds,
          {
            obstacles,
            clearedTrees: check.obstacleCounts.tree ?? 0,
            forestDistanceM: forestEdgeDistanceM(input.landscape, position.x, position.z),
            ...(tile ? { waterDistanceM: waterDistanceM(input.landscape, tile) } : {}),
            sacred: check.spared,
            // pole a sady pod obydlím se o zabranou plochu zmenší
            takenLand: check.takenLand,
            walk: villageRoadWalk(state, input.landscape),
          },
        ),
      };
    },
  );
}
