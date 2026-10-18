import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  roadUpgradeOptions,
  startRoadUpgrade,
  villageRoadWalk,
  type RoadUpgrade,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface UpgradeRoadInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  roadId: number;
  upgrade: RoadUpgrade;
}

/** Úsek takové vylepšení nenabízí (už je, nebo nevede mokřinou ani přes brod). */
export const NO_UPGRADE = 'Tohle vylepšení úsek nemá.';

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
    (state) => {
      const day = state.lastDay;
      const obstacles = obstaclesOf(input.landscape);
      const walk = villageRoadWalk(state, input.landscape);
      const option = roadUpgradeOptions(state, input.roadId, day, obstacles, walk).find(
        (o) => o.upgrade === input.upgrade,
      );
      if (!option) return { ok: false, reason: NO_UPGRADE };
      if (option.blocked) return { ok: false, reason: option.blocked };
      return {
        ok: true,
        state: startRoadUpgrade(state, day, input.roadId, input.upgrade, obstacles, walk),
      };
    },
  );
}
