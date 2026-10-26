import { ridingHorses } from './horses';
import { HORSE_SHOEING } from './rules';
import type { VillageState } from './types';

// Termín kování jezdeckých koní (horses.md – Kování) – lehký modul bez závislosti na nákupu
// u sousedů, ať ho smí číst výcvik koní a jízdy (`horse-riders.ts`, `lord.ts`) bez cyklu modulů.

/** Den dalšího kování, nebo null (ves bez jezdeckých koní). */
export function nextShoeingDay(state: Pick<VillageState, 'shoeing'>): number | null {
  return state.shoeing ? state.shoeing.lastDay + HORSE_SHOEING.everyDays : null;
}

/** Je den kování – termín nastal nebo prošel a ves má jezdecké koně? */
export function shoeingDue(state: VillageState, day: number): boolean {
  const next = nextShoeingDay(state);
  return next !== null && day >= next && ridingHorses(state, day).length > 0;
}

/**
 * Termín kování nastal a koně nejsou podkutí (po kroku kování dne) – nejezdí a výcvik nepostupuje
 * (horses.md – Kování).
 */
export function isUnshod(state: VillageState, day: number): boolean {
  return shoeingDue(state, day);
}
