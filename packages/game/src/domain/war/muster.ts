import { isLineMan } from '../village/dynasty';
import { createRandom, deriveSeed } from '../landscape/random';
import { villageHappiness } from '../village/happiness';
import { ageYears, isAway, isInjured } from '../village/people';
import type { Person, VillageState } from '../village/types';
import { WAR } from './rules-war';

// Nábor na tažení (war.md – Vojsko): kdo ve vsi smí jít a kdo se přihlásí dobrovolně. Čisté
// deterministické funkce (jen det-math): přihlášení každého muže losuje jeho vlastní náhoda ze
// seedu, takže se neliší mezi dotazy panelu a vysláním.

/** Výsledek náboru jedné vsi (vesničané 16–44 let; muži rodu jdou vždy na rozkaz hráče). */
export interface Muster {
  /** Id přihlášených dobrovolníků. */
  volunteers: number[];
  /** Kolik mužů je ochotných (nemají v cíli blízké příbuzné). */
  willing: number;
  /** Kolik mužů je neochotných (mají v cíli blízké příbuzné). */
  unwilling: number;
  /** Id ostatních způsobilých (kandidáti na rozkaz: neochotní i ochotní nepřihlášení). */
  others: number[];
}

/** Dospělý schopný služby: nepracuje jinde (není pryč), není zraněný, věk od 16 let. */
function fit(p: Person, day: number): boolean {
  return !isAway(p, day) && !isInjured(p, day) && ageYears(p.bornDay, day) >= WAR.army.minAge;
}

/** Muži rodu schopní tažení (od 16 let, ne pryč, ne zranění). */
export function lineCandidates(state: Pick<VillageState, 'people'>, day: number): Person[] {
  return state.people.filter((p) => isLineMan(p) && p.noble === undefined && fit(p, day));
}

/** Vesničané schopní tažení: muži 16–44 let mimo rod (war.md – Vojsko). */
export function villagerCandidates(state: Pick<VillageState, 'people'>, day: number): Person[] {
  return state.people.filter(
    (p) =>
      p.sex === 'male' &&
      p.line !== true &&
      p.noble === undefined &&
      fit(p, day) &&
      ageYears(p.bornDay, day) <= WAR.army.villagerMaxAge,
  );
}

/** Ves hladoví – kořist láká víc (war.md – Vojsko). */
function hungry(state: Pick<VillageState, 'starvationDays' | 'ration'>): boolean {
  return (state.starvationDays ?? 0) > 0 || state.ration !== undefined;
}

/**
 * Muž žije v domácnosti čerstvé vdovy – s matkou bez manžela a bez jiného dospělého muže (návrh
 * Clauda: bez úmrtí v rodokmenu nejde poznat „čerstvě“, stačí domácnost bez hlavy).
 */
function widowHousehold(state: Pick<VillageState, 'people'>, p: Person, day: number): boolean {
  const mother = state.people.find((q) => q.id === p.motherId);
  if (!mother || mother.spouseId !== undefined) return false;
  if (mother.dwellingId !== p.dwellingId) return false;
  return !state.people.some(
    (q) =>
      q.id !== p.id &&
      q.dwellingId === p.dwellingId &&
      q.sex === 'male' &&
      ageYears(q.bornDay, day) >= WAR.army.minAge,
  );
}

/** Pravděpodobnost přihlášení muže: 30 % + 0,5 % za bod štěstí nad 50, hlad víc, vdova méně. */
export function volunteerShare(
  state: Pick<VillageState, 'happiness' | 'starvationDays' | 'ration' | 'people'>,
  p: Person,
  day: number,
): number {
  const m = WAR.muster;
  let share = m.baseShare + m.perHappinessPoint * (villageHappiness(state) - m.happinessBase);
  if (hungry(state)) share += m.hungryBonus;
  if (widowHousehold(state, p, day)) share *= m.widowFactor;
  return Math.min(m.maxShare, Math.max(0, share));
}

/**
 * Nábor vesničanů: muž s blízkými příbuznými v cílové vsi (`relativesInTarget`) nechce, jinak se
 * přihlásí podle `volunteerShare` (vlastní los muže ze `seed`).
 */
export function musterOf(
  state: VillageState,
  day: number,
  relativesInTarget: (p: Person) => boolean,
  seed: number,
): Muster {
  const out: Muster = { volunteers: [], willing: 0, unwilling: 0, others: [] };
  for (const p of villagerCandidates(state, day)) {
    if (relativesInTarget(p)) {
      out.unwilling++;
      out.others.push(p.id);
      continue;
    }
    out.willing++;
    const draw = createRandom(deriveSeed(seed, `muster:${p.id}`)).next();
    if (draw < volunteerShare(state, p, day)) out.volunteers.push(p.id);
    else out.others.push(p.id);
  }
  return out;
}
