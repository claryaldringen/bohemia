// Postavení člověka v zápisu kroniky (úmrtí a návrat z tažení – Martin 15. 11. 2026: „Ve věku
// 64 let zemřel sedlák Bořivoj.“, „Z tažení se vrátil sedlák Bořivoj.“; návrh Clauda –
// population.md, Kronika). Jen zápis do kroniky – simulace postavení nezná.

import { currentLord } from './dynasty';
import { householdHead } from './households';
import { villageManorId } from './manor';
import type { ChronicleEstate, ChroniclePerson, Person, VillageState } from '../types';

type EstateState = Pick<
  VillageState,
  'people' | 'dwellings' | 'constructions' | 'manorId' | 'dynasty'
>;

/** Je `p` dítětem někoho z `parents`? */
function childOf(p: Person, parents: ReadonlySet<number>): boolean {
  return (
    (p.motherId !== undefined && parents.has(p.motherId)) ||
    (p.fatherId !== undefined && parents.has(p.fatherId))
  );
}

/**
 * Postavení člověka `p` v den `day` (žije, je ve stavu): kněz a mistr huti podle úřadu; jinak čí je
 * domácnost – dvorec vojvody, dílna řemesla (`workshop`), jinak rolník – a vztah k její hlavě (ve
 * dvorci vojvoda `dynasty.lordId`, jinak `householdHead` – nejstarší muž, bez muže nejstarší žena,
 * ta je „žena“ domu). Vedlejší manželka vojvody je vojvodova žena i ve vlastním domě.
 */
export function chronicleEstate(state: EstateState, p: Person, day: number): ChronicleEstate {
  const estate = estateOf(state, p, day);
  return p.sex === 'female' ? { ...estate, female: true } : estate;
}

function estateOf(state: EstateState, p: Person, day: number): ChronicleEstate {
  if (p.priest) return { title: 'priest', kin: 'head' };
  if (p.mason) return { title: p.mason, kin: 'head' };
  const lord = currentLord(state);
  if (lord && p.spouseId === lord.id) return { title: 'voivode', kin: 'wife' };
  const manor = villageManorId(state) === p.dwellingId;
  const title: ChronicleEstate['title'] = manor
    ? 'voivode'
    : (state.dwellings.find((d) => d.id === p.dwellingId)?.workshop?.craft ?? 'farmer');
  const head =
    manor && lord?.dwellingId === p.dwellingId
      ? lord
      : householdHead(state.people, p.dwellingId, day);
  if (!head) return { title, kin: 'other' };
  // jméno hlavy jen u muže – „syn sedláka Bořivoje“ (žena v čele domu se 2. pádem nepíše)
  const headName = head.name === undefined || head.sex === 'female' ? {} : { headName: head.name };
  if (p.id === head.id) return { title, kin: head.sex === 'female' ? 'wife' : 'head' };
  if (p.spouseId === head.id || head.spouseId === p.id) return { title, kin: 'wife' };
  if (head.motherId === p.id || head.fatherId === p.id)
    return { title, kin: 'parent', ...headName };
  const couple = new Set(head.spouseId === undefined ? [head.id] : [head.id, head.spouseId]);
  if (childOf(p, couple)) return { title, kin: 'child', ...headName };
  const children = new Set(state.people.filter((x) => childOf(x, couple)).map((x) => x.id));
  if (p.spouseId !== undefined && children.has(p.spouseId)) {
    return { title, kin: 'in-law', ...headName };
  }
  if (childOf(p, children)) return { title, kin: 'grandchild', ...headName };
  return { title, kin: 'other' };
}

/** Člověk do zápisu kroniky (návrat z tažení): postavení (s pohlavím) a jméno. */
export function chroniclePerson(state: EstateState, p: Person, day: number): ChroniclePerson {
  return {
    estate: chronicleEstate(state, p, day),
    ...(p.name === undefined ? {} : { name: p.name }),
  };
}

/**
 * Kdo zemřel – pole zápisu `death`: jméno a id (lord.md – Kde se jméno ukazuje, population.md –
 * Jména; id pro nástupnictví) a postavení s pohlavím v den smrti. Volá se, dokud je člověk ve stavu.
 */
export function deathWho(
  state: EstateState,
  p: Person,
  day: number,
): { name?: string; personId?: number; estate: ChronicleEstate } {
  return {
    ...(p.name === undefined ? {} : { name: p.name, personId: p.id }),
    estate: chronicleEstate(state, p, day),
  };
}
