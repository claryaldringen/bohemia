import { createRandom, deriveSeed } from '../landscape/random';
import type { CampaignMember, CampaignState } from './campaign-types';
import { WAR } from './rules-war';

// Dezerce nucených (war.md – Vojsko): každý nucený muž na tažení uteče ≈ 5 % denně, s příbuznými
// v cílové vsi ≈ 15 %. Los muže je jen ze seedu tažení, dne a pořadí muže – výsledek nezávisí na
// tom, po jakých kouscích taktů se tažení počítá.

/** Kdo dnes (den `state.day`) dezertuje – nucení aktivní muži; stav nemění. */
export function deserters(
  state: Pick<CampaignState, 'seed' | 'day' | 'members'>,
): CampaignMember[] {
  const out: CampaignMember[] = [];
  state.members.forEach((m, index) => {
    if (m.status !== 'active' || !m.forced) return;
    const chance = m.kin === true ? WAR.desertion.withKinPerDay : WAR.desertion.perDay;
    const draw = createRandom(deriveSeed(state.seed, `desert:${state.day}:${index}`)).next();
    if (draw < chance) out.push(m);
  });
  return out;
}
