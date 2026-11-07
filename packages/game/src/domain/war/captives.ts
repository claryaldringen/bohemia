import type { ChronicleEvent, VillageState } from '../village/types';
import { setStewardOn } from '../village/steward-state';

// Konec zajetí (war.md – Vzdaní, zajetí a výkupné): propuštěný zajatec jde domů mapu po mapě
// (příchod domů za 2 × vzdálenost dní), popravený umírá (`line-man-fell`). Tělo schránky
// `captive-returns` jde do obou vsí – každá použije svou stranu; opakování je neškodné.

/** Která strana zajetí událost dostává. */
export type CaptiveRole = 'home' | 'captor';

/** Tělo schránky `captive-returns`. */
export interface CaptiveReturns {
  role: CaptiveRole;
  /** Klíč zajetí (`<tažení>:<osoba>`). */
  prisonerId: string;
  personId: number;
}

/**
 * Zajatec se vrací (mutuje stav). Domovská ves: `away` zajetí zmizí (osoba je zase doma), zapnutého
 * správce kvůli zajetí vypne a zapíše návrat do kroniky. Ves věznitele: zajatec i jeho host zmizí.
 */
export function applyCaptiveReturns(
  state: VillageState,
  day: number,
  body: CaptiveReturns,
): ChronicleEvent[] {
  if (body.role === 'captor') {
    releasePrisoner(state, body.prisonerId);
    return [];
  }
  const p = state.people.find((x) => x.id === body.personId);
  if (p?.away?.kind !== 'captive' || p.away.refId !== body.prisonerId) return [];
  delete p.away;
  if (state.steward?.byCaptivity === true) {
    setStewardOn(state, day, false);
    delete state.steward.byCaptivity;
  }
  return [{ day, kind: 'people-back', away: 'captive', people: 1 }];
}

/** Zajatec z vsi věznitele pryč (zapsaný i jako host); neznámý se přeskočí. */
export function releasePrisoner(state: VillageState, prisonerId: string): void {
  const prisoner = state.prisoners?.find((x) => x.id === prisonerId);
  if (!prisoner) return;
  const rest = (state.prisoners ?? []).filter((x) => x.id !== prisonerId);
  if (rest.length === 0) delete state.prisoners;
  else state.prisoners = rest;
  if (state.guests === undefined) return;
  const guests = state.guests.filter(
    (g) =>
      !(
        g.kind === 'captive' &&
        g.ref.villageId === prisoner.ref.villageId &&
        g.ref.personId === prisoner.ref.personId
      ),
  );
  if (guests.length === 0) delete state.guests;
  else state.guests = guests;
}
