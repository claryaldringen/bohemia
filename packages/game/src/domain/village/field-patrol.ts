// Jezdecká hlídka polí (wildlife.md – Obrana polí, Jezdecká hlídka – objížďka polí): v červnu až
// říjnu jezdci rodiny na denní objížďce zvěř od polí odhání a občas uloví prase. Bez náhody.
import { dateOfDayIndex } from '../calendar';
import { riderPower } from './horse-riders';
import { emptyHunt } from './hunt';
import { huntingDogs } from './hunt-party';
import { butcher, villageHerds } from './livestock';
import { lordRides } from './lord';
import { FIELD_GUARD, HUNT } from './rules-wildlife';
import type { VillageState } from './types';
import { wildlifeCaps } from './wildlife';

const EPSILON = 1e-9;

/** Hlídka dne: součet sil jezdců a o kolik sníží škodu polí (0–`max`). */
export interface RiderPatrol {
  power: number;
  cut: number;
}

const NO_PATROL: RiderPatrol = { power: 0, cut: 0 };

/**
 * Jezdecká hlídka dne: jezdci z `lordRides` (jezdí jen nepodkutí koně, ne v hladový den na poli ani
 * ve žňový den cvičících mužů; v den výpravy k hranici nejedou po polích) v červnu až říjnu. Síla
 * jezdce = `riderPower ÷ 100`. Škoda polí klesne o `min(60 %; 25 % × Σ sil × (1 + 0,1 × psi,
 * nejvýš 1,5))`. Jen čte stav.
 */
export function riderPatrol(state: VillageState, day: number): RiderPatrol {
  const { fromMonth, toMonth, share, max, perDog, dogMax } = FIELD_GUARD.rider;
  const month = dateOfDayIndex(day).month;
  if (month < fromMonth || month > toMonth || !state.wildlife) return NO_PATROL;
  const rides = lordRides(state, day);
  if (!rides || rides.trailId !== null || rides.riders.length === 0) return NO_PATROL;
  const people = new Map(state.people.map((p) => [p.id, p]));
  let power = 0;
  for (const ride of rides.riders) {
    const rider = people.get(ride.riderId);
    if (rider) power += riderPower({ arms: rider.arms }, { training: ride.training }) / 100;
  }
  if (power <= EPSILON) return NO_PATROL;
  const dogs = Math.min(dogMax, 1 + perDog * huntingDogs(state));
  return { power, cut: Math.min(max, share * power * dogs) };
}

/**
 * Hlídka dne tak, jak ji `settlePatrol` ráno spočetl (škoda polí i úlovek čtou totéž, i když lov
 * dne zraní jezdce až po škodě); bez uložené hodnoty se spočte.
 */
export function patrolOfDay(state: VillageState, day: number): RiderPatrol {
  const stored = state.wildlife?.patrol;
  return stored && stored.day === day ? stored : riderPatrol(state, day);
}

/** Spočte hlídku dne jednou a uloží ji (volá `simulateDay` před škodou polí). */
export function settlePatrol(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  const { power, cut } = riderPatrol(state, day);
  if (power > EPSILON || w.patrol) w.patrol = { day, power, cut };
}

/**
 * Úlovek z hlídky (po `huntDay`): naděje prasat roste o `0,01 × Σ sil × prasata ÷ strop`, celé
 * kusy se uloví (dospělá napřed), maso jde přes porážku a do ročního součtu lovu (bez dne lovu).
 */
export function patrolHuntDay(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  const { power } = patrolOfDay(state, day);
  if (power <= EPSILON) return;
  const caps = wildlifeCaps(w.land, villageHerds(state).pig);
  const boar = w.boar;
  const stock = boar.adults + boar.piglets;
  if (stock <= EPSILON) return;
  const hunt = (w.hunt ??= emptyHunt());
  const share = caps.boar > EPSILON ? Math.min(1, stock / caps.boar) : 1;
  hunt.hope.boar += FIELD_GUARD.huntPerPower * power * share;
  let kills = 0;
  let meatKg = 0;
  while (hunt.hope.boar >= 1 - EPSILON) {
    if (boar.adults >= 1 - EPSILON) {
      boar.adults -= 1;
      meatKg += HUNT.meatKg.boar;
    } else if (boar.piglets >= 1 - EPSILON) {
      boar.piglets -= 1;
      meatKg += HUNT.meatKg.piglet;
    } else break;
    hunt.hope.boar -= 1;
    kills += 1;
  }
  hunt.hope.boar = Math.min(1, Math.max(0, hunt.hope.boar));
  if (kills === 0) return;
  butcher(state, meatKg);
  hunt.year.boar += kills;
  hunt.year.meatKg += meatKg;
}
