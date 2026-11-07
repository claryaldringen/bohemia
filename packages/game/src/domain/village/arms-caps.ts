// Převod starých vsí na stropy výcviku (war.md – Síla; Martin 2. 11. 2026: doma nejvýš 50, lov 70,
// nad 70 jen válka): dovednosti nad 70 z doby, kdy strop byl 100, se jednou stáhnou na 70.
import { cloneState } from './clone';
import { ARMS_CAPS } from './rules';
import type { ArmsSkills, VillageState } from './types';

const capSkill = (x: number): number => Math.min(x, ARMS_CAPS.hunt);

function capArms(arms: ArmsSkills): ArmsSkills {
  const best = arms.best;
  return {
    bow: capSkill(arms.bow),
    combat: capSkill(arms.combat),
    riding: capSkill(arms.riding),
    ...(best
      ? {
          best: {
            bow: capSkill(best.bow),
            combat: capSkill(best.combat),
            riding: capSkill(best.riding),
          },
        }
      : {}),
  };
}

/**
 * Stáhne dovednosti (i nejvyšší dosažené) nad 70 na 70 – **jen jednou**: příznak `armsCapped`
 * zaručí, že pozdější zkušenost z války (nad 70 do 100) se už nesráží. Vstupní stav nemění; ves
 * s příznakem vrací týž objekt (idempotentní).
 */
export function withArmsCaps(state: VillageState): VillageState {
  if (state.armsCapped) return state;
  const next = cloneState(state);
  for (const p of next.people) {
    if (p.arms) p.arms = capArms(p.arms);
  }
  next.armsCapped = true;
  return next;
}
