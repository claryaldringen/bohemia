import { createRandom, deriveSeed, type Random } from '../../landscape/random';
import { isDisused } from '../buildings/disused';
import { cloneState } from '../core/clone';
import { LODGE, MASON_CRAFTS, MASTER_NAMES, MASTER_ORIGIN } from '../rules';
import type { LodgeArrival, MasonCraft, MasonryCircle, Person, VillageState } from '../types';
import { lacksLord } from './appoint-lord';
import { displacedCount } from './displaced';
import { rodBaptized } from './faith';
import { villageManorId } from './manor';

// Stavební huť – pozvání a příchod mistrů (stone-masonry.md – Stavební huť). Mistři a kněz jsou
// obyčejné osoby vsi (`Person.mason`, `Person.priest`): jedí ze zásob vsi, ale se vsí nepracují.

const DAYS_PER_YEAR = 365.25;

/** Proč huť nejde pozvat (`'ok'` = jde) – jediné místo pravidla, texty dělá use-case. */
export type InviteLodgeCheck = 'ok' | 'not-baptized' | 'already' | 'no-lord';

/** Proč mistra nejde pozvat. */
export type InviteMasterCheck = 'ok' | 'no-lodge' | 'present';

/**
 * Smí vojvoda pozvat huť (stone-masonry.md – Kdo zve)? Rod musí být pokřtěný (`rodBaptized`), ves
 * musí mít vojvodu, a huť ani pozvání ještě nejsou (`'already'`).
 */
export function canInviteLodge(state: VillageState, day: number): InviteLodgeCheck {
  // `day` – podpis drží místo pro pozdější podmínku podle dne (zatím žádná)
  void day;
  if (state.lodge !== undefined) return 'already';
  if (!rodBaptized(state)) return 'not-baptized';
  if (lacksLord(state)) return 'no-lord';
  return 'ok';
}

/** Pozve huť okruhu `circle` – pět mistrů dorazí za `LODGE.arrivalDays` dní (vstup nemění). */
export function inviteLodge(state: VillageState, circle: MasonryCircle, day: number): VillageState {
  return {
    ...state,
    lodge: {
      circle,
      invitedDay: day,
      arriving: MASON_CRAFTS.map((role) => ({ role, day: day + LODGE.arrivalDays })),
    },
  };
}

/** Je obor `craft` obsazený mistrem ve vsi, nebo mistr už cestuje? */
function craftTaken(state: VillageState, craft: MasonCraft): boolean {
  return (
    state.people.some((p) => p.mason === craft) ||
    (state.lodge?.arriving ?? []).some((a) => a.role === craft)
  );
}

/** Smí vojvoda pozvat mistra oboru `craft` – huť je pozvaná a obor chybí. */
export function canInviteMaster(state: VillageState, craft: MasonCraft): InviteMasterCheck {
  if (state.lodge === undefined) return 'no-lodge';
  return craftTaken(state, craft) ? 'present' : 'ok';
}

/** Pozve chybějícího mistra oboru `craft` stejného okruhu (dorazí za `LODGE.arrivalDays`). */
export function inviteMaster(state: VillageState, craft: MasonCraft, day: number): VillageState {
  const lodge = state.lodge;
  if (lodge === undefined || canInviteMaster(state, craft) !== 'ok') return state;
  const arriving: LodgeArrival[] = [
    ...(lodge.arriving ?? []),
    { role: craft, day: day + LODGE.arrivalDays },
  ];
  return { ...state, lodge: { ...lodge, arriving } };
}

/** Mistr a kněz nepracují na poli ani ve vsi, jen jedí (stone-masonry.md – Mezi stavbami čekají). */
export function isLodgeIdle(person: Person): boolean {
  return person.mason !== undefined || person.priest === true;
}

/** Kdo ve vsi pracuje se vsí: bez mistrů a kněze; bez nich vrací týž seznam. */
export function withoutLodgeIdle<T extends Person>(people: readonly T[]): readonly T[] {
  return people.some(isLodgeIdle) ? people.filter((p) => !isLodgeIdle(p)) : people;
}

/** První prázdné obydlí v provozu bez dílny (nejnižší id), jinak undefined. */
function emptyDwellingId(state: VillageState): number | undefined {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings
    .filter((d) => !occupied.has(d.id) && !isDisused(d) && d.workshop === undefined)
    .sort((a, b) => a.id - b.id)[0]?.id;
}

