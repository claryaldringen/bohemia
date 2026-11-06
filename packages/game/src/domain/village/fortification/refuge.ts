import { FORTIFICATIONS } from '../rules-fortifications';
import type { GridGeometry } from '../square-grid';
import { fortificationArea, fortificationOutline } from './outline';
import type { Fortification } from './types';

// Útočiště (fortifications.md – Útočiště): kdo stihne doběhnout, schová se i s dobytkem, dokud
// je místo; plocha z nakresleného obvodu. Čistá doména pro válku.

/** Plocha útočiště v m² – uvnitř vnitřní hrany pásu; bez platné plochy 0. */
export function refugeCapacity(
  geo: GridGeometry,
  fort: Pick<Fortification, 'cells' | 'grid' | 'kind'>,
): number {
  const area = fortificationArea(fort.cells, fort.grid, geo);
  if ('error' in area) return 0;
  return fortificationOutline(area, fort.kind).innerAreaM2;
}

/** Kdo přichází do útočiště. */
export type ArrivalKind = 'adult' | 'child' | 'horse' | 'ox' | 'cow' | 'sheep' | 'goat' | 'pig';

/** Skupina příchozích téhož druhu, která doběhla v taktu `tick`. */
export interface Arrival {
  kind: ArrivalKind;
  count: number;
  /** Takt příchodu; po zavření brány se dovnitř nikdo nedostane. */
  tick: number;
  /** Lidé z domů uvnitř obvodu – zásoby jejich domů jsou v bezpečí a nic nenesou. */
  homeInside?: boolean;
}

export interface RefugeResult {
  admitted: Arrival[];
  /** Kdo zůstal venku – po zavření brány nebo bez místa. */
  outside: Arrival[];
  capacityM2: number;
  usedM2: number;
  /** Zásoby přinesené zvenku (kg): dospělý 25, dítě 10. */
  carriedKg: number;
}

/** Přednost při nedostatku místa: lidé, koně a voli, skot, drobný dobytek. */
function priority(kind: ArrivalKind): number {
  if (kind === 'adult' || kind === 'child') return 0;
  if (kind === 'horse' || kind === 'ox') return 1;
  if (kind === 'cow') return 2;
  return 3;
}

/** Plocha jednoho kusu v m². */
function spaceOf(kind: ArrivalKind): number {
  const r = FORTIFICATIONS.refuge;
  if (priority(kind) === 0) return r.m2PerPerson;
  return priority(kind) === 3 ? r.m2PerHead * r.smallStockHead : r.m2PerHead;
}

/**
 * Kdo se do útočiště vejde (Útočiště – Upřesnění): příchozí po `gateCloseTick` zůstanou venku,
 * zbytek se řadí podle přednosti (lidé → koně a voli → skot → drobný dobytek), uvnitř skupiny
 * podle příchodu, a plní se do vyčerpání místa. Zásoby: lidé zvenku nesou 25 / 10 kg, domácí nic.
 */
export function refugeAdmit(
  capacityM2: number,
  arrivals: readonly Arrival[],
  gateCloseTick: number,
): RefugeResult {
  const admitted: Arrival[] = [];
  const outside: Arrival[] = [];
  const open: Arrival[] = [];
  for (const a of arrivals) (a.tick > gateCloseTick ? outside : open).push({ ...a });
  open.sort((a, b) => priority(a.kind) - priority(b.kind) || a.tick - b.tick);
  let left = capacityM2;
  let carriedKg = 0;
  for (const a of open) {
    const each = spaceOf(a.kind);
    const fit = Math.min(a.count, Math.max(0, Math.floor(left / each + 1e-9)));
    left -= fit * each;
    if (fit > 0) admitted.push({ ...a, count: fit });
    if (fit < a.count) outside.push({ ...a, count: a.count - fit });
    if (!a.homeInside) {
      if (a.kind === 'adult') carriedKg += fit * FORTIFICATIONS.refuge.carryKgAdult;
      if (a.kind === 'child') carriedKg += fit * FORTIFICATIONS.refuge.carryKgChild;
    }
  }
  return { admitted, outside, capacityM2, usedM2: capacityM2 - left, carriedKg };
}
