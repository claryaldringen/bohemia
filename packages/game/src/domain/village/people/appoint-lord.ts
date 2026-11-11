// Dosazení vojvody do vsi bez muže rodu (seniorate.md – Ves bez muže rodu – dosazení vojvody;
// Martin 2. 11. 2026: „Poslat muže rodu“, podrobnosti návrh Clauda): rod pošle do vsi bez vojvody
// nejstaršího vhodného muže z jiné vsi rodu s rodinou a jídlem. Čisté funkce bez I/O; stav vstupu
// nemění `appointCandidate` ani `departAppointee`, `settleAppointee` mutuje stav jako kroky dne.
import { cloneState } from '../core/clone';
import {
  isVillageAbandoned,
  isVillageTravelling,
  leavingFood,
  type LeavingFood,
} from './departure';
import { currentLord, isLineMan, isDynastyTracked, moveIntoManor, wivesOf } from './dynasty';
import { isVillageExtinct } from '../core/extinction';
import { removePeople } from './kinship';
import { villageManorId } from './manor';
import { ageYears } from './people';
import { APPOINT_LORD } from '../rules/rules-lord';
import { successorOf } from './succession';
import { ARRIVAL_HOME, rehomePeople } from './transfer-people';
import type { ChronicleEvent, Person, VillageState } from '../types';

/** Kolik posledních přesunů mužů rodu si ves pamatuje (`VillageState.lineMoves`). */
const LINE_MOVES_KEPT = 20;

/** Odkaz na osobu ve vsi (stejný tvar jako `PersonRef` rodů). */
interface PersonKey {
  villageId: string;
  personId: number;
}

/**
 * Cestující dosazený vojvoda: muž rodu, jeho manželky a svobodné děti (lidé s id z vsi, odkud
 * odešli) a jídlo, které nesou. JSON – putuje schránkou vsi (`lord-arrives`).
 */
export interface AppointeeParty {
  /** Číslo muže ve vsi, odkud odešel (v `people`). */
  manId: number;
  people: Person[];
  food: LeavingFood;
}

/** Ves se stavem pro výběr kandidáta. */
interface CandidateVillage {
  villageId: string;
  state: VillageState;
}

/** Ves s rodem, která se nesimuluje (vymřelá, opuštěná, na cestě), muže neposílá ani nepřijímá. */
function isLiving(state: VillageState): boolean {
  return !isVillageExtinct(state) && !isVillageAbandoned(state) && !isVillageTravelling(state);
}

/**
 * Ves je bez muže rodu a čeká na vojvodu: sleduje rod, vojvoda není a není nikdo, kdo by
 * nastoupil (`successorOf` ve vsi by našel muže rodu).
 */
export function lacksLord(state: VillageState): boolean {
  return isDynastyTracked(state) && currentLord(state) === undefined;
}

/**
 * Starší ves bez muže rodu (uložená před dosazením vojvody) dostane `awaitingLord` – jednou
 * a idempotentně (ves, která už čeká nebo vojvodu má, zůstane týž objekt). Den čekání je konec rodu
 * ve vsi (`dynasty.endedDay`), jinak poslední den dopočtu.
 */
export function withAwaitingLord(state: VillageState): VillageState {
  if (state.awaitingLord !== undefined || !isLiving(state)) return state;
  if (!lacksLord(state) || state.dynasty?.lordId !== null) return state;
  return {
    ...state,
    awaitingLord: { sinceDay: state.dynasty?.endedDay ?? state.lastDay },
  };
}

/**
 * Kandidát na vojvodu vsi `targetVillageId` ke dni `day` (seniorate.md – Kdo): nejstarší (nejdřív
 * narozený) muž rodu od `APPOINT_LORD.minAge` let v jiné živé vsi rodu, který není vojvodou své
 * vsi, jejím nástupcem (`successorOf`), ani nikdo z `exclude` (hráčův muž). Při shodě stáří nižší
 * id osoby, pak nižší id vsi. Bez kandidáta null (ves čeká, hledá se při každém dopočtu).
 */
export function appointCandidate(
  villages: readonly CandidateVillage[],
  targetVillageId: string,
  day: number,
  exclude: readonly PersonKey[],
): PersonKey | null {
  let best: { key: PersonKey; bornDay: number } | null = null;
  for (const { villageId, state } of villages) {
    // ves povýšeného vesničana (NPC rod) rodu hráče mužů nedává
    if (villageId === targetVillageId || !isLiving(state) || state.nobles) continue;
    const lord = currentLord(state);
    // bez vojvody není nástupce, kterého by si ves držela – čeká sama
    if (!lord) continue;
    const heir = successorOf(state, lord.id);
    for (const man of state.people) {
      if (!isLineMan(man) || man.bornDay > day) continue;
      if (ageYears(man.bornDay, day) < APPOINT_LORD.minAge) continue;
      if (man.id === lord.id || man.id === heir?.id) continue;
      if (exclude.some((e) => e.villageId === villageId && e.personId === man.id)) continue;
      const better =
        best === null ||
        man.bornDay < best.bornDay ||
        (man.bornDay === best.bornDay &&
          (man.id < best.key.personId ||
            (man.id === best.key.personId && villageId < best.key.villageId)));
      if (better) best = { key: { villageId, personId: man.id }, bornDay: man.bornDay };
    }
  }
  return best?.key ?? null;
}

