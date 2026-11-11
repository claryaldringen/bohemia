// Měření cest na kopii vsi (docs/superpowers/plans/2026-10-23-roads-v2.md – Úloha 0):
// npx tsx packages/game/scripts/road-report.ts <soubor.json> [--years N] [--roads cesty.json]
//
// Soubor: { "state": <stav vsi>, "landscapeSeed": číslo, "layerVersions": {…}, "name"?: text } –
// tedy stav vsi (v DB komprimovaný – `storedVillageState` z `@bohemia/db/village-state`),
// `settlement.landscape_seed` a `settlement.layer_versions` z DB.
// Ves se načte use-casem `updateVillage` (stejné převody jako ve hře) a dopočte N let (výchozí 1).
// Výpis: čas generování krajiny, načtení a dopočtu (ms), velikost stavu (kB), cesty po druzích
// (počet, km), křižovatky (body, kde se potkají ≥ 3 konce úseků), pahýly (krátký úsek s volným
// koncem), uložené trasy (počet, kB) a vyšlapanost (políčka, kB, čas sčítání `settleWear` a zápisu
// `encodeWear` za dopočet zvlášť). Další úlohy přidají vlastní řádky. Kopii stavu
// necommitovat (je jen ve scratchpadu).
import { readFileSync, writeFileSync } from 'node:fs';
import {
  generateLandscapeAttempt,
  type Landscape,
  type LayerVersions,
} from '../src/domain/landscape';
import type { Road, RoadJunction, RoadPoint, VillageState } from '../src/domain/village';
import { ROAD_ANCHORS } from '../src/domain/village/rules';
import { anchorKindOf, roadAnchors } from '../src/domain/village/paths/road-anchors';
import {
  END_SNAP_M,
  PARALLEL_MIN_M,
  PARALLEL_STEP_M,
  alongsideRoad,
  nearestOnRoads,
  resample,
} from '../src/domain/village/paths/roads-geometry';
import { anchorTermini } from '../src/domain/village/paths/roads-tidy';
import { JUNCTION_RUNS } from '../src/domain/village/paths/junctions';
import { routeLine } from '../src/domain/village/paths/routes';
import { ROADS_MONTH_TIMING } from '../src/domain/village/paths/roads';
import { villageBlockedAt } from '../src/domain/village/paths/village';
import { pathCellM } from '../src/domain/village/paths/terrain';
import { updateVillage } from '../src/application/update-village';
import { WEAR_TIMING, decodeWear } from '../src/domain/village/paths/wear';
import { SingleVillageRepository } from './lib/memory-villages';

/** Vstup měření – stav vsi a údaje sídla, ze kterých se dá znovu vygenerovat krajina. */
export interface RoadReportInput {
  state: VillageState;
  landscapeSeed: number;
  layerVersions: LayerVersions;
  name?: string;
}

/** Úsek kratší než tohle (m) s volným koncem je pahýl. */
export const STUB_MAX_M = 30;
/** Dvě osy se v jednom bodě potkávají, když jejich konce leží blíž než tohle (m). */
const JOIN_M = 0.5;
const DAYS_PER_YEAR = 365;

export interface RoadReport {
  landscapeMs: number;
  loadMs: number;
  advanceMs: number;
  years: number;
  stateKb: number;
  roads: number;
  totalKm: number;
  byGrade: Record<string, { count: number; km: number }>;
  junctions: number;
  /** Křižovatky jako objekty (paths.md – Křižovatky): Y, kříž, znamení a uzly s 5+ konci. */
  junctionObjects: { y: number; cross: number; tree: number; stone: number; post: number };
  crowdedNodes: number;
  /** Přepočty křižovatek a ohyby konců os během dopočtu (`JUNCTION_RUNS`). */
  junctionRefits: number;
  junctionBends: number;
  stubs: number;
  endsOffAnchor: number;
  /** Volné konce mimo kotvu: id úseku, druh, poloha (m). */
  looseEnds: string[];
  parallelPairs: number;
  /** Opuštěné kusy pod stavbou (nejsou v síti) a stavby bez cesty do vchodu (paths.md – Vchody). */
  abandoned: number;
  entrancesWithoutRoad: number;
  /** Uložené trasy, které uvnitř (mimo první a poslední 3 body) vedou přes neprůchodnou plochu (ohrada, stavba). */
  routesThroughBlocked: number;
  /** Čas měsíčních kontrol `roadsMonth` během dopočtu (ms) a jejich počet. */
  monthMs: number;
  months: number;
  /** Cesty založené během dopočtu (kronika `road-formed`) a nová id úseků (i pohlcené úklidem). */
  formed: number;
  newIds: number;
  /** Uložené trasy (`VillageState.routes`) – počet a velikost v JSON (kB). */
  routes: number;
  routesKb: number;
  /** Vyšlapanost (`roads.wear`) – nenulová políčka, velikost v JSON (kB). */
  wearCells: number;
  wearKb: number;
  /** Čas sčítání vyšlapanosti a zápisu do stavu během dopočtu (ms) a kolikrát. */
  settleMs: number;
  settles: number;
  encodeMs: number;
  encodes: number;
}

