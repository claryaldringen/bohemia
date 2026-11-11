import { tileOfWorldPoint, type Landscape, type ObstacleLayer } from '../landscape';
import {
  fortificationCost,
  fortOccupancy,
  fortSections,
  layerBuilt,
  moatSegments,
  segmentRampart,
  upgradeBase,
  wallRank,
  type FortCost,
} from './fortification';
import { stewardFortificationProposal } from './fortification-proposal';
import type { Point } from './polygon';
import { outlineOf } from './fortifications';
import { isFertile, laborPerDay } from './people';
import { FORTIFICATIONS } from './rules-fortifications';
import { TRADE_GOOD_VALUES } from './rules-trade';
import { STEWARD } from './rules-steward';
import { fieldCells, fieldCellValue, planCentre } from './steward-land';
import type { StewardMode } from './steward';
import { stoneOnHand } from './stone';
import type { FortKind, Fortification, VillageState, WallKind } from './types';
import { woodLogs, wholeLogs } from './wood';

// Opevnění podle hrozby (fortifications.md – Hradby a obrana, Správce; Hrozba; steward.md –
// Rozhodovací pořadí, krok 9a): ochrana plánu proti ceně a obvod, který správce nakreslí kolem
// lidí, zásob a dobytka. Martin 8. 11. 2026: „To, že vesnice hradbu nepostaví, je spíš věcí správce
// – prostě usoudí, že se mu nevyplatí.“ Čisté funkce nad stavem vsi – krok dne a rozpočet práce
// jsou v `steward-extras.ts`.

const DAYS_PER_YEAR = 365;

/**
 * Plán opevnění správce (Hradby a obrana – Správce): hradba (nebo žádná), val s příkopem a vodní
 * příkop – vždy celý obvod. Vodní příkop jen s valem.
 */
export interface FortPlan {
  wall: WallKind | null;
  rampart: boolean;
  water: boolean;
}

/** Ves bez opevnění. */
export const NO_FORT: FortPlan = { wall: null, rampart: false, water: false };

/**
 * Vstup `fortValue`: délka obvodu (m), kg obilí na člověkoden, odkud se vylepšuje (null = nové
 * opevnění), horizont (roky – údržba za horizont) a muži 16–44 (obsazenost).
 */
export interface FortValueInput {
  lengthM: number;
  kgPerManDay: number;
  from: FortPlan | null;
  years: number;
  men: number;
}

/** Stejný plán? */
export function samePlan(a: FortPlan, b: FortPlan): boolean {
  return a.wall === b.wall && a.rampart === b.rampart && a.water === b.water;
}

/**
 * Ochrana plánu (Hradby a obrana – Správce): podíl ztráty nájezdu, který opevnění ušetří = jen
 * s obránci – Σ ochrany hradby, valu a vodního příkopu (`protectionMoat`) × obsazenost; nejvýš 1.
 * Neobsazenou hradbu útočník přeleze (Martin 9. 11. 2026: „Hradba je prostě jen fyzická překážka“).
 */
export function planProtection(plan: FortPlan, occupancy: number): number {
  const p = FORTIFICATIONS.protection;
  const occ = Math.min(1, Math.max(0, occupancy));
  let sum = 0;
  if (plan.wall !== null) sum += p[plan.wall];
  if (plan.rampart) {
    sum += p.rampart;
    if (plan.water) sum += FORTIFICATIONS.protectionMoat;
  }
  return Math.min(1, sum * occ);
}

/** Údržba plánu v čd na 100 m ročně (Hradby a obrana – Životnost a údržba): hradba a val zvlášť. */
export function planUpkeepPer100M(plan: FortPlan): number {
  const u = FORTIFICATIONS.upkeepPer100MYear;
  return (plan.wall !== null ? u[plan.wall] : 0) + (plan.rampart ? u.rampart : 0);
}

/** Muži 16–44 let – obránci, kteří obsadí hradbu (Hradby a obrana – Správce, obsazenost). */
export function fortDefenders(state: VillageState, day: number): number {
  let men = 0;
  for (const p of state.people) if (p.sex === 'male' && isFertile(p, day)) men++;
  return men;
}

/**
 * Plán, který stojí na opevnění `fort` (Hradby a obrana – Správce): nejnižší hradba dílů (díl bez
 * hradby – holý val či mezera – null), val jen když ho má dostavěný každý díl, vodní příkop jen
 * když je napuštěný v celém obvodu.
 */
