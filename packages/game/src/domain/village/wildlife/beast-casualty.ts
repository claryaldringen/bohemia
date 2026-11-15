// Šelma napadla muže výjezdu (lord-control.md – Nebezpečí, bod 3; wildlife.md – Nebezpečí pro
// lidi): schránka vsi použije událost `journey-casualty`. Čísla losu jsou čísla lovu (`HUNT_RISK`)
// a los je na výjezdu (`predatorDay`); ves už jen zapíše následek.
import { deathWho } from '../people/estate';
import { removePeople } from '../people/kinship';
import { ageGroup, ageYears } from '../people/people';
import { HUNT_RISK } from '../rules/rules-wildlife';
import type { ChronicleEvent, VillageState } from '../types';

/**
 * Následek útoku šelmy na muže výjezdu (mutuje stav; bez osoby ve vsi nic – událost se doručí
 * i po druhé a je idempotentní): zraněný 60 dní nepracuje, necvičí ani neloví jako po lovu,
 * zabitý zemře (kronika „zabil na cestě“, nepohřbí se – zůstal v lese) a nástupnictví řeší
 * `dynastyDay` týž den. Zranění se nevrací do kroniky – hráč ho vidí na muži.
 */
export function applyJourneyCasualty(
  state: VillageState,
  day: number,
  body: { personId: number; outcome: 'wounded' | 'dead'; by: 'bear' | 'wolves' },
): ChronicleEvent[] {
  const p = state.people.find((x) => x.id === body.personId);
  if (!p) return [];
  if (body.outcome === 'wounded') {
    p.injuredUntilDay = Math.max(p.injuredUntilDay ?? 0, day + 1 + HUNT_RISK.injuryDays);
    return [];
  }
  const event: ChronicleEvent = {
    day,
    kind: 'death',
    group: ageGroup(p, day),
    age: ageYears(p.bornDay, day),
    cause: 'beast',
    by: body.by,
    ...deathWho(state, p, day),
  };
  removePeople(state, new Set([p.id]));
  return [event];
}