/** Rodina muže: on, jeho manželky a jejich svobodné děti (kdekoli ve vsi). */
function familyOf(state: VillageState, man: Person): Person[] {
  const wives = wivesOf(state, man);
  const parents = new Set([man.id, ...wives.map((w) => w.id)]);
  const children = state.people.filter(
    (p) =>
      p.spouseId === undefined &&
      !parents.has(p.id) &&
      ((p.fatherId !== undefined && parents.has(p.fatherId)) ||
        (p.motherId !== undefined && parents.has(p.motherId))),
  );
  return [man, ...wives, ...children];
}

/**
 * Muž `personId` odejde se svou rodinou vládnout do vsi `toVillageName` (seniorate.md – Kdo jde
 * s ním): manželky a svobodné děti, jídlo, které unesou (25 kg na člověka od 7 let – `leavingFood`,
 * z každé zásoby stejný podíl, nejvýš co ves má). Lidé z vsi zmizí (rodokmen je zapamatuje jako
 * předky), kronika „odešel vládnout ve …“. Vrací novou starou ves (vstup nemění) a družinu.
 * RangeError, když muž ve vsi není.
 */
export function departAppointee(
  state: VillageState,
  day: number,
  personId: number,
  toVillageName: string,
): { state: VillageState; party: AppointeeParty } {
  const man = state.people.find((p) => p.id === personId);
  if (!man) throw new RangeError(`Muž ${personId} ve vsi není.`);
  const family = familyOf(state, man);
  const planned = leavingFood(state, family, day);
  const next = cloneState(state);
  // jídlo se bere ze zásob, které ves má (snopy ve výpočtu jako zrno) – nikdy víc než zbývá
  const take = (have: number, kg: number): number => Math.max(0, Math.min(kg, have));
  const food: LeavingFood = {
    grainKg: take(next.storesKg, planned.grainKg),
    meatKg: take(next.meatKg ?? 0, planned.meatKg),
    cheeseKg: take(next.cheeseKg ?? 0, planned.cheeseKg),
    legumesKg: take(next.legumesKg ?? 0, planned.legumesKg),
    applesKg: take(next.applesKg ?? 0, planned.applesKg),
  };
  next.storesKg -= food.grainKg;
  if (next.meatKg !== undefined) next.meatKg -= food.meatKg;
  if (next.cheeseKg !== undefined) next.cheeseKg -= food.cheeseKg;
  if (next.legumesKg !== undefined) next.legumesKg -= food.legumesKg;
  if (next.applesKg !== undefined) next.applesKg -= food.applesKg;
  const party: AppointeeParty = {
    manId: man.id,
    people: family.map((p) => ({ ...p })),
    food,
  };
  removePeople(next, new Set(family.map((p) => p.id)));
  next.chronicle.push({
    day,
    kind: 'lord-sent',
    villageName: toVillageName,
    ...(man.name === undefined ? {} : { name: man.name }),
  });
  return { state: next, party };
}

/**
 * Družina dorazila do vsi (mutuje stav): lidé dostanou nová místní id (`nextId`), vazby uvnitř
 * družiny se převedou, rodiče mimo družinu se zapomenou (jejich id patří jiné vsi), jídlo se přidá
 * do zásob a rodina se nastěhuje do dvorce (`moveIntoManor`). Ves bez vojvody tím dostane muže jako
 * vojvodu (`dynasty.lordId`, kronika rodu, konec čekání, kronika „Vojvodou je …“). Má-li ves
 * vojvodu už (dosazení přišlo pozdě – rozhodnutí návrhu Clauda: lidé už z domova odešli, tak je ves
 * přijme a neztratí je), muž jen žije v dvorci jako ostatní muži rodu (kronika
 * `line-arrived`). Vrací zápisy do kroniky vsi.
 */
export function settleAppointee(
  state: VillageState,
  day: number,
  party: AppointeeParty,
  fromVillageId?: string,
): ChronicleEvent[] {
  const { arrivals, idMap: ids } = rehomePeople(state, party.people);
  state.people.push(...arrivals);
  const manId = ids.get(party.manId)!;
  const man = state.people.find((p) => p.id === manId)!;
  moveIntoManor(state, man);
  // ves bez dvorce (bez obydlí) – příchozí zůstanou ve vsi v nejstarším obydlí, je-li
  const home = villageManorId(state) ?? state.dwellings[0]?.id;
  if (home !== undefined) {
    for (const p of arrivals) if (p.dwellingId === ARRIVAL_HOME) p.dwellingId = home;
  }
  const { food } = party;
  state.storesKg += food.grainKg;
  state.meatKg = (state.meatKg ?? 0) + food.meatKg;
  if (food.cheeseKg > 0) state.cheeseKg = (state.cheeseKg ?? 0) + food.cheeseKg;
  if (food.legumesKg > 0) state.legumesKg = (state.legumesKg ?? 0) + food.legumesKg;
  if (food.applesKg > 0) state.applesKg = (state.applesKg ?? 0) + food.applesKg;
  if (fromVillageId !== undefined) {
    const moves = [
      ...(state.lineMoves ?? []),
      { fromVillageId, fromPersonId: party.manId, personId: manId, day },
    ];
    state.lineMoves = moves.slice(-LINE_MOVES_KEPT);
  }
  const name = man.name === undefined ? {} : { name: man.name };
  const dynasty = state.dynasty;
  delete state.awaitingLord;
  if (!dynasty || !lacksLord(state)) return [{ day, kind: 'line-arrived', ...name }];
  delete state.nobles; // ves se vrací pod rod hráče
  dynasty.lordId = man.id;
  delete dynasty.endedDay;
  dynasty.lords.push({ id: man.id, ...name, fromDay: day });
  return [{ day, kind: 'lord', ...name }];
}
