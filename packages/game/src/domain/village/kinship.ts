// Příbuzenství a pohlaví (kinship.md; Martin, 18. 10. 2026: „Pojďme na příbuzenství a pohlaví“,
// detaily návrh Clauda). Člověk zná matku, otce a manžela / manželku; sourozenci, prarodiče,
// strýcové a bratranci se odvodí přes rodiče. Zemřelí a odešlí rodiče žijících zůstávají
// v rodokmenu jen jako id a jejich rodiče (`VillageState.ancestors`). Čisté funkce bez I/O.
import { cloneState } from './clone';
import { ageGroup, ageYears } from './people';
import { AGE, DECEASED_NAMES_MAX, MARRIAGE } from './rules';
import type { Ancestor, Emigrant, NeighborDirection, Person, Sex, VillageState } from './types';

const DAYS_PER_YEAR = 365.25;

/** Rodiče člověka podle id – žijícího nebo předka z rodokmenu. */
export type ParentIndex = ReadonlyMap<number, { motherId?: number; fatherId?: number }>;

/** Rodiče žijících i zemřelých předků (`ancestors`) podle id. */
export function parentIndex(state: Pick<VillageState, 'people' | 'ancestors'>): ParentIndex {
  const index = new Map<number, { motherId?: number; fatherId?: number }>();
  for (const a of state.ancestors ?? []) index.set(a.id, a);
  for (const p of state.people) index.set(p.id, p);
  return index;
}

/** Známí rodiče (id) člověka `id`. */
function parentsOf(index: ParentIndex, id: number): number[] {
  const entry = index.get(id);
  if (!entry) return [];
  const parents: number[] = [];
  if (entry.motherId !== undefined) parents.push(entry.motherId);
  if (entry.fatherId !== undefined) parents.push(entry.fatherId);
  return parents;
}

function shares(a: readonly number[], b: readonly number[]): boolean {
  return a.some((x) => b.includes(x));
}

/**
 * Blízcí příbuzní, kteří se nesmí vzít (kinship.md – Příbuzenství): rodiče a děti, prarodiče
 * a vnoučata, sourozenci (i nevlastní – stačí společný rodič), strýc / teta a synovec / neteř,
 * bratranci a sestřenice (společný prarodič). Neznámí rodiče nejsou příbuzní nikomu.
 */
export function areCloseKin(index: ParentIndex, a: number, b: number): boolean {
  if (a === b) return true;
  const pa = parentsOf(index, a);
  const pb = parentsOf(index, b);
  if (pa.includes(b) || pb.includes(a)) return true; // rodič a dítě
  if (shares(pa, pb)) return true; // sourozenci
  const ga = pa.flatMap((p) => parentsOf(index, p));
  const gb = pb.flatMap((p) => parentsOf(index, p));
  if (ga.includes(b) || gb.includes(a)) return true; // prarodič a vnouče
  if (shares(pa, gb) || shares(pb, ga)) return true; // strýc / teta a synovec / neteř
  return shares(ga, gb); // bratranci a sestřenice
}

/** Žijící manžel / manželka člověka `p`, nebo undefined. */
export function spouseOf(state: VillageState, p: Person): Person | undefined {
  if (p.spouseId === undefined) return undefined;
  return state.people.find((q) => q.id === p.spouseId);
}

/** Sdílí dva lidé aspoň jednoho známého rodiče (sourozenci, i nevlastní)? */
function sharesParent(
  a: { motherId?: number; fatherId?: number },
  b: { motherId?: number; fatherId?: number },
): boolean {
  return (
    (a.motherId !== undefined && a.motherId === b.motherId) ||
    (a.fatherId !== undefined && a.fatherId === b.fatherId)
  );
}

/** Je `e` rodič, dítě nebo sourozenec člověka `p` (podle id rodičů)? */
function parentChildOrSibling(
  p: { id: number; motherId?: number; fatherId?: number },
  e: { id: number; motherId?: number; fatherId?: number },
): boolean {
  return (
    e.id === p.motherId ||
    e.id === p.fatherId ||
    e.motherId === p.id ||
    e.fatherId === p.id ||
    sharesParent(p, e)
  );
}

