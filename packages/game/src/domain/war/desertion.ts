import type { WorldClock } from '../calendar';
import { createRandom, deriveSeed } from '../landscape/random';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape/types';
import type { CampaignMember, CampaignState, CampaignWorld } from './campaign-types';
import { homeFoodKg, walkDays } from './npc-commander';
import { WAR } from './rules-war';

// Dezerce (war.md – Vojsko; Zásoby tažení: Živé vedení bez rozkazu): každý nucený muž na tažení
// uteče ≈ 5 % denně, s příbuznými v cílové vsi ≈ 15 %. Tažení vedenému živě, kterému jídlo klesne
// pod jídlo na cestu domů, utíká navíc ≈ 5 % mužů denně – kromě vůdce (Martin 14. 11. 2026). Los muže
// je jeden na den, jen ze seedu tažení, dne a pořadí muže – výsledek nezávisí na tom, po jakých
// kouscích taktů se tažení počítá; hlad šanci nuceného jen zvětší (kdo by utekl bez hladu, uteče).
// Dezertér jde domů hned, ne s koncem tažení (Martin 15. 11. 2026) – `deserterHomeDay`.

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

/** Strana mapy políčka (m) – všechny mapy světa jsou stejně velké. */
const MAP_SIDE_M = LANDSCAPE_SIZE * CELL_SIZE_M;

/**
 * Den, na jehož začátku je dezertér doma (war.md – Vojsko; Martin 15. 11. 2026: „Dezertér jde domů
 * hned… k čemu by mu dezerce byla, když by čekal na konec tažení?“): den dezerce + dny chůze z místa
 * jeho skupiny do jeho vsi (`homes`, chybí-li – shromaždiště) vzdušnou čarou tempem pěšího jako
 * cesta domů tažení (`walkDays`; návrh Clauda), nejdřív den po dezerci – výsledky tažení jdou do vsi
 * den nato. Mapy nečte (strana je všude stejná), výsledek tak nezávisí na tom, které jsou načtené.
 */
export function deserterHomeDay(
  state: Pick<CampaignState, 'day' | 'groups' | 'homes' | 'assembly'>,
  m: CampaignMember,
  clock: WorldClock,
): number {
  const from = state.groups.find((g) => g.id === m.group) ?? state.groups[0];
  const home = state.homes?.[m.ref.villageId] ?? state.assembly;
  const days = from ? walkDays(from, home, MAP_SIDE_M, clock) : 0;
  return state.day + Math.max(1, Math.ceil(days));
}

/** Denní šance nuceného na útěk (war.md – Vojsko); dobrovolník a muž rodu 0. */
function forcedChance(m: CampaignMember): number {
  if (!m.forced) return 0;
  return m.kin === true ? WAR.desertion.withKinPerDay : WAR.desertion.perDay;
}
