import type { Landscape } from '../domain/landscape';
import {
  canInviteLodge,
  canInviteMaster,
  inviteLodge,
  inviteMaster,
  type MasonCraft,
  type MasonryCircle,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// Pozvání stavební huti a chybějícího mistra (stone-masonry.md – Stavební huť). Právo (`ennoble`)
// ověřuje vstupní bod (`ACTION_RIGHTS`); tady jen pravidla huti.

/** Proč huť nebo mistra nejde pozvat – jediné místo textů (důvod u tlačítka i odpověď use-casu). */
export const INVITE_LODGE_REASONS = {
  'not-baptized': 'Stavební huť pozve jen pokřtěný rod.',
  already: 'Stavební huť už je pozvaná.',
  'no-lord': 'Ves nemá vojvodu, který by huť pozval.',
  'no-lodge': 'Nejdřív je třeba pozvat stavební huť.',
  present: 'Mistr tohoto oboru už ve vsi je nebo je na cestě.',
} as const;

export interface InviteLodgeInput {
  /** Ves (id), ve které hráč jedná. */
  villageId: string;
  /** Dnešní herní den (index dne) – ves se nejdřív dopočítá do dneška. */
  today: number;
  /** Krajina sídla – ves se s ní dopočítává. */
  landscape: Landscape;
  /** Okruh huti: adriatický nebo karolinský. */
  circle: MasonryCircle;
}

/** Vojvoda pozve stavební huť okruhu `circle` – pět mistrů dorazí za 60 dní. */
export function inviteLodgeForVillage(
  deps: { villages: VillageRepository },
  input: InviteLodgeInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const denied = canInviteLodge(state, state.lastDay);
      if (denied !== 'ok') return { ok: false, reason: INVITE_LODGE_REASONS[denied] };
      return { ok: true, state: inviteLodge(state, input.circle, state.lastDay) };
    },
  );
}

export interface InviteMasterInput {
  villageId: string;
  today: number;
  landscape: Landscape;
  /** Obor chybějícího mistra. */
  craft: MasonCraft;
}

/** Vojvoda pozve mistra chybějícího oboru stejného okruhu (dorazí za 60 dní). */
export function inviteMasterForVillage(
  deps: { villages: VillageRepository },
  input: InviteMasterInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const denied = canInviteMaster(state, input.craft);
      if (denied !== 'ok') return { ok: false, reason: INVITE_LODGE_REASONS[denied] };
      return { ok: true, state: inviteMaster(state, input.craft, state.lastDay) };
    },
  );
}