/** Pojmenovaný muž rodu, který odešel, se zapamatuje v rodě (absence.md – Jména synů). */
function rememberLineName(state: VillageState, p: Person): void {
  if (!state.dynasty || p.name === undefined || p.sex !== 'male' || p.line !== true) return;
  const deceased = [
    ...(state.dynasty.deceased ?? []),
    {
      id: p.id,
      name: p.name,
      ...(p.fatherId === undefined ? {} : { fatherId: p.fatherId }),
    },
  ];
  state.dynasty.deceased = deceased.slice(-DECEASED_NAMES_MAX);
}

/**
 * Lidé odešli ze vsi – zemřeli, nebo se vdali pryč (mutuje stav): jejich manželé ovdověli,
 * a kdo z nich je rodičem někoho žijícího, zůstane v rodokmenu (`ancestors` – id a rodiče). Předci,
 * kteří už nejsou rodičem nikoho žijícího, se zapomenou – rodokmen tak drží jen rodiče a prarodiče
 * žijících a neroste do nekonečna. Kdo se vdal pryč (`emigrated` – směr nové vsi), zůstane jako
 * záznam v `emigrants` (war.md), dokud ve vsi žije jeho rodič, sourozenec nebo dítě.
 */
export function removePeople(
  state: VillageState,
  ids: ReadonlySet<number>,
  emigrated: ReadonlyMap<number, NeighborDirection> = new Map(),
): void {
  if (ids.size === 0) return;
  const removed = state.people.filter((p) => ids.has(p.id));
  state.people = state.people.filter((p) => !ids.has(p.id));
  for (const p of state.people) {
    if (p.spouseId !== undefined && ids.has(p.spouseId)) delete p.spouseId;
  }
  const ancestors: Ancestor[] = [...(state.ancestors ?? [])];
  const emigrants: Emigrant[] = [...(state.emigrants ?? [])];
  for (const p of removed) {
    const parents = {
      ...(p.motherId === undefined ? {} : { motherId: p.motherId }),
      ...(p.fatherId === undefined ? {} : { fatherId: p.fatherId }),
    };
    ancestors.push({ id: p.id, ...parents });
    rememberLineName(state, p);
    const direction = emigrated.get(p.id);
    if (direction !== undefined && p.sex !== undefined) {
      emigrants.push({ id: p.id, sex: p.sex, bornDay: p.bornDay, direction, ...parents });
    }
  }
  const parents = new Set<number>();
  for (const p of state.people) {
    if (p.motherId !== undefined) parents.add(p.motherId);
    if (p.fatherId !== undefined) parents.add(p.fatherId);
  }
  const kept = ancestors.filter((a) => parents.has(a.id)).sort((a, b) => a.id - b.id);
  if (kept.length > 0 || state.ancestors !== undefined) state.ancestors = kept;
  const keptEmigrants = emigrants
    .filter((e) => state.people.some((p) => parentChildOrSibling(p, e)))
    .sort((a, b) => a.id - b.id);
  if (keptEmigrants.length > 0 || state.emigrants !== undefined) state.emigrants = keptEmigrants;
}

/**
 * Má člověk blízké příbuzné ve vsi ve směru `direction` (kinship.md – kvůli válce, war.md: muži
 * s příbuznými v cílové vsi útočit nechtějí)? Ano, když odtamtud sám přišel (jsou tam jeho rodiče
 * a sourozenci), když se tam vdala jeho matka, sestra nebo dcera (rodič, sourozenec, dítě), nebo
 * když odtamtud je jeho žena / manžel, případně se tam vdal její rodič nebo sourozenec.
 */
