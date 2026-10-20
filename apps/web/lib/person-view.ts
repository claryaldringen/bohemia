// Lidé vsi pro scénu (docs/design/villagers.md – Výběr postavy): úsporně id, věk, pohlaví,
// domácnost a hotová role (person-roles.ts) – scéna podle nich přiřadí každé postavě skutečného
// člověka a panel postavy ukáže, kdo to je. Čistý modul na serveru.
import { ageYears, villageManorId, type Craft, type Sex, type VillageState } from '@bohemia/game';
import { personRoles, type PersonRole, type RolePerson } from './person-roles';

/** Člověk vsi ve scéně: id, věk (celé roky), pohlaví, domácnost (id obydlí) a role. */
export interface ScenePerson {
  id: number;
  age: number;
  sex: Sex;
  home: number;
  role: PersonRole;
}

/**
 * Lidé vsi pro scénu v den `day` (věk ke dni) seřazení podle id. Ves uložená před pohlavím
 * (`Person.sex` chybí) má pohlaví střídavě podle id – jako průvod pohřbu (funeral-view.ts).
 */
export function scenePersons(
  state: Pick<VillageState, 'people' | 'dwellings' | 'manorId' | 'constructions'>,
  day: number,
): ScenePerson[] {
  const crafts = new Map<number, Craft>();
  for (const d of state.dwellings) if (d.workshop) crafts.set(d.id, d.workshop.craft);
  const people = state.people.map((p): RolePerson => ({
    id: p.id,
    age: ageYears(p.bornDay, day),
    sex: p.sex ?? (p.id % 2 === 0 ? 'female' : 'male'),
    home: p.dwellingId,
    ...(p.spouseId !== undefined ? { spouse: p.spouseId } : {}),
    ...(p.motherId !== undefined ? { mother: p.motherId } : {}),
    ...(p.fatherId !== undefined ? { father: p.fatherId } : {}),
    ...(p.origin !== undefined ? { origin: true } : {}),
    ...(p.practice ? { practice: p.practice } : {}),
  }));
  const roles = personRoles(people, {
    manor: villageManorId(state),
    craft: (home) => crafts.get(home) ?? null,
  });
  return people
    .map((p) => ({ id: p.id, age: p.age, sex: p.sex, home: p.home, role: roles.get(p.id)! }))
    .sort((a, b) => a.id - b.id);
}
