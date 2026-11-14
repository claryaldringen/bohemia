import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { HIVES } from '../rules/rules-wares';
import type { HerdSpecies, VillageState, WaresState } from '../types';
import { hivesDay } from './hives';

const EPSILON = 1e-9;

/** Zboží vsi; vznikne líně při prvním přírůstku (hides-honey.md). Mutuje stav. */
export function ensureWares(state: VillageState): WaresState {
  return (state.wares ??= { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0 });
}

/** Přibyly kůže (skot, kozy, prasata, voli, zvěř z lovu); nulový přírůstek stav nezakládá. */
export function addHides(state: VillageState, count: number): void {
  if (count <= EPSILON) return;
  ensureWares(state).hides += count;
}

/** Přibyly kožešiny z lovu a ok (zajíc, liška). */
export function addWildFurs(state: VillageState, count: number): void {
  if (count <= EPSILON) return;
  ensureWares(state).wildFurs += count;
}

/** Porážka dá zboží: ovce kožešinu, koza, prase a kráva kůži (hides-honey.md – Porážka). */
export function addSlaughterWares(state: VillageState, species: HerdSpecies, heads: number): void {
  if (heads <= EPSILON) return;
  if (species === 'sheep') ensureWares(state).sheepFurs += heads;
  else addHides(state, heads);
}

/** Včely létají od května do září (HIVES.fromMonth–toMonth). */
export function beesFlying(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return month >= HIVES.fromMonth && month <= HIVES.toMonth;
}

/** Zboží vsi za den: zatím jen med a vosk z klátů (volá `storesAndHerdsDay`). */
export function waresDay(state: VillageState, day: number, landscape: Landscape | null): void {
  // krajina je v podpisu pro další kroky (brtě, oka) – klát ji nepotřebuje
  void landscape;
  hivesDay(state, day);
}
