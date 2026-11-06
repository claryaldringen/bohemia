import { tileOfWorldPoint, type Landscape, type ObstacleLayer } from '../landscape';
import {
  fortificationArea,
  fortificationCost,
  fortificationOutline,
  type FortArea,
} from './fortification';
import { outlineOf, villageFortifications } from './fortifications';
import { laborPerDay } from './people';
import { FELLING_MAN_DAYS_PER_TREE } from './rules-buildings';
import { FORTIFICATIONS } from './rules-fortifications';
import { TRADE_GOOD_VALUES } from './rules-trade';
import { STEWARD } from './rules-steward';
import { fieldCells, fieldCellValue, planCentre } from './steward-land';
import type { StewardMode } from './steward';
import type { FortKind, FortTop, TileCell, VillageState } from './types';
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

/** Druh opevnění, které ves má (druh + hotová nástavba). */
export function planOf(kind: FortKind, top: FortTop | undefined): FortPlan {
  if (kind !== 'rampart') return kind;
  return top === 'fence' ? 'rampart-fence' : top === 'palisade' ? 'rampart-palisade' : 'rampart';
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

/** Cena stavby druhu `plan` z druhu `from` (práce + kácení chybějících klád), klády k tomu. */
function planCost(
  state: VillageState,
  plan: FortPlan,
  from: FortPlan | null,
  lengthM: number,
): number {
  const parts: { labor: number; wood: number }[] = [];
  const add = (kind: FortKind, work: 'new' | 'upgrade' | 'top'): void => {
    const c = fortificationCost(kind, lengthM, work);
    parts.push({ labor: c.laborManDays, wood: c.upfront.wood ?? 0 });
  };
  const top = planTop(plan);
  if (from === null) {
    add(planBase(plan), 'new');
    if (top) add(top, 'top');
  } else if (from === 'fence') {
    add('palisade', 'upgrade');
  } else if (top) {
    add(top, 'top');
  }
  const labor = parts.reduce((s, p) => s + p.labor, 0);
  const wood = parts.reduce((s, p) => s + p.wood, 0);
  const fell = Math.max(0, wood - wholeLogs(woodLogs(state))) * FELLING_MAN_DAYS_PER_TREE;
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

function tileKey(x: number, y: number): number {
  return y * 65536 + x;
}

/** Políčka, která musí obvod obsáhnout: obydlí s pozemky (i dvorec a dílny), humna, jámy, ohrady. */
function mustCoverTiles(state: VillageState, landscape: Landscape): Map<number, TileCell> {
  const out = new Map<number, TileCell>();
  const put = (x: number, z: number): void => {
    const t = tileOfWorldPoint(landscape, x, z);
    if (!t) return;
    out.set(tileKey(t.x, t.y), { x: t.x, y: t.y });
  };
  for (const d of state.dwellings) {
    put(d.position.x, d.position.z);
    if (d.plot && !d.plot.square) {
      out.set(tileKey(d.plot.cell.x, d.plot.cell.y), { x: d.plot.cell.x, y: d.plot.cell.y });
    }
    if (d.plot?.square) put(d.plot.square.x, d.plot.square.z);
  }
  for (const f of state.threshingFloors ?? []) put(f.position.x, f.position.z);
  for (const p of state.grainPits ?? []) put(p.x, p.z);
  for (const pen of state.pens ?? []) {
    put(pen.x, pen.z);
    for (const s of pen.extraSquares ?? []) put(s.x, s.z);
  }
  return out;
}

/** Spojí `from` s `to` vodorovně a pak svisle (čtyřokolí souvislost). */
function connect(set: Set<number>, from: TileCell, to: TileCell): void {
  let x = from.x;
  let y = from.y;
  set.add(tileKey(x, y));
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    set.add(tileKey(x, y));
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    set.add(tileKey(x, y));
  }
}

/**
 * Políčka obvodu správce (fortifications.md – Obvod správce): nejmenší souvislá plocha, která
 * obsahuje obydlí s pozemky, dvorec, dílny, humna, obilné jámy a ohrady; kolem každého políčka
 * pás navíc (opevnění leží uvnitř plochy), pole a sady se nepočítají. `rings` – prstence navíc.
 * Ves bez staveb nemá obvod (null).
 */
export function stewardFortificationCells(
  state: VillageState,
  landscape: Landscape,
  rings = 0,
): TileCell[] | null {
  const must = mustCoverTiles(state, landscape);
  if (must.size === 0) return null;
  const size = landscape.size;
  const keys = [...must.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const first = keys[0]!;
  const set = new Set<number>();
  for (const c of keys) connect(set, first, c);
  // pás navíc kolem každého políčka a prstence podle potřeby útočiště
  let grown = set;
  for (let r = 0; r < 1 + rings; r++) {
    const next = new Set(grown);
    for (const k of grown) {
      const x = k % 65536;
      const y = (k - x) / 65536;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) next.add(tileKey(nx, ny));
        }
      }
    }
    grown = next;
  }
  return [...grown]
    .map((k) => ({ x: k % 65536, y: Math.floor(k / 65536) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Obvod správce jako plocha opevnění (`fortificationArea`), nebo null (bez staveb, neplatná plocha). */
export function stewardFortificationArea(
  state: VillageState,
  landscape: Landscape,
  rings = 0,
): FortArea | null {
  const cells = stewardFortificationCells(state, landscape, rings);
  if (!cells) return null;
  const area = fortificationArea(cells, null, landscape);
  return 'error' in area ? null : area;
}

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
 * Obvod správce pro druh `kind` s útočištěm pro lidi a dobytek + 20 % (jinak se plocha rozšíří
 * o prstenec políček, nejvýš `STEWARD.fortMaxRings`): buňky a délka obvodu (m), nebo null.
 */
export function stewardFortificationFor(
  state: VillageState,
  landscape: Landscape,
  kind: FortKind,
): { cells: TileCell[]; lengthM: number } | null {
  const need = refugeNeedM2(state);
  for (let rings = 0; rings <= STEWARD.fortMaxRings; rings++) {
    const cells = stewardFortificationCells(state, landscape, rings);
    if (!cells) return null;
    const area = fortificationArea(cells, null, landscape);
    if ('error' in area) return null;
    const outline = fortificationOutline(area, kind);
    if (outline.innerAreaM2 >= need) return { cells, lengthM: outline.lengthM };
  }
  return null;
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
