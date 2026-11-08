import type { Landscape } from '../domain/landscape';
import { abandonFieldParts, abandonPartsBlock } from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Opuštění dílu pole a jeho vrácení do osevu (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“ –
// akce pro hráče i správce, kterou díly vypadnou z oběhu a zarostou). Hráč smí kdykoli, bez ceny.

export interface AbandonFieldPartsInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Díly pole (`FieldPart.id`). */
  partIds: number[];
  /** true = opustit, false = vrátit do osevu. */
  abandon: boolean;
}

/**
 * Hráč opustí díly pole, nebo je vrátí do osevu (ves se nejdřív dopočítá do dneška – díl mezitím
 * mohl zarůst lesem). Důvod odmítnutí se vrací jako `reason`.
 */
export function abandonVillageFieldParts(
  deps: { villages: VillageRepository },
  input: AbandonFieldPartsInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const block = abandonPartsBlock(state, input.partIds, input.abandon);
      if (block !== null) return { ok: false, reason: block };
      return {
        ok: true,
        state: abandonFieldParts(state, state.lastDay, input.partIds, input.abandon),
      };
    },
  );
}
