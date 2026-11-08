import { dateOfDayIndex } from '../../calendar';
import { FORTIFICATIONS, type FortCostPer100M } from '../rules-fortifications';
import type { FortKind, WallKind } from '../types';
import { WALL_ORDER } from './life';

// Cena opevnění podle délky (fortifications.md – Hradby a obrana, Cena; Martin 8. 11. 2026: ceny
// „komplet, včetně kácení a odvozu“): na 100 m obvodu, úměrně délce – i rohy a brány se počítají
// délkou (návrh Clauda). Komplet = práce, kdyby se všechny klády kácely a všechen kámen lámal
// u staveniště; kláda z hromady ušetří 1 čd, kámen z hromady 1 čd na m³ (Martin – „A“). Kácení
// a lámání proto přičte až stavba podle toho, odkud surovina je (`pushWork`).

/** Cena opevnění: práce bez kácení klád a lámání kamene (čd), klády a kámen předem (m³). */
export interface FortCost {
  laborManDays: number;
  logs: number;
  stoneM3: number;
}

/** Cena na 100 m pro stavbu `target` z dosavadní hradby `from` (null = nové opevnění). */
function costPer100M(target: FortKind, from: WallKind | null): FortCostPer100M {
  if (target === 'rampart' || from === null) return FORTIFICATIONS.costPer100M[target];
  if (WALL_ORDER.indexOf(from) >= WALL_ORDER.indexOf(target)) {
    throw new Error(`Vylepšit jde jen na vyšší stupeň, ne z ${from} na ${target}`);
  }
  // ochoz je přístavba – palisáda zůstane (Hradby a obrana – Druhy a postup vylepšení)
  if (from === 'palisade' && target === 'walkway') return FORTIFICATIONS.walkwayAddPer100M;
  // vylepšení stojí cenu cílového, nižší stupeň nic nevrací (Martin 3. 11. 2026)
  return FORTIFICATIONS.costPer100M[target];
}

/**
 * Cena komplet stavby `target` o délce `lengthM` (m) z hradby `from` – práce i s kácením všech
 * klád a lámáním všeho kamene (tabulka Cena). Z ní počítá zboření (`DEMOLITION.laborShare` práce
 * stavby – demolition.md, Čísla).
 */
export function fortificationFullCost(
  target: FortKind,
  lengthM: number,
  from: WallKind | null = null,
): FortCost {
  const per = costPer100M(target, from);
  const share = lengthM / 100;
  return {
    laborManDays: per.laborManDays * share,
    logs: per.wood * share,
    stoneM3: (per.stoneM3 ?? 0) * share,
  };
}

/**
 * Cena stavby `target` o délce `lengthM` (m) z hradby `from` (chybí = nové opevnění, hradba na
 * valu, přestavba): práce = komplet − 1 čd za každou kládu − 1 čd za každý m³ kamene; kácení
 * a lámání přičte stavba podle zdroje (z hromady nic, ze stromů a ze skály 1 čd × vzdálenost).
 * Vylepšení stojí cenu cílového stupně (nižší nic nevrací), palisáda → s ochozem jen přístavbu.
 */
export function fortificationCost(
  target: FortKind,
  lengthM: number,
  from: WallKind | null = null,
): FortCost {
  const full = fortificationFullCost(target, lengthM, from);
  const saves = FORTIFICATIONS.pileSaves;
  return {
    laborManDays:
      full.laborManDays - saves.logManDays * full.logs - saves.stoneManDaysPerM3 * full.stoneM3,
    logs: full.logs,
    stoneM3: full.stoneM3,
  };
}

/**
 * Jde hradbu `kind` v den `day` stavět (Hradby a obrana – Druhy; Martin 8. 11. 2026: „Od 790 je
 * možné stavět roštovou hradbu, od 830 i komorovou.“)? Ostatní stupně kdykoli.
 */
export function wallAvailable(kind: WallKind, day: number): boolean {
  const from = kind === 'crib' || kind === 'chamber' ? FORTIFICATIONS.wallFromYear[kind] : null;
  return from === null || dateOfDayIndex(day).year >= from;
}

/** Důvod, proč hradba `kind` ještě nejde (`wallAvailable`) – roštová a komorová. */
export function FORT_WALL_YEAR(kind: 'crib' | 'chamber'): string {
  const name = kind === 'crib' ? 'Roštová' : 'Komorová';
  return `${name} hradba až od roku ${FORTIFICATIONS.wallFromYear[kind]}.`;
}

/** Důvod, proč opevnění `kind` v den `day` ještě nejde stavět (`wallAvailable`), jinak null. */
export function wallYearReason(kind: FortKind, day: number): string | null {
  if (kind !== 'crib' && kind !== 'chamber') return null;
  return wallAvailable(kind, day) ? null : FORT_WALL_YEAR(kind);
}

/** Palisáda s ochozem vzniká jen vylepšením palisády (Hradby a obrana – Druhy; Martin – „A“). */
export const FORT_WALKWAY_NEW = 'Palisáda s ochozem vzniká jen vylepšením palisády.';

/** Kolik kamene chybí – celé m³ nahoru. */
export function FORT_NO_STONE(m3: number): string {
  return `Chybí ${Math.ceil(m3 - 1e-9)} m³ kamene.`;
}
