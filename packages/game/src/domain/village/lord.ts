// Vojvodova rodina a dovednosti (docs/design/lord.md): kdo patří k rodině, výcvik den po dni, růst
// a úbytek dovedností. Čisté funkce nad stavem a dnem – nic se zatím nezapojuje do simulace.
import { householdHead } from './households';
import { villageManorId } from './manor';
import { ageGroup, ageYears } from './people';
import { AGE, LORD } from './rules';
import type { ArmsSkills, Person, VillageState } from './types';

/** Rodina vojvody (lord.md – Kdo je vojvodova rodina). */
export interface LordFamily {
  /** Hlava dvorce. */
  lord: Person | null;
  /** Vojvoda a jeho potomci po meči v dvorci od 7 let – cvičí. */
  trainees: Person[];
  /** Žena vojvody, dcery, snachy a vnučky – jen domácnost dvorce. */
  household: Person[];
  /** Zbytek dvorce (zeť, ženich, chlapci pod 7 let) – pracují jako dosud. */
  others: Person[];
}

type Hours = { bow: number; combat: number; riding: number };

/**
 * Rodina vojvody (lord.md – Kdo je vojvodova rodina): trénuje vojvoda a jeho potomci po meči
 * v dvorci (`fatherId` řetězem) od 7 let; žena vojvody, jeho dcery a vnučky po meči a snachy
 * (ženy cvičících) vedou jen domácnost; ostatní v dvorci (zeť, synové předchozího vojvody, chlapci
 * pod 7 let) jsou `others`. Kdo dvorec opustil, v rodině není.
 */
export function lordFamily(state: VillageState, day: number): LordFamily {
  const manor = villageManorId(state);
  const lord = manor === null ? undefined : householdHead(state.people, manor, day);
  if (manor === null || !lord) return { lord: null, trainees: [], household: [], others: [] };
  const members = state.people.filter((p) => p.dwellingId === manor);
  // potomci po otci: vojvoda a všichni, kdo z něj vedou po otcích
  const line = new Set<number>([lord.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of members) {
      if (!line.has(p.id) && p.fatherId !== undefined && line.has(p.fatherId)) {
        line.add(p.id);
        grew = true;
      }
    }
  }
  const trainees: Person[] = [];
  const household: Person[] = [];
  const others: Person[] = [];
  for (const p of members) {
    const male = p.sex !== 'female';
    if (male && line.has(p.id) && ageYears(p.bornDay, day) >= AGE.olderChild) trainees.push(p);
    else if (!male && line.has(p.id)) household.push(p);
    else if (!male && p.spouseId !== undefined && line.has(p.spouseId)) household.push(p);
    else if (p.sex === 'female' && lord.spouseId === p.id) household.push(p);
    else others.push(p);
  }
  return { lord, trainees, household, others };
}

/**
 * Hodiny výcviku muže za den podle věku (lord.md – Den rodiny): chlapci 7–9 let luk, 10–13 let
 * luk, boj a jízda, muži 14–44 let, vojvoda a muži od 45 let méně. Bez koně se jízda rozdělí do
 * luku a boje. Ženy a děti do 7 let nic.
 */
export function trainingHours(
  person: Person,
  day: number,
  lord: Person | null,
  hasHorse: boolean,
): Hours {
  const age = ageYears(person.bornDay, day);
  if (person.sex === 'female' || age < AGE.olderChild) return { bow: 0, combat: 0, riding: 0 };
  const kind =
    lord?.id === person.id || age >= AGE.elder
      ? 'older'
      : age < 10
        ? 'boy'
        : age < AGE.adult
          ? 'youth'
          : 'man';
  const share = LORD.split[kind][hasHorse ? 'withHorse' : 'noHorse'];
  const h = LORD.hours[kind];
  return { bow: h * share.bow, combat: h * share.combat, riding: h * share.riding };
}

/** Strop dovednosti podle věku (lord.md – Výcvik a zkušenost): 7–13 let 40, 14–44 let 100, pak −3 ročně. */
export function armsCap(person: Person, day: number): number {
  const age = ageYears(person.bornDay, day);
  if (age < AGE.olderChild) return 0;
  if (age < AGE.adult) return LORD.cap.boy;
  if (age < AGE.elder) return LORD.cap.man;
  return Math.max(0, LORD.cap.man - LORD.cap.declinePerYear * (age - AGE.elder));
}

function bestOf(skills: ArmsSkills): Hours {
  return skills.best ?? { bow: skills.bow, combat: skills.combat, riding: skills.riding };
}

/** Jeden den růstu: každá dovednost přibude o `(strop − x) × gainPerHour × hodiny` (nikdy dolů). */
export function trainArms(skills: ArmsSkills, hours: Hours, cap: number): ArmsSkills {
  const grow = (x: number, h: number): number => x + Math.max(0, cap - x) * LORD.gainPerHour * h;
  const next = {
    bow: grow(skills.bow, hours.bow),
    combat: grow(skills.combat, hours.combat),
    riding: grow(skills.riding, hours.riding),
  };
  const best = bestOf(skills);
  return {
    ...next,
    best: {
      bow: Math.max(best.bow, next.bow),
      combat: Math.max(best.combat, next.combat),
      riding: Math.max(best.riding, next.riding),
    },
  };
}

/** Den bez výcviku: `× (1 − decayPerYear / 365)`, nejníž `best × floorShare` (a co je pod ním, zůstane). */
export function decayArms(skills: ArmsSkills): ArmsSkills {
  const best = bestOf(skills);
  const fall = (x: number, top: number): number => {
    const floor = top * LORD.floorShare;
    return x <= floor ? x : Math.max(floor, x * (1 - LORD.decayPerYear / 365));
  };
  return {
    bow: fall(skills.bow, best.bow),
    combat: fall(skills.combat, best.combat),
    riding: fall(skills.riding, best.riding),
    best,
  };
}

/** Dospělí (od 14 let) mimo cvičící a domácnost vojvody. */
function adultsOutsideFamily(state: VillageState, day: number): number {
  const family = lordFamily(state, day);
  const inFamily = new Set([...family.trainees, ...family.household].map((p) => p.id));
  return state.people.filter((p) => !inFamily.has(p.id) && ageGroup(p, day) !== 'child').length;
}

/**
 * Cvičí rodina místo práce? (lord.md – Zakládání vsi; Martin 24. 10. 2026: až má ves aspoň
 * `minVillageAdults` dospělých mimo rodinu.) Hystereze (návrh Clauda): kdo už cvičí (`training`),
 * zůstane u výcviku, dokud je jich mimo rodinu aspoň `keepVillageAdults`.
 */
export function familyTrains(state: VillageState, day: number, training = false): boolean {
  const need = training ? LORD.keepVillageAdults : LORD.minVillageAdults;
  return adultsOutsideFamily(state, day) >= need;
}
