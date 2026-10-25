// Stav cest po kusech a zarůstání podle druhů (paths.md – Zarůstání; roads.md – Nový systém cest).
// Deterministická vrstva: stav se sčítá
// celými čísly (setiny cest za den × dny) po týchž intervalech jako vyšlapanost.

import { length2 } from '../../landscape';
import { ROADS, ROAD_ANCHORS, ROAD_DECAY, ROAD_TRAFFIC } from '../rules';
import {
  type Construction,
  type Road,
  type RoadConditionPiece,
  type RoadPoint,
  type StoredRoute,
  type Trail,
  type VillageRoads,
  type VillageState,
} from '../types';
import { MEASURE_STEP_M, axisSlice, lengthsAlong, resample } from './roads-geometry';
import { routeCells } from './routes';

/** Kolik dní má rok ve stavu cest (jako herní rok). */
const DAYS_PER_YEAR = 365.25;

/** Rozhodnutí o druhu cesty pro zarůstání: vyšlapaná, upravená (i s hatí a lávkou), vozová. */
function decayOf(road: Pick<Road, 'grade'>): { keep: number; years: number } {
  if (road.grade === 'wagon') return ROAD_DECAY.wagon;
  return road.grade === 'trodden' ? ROAD_DECAY.trodden : ROAD_DECAY.improved;
}

/** Plný stav kusu cesty (setiny cest za den × dny) – `keep` × roky × dny v roce. */
export function roadFullCondition(road: Pick<Road, 'grade'>): number {
  const { keep, years } = decayOf(road);
  return Math.round(keep * years * DAYS_PER_YEAR);
}

/** Kus osy úseku: od–do (m od začátku osy) a jeho střed ve světě (na cm). */
export interface RoadPiece {
  from: number;
  to: number;
  x: number;
  z: number;
}

/**
 * Kusy osy pro stav cesty (paths.md – Zarůstání): osa rozdělená na stejně dlouhé kusy co nejblíž
 * ROADS.pieceM (kratší úsek je jeden kus).
 */
export function roadPieces(points: readonly RoadPoint[]): RoadPiece[] {
  const at = lengthsAlong(points);
  const length = at[at.length - 1] ?? 0;
  const count = Math.max(1, Math.round(length / ROADS.pieceM));
  const pieces: RoadPiece[] = [];
  for (let k = 0; k < count; k++) {
    const from = (length * k) / count;
    const to = (length * (k + 1)) / count;
    pieces.push({ from, to, ...pointAlong(points, (from + to) / 2) });
  }
  return pieces;
}

/** Stav kusu `piece`: záznam nejbližšího kusu do půl kusu odsud, jinak plný. */
export function conditionOf(
  old: readonly RoadConditionPiece[],
  piece: RoadPiece,
  full: number,
): number {
  let c = full;
  let nearest = ROADS.pieceM / 2;
  for (const entry of old) {
    const d = length2(entry.x - piece.x, entry.z - piece.z);
    if (d <= nearest) {
      nearest = d;
      c = Math.min(full, entry.c);
    }
  }
  return c;
}

/**
 * Provoz po cestě v bodě osy (setiny cest za den): součet cest za den tras, které šly po cestě –
 * mají buňku do `ROAD_TRAFFIC.bandM` od bodu (paths.md – Zarůstání, Provoz po cestě).
 */
export type RoadTraffic = (x: number, z: number) => number;

/** Bez provozu. */
export const NO_ROAD_TRAFFIC: RoadTraffic = () => 0;

/** Klíč buňky mřížky chodců (celá čísla buněk světa – `routeCells`). */
function cellKey(i: number, j: number): number {
  return (i + 32768) * 65536 + (j + 32768);
}

/** Index tras po buňkách posledních sad tras (podle pole tras – dopočet je střídá jen málo). */
const ROAD_TRAFFIC_CACHE = new WeakMap<
  readonly StoredRoute[],
  { cellM: number; at: RoadTraffic }
>();

/**
 * Provoz po cestě ze sady tras (paths.md – Zarůstání, Martin 25. 10. 2026: „proč by lidé chodili
 * kousek vedle, když tam je cesta?“): trasa nese provoz bodu osy jen, když jí vede – prošla pásem
 * úseku v mřížce chodců: některá její buňka (`routeCells`) je do `ROAD_TRAFFIC.bandCells` buňky od
 * bodu (jako `roadBandCells`); každá trasa jednou.
 * Žádné sousední políčko provozního pole (to je pro vznik cest – vyšlapanost). Nic nemění.
 */
