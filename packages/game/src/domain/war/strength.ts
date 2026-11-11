// Síla vojska (war.md – Síla): dvě stupnice – vesničan pevně malá, muž rodu podle vojenské
// zkušenosti – a kůň, výzbroj a štěstí. Čisté deterministické funkce (jen det-math, žádné I/O).
import { riderPower } from '../village/livestock/horse-riders';
import { happinessLaborFactor } from '../village/people/happiness';
import type { ArmsSkills, Person } from '../village/types';
import { WAR } from './rules-war';

/** Vojenská zkušenost muže rodu = (boj + luk) ÷ 2 (war.md – Síla; návrh Clauda); jízda je v koni. */
export function militaryExperience(arms: Pick<ArmsSkills, 'bow' | 'combat'> | undefined): number {
  return ((arms?.combat ?? 0) + (arms?.bow ?? 0)) / 2;
}

/**
 * Dovednost luku muže rodu 0–100 pro kruh rozptylu (fortifications.md – Střelba a viditelná plocha):
 * luk podle dovednosti luku muže rodu; bez dovedností 0.
 */
export function bowSkillOf(person: Pick<Person, 'arms'>): number {
  return person.arms?.bow ?? 0;
}

/**
 * Síla muže rodu: pěšky `1 + 2 × zkušenost ÷ 100` (1–3), na koni navíc
 * `× (1 + 0,5 × jízda na koni ÷ 100)` – jízda na koni je `riderPower` (jízda × (0,4 + 0,6 × výcvik
 * koně)); nejvýš 3 × 1,5 = 4,5.
 */
export function lineManStrength(
  person: Pick<Person, 'arms'>,
  horse: Parameters<typeof riderPower>[1] | null,
): number {
  const { lineBase, linePerExperience, horsePerRiding } = WAR.strength;
  const onFoot = lineBase + (linePerExperience * militaryExperience(person.arms)) / 100;
  if (!horse) return onFoot;
  return onFoot * (1 + (horsePerRiding * riderPower({ arms: person.arms }, horse)) / 100);
}

/** Síla vesničana: pevně 0,4, nucený × 0,5, × 0,8–1,1 podle štěstí vsi (jako práce). */
export function villagerStrength(forced: boolean, happiness: number): number {
  const { villager, forcedFactor } = WAR.strength;
  return villager * (forced ? forcedFactor : 1) * happinessLaborFactor(happiness);
}

/**
 * Síla vojska = součet sil mužů × výzbroj z kovárny: `1 + 0,5 × pokrytí` (pokrytí nástroji 0–1,
 * s plným až × 1,5).
 */
export function armyStrength(members: readonly number[], smithCoverage: number): number {
  const coverage = Math.min(1, Math.max(0, smithCoverage));
  const sum = members.reduce((a, b) => a + b, 0);
  return sum * (1 + (WAR.strength.smithMax - 1) * coverage);
}
