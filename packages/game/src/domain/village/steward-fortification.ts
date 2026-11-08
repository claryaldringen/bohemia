import { tileOfWorldPoint, type Landscape, type ObstacleLayer } from '../landscape';
import { fortificationCost } from './fortification';
import { stewardFortificationProposal } from './fortification-proposal';
import type { Point } from './polygon';
import { outlineOf, villageFortifications } from './fortifications';
import { laborPerDay } from './people';
import { FORTIFICATIONS } from './rules-fortifications';
import { TRADE_GOOD_VALUES } from './rules-trade';
import { STEWARD } from './rules-steward';
import { fieldCells, fieldCellValue, planCentre } from './steward-land';
import type { StewardMode } from './steward';
import type { FortKind, FortTop, VillageState, WallKind } from './types';
import { woodLogs, wholeLogs } from './wood';

// Opevnění podle hrozby (fortifications.md – Správce, Hrozba; steward.md – Rozhodovací pořadí,
// krok 9a): hodnota druhu proti ceně a obvod, který správce nakreslí kolem lidí, zásob a dobytka.
// Čisté funkce nad stavem vsi – krok dne a rozpočet práce jsou v `steward-extras.ts`.

const DAYS_PER_YEAR = 365;

/** Druh, který správce porovnává – val s nástavbou je jeden druh (staví se po etapách). */
export type FortPlan = 'fence' | 'palisade' | 'rampart' | 'rampart-fence' | 'rampart-palisade';

/** Vstup `fortValue`: délka obvodu (m), kg obilí na člověkoden, odkud se vylepšuje a horizont (roky). */
export interface FortValueInput {
  lengthM: number;
  kgPerManDay: number;
  /** Už stojící druh (rozdíl vylepšení); chybí = nové opevnění. */
  from?: FortPlan | null;
  /** Horizont přínosu v letech (údržba valu za horizont). */
  years: number;
}

/** Násobek obrany druhu (Obrana – tabulka násobků). */
export function planMultiplier(plan: FortPlan): number {
  const m = FORTIFICATIONS.multiplier;
  switch (plan) {
    case 'fence':
      return m.fence;
    case 'palisade':
      return m.palisade;
    case 'rampart':
      return m.rampart;
    case 'rampart-fence':
      return m.rampartFence;
    case 'rampart-palisade':
      return m.rampartPalisade;
  }
}

/** Základ stavby druhu: val s nástavbou začíná valem. */
export function planBase(plan: FortPlan): FortKind {
  return plan === 'fence' || plan === 'palisade' ? plan : 'rampart';
}

/** Nástavba druhu (jen val s plotem nebo palisádou). */
export function planTop(plan: FortPlan): FortTop | null {
  return plan === 'rampart-fence' ? 'fence' : plan === 'rampart-palisade' ? 'palisade' : null;
}