export function trafficOnRoads(routes: readonly StoredRoute[], cellM: number): RoadTraffic {
  const cached = ROAD_TRAFFIC_CACHE.get(routes);
  if (cached && cached.cellM === cellM) return cached.at;
  const cells = new Map<number, number[]>();
  routes.forEach((route, k) => {
    if (route.trips <= 0) return;
    for (const [i, j] of routeCells(route)) {
      const key = cellKey(i, j);
      const list = cells.get(key);
      if (!list) cells.set(key, [k]);
      else if (list[list.length - 1] !== k) list.push(k);
    }
  });
  const band = ROAD_TRAFFIC.bandCells;
  const at: RoadTraffic = (x, z) => {
    // pás jako `roadBandCells`: buňky do `bandCells` buňky od bodu osy
    const fi = x / cellM;
    const fj = z / cellM;
    const seen = new Set<number>();
    let sum = 0;
    for (let i = Math.ceil(fi - band); i <= Math.floor(fi + band); i++) {
      for (let j = Math.ceil(fj - band); j <= Math.floor(fj + band); j++) {
        const list = cells.get(cellKey(i, j));
        if (!list || (i - fi) * (i - fi) + (j - fj) * (j - fj) > band * band) continue;
        for (const k of list) {
          if (seen.has(k)) continue;
          seen.add(k);
          sum += routes[k]!.trips;
        }
      }
    }
    return sum;
  };
  ROAD_TRAFFIC_CACHE.set(routes, { cellM, at });
  return at;
}

/** Provoz kusu osy (setiny cest za den): medián provozu po cestě (`RoadTraffic`) po MEASURE_STEP_M. */
function pieceTraffic(axis: readonly RoadPoint[], traffic: RoadTraffic): number {
  const values = resample(axis, null, MEASURE_STEP_M)
    .points.map((p) => traffic(p.x, p.z))
    .sort((a, b) => a - b);
  return values.length === 0 ? 0 : values[Math.floor(values.length / 2)]!;
}

/** Bod u vchodu – do `ROAD_ANCHORS.entranceM` od něj (paths.md – Vchody). */
export function nearEntrance(e: RoadPoint, entrances: readonly RoadPoint[]): boolean {
  return entrances.some((p) => length2(p.x - e.x, p.z - e.z) <= ROAD_ANCHORS.entranceM);
}

/** Cesta končí do ROAD_ANCHORS.entranceM od některého vchodu (kotvy `entrance`). */
function endsAtEntrance(road: Road, entrances: readonly RoadPoint[]): boolean {
  const ends = [road.points[0]!, road.points[road.points.length - 1]!];
  return ends.some((e) => nearEntrance(e, entrances));
}

/**
 * Živý konec cesty pro křižovatku (paths.md – Křižovatky): cesta, kterou vede trasa aspoň
 * v udržovacím prahu jejího druhu – provoz kusu u konce (`atStart`) jako ve stavu kusů
 * (`settleRoadCondition`: cesta do vchodu se drží, jízdy vozů loni). Opuštěná ne; zemská stezka
 * a cesta ve vylepšení (`frozen` – nezarůstají) ano.
 */
export function liveRoadEnd(
  road: Road,
  atStart: boolean,
  traffic: RoadTraffic,
  entrances: readonly RoadPoint[],
  frozen: ReadonlySet<number>,
): boolean {
  if (road.abandoned || road.points.length < 2) return false;
  if (road.link || frozen.has(road.id) || endsAtEntrance(road, entrances)) return true;
  const { keep } = decayOf(road);
  if (Math.round((road.cartTraffic?.[road.cartTraffic.length - 1] ?? 0) * 100) >= keep) return true;
  const pieces = roadPieces(road.points);
  const piece = atStart ? pieces[0] : pieces[pieces.length - 1];
  if (!piece) return false;
  return pieceTraffic(axisSlice(road.points, piece.from, piece.to), traffic) >= keep;
}

/** Úseky, které se nemění: ve vylepšení (stavby `road`) a zemské stezky (nezarůstají). */
export function fixedRoadIds(
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
): Set<number> {
  return new Set([
    ...constructions.flatMap((c) => c.roadIds ?? []),
    ...(trails ?? []).flatMap((t) => t.pieces.map((p) => p.roadId)),
  ]);
}

/**
 * Stav cest za dny `from`–`to` (mutuje; paths.md – Zarůstání, Martin 23. 10. 2026): každý kus osy
 * (`roadPieces`) přičte (provoz − `keep` druhu) × dny, nejvýš do plného stavu a nejníž na nulu;
 * provoz je medián provozu po cestě po kusu (`trafficOnRoads` – jen trasy, které šly po ní; a jízdy
 * vozů loni). Opuštěný úsek provoz nedostane nikdy – bledne a zmizí. Zemská stezka, cesta ve
 * vylepšení a cesta, která končí ve vchodu (`entrances` – kotvy z tras: ke stavbě se chodí),
 * nezarůstají. Uloží jen kusy pod plným stavem. Jen sčítá – kusy na nule vyřízne `cutDeadRoads`.
 */
