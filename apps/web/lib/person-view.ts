// Lidé vsi pro scénu (docs/design/villagers.md – Výběr postavy): úsporně id, věk, pohlaví,
// domácnost a hotová role (person-roles.ts) – scéna podle nich přiřadí každé postavě skutečného
// člověka a panel postavy ukáže, kdo to je. Čistý modul na serveru.
import {
  AGE,
  ageYears,
  villageManorId,
  type Craft,
  type Sex,
  type VillageState,
} from '@bohemia/game';
import { personRoles, type PersonRole, type RolePerson } from './person-roles';

/** Portrét člověka podle věku a pohlaví (ikony lidí v `public/icons/resources/`). */
export type PersonPortraitIcon = 'man' | 'woman' | 'child' | 'elder';

/** Portrét člověka: starší, dítě (do 14 let), žena, nebo muž. */
export function personPortrait(person: { age: number; sex: string }): PersonPortraitIcon {
  if (person.age >= AGE.elder) return 'elder';
  if (person.age < AGE.adult) return 'child';
  return person.sex === 'female' ? 'woman' : 'man';
}

/** Dovednosti se zbraní a na koni celými čísly 0–100 (lord.md – Dovednosti). */
export interface ArmsView {
  bow: number;
  combat: number;
  riding: number;
}

/**
 * Člověk vsi ve scéně: id, věk (celé roky), pohlaví, domácnost (id obydlí) a role; kdo se cvičil
 * (`Person.arms`), nese dovednosti, a kdo má koně (`Horse.riderId`), `horse`.
 */
export interface ScenePerson {
  id: number;
  age: number;
  sex: Sex;
  home: number;
  role: PersonRole;
  arms?: ArmsView;
  horse?: true;
}

/**
 * Lidé vsi pro scénu v den `day` (věk ke dni) seřazení podle id. Ves uložená před pohlavím
 * (`Person.sex` chybí) má pohlaví střídavě podle id – jako průvod pohřbu (funeral-view.ts).
 */
export function scenePersons(
  state: Pick<VillageState, 'people' | 'dwellings' | 'manorId' | 'constructions'> &
    Partial<Pick<VillageState, 'pens'>>,
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
  const riders = new Set<number>();
  for (const pen of state.pens ?? []) {
    for (const horse of pen.horses ?? [])
      if (horse.riderId !== undefined) riders.add(horse.riderId);
  }
  const arms = new Map(
    state.people.flatMap((p) => (p.arms ? [[p.id, armsView(p.arms)] as const] : [])),
  );
  return people
    .map((p) => ({
      id: p.id,
      age: p.age,
      sex: p.sex,
      home: p.home,
      role: roles.get(p.id)!,
      ...(arms.has(p.id) ? { arms: arms.get(p.id)! } : {}),
      ...(riders.has(p.id) ? { horse: true as const } : {}),
    }))
    .sort((a, b) => a.id - b.id);
}

/** Dovednosti pro rozhraní: celá čísla v mezích 0–100. */
export function armsView(arms: { bow: number; combat: number; riding: number }): ArmsView {
  const whole = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));
  return { bow: whole(arms.bow), combat: whole(arms.combat), riding: whole(arms.riding) };
}
