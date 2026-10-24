// Měření cest na kopii vsi (docs/superpowers/plans/2026-10-23-roads-v2.md – Úloha 0):
// npx tsx packages/game/scripts/road-report.ts <soubor.json> [--years N] [--roads cesty.json]
//
// Soubor: { "state": <stav vsi>, "landscapeSeed": číslo, "layerVersions": {…}, "name"?: text } –
// tedy sloupce `village.state`, `settlement.landscape_seed` a `settlement.layer_versions` z DB.
// Ves se načte use-casem `updateVillage` (stejné převody jako ve hře) a dopočte N let (výchozí 1).
// Výpis: čas generování krajiny, načtení a dopočtu (ms), velikost stavu (kB), cesty po druzích
// (počet, km), křižovatky (body, kde se potkají ≥ 3 konce úseků), pahýly (krátký úsek s volným
// koncem), uložené trasy (počet, kB) a vyšlapanost (políčka, kB, čas sčítání `settleWear` a zápisu
// `encodeWear` za dopočet zvlášť). Další úlohy přidají vlastní řádky. Kopii stavu
// necommitovat (je jen ve scratchpadu).
import { readFileSync, writeFileSync } from 'node:fs';
import { generateLandscapeAttempt, type LayerVersions } from '../src/domain/landscape';
import type { Road, VillageState } from '../src/domain/village';
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
  stubs: number;
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

/** Křižovatky a pahýly sítě – prosté měření ze stavu, ne pravidlo hry. */
export function networkShape(roads: readonly Road[]): { junctions: number; stubs: number } {
  const ends: { x: number; z: number; road: number }[] = [];
  roads.forEach((r, i) => {
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    if (first) ends.push({ ...first, road: i });
    if (last && last !== first) ends.push({ ...last, road: i });
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
  let stubs = 0;
  roads.forEach((r, i) => {
    if (lengthOf(r) >= STUB_MAX_M) return;
    const mine = ends.filter((e) => e.road === i);
    if (mine.some((e) => degree(e) === 1)) stubs++;
  });
  return { junctions, stubs };
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
  const repo = new SingleVillageRepository('settlement-1', input.name ?? 'Ves', input.state);
  const keep = (state: VillageState): { ok: true; state: VillageState } => ({ ok: true, state });
  const start = input.state.lastDay;

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

  const state = done.village.state;
  onState?.(state);
  const roads = state.roads?.roads ?? [];
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
    ...networkShape(roads),
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
    `křižovatky ${r.junctions}`,
    `pahýly ${r.stubs}`,
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