export function settleRoadCondition(
  roads: VillageRoads,
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
  traffic: RoadTraffic,
  entrances: readonly RoadPoint[],
  from: number,
  to: number,
): void {
  const days = to - from;
  if (days <= 0 || roads.roads.length === 0) return;
  const frozen = fixedRoadIds(constructions, trails);
  for (const road of roads.roads) {
    if (frozen.has(road.id) || road.link || road.points.length < 2) continue;
    const full = roadFullCondition(road);
    const { keep } = decayOf(road);
    // opuštěná cesta u vchodu se nedrží – po ní nikdo nechodí, časem zmizí
    const held = !road.abandoned && endsAtEntrance(road, entrances);
    // opuštěný úsek provoz nedostane (paths.md – Zarůstání, Martin 25. 10. 2026)
    const cart = road.abandoned
      ? 0
      : Math.round((road.cartTraffic?.[road.cartTraffic.length - 1] ?? 0) * 100);
    const old = road.condition ?? [];
    const next: RoadConditionPiece[] = [];
    for (const piece of roadPieces(road.points)) {
      const before = conditionOf(old, piece, full);
      const on = held
        ? keep
        : road.abandoned
          ? 0
          : Math.max(pieceTraffic(axisSlice(road.points, piece.from, piece.to), traffic), cart);
      const c = Math.max(0, Math.min(full, before + (on - keep) * days));
      if (c < full) next.push({ x: piece.x, z: piece.z, c });
    }
    if (next.length > 0) road.condition = next;
    else delete road.condition;
  }
}

/**
 * Opuštěný kus pod hotovou stavbou zmizí do roka (`ROAD_TRAFFIC.underBuildingDays`; paths.md –
 * Stavba přes cestu, návrh Clauda 25. 10. 2026; mutuje): kusy osy pod stavbou (`under` – osa kusu
 * vede neprůchodnou plochou) mají stav nejvýš udržovací práh × ty dny. Jen snižuje – opakovaně
 * beze změny. Vrátí, jestli něco snížil.
 */
export function capUnderBuilding(
  road: Road,
  under: (axis: readonly RoadPoint[]) => boolean,
): boolean {
  if (!road.abandoned || road.points.length < 2) return false;
  const { keep } = decayOf(road);
  const full = roadFullCondition(road);
  const cap = keep * ROAD_TRAFFIC.underBuildingDays;
  if (cap >= full) return false;
  const old = road.condition ?? [];
  let changed = false;
  const next: RoadConditionPiece[] = [];
  for (const piece of roadPieces(road.points)) {
    const before = conditionOf(old, piece, full);
    const c = under(axisSlice(road.points, piece.from, piece.to)) ? Math.min(before, cap) : before;
    if (c !== before) changed = true;
    if (c < full) next.push({ x: piece.x, z: piece.z, c });
  }
  if (!changed) return false;
  road.condition = next;
  return true;
}

/**
 * Stav cest staré vsi z historie (paths.md – Převod starých vsí, bod 2; jednou a idempotentně):
 * cesta bez `condition`, ale s dosud nezarůstající historií se převede – kus s provozem
 * v posledním roce nad udržovacím prahem druhu je plný, jinak plný × (1 − tiché roky / roky
 * zarůstání druhu). Tiché roky = roky od konce `traffic` (provoz pod `keep`), nejvýš
 * `ROADS.overgrowYears` a `years` − 1; nic nezmizí hned. Cesta, která už stav má, nebo plná, se nemění.
 */
export function withRoadConditionOf(roads: VillageRoads): boolean {
  if (roads.conditionSeeded) return false;
  roads.conditionSeeded = true;
  let changed = false;
  for (const road of roads.roads) {
    if (road.condition || road.traffic.length === 0 || road.points.length < 2) continue;
    const { keep, years } = decayOf(road);
    const full = roadFullCondition(road);
    let quiet = 0;
    for (let k = road.traffic.length - 1; k >= 0; k--) {
      if (road.traffic[k]! * 100 >= keep) break;
      quiet++;
    }
    if (quiet === 0) continue;
    // nejvýš `years` − 1 tichých let – nic nezmizí hned
    const silent = Math.min(quiet, ROADS.overgrowYears, years - 1);
    const c = Math.round((full * (years - silent)) / years);
    if (c >= full) continue;
    road.condition = roadPieces(road.points).map((p) => ({ x: p.x, z: p.z, c }));
    changed = true;
  }
  return changed;
}

/** Bod osy `d` m od začátku (na cm). */
function pointAlong(points: readonly RoadPoint[], d: number): RoadPoint {
  return axisSlice(points, d, d)[0]!;
}

/**
 * Stav kusů cest staré vsi z historie (paths.md – Převod starých vsí, bod 2; plán cest v2,
 * Úloha 7): ves bez `conditionSeeded` dostane `Road.condition` z provozu loňských let
 * (`withRoadConditionOf`) a příznak. Jednou a idempotentně; stav vsi se nemění, vrátí se kopie.
 */
export function withRoadCondition(state: VillageState): VillageState {
  const roads = state.roads;
  if (!roads || roads.conditionSeeded) return state;
  const copy: VillageRoads = { ...roads, roads: roads.roads.map((r) => ({ ...r })) };
  withRoadConditionOf(copy);
  return { ...state, roads: copy };
}
