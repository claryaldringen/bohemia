import { dateOfDayIndex } from '../calendar';
import { length2, obstacleIndex, type ObstacleLayer } from '../landscape';
import { distanceFactor } from './fields';
import { buildingLocalToWorld, fellTrees, obstacleChangesAt, plantOnStump } from './obstacles';
import { monthInWindow } from './orchard';
import {
  BEECH_PLANTING,
  CHARCOAL_KILN,
  CRAFT_PRODUCTION,
  MILIR,
  ORCHARD_PLANTING_WINDOWS,
} from './rules';
import type {
  CharcoalKiln,
  CraftStocks,
  Dwelling,
  Position,
  VillageState,
  Workshop,
  WorkshopActivity,
} from './types';
import type { Walk } from './paths/walking';
import {
  availableTrees,
  claimedObstacles,
  fellingCost,
  fellingsOf,
  isBeech,
  isTreeStanding,
  nearestMatureTrees,
} from './wood';

// Uhlíř (crafts.md – Uhlíř, Martin 18. 10. 2026; rešerše 2026-10-18-charcoal.md): pálí jen buky
// po dávkách do milíře – vybere nejbližší dospělé buky (vyhradí je), skácí je a připraví dřevo,
// postaví milíř, pálí ho 8 dní (hlídá ve dne i v noci), vytahá uhlí a odnese ho domů. Leží-li
// dávka blízko dílny, pálí u ní; dál staví milíř v lese u dávky a za chůzi platí přirážku
// vzdálenosti. Na pařezy skácených buků sází mladé buky (obnova lesa). Pálí jen do zásoby na rok
// spotřeby kovářů – s plnou zásobou sází, nebo pomáhá vsi. Krok dne mutuje stav (volat na klonu),
// den po dni – na kouscích nezávisí.

/** Tolerance proti chybám desetinných čísel u odvedené práce. */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků práce uhlíře za den (sázení, buky, fáze milíře). */
const MAX_STEPS = 64;
const DAYS_PER_YEAR = 365;

/** Střed milíře u uhlířovy zemnice ve světě (MILIR.offset v souřadnicích modelu). */
export function homeKilnCenter(position: Position): { x: number; z: number } {
  const [x, z] = buildingLocalToWorld(position, MILIR.offset.x, MILIR.offset.z);
  return { x, z };
}

/** Kolik uhlí dá milíř (kg) – 120 kg z každého buku dávky. */
export function kilnYieldKg(kiln: Pick<CharcoalKiln, 'trees'>): number {
  return kiln.trees.length * CRAFT_PRODUCTION.charcoalKgPerTree;
}

/**
 * Násobek práce u milíře za chůzi z dílny (crafts.md – Uhlíř): milíř v lese o 1 % dražší za
 * každých 10 m nad 100 m od dílny (DISTANCE), milíř u dílny 1.
 */
export function kilnWalkFactor(kiln: Pick<CharcoalKiln, 'site' | 'walkM'>, home: Position): number {
  if (!kiln.site) return 1;
  return distanceFactor(kiln.walkM ?? length2(kiln.site.x - home.x, kiln.site.z - home.z));
}

/** Je den v okně výsadby (jaro, podzim – jako sad)? */
export function inPlantingWindow(day: number): boolean {
  return monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month);
}

/**
 * Nová dávka buků pro milíř (crafts.md – Uhlíř): nejbližší stojící dospělý buk k milíři u dílny,
 * který nepatří jiné stavbě ani dílně a není posvátný. Do CHARCOAL_KILN.homeReachM od milíře
 * u dílny se pálí doma a dávka jsou nejbližší buky k němu; dál stojí milíř v lese u prvního buku
 * a dávka jsou buky nejblíž k němu. Kácení a dovoz se platí od milíře (`fellingCost`). Bez
 * vrstvy překážek (null – jen testy) se kácí bez polohy u dílny. Když není z čeho kácet, null.
 */