/** Životnost druhu v letech (plot 15, palisáda 20; holý val nehnije – Infinity jen v porovnání). */
export function planLifeYears(plan: FortPlan): number {
  if (plan === 'fence' || plan === 'rampart-fence') return FORTIFICATIONS.lifeYears.fence;
  if (plan === 'palisade' || plan === 'rampart-palisade') return FORTIFICATIONS.lifeYears.palisade;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Druh opevnění, které ves má (druh + hotová nástavba). Vyšší stupně hradby než palisáda správce
 * zatím počítá jako palisádu (ochranu druhu přidá další úloha – Hradby a obrana, Správce).
 */
export function planOf(kind: FortKind, top: FortTop | undefined): FortPlan {
  if (kind !== 'rampart') return kind === 'fence' ? 'fence' : 'palisade';
  return top === undefined ? 'rampart' : top === 'fence' ? 'rampart-fence' : 'rampart-palisade';
}

/**
 * Ztráta jednoho nájezdu v člověkodnech (Hrozba – Ztráta nájezdu): kořist (25 kg na muže, odhad
 * 20 mužů, nejvýš zásoby) a dobytek (ceny u sousedů – kráva 600 kg obilí, drobný dobytek čtvrt
 * krávy) přes kg za člověkoden, k tomu 10 % dospělých × jejich práce za rok.
 */
export function raidLossManDays(state: VillageState, day: number, kgPerManDay: number): number {
  const loss = FORTIFICATIONS.raidLoss;
  const loot = Math.min(Math.max(0, state.storesKg), loss.men * loss.kgPerMan);
  const cow = TRADE_GOOD_VALUES.cows.valueKg;
  const small = cow * FORTIFICATIONS.refuge.smallStockHead;
  const herds = state.livestock?.herds;
  const cattleKg = herds ? herds.cow * cow + (herds.pig + herds.sheep + herds.goat) * small : 0;
  let adultDays = 0;
  for (const p of state.people) adultDays += laborPerDay(p, day);
  return (loot + cattleKg) / kgPerManDay + loss.adultShare * adultDays * DAYS_PER_YEAR;
}

/**
 * Cena stavby druhu `plan` z druhu `from` (fortifications.md – Hradby a obrana, Cena): práce bez
 * kácení (`fortificationCost`) + kácení chybějících klád za `pileSaves.logManDays` na strom –
 * cena komplet, z hromady o kládu levněji.
 */
function planCost(
  state: VillageState,
  plan: FortPlan,
  from: FortPlan | null,
  lengthM: number,
): number {
  const parts: { labor: number; wood: number }[] = [];
  const add = (kind: FortKind, wallFrom: WallKind | null = null): void => {
    const c = fortificationCost(kind, lengthM, wallFrom);
    parts.push({ labor: c.laborManDays, wood: c.logs });
  };
  const top = planTop(plan);
  if (from === null) {
    add(planBase(plan));
    if (top) add(top);
  } else if (from === 'fence') {
    add('palisade', 'fence');
  } else if (top) {
    add(top);
  }
  const labor = parts.reduce((s, p) => s + p.labor, 0);
  const wood = parts.reduce((s, p) => s + p.wood, 0);
  const fell = Math.max(0, wood - wholeLogs(woodLogs(state))) * FORTIFICATIONS.pileSaves.logManDays;
  return labor + fell;
}

/**
 * Hodnota druhu `plan` pro hrozbu `threat` (fortifications.md – Správce): `gain` = přínos za rok
 * v člověkodnech (`H × ztráta nájezdu × (1 ÷ dnešní násobek − 1 ÷ nový násobek)`, bez opevnění
 * násobek 1), `cost` = práce stavby a kácení chybějících klád, u valu k tomu údržba za horizont.
 * Správce staví, když `gain × horizont − cost > 0`.
 */
export function fortValue(
  state: VillageState,
  day: number,
  plan: FortPlan,
  threat: number,
  input: FortValueInput,
): { gain: number; cost: number } {
  const from = input.from ?? null;
  const before = from === null ? 1 : planMultiplier(from);
  const gain =
    threat *
    raidLossManDays(state, day, input.kgPerManDay) *
    Math.max(0, 1 / before - 1 / planMultiplier(plan));
  let cost = planCost(state, plan, from, input.lengthM);
  if (from === null && planBase(plan) === 'rampart') {
    cost += (FORTIFICATIONS.rampartUpkeep.manDaysPer100MYear * input.lengthM * input.years) / 100;
  }
  return { gain, cost };
}

/** Kg čisté úrody na člověkoden v okolí vsi (`squareValue` políček kolem středu; mapa bez polí → záloha). */
export function stewardKgPerManDay(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): number {
  const centre = planCentre(state);
  if (!centre) return STEWARD.fortKgPerManDayFallback;
  const cells = fieldCells(landscape, obstacles);
  const home = tileOfWorldPoint(landscape, centre.x, centre.z);
  if (!home) return STEWARD.fortKgPerManDayFallback;
  const size = landscape.size;
  const r = 8;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, home.y - r); y <= Math.min(size - 1, home.y + r); y++) {
    for (let x = Math.max(0, home.x - r); x <= Math.min(size - 1, home.x + r); x++) {
      const v = fieldCellValue(cells, y * size + x, 300);
      if (v > 0) {
        sum += v;
        n++;
      }
    }
  }
  return n > 0 ? sum / n : STEWARD.fortKgPerManDayFallback;
}

/** Štítek režimu pro horizont (Nouze 0). */
export function fortHorizonYears(plan: FortPlan, mode: StewardMode): number {
  return Math.min(STEWARD.fortPaybackYears[mode], planLifeYears(plan));
}

// --- obvod ------------------------------------------------------------------------------

/** Plocha útočiště, kterou ves potřebuje: lidé a dobytek + 20 % (Správce – Obvod). */
export function refugeNeedM2(state: VillageState): number {
  const r = FORTIFICATIONS.refuge;
  const herds = state.livestock?.herds;
  const small = herds ? (herds.pig + herds.sheep + herds.goat) * r.smallStockHead : 0;
  let oxen = state.looseOxen?.length ?? 0;
  let horses = state.looseHorses?.length ?? 0;
  for (const pen of state.pens ?? []) {
    oxen += pen.oxen?.length ?? 0;
    horses += pen.horses?.length ?? 0;
  }
  const heads = (herds?.cow ?? 0) + small + oxen + horses;
  return (
    (state.people.length * r.m2PerPerson + heads * r.m2PerHead) *
    (1 + FORTIFICATIONS.stewardRefugeMargin)
  );
}

/**
 * Obvod správce pro druh `kind` (fortifications.md – Správce – Obvod správce): návrh kolem jádra
 * vsi (`stewardFortificationProposal`) s útočištěm pro lidi a dobytek + 20 % – jinak odstup po
 * 5 m víc, nejvýš `STEWARD.fortMaxRings` kroků: body a délka obvodu (m), nebo null.
 */
export function stewardFortificationFor(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  day: number,
  kind: FortKind,
): { points: Point[]; lengthM: number } | null {
  return stewardFortificationProposal(
    state,
    day,
    landscape,
    obstacles,
    kind,
    refugeNeedM2(state),
    STEWARD.fortMaxRings,
  );
}

/** Délka obvodu stojícího opevnění `fort` jako druhu `kind` (m), nebo null. */
export function fortLengthAs(
  landscape: Landscape,
  fort: NonNullable<VillageState['fortifications']>[number],
  kind: FortKind,
): number | null {
  return outlineOf(landscape, fort, kind)?.lengthM ?? null;
}

/** Opevnění vsi, které správce nezaložil (hráčovo) – správce ho nemění ani nedoplňuje. */
export function hasForeignFortification(
  state: VillageState,
  isOwn: (id: number) => boolean,
): boolean {
  return villageFortifications(state).some((f) => !isOwn(f.id));
}