/** Hostitel pro mistra bez obydlí: dvorec vojvody, jinak první obydlí v provozu. */
function hostDwellingId(state: VillageState): number | undefined {
  const manor = villageManorId(state);
  if (manor !== null && state.dwellings.some((d) => d.id === manor)) return manor;
  return state.dwellings.filter((d) => !isDisused(d)).sort((a, b) => a.id - b.id)[0]?.id;
}

/** Jméno mistra podle okruhu – z jmen, která ve vsi ještě nejsou, jinak ze všech. */
function masterName(state: VillageState, circle: MasonryCircle, random: Random): string {
  const names = MASTER_NAMES[circle];
  const used = new Set(state.people.map((p) => p.name));
  const free = names.filter((n) => !used.has(n));
  const pool = free.length > 0 ? free : names;
  return pool[Math.floor(random.next() * pool.length)]!;
}

/** Příchozí usadí (mutuje stav); vrací, jestli se ve vsi našlo místo. */
export function settleArrival(
  state: VillageState,
  role: MasonCraft | 'priest',
  day: number,
  random: Random,
): boolean {
  // volné obydlí, jen když na něj nečeká vystěhovaná domácnost (ta má přednost – displaced.ts)
  const own = displacedCount(state) === 0 ? emptyDwellingId(state) : undefined;
  const host = own ?? hostDwellingId(state);
  if (host === undefined) return false;
  const circle = state.lodge?.circle;
  const age = LODGE.masterAge.min + random.next() * (LODGE.masterAge.max - LODGE.masterAge.min + 1);
  const person: Person = {
    id: state.nextId++,
    bornDay: day - Math.floor(age * DAYS_PER_YEAR),
    dwellingId: host,
    sex: 'male',
    faith: 'christian',
    ...(circle === undefined ? {} : { origin: MASTER_ORIGIN[circle] }),
  };
  if (role === 'priest') person.priest = true;
  else {
    person.mason = role;
    if (circle !== undefined) person.name = masterName(state, circle, random);
  }
  state.people.push(person);
  // bez volného obydlí je host ve dvorci a nové obydlí osídlí přednostně (`rehouseDisplaced`)
  if (own === undefined) {
    state.displaced = [
      ...(state.displaced ?? []),
      { household: host, day, people: [{ id: person.id, host }] },
    ];
  }
  state.chronicle.push({
    day,
    kind: 'newcomer',
    direction: circle === undefined ? 'S' : MASTER_ORIGIN[circle],
    group: 'man',
    people: 1,
    dwellingId: host,
  });
  return true;
}

/**
 * Do vsi přijde mistr oboru `role` (nebo kněz) – muž z ciziny, svobodný, křesťan, ve věku
 * `LODGE.masterAge`, se jménem podle okruhu huti (kněz bez jména). Dostane vlastní domácnost: volné
 * obydlí, jinak je host ve dvorci vojvody a první nové obydlí patří jemu (`state.displaced`).
 * Ves bez obydlí nikoho nepřijme (vrací týž stav). Vstup nemění.
 */
export function arriveFromAbroad(
  state: VillageState,
  role: MasonCraft | 'priest',
  day: number,
  random: Random,
): VillageState {
  const next = cloneState(state);
  return settleArrival(next, role, day, random) ? next : state;
}

/**
 * Krok dne (mutuje stav): příchozí mistři a kněží s termínem do dneška se usadí. Los ze seedu vsi,
 * oboru a dne příchodu – výsledek nezávisí na kouscích dopočtu. Kdo se nemá kam usadit (ves bez
 * obydlí), čeká na cestě dál.
 */
export function lodgeArrivalsDay(state: VillageState, day: number): void {
  const lodge = state.lodge;
  if (lodge?.arriving === undefined) return;
  const due = lodge.arriving.filter((a) => a.day <= day);
  if (due.length === 0) return;
  const waiting = lodge.arriving.filter((a) => a.day > day);
  for (const a of due) {
    const random = createRandom(deriveSeed(state.seed, `lodge:${a.role}:${a.day}`));
    if (!settleArrival(state, a.role, day, random)) waiting.push(a);
  }
  const rest = { circle: lodge.circle, invitedDay: lodge.invitedDay };
  const counters = {
    ...(lodge.hungryDays === undefined ? {} : { hungryDays: lodge.hungryDays }),
    ...(lodge.unhappyDays === undefined ? {} : { unhappyDays: lodge.unhappyDays }),
  };
  state.lodge = { ...rest, ...counters, ...(waiting.length > 0 ? { arriving: waiting } : {}) };
}

/** Počet mistrů ve vsi (pro rozhraní a testy). */
export function masterCount(state: VillageState): number {
  return state.people.filter((p) => p.mason !== undefined).length;
}