export function startKiln(
  state: VillageState,
  dwelling: Pick<Dwelling, 'position'>,
  day: number,
  obstacles: ObstacleLayer | null,
  walk?: Walk,
): CharcoalKiln | null {
  const fresh = (site: CharcoalKiln['site'], trees: CharcoalKiln['trees']): CharcoalKiln => ({
    site,
    trees,
    stage: 'wood',
    prepared: 0,
    done: 0,
  });
  if (!obstacles) {
    const tree = { id: null, cost: fellingCost(0) };
    return fresh(
      null,
      Array.from({ length: CHARCOAL_KILN.trees }, () => ({ ...tree })),
    );
  }
  // bez buků v celé krajině se nehledá po políčkách (celá vrstva by se procházela každý den)
  if (availableTrees(obstacles, state, day, 'beeches') <= 0) return null;
  const changes = obstacleChangesAt(state, day);
  const claimed = claimedObstacles(state);
  const home = homeKilnCenter(dwelling.position);
  const [first] = nearestMatureTrees(obstacles, changes, home, 1, claimed, isBeech);
  if (!first) return null;
  const site = first.distanceM <= CHARCOAL_KILN.homeReachM ? null : { x: first.x, z: first.z };
  const trees = nearestMatureTrees(
    obstacles,
    changes,
    site ?? home,
    CHARCOAL_KILN.trees,
    claimed,
    isBeech,
  );
  // dovoz dřeva k milíři a chůze z dílny k lesnímu milíři po pevných cestách s půdou (walk)
  const kiln = fresh(
    site,
    fellingsOf(trees, site ?? home, walk).map((t) => ({ id: t.id, cost: t.cost })),
  );
  if (site && walk) kiln.walkM = walk(dwelling.position, [site])[0]!;
  return kiln;
}

/** Výsledek dne uhlíře pro rozdělení práce dne a panel. */
export interface BurnerDay {
  /** Kácení a příprava dřeva u buků (člověkodny) a buky, u kterých se dnes pracovalo. */
  felling: number;
  fellingTrees: number[];
  /** Práce u milíře – stavba, hlídání, vytahání (čd). */
  making: number;
  /** Sázení mladých buků (čd) a pařezy, na které dnes uhlíř zasadil. */
  planting: number;
  plantedTrees: number[];
  /** Uhlí, které dnes přibylo (kg – vytahaný milíř). */
  producedKg: number;
  /** Milíř v lese, u kterého se dnes pracovalo (střed, m); u dílny null. */
  site: { x: number; z: number } | null;
  activity: WorkshopActivity;
}

/** Co uhlíř dnes dělá: hlídá pálící milíř, sází, pokračuje v milíři, nebo začne nový. */
export interface BurnerPlan {
  /** Smí začít nový milíř (ves potřebuje uhlí – zásoba pod rokem spotřeby kovářů). */
  startNew: boolean;
}

/**
 * Starší dílna uhlíře (před milíři): skácené dřevo, ze kterého ještě nevzniklo uhlí, se dopálí
 * do zásoby a rozdělané kácení se opustí (strom se uvolní). Mutuje stav; volá se v kroku práce,
 * takže se to stane v prvním dopočítaném dni – na kouscích nezávisí.
 */
export function migrateBurner(workshop: Workshop, stocks: CraftStocks): void {
  if (workshop.fuelKg > 0) stocks.charcoalKg += workshop.fuelKg;
  workshop.fuelKg = 0;
  workshop.felling = null;
}

/**
 * Den uhlíře (mutuje stav): `labor` = práce domácnosti řemeslu (po minimu a domácí výrobě).
 * Pálící milíř zabere celý den (hlídání ve dne i v noci) – po CHARCOAL_KILN.burnDays dnech jde
 * k vytahání. Jinak v okně výsadby nejdřív sází mladé buky na pařezy, pak pokračuje v milíři
 * (buky strom po stromu: kácení a dovoz, pak příprava dřeva; stavba; vytahání a odnos uhlí –
 * u milíře v lese s přirážkou za chůzi), a když žádný nemá a `plan.startNew`, začne nový.
 * Vytahaný milíř přidá uhlí do zásoby.
 */
