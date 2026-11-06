// Povýšení vesničana (vassalage.md – Povýšení vesničana; Martin: „Ano“): vesničan s rodinou se
// přestěhuje do vsi bez vojvody a založí NPC šlechtický rod. Čisté funkce bez I/O; stěhování
// rodiny používá stejné kroky jako dosazení vojvody (`departAppointee`, `settleAppointee`).
import { isLineMan } from '../village/dynasty';
import { departAppointee, settleAppointee, type AppointeeParty } from '../village/appoint-lord';
import { ageYears } from '../village/people';
import type { ChronicleEvent, Person, VillageState } from '../village/types';
import { VASSALAGE } from './rules-vassalage';

/** Důvody odmítnutí povýšení (hráči se ukazují u kurzoru). */
export const ENNOBLE_REASONS = {
  noPerson: 'Tenhle člověk ve vsi není.',
  notMale: 'Povýšit jde jen muže.',
  tooYoung: 'Povýšit jde muže od 16 let.',
  lineMan: 'Muže tvého rodu povýšit nejde.',
  alreadyNoble: 'Tenhle muž už je šlechtic.',
  perYear: 'Letos už jsi povýšil.',
  targetTaken: 'Tahle ves vojvodu nepotřebuje.',
  noTarget: 'Cílová ves neexistuje.',
} as const;

/**
 * Smí být vesničan `personId` ke dni `day` povýšen? Muž od `VASSALAGE.ennoble.fromAge` let, ne muž
 * rodu vojvody (`line`) ani už povýšený. Vrací důvod odmítnutí, nebo null.
 */
export function checkEnnoble(
  state: Pick<VillageState, 'people'>,
  personId: number,
  day: number,
): string | null {
  const person = state.people.find((p) => p.id === personId);
  return person ? ennobleBlock(person, day) : ENNOBLE_REASONS.noPerson;
}

/** Důvod, proč člověka povýšit nejde (muž od 16 let, ne z rodu vojvody, ne šlechtic), nebo null. */
export function ennobleBlock(person: Person, day: number): string | null {
  if (person.sex !== 'male') return ENNOBLE_REASONS.notMale;
  if (isLineMan(person)) return ENNOBLE_REASONS.lineMan;
  if (person.noble) return ENNOBLE_REASONS.alreadyNoble;
  if (ageYears(person.bornDay, day) < VASSALAGE.ennoble.fromAge) return ENNOBLE_REASONS.tooYoung;
  return null;
}

/** Herní rok rodu ke dni (pro „nejvýš jeden za herní rok“). */
export function ennobleYear(day: number): number {
  return Math.floor(day / 365.25);
}

/**
 * Muž odejde se ženami a svobodnými dětmi (stejně jako dosazený vojvoda) – vrací novou starou ves
 * a družinu pro schránku cílové vsi.
 */
export function departNoble(
  state: VillageState,
  day: number,
  personId: number,
  toVillageName: string,
): { state: VillageState; party: AppointeeParty } {
  return departAppointee(state, day, personId, toVillageName);
}

/**
 * Družina povýšeného dorazila (mutuje stav): všichni dostanou `noble`, muž a jeho synové `line`
 * (cvičí jako synové vojvody), muž se usadí ve dvorci jako vojvoda vsi bez vojvody. Do vsi se
 * zapíše `nobles`. Vrací zápisy do kroniky.
 */
export function settleNoble(
  state: VillageState,
  day: number,
  party: AppointeeParty,
  houseId: string,
): ChronicleEvent[] {
  for (const p of party.people) {
    p.noble = { houseId };
    if (p.sex === 'male' && (p.id === party.manId || p.fatherId === party.manId)) p.line = true;
  }
  const order = party.people.map((p) => p.id).sort((a, b) => a - b);
  const headId = state.nextId + order.indexOf(party.manId);
  const chronicle = settleAppointee(state, day, party);
  state.nobles = { houseId, headId };
  return chronicle;
}
