import { dateOfDayIndex } from '../../calendar';
import { SLAUGHTER_DAY } from '../core/diet';
import { isFoalByAge, villageHorses } from '../livestock/horses';
import { householdCount } from '../livestock/livestock';
import { trainedOxen } from '../livestock/oxen';
import { ageGroup } from '../people/people';
import { OXEN } from '../rules/rules-livestock';
import { HIDES } from '../rules/rules-wares';
import { SMALL_GAME } from '../rules/rules-wildlife';
import type { HidesFurs, VillageState, WaresState } from '../types';
import { ensureWares } from './wares';

// Zpracování kůží a kožešin v domácnosti (hides-honey.md – Zpracování v domácnosti): roční
// potřeba 1. 11., práce od listopadu do března ze zbytku práce vsi, hotové po `HIDES.cureDays`.

const EPSILON = 1e-9;

/** Kozí a prasečí kůže v kůžích skotu – přepočet plochou usně. */
const SMALL_HIDE = HIDES.smallHideM2 / HIDES.hideM2;

/** Domácnosti zpracovávají od listopadu do března (`HIDES.fromMonth`–`toMonth`). */
export function curingSeason(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return month >= HIDES.fromMonth || month <= HIDES.toMonth;
}

/**
 * Roční spotřeba vsi (kůže v kůžích skotu, kožešiny v kusech): obuv na lidi, řemení a pouzdra na
 * domácnosti, postroje na páry vycvičených volů a dospělé koně; kožichy na dospělé a děti, čepice
 * a rukavice na každého.
 */
export function yearlyNeed(state: VillageState, day: number): HidesFurs {
  const people = state.people.length;
  const children = state.people.filter((p) => ageGroup(p, day) === 'child').length;
  const horses = villageHorses(state).filter((h) => !isFoalByAge(h, day)).length;
  const harness = trainedOxen(state, day) / OXEN.teamSize + horses;
  return {
    hides:
      people / HIDES.peoplePerShoeHide +
      householdCount(state) / HIDES.householdYearsPerHide +
      harness / HIDES.harnessYearsPerHide,
    furs:
      (people - children) * HIDES.coatFursPerAdult +
      children * HIDES.coatFursPerChild +
      people * HIDES.capFursPerPerson,
  };
}

/** V den porážky (`SLAUGHTER_DAY`, 1. 11.) nastaví roční potřebu; nedodělek loňska propadá. */
export function setWaresNeed(state: VillageState, day: number): void {
  const { month, day: dayOfMonth } = dateOfDayIndex(day);
  if (month !== SLAUGHTER_DAY.month || dayOfMonth !== SLAUGHTER_DAY.day) return;
  ensureWares(state).need = yearlyNeed(state, day);
}

/** Várky hotové dnes nebo dřív: hotový výrobek ubere potřebu domácností (mutuje stav). */
export function finishCuring(state: VillageState, day: number): void {
  const wares = state.wares;
  if (!wares?.curing) return;
  const left = wares.curing.filter((batch) => batch.doneDay > day);
  if (left.length === wares.curing.length) return;
  for (const batch of wares.curing) {
    if (batch.doneDay > day || !wares.need) continue;
    wares.need.hides = Math.max(0, wares.need.hides - batch.hides);
    wares.need.furs = Math.max(0, wares.need.furs - batch.furs);
  }
  if (left.length > 0) wares.curing = left;
  else delete wares.curing;
}

/** Potřeba, na kterou ještě nic není v práci. */
function openNeed(wares: WaresState): HidesFurs {
  let hides = wares.need?.hides ?? 0;
  let furs = wares.need?.furs ?? 0;
  for (const batch of wares.curing ?? []) {
    hides -= batch.hides;
    furs -= batch.furs;
  }
  return { hides: Math.max(0, hides), furs: Math.max(0, furs) };
}

/**
 * Domácnosti vezmou do práce kůže a kožešiny z práce `labor` (člověkodny; mutuje stav): nejvýš do
 * potřeby, na kterou nic není v práci, do zásoby a do hodin práce, zlomky jsou dovolené. Napřed
 * kůže – skotu (méně práce na plochu), pak kozí a prasečí; pak kožešiny – ovčí a teprve když
 * nestačí, z lovu. Vzaté ubyde ze zásoby a jde do várky hotové za `HIDES.cureDays`. Mimo
 * listopad–březen nic. Vrací spotřebované člověkodny.
 */
export function processHidesDay(state: VillageState, day: number, labor: number): number {
  const wares = state.wares;
  if (!wares?.need || labor <= EPSILON || !curingSeason(day)) return 0;
  const open = openNeed(wares);
  const start = labor * SMALL_GAME.hoursPerManDay;
  let hours = start;
  /** Vezme do práce kusy jednoho druhu; vrací kusy. `units` = kolik potřeby kus kryje. */
  const take = (stock: number, need: number, units: number, hoursEach: number): number => {
    const pieces = Math.max(0, Math.min(stock, need / units, hours / hoursEach));
    if (pieces <= EPSILON) return 0;
    hours = Math.max(0, hours - pieces * hoursEach);
    return pieces;
  };
  const big = take(wares.hides, open.hides, 1, HIDES.hoursPerHide);
  const small = take(wares.smallHides ?? 0, open.hides - big, SMALL_HIDE, HIDES.hoursPerSmallHide);
  const sheep = take(wares.sheepFurs, open.furs, 1, HIDES.hoursPerSheepFur);
  const wild = take(wares.wildFurs, open.furs - sheep, 1, HIDES.hoursPerWildFur);
  const hides = big + small * SMALL_HIDE;
  const furs = sheep + wild;
  if (hides + furs <= EPSILON) return 0;
  wares.hides -= big;
  if (small > 0) wares.smallHides = (wares.smallHides ?? 0) - small;
  wares.sheepFurs -= sheep;
  wares.wildFurs -= wild;
  (wares.curing ??= []).push({ doneDay: day + HIDES.cureDays, hides, furs });
  return (start - hours) / SMALL_GAME.hoursPerManDay;
}