export function workBurner(
  state: VillageState,
  dwelling: Dwelling,
  stocks: CraftStocks,
  labor: number,
  day: number,
  obstacles: ObstacleLayer | null,
  plan: BurnerPlan,
  walk?: Walk,
): BurnerDay {
  const workshop = dwelling.workshop!;
  if (workshop.felling || workshop.fuelKg > 0) migrateBurner(workshop, stocks);
  const out: BurnerDay = {
    felling: 0,
    fellingTrees: [],
    making: 0,
    planting: 0,
    plantedTrees: [],
    producedKg: 0,
    site: workshop.kiln?.site ?? null,
    activity: 'idle',
  };
  let left = Math.max(0, labor);
  let worked: WorkshopActivity | null = null;
  let noWood = false;
  const kilnNow = workshop.kiln ?? null;
  // pálící milíř se hlídá ve dne i v noci – celá práce dne
  if (kilnNow?.stage === 'burn') {
    out.making = left;
    kilnNow.done += 1;
    if (kilnNow.done + EPSILON >= CHARCOAL_KILN.burnDays) {
      kilnNow.stage = 'draw';
      kilnNow.done = 0;
    }
    out.activity = 'burning';
    return out;
  }
  // obnova lesa: v okně výsadby mladé buky na pařezy (crafts.md – Uhlíř)
  if (inPlantingWindow(day)) {
    const toPlant = workshop.toPlant ?? [];
    while (left > EPSILON && toPlant.length > 0) {
      const id = toPlant[0]!;
      toPlant.shift();
      if (!plantOnStump(state, id, day)) continue;
      const cost = BEECH_PLANTING.manDaysPerTree * stumpWalkFactor(obstacles, id, dwelling);
      const spent = Math.min(left, cost);
      left -= spent;
      out.planting += spent;
      out.plantedTrees.push(id);
      worked = 'planting';
    }
    if (workshop.toPlant) {
      if (toPlant.length > 0) workshop.toPlant = toPlant;
      else delete workshop.toPlant;
    }
  }
  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    let kiln = workshop.kiln ?? null;
    if (!kiln) {
      if (!plan.startNew || out.producedKg > 0) break;
      kiln = startKiln(state, dwelling, day, obstacles, walk);
      if (!kiln) {
        noWood = true;
        break;
      }
      workshop.kiln = kiln;
    }
    out.site = kiln.site;
    const factor = kilnWalkFactor(kiln, dwelling.position);
    if (kiln.stage === 'burn') break;
    if (kiln.stage === 'wood') {
      const tree = kiln.trees[kiln.prepared]!;
      const total = tree.cost + CHARCOAL_KILN.prepManDaysPerTree;
      const work = Math.min(left / factor, Math.max(0, total - kiln.done));
      const before = kiln.done;
      kiln.done += work;
      left -= work * factor;
      out.felling += work * factor;
      if (tree.id !== null && !out.fellingTrees.includes(tree.id)) out.fellingTrees.push(tree.id);
      if (before < tree.cost - EPSILON && kiln.done + EPSILON >= tree.cost)
        fellBeech(state, workshop, tree.id, day);
      worked = 'felling';
      if (kiln.done + EPSILON >= total) {
        kiln.prepared++;
        kiln.done = 0;
        if (kiln.prepared >= kiln.trees.length) kiln.stage = 'build';
      }
      continue;
    }
    const perTree =
      kiln.stage === 'build' ? CHARCOAL_KILN.buildManDaysPerTree : CHARCOAL_KILN.drawManDaysPerTree;
    const total = perTree * kiln.trees.length;
    const work = Math.min(left / factor, Math.max(0, total - kiln.done));
    kiln.done += work;
    left -= work * factor;
    out.making += work * factor;
    worked = kiln.stage === 'build' ? 'building' : 'drawing';
    if (kiln.done + EPSILON < total) continue;
    if (kiln.stage === 'build') {
      // postavený milíř se zapálí – pálí se od zítřka
      kiln.stage = 'burn';
      kiln.done = 0;
      break;
    }
    // vytahané uhlí jde domů do zásoby, milíř je hotový
    const kg = kilnYieldKg(kiln);
    stocks.charcoalKg += kg;
    out.producedKg += kg;
    workshop.kiln = null;
  }
  out.activity =
    worked ?? (noWood ? 'no-wood' : labor <= EPSILON ? 'idle' : workshop.kiln ? 'idle' : 'resting');
  return out;
}

