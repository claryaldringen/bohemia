// Bydlení rodu vojvody (lord.md – Rod vojvody: Manželky – Bydlení a Přednost při osídlení; Synové
// po sňatku odcházejí z dvorce): vedlejší manželka z přeplněného domu muže rodu a pořadí rodin při
// osídlení nového nebo prázdného obydlí. Ves bez rodu se osídluje jako dosud (`leavingFamilies`).
// Čisté funkce nad stavem vsi.
import { isOvercrowded } from './dwellings';
import { isDynastyTracked, isLineMan } from './dynasty';
import { byCrowding, departingFamilies, leavingFamilies, type Family } from './households';
import { villageManorId } from './manor';
import { householdBreaksUp, occupants } from './people';
import { DWELLINGS } from './rules';
import type { Dwelling, Person, VillageState } from './types';

/** Svobodný v domácnosti – nemá v ní manžela / manželku. */
function unmarriedHere(p: Person, members: readonly Person[]): boolean {
  return p.spouseId === undefined || !members.some((m) => m.id === p.spouseId);
}

/** Datum narození nejstaršího syna rodiny (bez syna nekonečno – odchází až po rodinách se syny). */
function oldestSonBorn(family: Family): number {
  return Math.min(...family.people.filter((p) => p.sex === 'male').map((p) => p.bornDay), Infinity);
}

/**
 * Vedlejší manželky, které odcházejí z přeplněného domu `dwelling` muže rodu (lord.md – Manželky –
 * Bydlení; Martin 24. 10. 2026: „Ta s nejstarším synem, který by se mohl starat už o dům“): každá
 * vedlejší manželka muže rodu z domu se svými svobodnými dětmi, od té s nejstarším synem (bez syna
 * až po nich, při shodě nejdéle vdaná – nižší id), po jedné rodině, dokud dům zůstává přeplněný.
 * Rodiny `leaving` z domu odcházejí tak jako tak (ženatí synové) – s nimi i jejich ženy, o ně se
 * přeplnění zmenší. Jen rodina, která dům udrží (někdo 16–44), a jen když se zbytek domácnosti
 * nerozpadne. Ves bez rodu – nic.
 */
export function secondaryWifeFamilies(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
  leaving: readonly Family[] = [],
): Family[] {
  if (!isDynastyTracked(state)) return [];
  const gone = new Set(leaving.flatMap((f) => f.people.map((p) => p.id)));
  const members = occupants(state, dwelling.id).filter((m) => !gone.has(m.id));
  let excess = members.length - DWELLINGS[dwelling.type].capacity;
  if (excess <= 0) return [];
  const men = new Map(members.filter(isLineMan).map((m) => [m.id, m]));
  const families = members
    .filter((w) => {
      const husband = w.sex === 'female' ? men.get(w.spouseId ?? -1) : undefined;
      return husband !== undefined && husband.spouseId !== w.id;
    })
    .map((wife): Family => ({
      dwelling,
      people: [wife, ...members.filter((c) => c.motherId === wife.id && unmarriedHere(c, members))],
    }))
    .sort((a, b) => oldestSonBorn(a) - oldestSonBorn(b) || a.people[0]!.id - b.people[0]!.id);
  let staying = members;
  const out: Family[] = [];
  for (const family of families) {
    if (excess <= 0) break;
    const rest = staying.filter((m) => !family.people.includes(m));
    if (householdBreaksUp(family.people, day) || householdBreaksUp(rest, day)) continue;
    out.push(family);
    staying = rest;
    excess -= family.people.length;
  }
  return out;
}

/**
 * Rodiny k osídlení nového nebo prázdného obydlí v pořadí přednosti (lord.md – Manželky – Přednost
 * při osídlení, Synové po sňatku – Přestěhování): 1. ženatí muži rodu z dvorce od nejstaršího
 * (odcházejí tak jako tak, jejich odchod dvorec uvolní), 2. vedlejší manželky z přeplněných domů
 * mužů rodu – nejdřív z dvorce, pak od nejvíc přeplněného domu; jen kolik jich je třeba, až odejdou
 * rodiny, které z domu odcházejí tak jako tak (`departingFamilies`), 3. ostatní (`leavingFamilies`).
 * Ves bez rodu – přesně `leavingFamilies`.
 */
export function settlingFamilies(state: VillageState, day: number): Family[] {
  const others = leavingFamilies(state, day);
  if (!isDynastyTracked(state)) return others;
  const manorId = villageManorId(state);
  const manor = state.dwellings.find((d) => d.id === manorId);
  const fromManor = manor ? departingFamilies(state, manor, day) : [];
  const sons = fromManor.filter((f) => f.people[0] && isLineMan(f.people[0]));
  const homes = byCrowding(state).filter(
    (d) => d.id !== manorId && isOvercrowded(state, d.id, day),
  );
  const wives = [
    ...(manor ? secondaryWifeFamilies(state, manor, day, fromManor) : []),
    ...homes.flatMap((d) => secondaryWifeFamilies(state, d, day, departingFamilies(state, d, day))),
  ];
  const first = [...sons, ...wives];
  const taken = new Set(first.flatMap((f) => f.people.map((p) => p.id)));
  return [...first, ...others.filter((f) => !f.people.some((p) => taken.has(p.id)))];
}
