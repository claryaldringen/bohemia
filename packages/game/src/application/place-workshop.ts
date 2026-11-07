import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type Craft, type Position } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvod odmítnutí žije v doméně (build-intent.ts) – use-case ho dál exportuje pro web a testy
export { UNKNOWN_CRAFT } from '../domain/village';

export interface PlaceWorkshopInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  craft: Craft;
  /** Volná poloha dílny jako u zemnice (milíř uhlíř staví zvlášť u dávky buků – crafts.md). */
  position: Position;
}

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
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'workshop',
        craft: input.craft,
        position: input.position,
      }),
  );
}
