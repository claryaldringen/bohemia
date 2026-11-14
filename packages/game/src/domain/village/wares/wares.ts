import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { HIVES } from '../rules/rules-wares';
import type { HerdSpecies, VillageState, WaresState } from '../types';
import { finishCuring, setWaresNeed } from './hides';
import { hivesDay } from './hives';

const EPSILON = 1e-9;

/** Zboží vsi; vznikne líně při prvním přírůstku (hides-honey.md). Mutuje stav. */
export function ensureWares(state: VillageState): WaresState {
  return (state.wares ??= { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 0, waxKg: 0 });
}

/** Přibyly kůže skotu (krávy, voli) nebo jelení; nulový přírůstek stav nezakládá. */
export function addHides(state: VillageState, count: number): void {
  if (count <= EPSILON) return;
  ensureWares(state).hides += count;
}

/** Přibyly kozí, prasečí nebo divočákovy kůže – menší, zpracují se rychleji (`HIDES`). */
export function addSmallHides(state: VillageState, count: number): void {
  if (count <= EPSILON) return;
  const wares = ensureWares(state);
  wares.smallHides = (wares.smallHides ?? 0) + count;
}

/** Přibyly kožešiny z lovu a ok (zajíc, liška). */
export function addWildFurs(state: VillageState, count: number): void {
  if (count <= EPSILON) return;
  ensureWares(state).wildFurs += count;
}

/** Porážka dá zboží: ovce kožešinu, kráva kůži skotu, koza a prase menší kůži (hides-honey.md – Porážka). */
export function addSlaughterWares(state: VillageState, species: HerdSpecies, heads: number): void {
  if (heads <= EPSILON) return;
  if (species === 'sheep') ensureWares(state).sheepFurs += heads;
  else if (species === 'cow') addHides(state, heads);
  else addSmallHides(state, heads);
}

/** Včely létají od května do září (HIVES.fromMonth–toMonth). */
export function beesFlying(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return month >= HIVES.fromMonth && month <= HIVES.toMonth;
}

/**
 * Zboží vsi ráno (volá `storesAndHerdsDay` po porážce): hotové várky kůží a kožešin, med a vosk
 * z klátů a 1. 11. roční potřeba domácností (hides-honey.md). Práce je až ve `waresWorkDay`.
 */
export function waresDay(state: VillageState, day: number, landscape: Landscape | null): void {
  // krajina je v podpisu pro další kroky (brtě) – klát ani kůže ji nepotřebují
  void landscape;
  finishCuring(state, day);
  hivesDay(state, day);
  setWaresNeed(state, day);
}