function lengthOf(road: Road): number {
  let sum = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!;
    const b = road.points[i]!;
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/** Tvar sítě živých úseků (opuštěné kusy pod stavbou nejsou cesty). */
export interface NetworkShape {
  junctions: number;
  /** Úsek kratší než STUB_MAX_M s volným koncem mimo kotvu (paths.md – Síť: pahýl). */
  stubs: number;
  /** Volné konce mimo kotvu a mimo jinou cestu (Úloha 8 – po úklidu 0). */
  endsOffAnchor: number;
  /** Volné konce mimo kotvu: id úseku, druh a poloha (m). */
  looseEnds: string[];
  /** Dvojice úseků se souběžným kusem aspoň PARALLEL_MIN_M (`alongsideRoad`). */
  parallelPairs: number;
}

/** Délka nejdelšího souběžného kusu úseku `road` s úsekem `other` (m). */
function parallelM(road: Road, other: Road): number {
  const samples = resample(road.points, null, PARALLEL_STEP_M).points;
  let best = 0;
  let run = 0;
  samples.forEach((p, k) => {
    const before = samples[Math.max(0, k - 1)]!;
    const after = samples[Math.min(samples.length - 1, k + 1)]!;
    run = alongsideRoad([other], p, before, after) ? run + PARALLEL_STEP_M : 0;
    best = Math.max(best, run);
  });
  return best;
}

/**
 * Křižovatky, pahýly, konce mimo kotvu a souběžné dvojice sítě – prosté měření ze stavu, ne
 * pravidlo hry. Bez kotev (`isAnchor`) je každý volný konec mimo kotvu.
 */
export function networkShape(
  all: readonly Road[],
  isAnchor: (p: RoadPoint) => boolean = () => false,
): NetworkShape {
  const roads = all.filter((r) => !r.abandoned && r.points.length >= 2);
  const ends: { x: number; z: number; road: number }[] = [];
  roads.forEach((r, i) => {
    ends.push({ ...r.points[0]!, road: i }, { ...r.points[r.points.length - 1]!, road: i });
  });
  const degree = (e: { x: number; z: number }): number =>
    ends.filter((o) => Math.hypot(o.x - e.x, o.z - e.z) < JOIN_M).length;
  const seen = new Set<string>();
  let junctions = 0;
  for (const e of ends) {
    if (degree(e) < 3) continue;
    const key = `${Math.round(e.x)},${Math.round(e.z)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    junctions++;
  }
  // volný konec mimo kotvu, který neleží na jiné cestě (do END_SNAP_M)
  const offAnchor = (e: { x: number; z: number; road: number }): boolean => {
    if (degree(e) !== 1 || isAnchor(e)) return false;
    const others = roads.filter((_, i) => i !== e.road);
    const hit = nearestOnRoads(others, e.x, e.z);
    return !hit || hit.distance > END_SNAP_M;
  };
  const loose = ends.filter(offAnchor);
  let stubs = 0;
  roads.forEach((r, i) => {
    if (lengthOf(r) < STUB_MAX_M && loose.some((e) => e.road === i)) stubs++;
  });
  let parallelPairs = 0;
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const m = Math.max(parallelM(roads[i]!, roads[j]!), parallelM(roads[j]!, roads[i]!));
      if (m >= PARALLEL_MIN_M) parallelPairs++;
    }
  }
  const looseEnds = loose.map((e) => {
    const r = roads[e.road]!;
    return `${r.id}:${r.grade}@${Math.round(e.x)},${Math.round(e.z)}`;
  });
  return { junctions, stubs, endsOffAnchor: loose.length, looseEnds, parallelPairs };
}

/**
 * Hotové stavby, ke kterým se chodí (trasa s provozem stavby do vchodu) a do jejichž vchodu
 * (do ROAD_ANCHORS.entranceM) nevede živá cesta (paths.md – Vchody).
 */
function entrancesWithoutRoad(state: VillageState, landscape: Landscape): number {
  const cellM = pathCellM(landscape);
  const roads = (state.roads?.roads ?? []).filter((r) => !r.abandoned);
  let missing = 0;
  const seen = new Set<string>();
  for (const route of state.routes?.list ?? []) {
    if (!route.visit || anchorKindOf(route.to, route.purpose) !== 'entrance') continue;
    if (seen.has(route.visit)) continue;
    seen.add(route.visit);
    const line = routeLine(route, cellM);
    const gate = line[line.length - 1];
    const hit = gate ? nearestOnRoads(roads, gate.x, gate.z) : null;
    if (!hit || hit.distance > ROAD_ANCHORS.entranceM) missing++;
  }
  return missing;
}

/** Uložené trasy vedoucí uvnitř přes neprůchodnou plochu vsi (ohrady, stavby – paths.md). */
function routesThroughBlocked(state: VillageState, landscape: Landscape): number {
  const blocked = villageBlockedAt(state, state.lastDay, landscape);
  if (!blocked) return 0;
  const cellM = pathCellM(landscape);
  let bad = 0;
  for (const route of state.routes?.list ?? []) {
    const line = routeLine(route, cellM);
    const inner = line.slice(3, Math.max(3, line.length - 3));
    if (inner.some((p) => blocked(p.x, p.z))) bad++;
  }
  return bad;
}

/** Načte a dopočte ves, vrátí naměřená čísla. */
export async function roadReport(
  input: RoadReportInput,
  years: number,
  onState?: (state: VillageState) => void,
): Promise<RoadReport> {
  let t = performance.now();
  const landscape = generateLandscapeAttempt(input.landscapeSeed, input.layerVersions);
  const landscapeMs = performance.now() - t;
  WEAR_TIMING.clock = (): number => performance.now();
  ROADS_MONTH_TIMING.clock = (): number => performance.now();
  ROADS_MONTH_TIMING.ms = 0;
  ROADS_MONTH_TIMING.runs = 0;
  const repo = new SingleVillageRepository('settlement-1', input.name ?? 'Ves', input.state);
  const keep = (state: VillageState): { ok: true; state: VillageState } => ({ ok: true, state });
  const start = input.state.lastDay;
  const runs = { ...JUNCTION_RUNS };

  t = performance.now();
  const loaded = await updateVillage(repo, repo.record.id, start, landscape, keep);
  const loadMs = performance.now() - t;
  if (!loaded.ok) throw new Error(loaded.reason);

  t = performance.now();
  const done = await updateVillage(
    repo,
    repo.record.id,
    start + years * DAYS_PER_YEAR,
    landscape,
    keep,
  );
  const advanceMs = performance.now() - t;
  if (!done.ok) throw new Error(done.reason);
  const { settleMs, settles, encodeMs, encodes } = WEAR_TIMING;
  WEAR_TIMING.clock = null;
  ROADS_MONTH_TIMING.clock = null;

  const state = done.village.state;
  onState?.(state);
  const roads = (state.roads?.roads ?? []).filter((r) => !r.abandoned);
  const all = state.roads?.roads ?? [];
  const wear = state.roads?.wear;
  const byGrade: RoadReport['byGrade'] = {};
  let totalM = 0;
  for (const r of roads) {
    const m = lengthOf(r);
    totalM += m;
    const g = (byGrade[r.grade] ??= { count: 0, km: 0 });
    g.count++;
    g.km += m / 1000;
  }
  return {
    landscapeMs,
    loadMs,
    advanceMs,
    years,
    stateKb: JSON.stringify(state).length / 1024,
    roads: roads.length,
    totalKm: totalM / 1000,
    byGrade,
    ...networkShape(roads, anchorTermini(roadAnchors(state.routes?.list ?? [], landscape))),
    junctionObjects: junctionObjects(state.roads?.junctions ?? []),
    crowdedNodes: crowdedNodes(roads),
    junctionRefits: JUNCTION_RUNS.refits - runs.refits,
    junctionBends: JUNCTION_RUNS.bends - runs.bends,
    abandoned: all.length - roads.length,
    entrancesWithoutRoad: entrancesWithoutRoad(state, landscape),
    routesThroughBlocked: routesThroughBlocked(state, landscape),
    monthMs: ROADS_MONTH_TIMING.ms,
    months: ROADS_MONTH_TIMING.runs,
    formed: state.chronicle.filter((e) => e.kind === 'road-formed' && e.day > start).length,
    newIds: (state.roads?.nextId ?? 1) - (input.state.roads?.nextId ?? 1),
    routes: state.routes?.list.length ?? 0,
    routesKb: state.routes ? JSON.stringify(state.routes).length / 1024 : 0,
    wearCells: wear ? decodeWear(wear.cells).size : 0,
    wearKb: wear ? JSON.stringify(wear).length / 1024 : 0,
    settleMs,
    settles,
    encodeMs,
    encodes,
  };
}

/** Křižovatky jako objekty po tvarech a znameních. */
function junctionObjects(list: readonly RoadJunction[]): RoadReport['junctionObjects'] {
  const out = { y: 0, cross: 0, tree: 0, stone: 0, post: 0 };
  for (const j of list) {
    out[j.shape]++;
    out[j.landmark.kind]++;
  }
  return out;
}

/** Uzly, kde končí 5 a víc živých úseků (křižovatka by se rozdělila – `splitCrowdedNode`). */
function crowdedNodes(roads: readonly Road[]): number {
  const count = new Map<string, number>();
  for (const r of roads) {
    for (const p of [r.points[0]!, r.points[r.points.length - 1]!]) {
      const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return [...count.values()].filter((n) => n >= 5).length;
}

/** Jednořádkový výpis do zprávy úlohy. */
export function formatReport(r: RoadReport): string {
  const grades = Object.entries(r.byGrade)
    .map(([g, v]) => `${g} ${v.count} (${v.km.toFixed(2)} km)`)
    .join(', ');
  return [
    `krajina ${r.landscapeMs.toFixed(0)} ms`,
    `načtení ${r.loadMs.toFixed(0)} ms`,
    `dopočet ${r.years} let ${r.advanceMs.toFixed(0)} ms`,
    `stav ${r.stateKb.toFixed(0)} kB`,
    `cesty ${r.roads} (${r.totalKm.toFixed(2)} km): ${grades || '–'}`,
    `křižovatky ${r.junctions} (objekty: Y ${r.junctionObjects.y}, kříž ${r.junctionObjects.cross}, ` +
      `uzly 5+ ${r.crowdedNodes}; znamení strom ${r.junctionObjects.tree}, kámen ` +
      `${r.junctionObjects.stone}, kůl ${r.junctionObjects.post}; přepočty ${r.junctionRefits}, ` +
      `ohyby ${r.junctionBends})`,
    `konce mimo kotvu ${r.endsOffAnchor}${r.looseEnds.length ? ` [${r.looseEnds.join(' ')}]` : ''}`,
    `pahýly < ${STUB_MAX_M} m ${r.stubs}`,
    `souběžné páry ${r.parallelPairs}`,
    `opuštěné ${r.abandoned}`,
    `vchody bez cesty ${r.entrancesWithoutRoad}`,
    `trasy přes neprůchodné ${r.routesThroughBlocked}`,
    `roadsMonth ${r.months}× ${r.monthMs.toFixed(0)} ms (Ø ${(r.monthMs / Math.max(1, r.months)).toFixed(1)} ms)`,
    `vzniklo ${r.formed} (nových id ${r.newIds})`,
    `trasy ${r.routes} (${r.routesKb.toFixed(1)} kB)`,
    `vyšlapanost ${r.wearCells} políček (${r.wearKb.toFixed(1)} kB)`,
    `settleWear ${r.settles}× ${r.settleMs.toFixed(0)} ms`,
    `encodeWear ${r.encodes}× ${r.encodeMs.toFixed(0)} ms`,
  ].join(' | ');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const yearsAt = args.indexOf('--years');
  const years = yearsAt >= 0 ? Number(args[yearsAt + 1]) : 1;
  const roadsAt = args.indexOf('--roads');
  const roadsFile = roadsAt >= 0 ? args[roadsAt + 1] : undefined;
  const value = (i: number, at: number): boolean => at >= 0 && i === at + 1;
  const file = args.find((a, i) => !a.startsWith('--') && !value(i, yearsAt) && !value(i, roadsAt));
  if (!file || !Number.isFinite(years) || years < 0) {
    console.error('Použití: road-report.ts <soubor.json> [--years N]');
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(file, 'utf8')) as RoadReportInput;
  const dump = (state: VillageState): void => {
    if (roadsFile) writeFileSync(roadsFile, JSON.stringify(state.roads?.roads ?? []));
  };
  console.log(formatReport(await roadReport(input, years, dump)));
}

if (process.argv[1]?.endsWith('road-report.ts')) {
  void main();
}