/**
 * Pokácí buk dávky (pařez) a zapíše ho k obnově – na pařez uhlíř později zasadí mladý buk.
 * Vyhrazený buk, který mezitím zmizel (vyklidila ho jiná stavba), se počítá jako skácený, ale
 * není kam sázet.
 */
function fellBeech(state: VillageState, workshop: Workshop, id: number | null, day: number): void {
  if (id === null || !isTreeStanding(state, id, day)) return;
  state.felledTrees = fellTrees(state, [id], day).felledTrees ?? [];
  (workshop.toPlant ??= []).push(id);
}

/** Přirážka za chůzi z dílny k pařezu, na který uhlíř sází (bez vrstvy 1). */
function stumpWalkFactor(obstacles: ObstacleLayer | null, id: number, dwelling: Dwelling): number {
  if (!obstacles) return 1;
  const index = obstacleIndex(obstacles, id);
  if (index < 0) return 1;
  return distanceFactor(
    length2(obstacles.x[index]! - dwelling.position.x, obstacles.z[index]! - dwelling.position.z),
  );
}

/**
 * Kolik uhlí ročně spálí kováři vsi, když kovají celý rok (kg): práce kováře za den ÷ práce na
 * kg nástrojů × 50 kg uhlí × 365. Volající dává práci kovářů (`workshopLabor` v crafts.ts).
 */
export function smithCharcoalPerYear(
  smiths: readonly { labor: number; oreFactor: number }[],
): number {
  return smiths.reduce(
    (sum, s) =>
      sum +
      (s.labor / (CRAFT_PRODUCTION.toolManDaysPerKg * s.oreFactor)) *
        CRAFT_PRODUCTION.toolCharcoalKgPerKg *
        DAYS_PER_YEAR,
    0,
  );
}

/**
 * Uhlí, které ves ještě potřebuje (kg): zásoba na CHARCOAL_KILN.reserveYears spotřeby kovářů
 * minus uhlí v zásobě a v rozdělaných milířích. Kladné = uhlíř smí začít nový milíř.
 */
export function charcoalShortfallKg(
  state: Pick<VillageState, 'dwellings' | 'crafts'>,
  smithPerYearKg: number,
): number {
  const inKilns = state.dwellings.reduce(
    (sum, d) => sum + (d.workshop?.kiln ? kilnYieldKg(d.workshop.kiln) : 0),
    0,
  );
  const stock = state.crafts?.charcoalKg ?? 0;
  return smithPerYearKg * CHARCOAL_KILN.reserveYears - stock - inKilns;
}

/**
 * Uhlíř dnes nemá co dělat – nemá rozdělaný milíř, ves uhlí nepotřebuje a není kam (nebo kdy)
 * sázet: jeho domácnost dnes pracuje se vsí (crafts.md – Uhlíř, návrh Clauda).
 */
export function burnerRests(workshop: Workshop, day: number, shortfallKg: number): boolean {
  if (workshop.kiln) return false;
  if (inPlantingWindow(day) && (workshop.toPlant?.length ?? 0) > 0) return false;
  return shortfallKg <= 0;
}
