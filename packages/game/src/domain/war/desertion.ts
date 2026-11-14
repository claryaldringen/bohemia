import { createRandom, deriveSeed } from '../landscape/random';
import type { CampaignMember, CampaignState, CampaignWorld } from './campaign-types';
import { homeFoodKg } from './npc-commander';
import { WAR } from './rules-war';

// Dezerce (war.md – Vojsko; Zásoby tažení: Živé vedení bez rozkazu): každý nucený muž na tažení
// uteče ≈ 5 % denně, s příbuznými v cílové vsi ≈ 15 %. Tažení vedenému živě, kterému jídlo klesne
// pod jídlo na cestu domů, utíká navíc ≈ 5 % mužů denně – kromě vůdce (Martin 14. 11. 2026). Los muže
// je jeden na den, jen ze seedu tažení, dne a pořadí muže – výsledek nezávisí na tom, po jakých
// kouscích taktů se tažení počítá; hlad šanci nuceného jen zvětší (kdo by utekl bez hladu, uteče).

/**
 * Hlad živého vedení (war.md – Zásoby tažení: Živé vedení bez rozkazu): tažení na pochodu či
 * v nájezdu vede hráčův muž, hráč je u něj (ne zástupce) a jídla je méně než na cestu domů
 * (`homeFoodKg` – jako u NPC velitele, který se v tu chvíli obrátí).
 */
export function starving(s: CampaignState, world: CampaignWorld): boolean {
  if (s.phase !== 'marching' && s.phase !== 'raiding') return false;
  if (!s.liveCommand || s.absent === true) return false;
  return s.supplies.foodKg < homeFoodKg(s, world) - 1e-9;
}

/**
 * Kdo dnes (den `state.day`) dezertuje – aktivní nucení, a hladoví-li (`starving`), i ostatní muži
 * kromě vůdce (`commander`); šance se sčítají, los je jeden. Stav nemění.
 */
export function deserters(
  state: Pick<CampaignState, 'seed' | 'day' | 'members' | 'commander'>,
  hungry = false,
): CampaignMember[] {
  const out: CampaignMember[] = [];
  const leader = state.commander;
  state.members.forEach((m, index) => {
    if (m.status !== 'active') return;
    if (m.ref.villageId === leader.villageId && m.ref.personId === leader.personId) return;
    const chance = forcedChance(m) + (hungry ? WAR.hungerDesertPerDay : 0);
    if (chance <= 0) return;
    const draw = createRandom(deriveSeed(state.seed, `desert:${state.day}:${index}`)).next();
    if (draw < chance) out.push(m);
  });
  return out;
}

/** Denní šance nuceného na útěk (war.md – Vojsko); dobrovolník a muž rodu 0. */
function forcedChance(m: CampaignMember): number {
  if (!m.forced) return 0;
  return m.kin === true ? WAR.desertion.withKinPerDay : WAR.desertion.perDay;
}
