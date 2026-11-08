import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  startFortificationUpgrade,
  startSectionUpgrade,
  villageRoadWalk,
  type FortTop,
  type WallKind,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

export interface UpgradeFortificationInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  fortificationId: number;
  /** Plot na palisádu (`upgrade`), nebo plot či palisáda na val (`top`). */
  work: 'upgrade' | 'top';
  /** Nástavba na val (jen `top`). */
  top?: FortTop;
  /**
   * Vylepšení po úsecích (fortifications.md – Hradby a obrana, Druhy a postup vylepšení): cílová
   * hradba – s ní se `work` a `top` nečtou a vylepší se úsek s dílem `segment` (null či chybí –
   * celé opevnění, „Vylepšit vše“).
   */
  target?: WallKind;
  segment?: number | null;
}

/**
 * Hráč vylepší opevnění (fortifications.md – Druhy): s cílovou hradbou úsek mezi branami (nebo
 * celé) na kterýkoli vyšší stupeň (`startSectionUpgrade`); bez ní starší akce – plot na palisádu
 * (plot úseku stojí, dokud jeho palisáda není hotová), nebo plot či palisáda na hotový val.
 */
export function upgradeFortification(
  deps: { villages: VillageRepository },
  input: UpgradeFortificationInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      input.target !== undefined
        ? startSectionUpgrade(
            state,
            state.lastDay,
            input.landscape,
            obstaclesOf(input.landscape),
            {
              fortificationId: input.fortificationId,
              segment: input.segment ?? null,
              target: input.target,
            },
            villageRoadWalk(state, input.landscape),
          )
        : startFortificationUpgrade(
            state,
            state.lastDay,
            input.landscape,
            obstaclesOf(input.landscape),
            {
              fortificationId: input.fortificationId,
              work: input.work,
              ...(input.top ? { top: input.top } : {}),
            },
            villageRoadWalk(state, input.landscape),
          ),
  );
}