export function fortPlanOf(fort: Fortification): FortPlan {
  let wall: WallKind | null | undefined;
  let rampart = fort.segments.length > 0;
  let water = rampart;
  for (const seg of fort.segments) {
    const base = upgradeBase(fort, seg);
    const w = base.kind === 'wall' ? base.wall : null;
    if (wall === undefined) wall = w;
    else if (wall !== null) wall = w === null || wallRank(w) < wallRank(wall) ? w : wall;
    const r = seg.demolishedDay === undefined ? segmentRampart(fort, seg) : null;
    if (!layerBuilt(r)) rampart = false;
    if (!r?.water) water = false;
  }
  return { wall: wall ?? null, rampart, water: rampart && water };
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
 * Cena stavby plánu `plan` z plánu `from` (fortifications.md – Hradby a obrana, Cena): práce bez
 * kácení a lámání (`fortificationCost` – vylepšení cenu cílového stupně, ochoz jen přístavbu,
 * hradba na valu jako samotná), val, strouha vodního příkopu (¼ čd na 1 m) + kácení chybějících
 * klád a lámání chybějícího kamene (1 čd na kládu a m³) – cena komplet, z hromady levněji.
 */
function planCost(state: VillageState, plan: FortPlan, from: FortPlan, lengthM: number): number {
  let labor = 0;
  let logs = 0;
  let stone = 0;
  const add = (c: FortCost): void => {
    labor += c.laborManDays;
    logs += c.logs;
    stone += c.stoneM3;
  };
  if (plan.wall !== null && plan.wall !== from.wall) {
    add(fortificationCost(plan.wall, lengthM, from.wall));
  }
  if (plan.rampart && !from.rampart) add(fortificationCost('rampart', lengthM));
  if (plan.water && !from.water) labor += FORTIFICATIONS.moat.manDaysPerM * lengthM;
  const saves = FORTIFICATIONS.pileSaves;
  const fell = Math.max(0, logs - wholeLogs(woodLogs(state))) * saves.logManDays;
  const quarry = Math.max(0, stone - stoneOnHand(state)) * saves.stoneManDaysPerM3;
  return labor + fell + quarry;
}

/**
 * Hodnota plánu `plan` pro hrozbu `threat` (fortifications.md – Hradby a obrana, Správce):
 * `gain` = přínos za rok v člověkodnech = H × ztráta nájezdu × `protectionScale` × (ochrana plánu
 * − ochrana dneška) s obsazeností `fortOccupancy(muži, délka)`; `cost` = stavba (`planCost`)
 * + přírůstek údržby za horizont. Správce staví, když `gain × horizont − cost > 0`.
 */
export function fortValue(
  state: VillageState,
  day: number,
  plan: FortPlan,
  threat: number,
  input: FortValueInput,
): { gain: number; cost: number } {
  const from = input.from ?? NO_FORT;
  const occupancy = fortOccupancy(input.men, input.lengthM);
  const gain =
    threat *
    raidLossManDays(state, day, input.kgPerManDay) *
    FORTIFICATIONS.protectionScale *
    Math.max(0, planProtection(plan, occupancy) - planProtection(from, occupancy));
  const upkeep =
    (Math.max(0, planUpkeepPer100M(plan) - planUpkeepPer100M(from)) * input.lengthM * input.years) /
    100;
  return { gain, cost: planCost(state, plan, from, input.lengthM) + upkeep };
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

/**
 * Horizont přínosu v letech (Hradby a obrana – Správce): podle režimu (Růst 25, Obnova 5, Nouze 0),
 * nejvýš životnost hradby, kterou plán staví (plot 15, palisáda 20, roštová 30, komorová 50 let);
 * val a vodní příkop nehnijí.
 */
export function fortHorizonYears(plan: FortPlan, from: FortPlan | null, mode: StewardMode): number {
  const payback = STEWARD.fortPaybackYears[mode];
  if (plan.wall === null || plan.wall === (from?.wall ?? null)) return payback;
  return Math.min(payback, FORTIFICATIONS.lifeYears[plan.wall]);
}

/**
 * Úsek, jehož příkop správce napustí dál (Hradby a obrana – Správce, vždy celý obvod): voda musí
 * dosáhnout do všech dílů (`moatSegments` po úsecích), jinak null; vrátí díl úseku, který má ještě
 * suché díly, nebo null, když je napuštěné všechno.
 */
export function stewardMoatSection(
  landscape: Landscape,
  fort: Fortification,
): { segment: number } | null {
  const wet = new Set<number>();
  let next: number | null = null;
  for (const section of fortSections(fort)) {
    const first = section.segments[0];
    if (first === undefined) continue;
    for (const index of moatSegments(landscape, fort, first)) {
      wet.add(index);
      const seg = fort.segments.find((s) => s.index === index);
      if (next === null && seg?.moatDay === undefined) next = first;
    }
  }
  if (fort.segments.some((s) => !wet.has(s.index)) || next === null) return null;
  return { segment: next };
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