export function hasCloseKinIn(
  state: VillageState,
  personId: number,
  direction: NeighborDirection,
): boolean {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return false;
  if (person.origin === direction) return true;
  const there = (state.emigrants ?? []).filter((e) => e.direction === direction);
  if (there.some((e) => parentChildOrSibling(person, e))) return true;
  const spouse = spouseOf(state, person);
  if (!spouse) return false;
  if (spouse.origin === direction) return true;
  return there.some(
    (e) => e.id === spouse.motherId || e.id === spouse.fatherId || sharesParent(spouse, e),
  );
}

/** Věkový rozdíl dvou lidí v letech (podle data narození). */
export function ageGapYears(a: Person, b: Person): number {
  return Math.abs(a.bornDay - b.bornDay) / DAYS_PER_YEAR;
}

/**
 * Starší ves (lidé bez pohlaví – kinship.md, Pohlaví): jednou se doplní deterministicky. V každé
 * domácnosti od nejstaršího střídavě muž, žena, muž… – dvojice v domě jsou tak muž a žena; pak
 * manželé z dnešních párů: každý muž od 16 let (od nejstaršího) s nejstarší dosud neprovdanou ženou
 * od 16 let v témže domě, jsou-li od sebe nejvýš MARRIAGE.maxAgeGapYears. Rodiče zůstanou neznámí
 * (= nepříbuzní). Ves, ve které všichni pohlaví mají, se vrací beze změny (týž objekt) – převod je
 * idempotentní, příznak „převedeno“ nepotřebuje.
 */
export function withKinship(state: VillageState, day: number = state.lastDay): VillageState {
  if (state.people.every((p) => p.sex !== undefined)) return state;
  const next = cloneState(state);
  const households = new Map<number, Person[]>();
  for (const p of next.people)
    households.set(p.dwellingId, [...(households.get(p.dwellingId) ?? []), p]);
  const byAge = (a: Person, b: Person): number => a.bornDay - b.bornDay || a.id - b.id;
  for (const id of [...households.keys()].sort((a, b) => a - b)) {
    const members = [...(households.get(id) ?? [])].sort(byAge);
    const missing = members.filter((p) => p.sex === undefined);
    missing.forEach((p, i) => {
      p.sex = (i % 2 === 0 ? 'male' : 'female') satisfies Sex;
    });
    const grown = (p: Person): boolean => ageYears(p.bornDay, day) >= AGE.fertile;
    const free = (p: Person): boolean => p.spouseId === undefined && grown(p);
    const women = members.filter((p) => p.sex === 'female' && free(p));
    for (const man of members.filter((p) => p.sex === 'male' && free(p))) {
      const wife = women.find(
        (w) => w.spouseId === undefined && ageGapYears(man, w) <= MARRIAGE.maxAgeGapYears,
      );
      if (!wife) continue;
      man.spouseId = wife.id;
      wife.spouseId = man.id;
    }
  }
  return next;
}

/**
 * Muži, ženy, děti a starší skupiny lidí a manželské páry (kinship.md – Co hráč vidí): muži
 * a ženy 14–44 let, chlapci a dívky do 13, starší 45+ podle pohlaví; páry = manželé, kteří oba
 * patří do skupiny. Lidé bez pohlaví (ves před převodem) se počítají jen do párů ne.
 */
export interface FamilyCounts {
  men: number;
  women: number;
  boys: number;
  girls: number;
  elderMen: number;
  elderWomen: number;
  couples: number;
}

export function familyCounts(people: readonly Person[], day: number): FamilyCounts {
  const counts: FamilyCounts = {
    men: 0,
    women: 0,
    boys: 0,
    girls: 0,
    elderMen: 0,
    elderWomen: 0,
    couples: 0,
  };
  const ids = new Set(people.map((p) => p.id));
  for (const p of people) {
    const male = p.sex === 'male';
    if (p.sex === undefined) continue;
    const group = ageGroup(p, day);
    if (group === 'child') counts[male ? 'boys' : 'girls']++;
    else if (group === 'adult') counts[male ? 'men' : 'women']++;
    else counts[male ? 'elderMen' : 'elderWomen']++;
    if (male && p.spouseId !== undefined && ids.has(p.spouseId)) counts.couples++;
  }
  return counts;
}
