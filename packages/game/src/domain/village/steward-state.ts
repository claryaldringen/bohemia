import { cloneState } from './clone';
import type { StewardState } from './types-steward';
import type { VillageState } from './types-state';

// Stav správce vsi (steward.md – Stav správce, Převod jednou a idempotentně).

/** Nový stav správce od dne `day`. */
export function newSteward(day: number, on: boolean): StewardState {
  return { on, sinceDay: day, built: [] };
}

/**
 * Převod: ves bez `steward` ho dostane vypnutý (i ves syna před fází 3 – hráč ji řídil sám).
 * Jednou a idempotentně – ves, která stav má, se vrací beze změny (týž objekt).
 */
export function withSteward(state: VillageState): VillageState {
  if (state.steward !== undefined) return state;
  const next = cloneState(state);
  next.steward = newSteward(next.lastDay, false);
  return next;
}

export function isStewardOn(state: VillageState): boolean {
  return state.steward?.on === true;
}

/** Zapíše značku „postavil správce“ (mutuje `state`). */
export function markStewardBuilt(state: VillageState, id: number): void {
  const steward = (state.steward ??= newSteward(state.lastDay, false));
  if (!steward.built.includes(id)) steward.built.push(id);
}

export function isStewardBuilt(state: VillageState, id: number): boolean {
  return state.steward?.built.includes(id) === true;
}

/** Přepne správce ke dni `day` (mutuje `state`); stejná hodnota den nemění. */
export function setStewardOn(state: VillageState, day: number, on: boolean): void {
  const steward = (state.steward ??= newSteward(day, on));
  if (steward.on === on) return;
  steward.on = on;
  steward.sinceDay = day;
}
