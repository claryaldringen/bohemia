import { obstaclesOf, type Landscape } from '../domain/landscape';
import { applyBuildIntent, type RoadUpgrade } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvod odmítnutí žije v doméně (build-intent.ts) – use-case ho dál exportuje pro web a testy
export { NO_UPGRADE } from '../domain/village';

export interface UpgradeRoadInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  roadId: number;
  upgrade: RoadUpgrade;
}

/**
 * Hráč zadá vylepšení pevné cesty (roads.md – Vylepšení cesty; ves se nejdřív dopočítá do
 * dneška): upravená cesta, nebo hať a lávka. Server vylepšení ověří znovu (`roadUpgradeOptions`)
 * a vrátí důvod česky, když nejde; dřevo vezme z hromady, zbytek vyhradí ke kácení chůzí po
 * pevných cestách.
 */
export function upgradeRoad(
  deps: { villages: VillageRepository },
  input: UpgradeRoadInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    // akce patří do dne, do kterého je ves dopočítaná – dnešek, nebo „budoucí“ den vsi
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'road-upgrade',
        roadId: input.roadId,
        upgrade: input.upgrade,
      }),
  );
}
