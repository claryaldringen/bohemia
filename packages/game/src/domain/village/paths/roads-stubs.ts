// Pahýly a okruhy v síti pevných cest (paths.md – Síť – kotvy, pahýly a úklid; Martin, #6: „Každá
// cesta vede odněkud někam … Pahýly bez cíle nevznikají, a když po dělení a spojování cest nějaký
// zbude, sloučí se se sousední cestou nebo zmizí.“). Pahýl je konec úseku mimo kotvu a mimo jinou
// cestu. Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { length2 } from '../../landscape';
import { ROAD_STUBS, ROAD_TREES } from '../rules';
import type { Construction, Road, RoadPoint, Trail, VillageRoads } from '../types';
import { fixedRoadIds } from './road-condition';
import {
  ATTACH_M,
  END_SNAP_M,
  MIN_ROAD_M,
  SAMPLE_M,
  axisDistance,
  axisSlice,
  groundPart,
  lengthsAlong,
  nearestOnRoads,
  resample,
  roadLengthM,
} from './roads-geometry';
import { endKey, splitRoad } from './roads-form';
import { relinkApples } from './roads-overgrow';
import { type SpotContext } from './roads-trees';

/** Co úklid pahýlů potřebuje znát ze sítě tras: kotvy a čáry tras (nejsilnější napřed). */
export interface StubNetwork {
  /** Smí cesta v bodě končit (kotva – `anchorTermini`)? */
  isAnchor: (p: RoadPoint) => boolean;
  lines: readonly (readonly RoadPoint[])[];
  trails?: readonly Trail[] | undefined;
}

/** Kolik konců živých úseků je v bodě (klíč na cm). */
function liveEnds(roads: readonly Road[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const road of roads) {
    if (road.points.length < 2 || road.abandoned) continue;
    for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
      const key = endKey(p);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return count;
}

/** Úseky, které úklid pahýlů nemění: ve stavbě, zemské stezky a vozové cesty (zemní práce). */
function untouchable(
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
): (road: Road) => boolean {
  const fixed = fixedRoadIds(constructions, trails);
  return (road) =>
    road.abandoned === true ||
    road.points.length < 2 ||
    road.grade === 'wagon' ||
    fixed.has(road.id);
}

/**
 * Okruh přes jeden uzel (úsek, který začíná i končí v rozcestí s dalšími úseky) se rozdělí
 * v nejvzdálenějším bodě osy na dva úseky (paths.md – „Jedna cesta hráče se v uzlu nepotká sama
 * se sebou“). Malý okruh se pak uklidí jako copánek a pahýl. Vrátí, jestli něco rozdělil (mutuje).
 */
/** Index prvního okruhu přes jeden uzel (začíná i končí v rozcestí); jinak −1. */
function loopIndex(roads: VillageRoads, skip: (road: Road) => boolean): number {
  const degrees = liveEnds(roads.roads);
  return roads.roads.findIndex((road) => {
    if (skip(road) || road.points.length < 3) return false;
    const key = endKey(road.points[0]!);
    return key === endKey(road.points[road.points.length - 1]!) && (degrees.get(key) ?? 0) > 2;
  });
}

/** Je v síti okruh přes jeden uzel (`splitLoops`)? Nic nemění. */
export function hasLoop(
  roads: VillageRoads,
  constructions: readonly Construction[],
  trails?: readonly Trail[],
): boolean {
  return loopIndex(roads, untouchable(constructions, trails)) >= 0;
}

export function splitLoops(
  roads: VillageRoads,
  constructions: readonly Construction[],
  context: SpotContext,
  trails?: readonly Trail[],
): boolean {
  const skip = untouchable(constructions, trails);
  let split = false;
  for (let guard = roads.roads.length; guard > 0; guard--) {
    const index = loopIndex(roads, skip);
    if (index < 0) break;
    const road = roads.roads[index]!;
    const node = road.points[0]!;
    let far = 1;
    for (let k = 2; k < road.points.length - 1; k++) {
      const p = road.points[k]!;
      const q = road.points[far]!;
      if (length2(p.x - node.x, p.z - node.z) > length2(q.x - node.x, q.z - node.z)) far = k;
    }
    splitRoad(
      roads,
      { road: index, segment: far - 1, point: { ...road.points[far]! }, distance: 0 },
      context,
    );
    split = true;
  }
  return split;
}

/** Pahýl: úsek, jeho konec mimo kotvu a délka osy. */
interface Stub {
  road: Road;
  atStart: boolean;
  length: number;
  /** Druhý konec není v uzlu ani na jiné cestě – samotný kus bez napojení. */
  alone: boolean;
}

/**
 * První pahýl (v pořadí úseků): konec živého úseku, ve kterém nekončí jiný úsek, který neleží
 * u kotvy (`isAnchor`) ani na jiné cestě (do END_SNAP_M – díra, kterou zacelí `joinRoadGaps`).
 * Konce v `accepted` (zkrácené na poslední bod trasy) se přeskočí. Jinak null.
 */
function firstStub(
  roads: VillageRoads,
  skip: (road: Road) => boolean,
  isAnchor: (p: RoadPoint) => boolean,
  accepted: ReadonlySet<string>,
): Stub | null {
  const degrees = liveEnds(roads.roads);
  for (const road of roads.roads) {
    if (skip(road)) continue;
    for (const atStart of [true, false]) {
      const p = atStart ? road.points[0]! : road.points[road.points.length - 1]!;
      const key = endKey(p);
      if ((degrees.get(key) ?? 0) !== 1 || accepted.has(key) || isAnchor(p)) continue;
      const others = roads.roads.map((r) => (r === road ? { ...r, points: [] } : r));
      const hit = nearestOnRoads(others, p.x, p.z);
      if (hit && hit.distance <= END_SNAP_M) continue;
      const q = atStart ? road.points[road.points.length - 1]! : road.points[0]!;
      const joined = nearestOnRoads(others, q.x, q.z);
      const alone =
        (degrees.get(endKey(q)) ?? 0) === 1 && (!joined || joined.distance > END_SNAP_M);
      return { road, atStart, length: roadLengthM(road), alone };
    }
  }
  return null;
}

/** Odstraní úsek (místa na stromy s ním – stromy stojí dál; jabloně k nejbližší cestě). */
function dropRoad(roads: VillageRoads, road: Road): void {
  roads.roads.splice(roads.roads.indexOf(road), 1);
  relinkApples(roads, road.id);
}

/**
 * Jak daleko od uzlu (m, od konce naproti pahýlu) úsek ponechat: poslední vzorek osy, kudy vede
 * trasa (do `ROAD_STUBS.routeM` od její čáry), a nejméně k místu, kde k ose přiléhá konec jiné
 * cesty (do ATTACH_M – napojení objížďky nesmí zůstat bez cesty).
 */
function keptLength(roads: VillageRoads, stub: Stub, lines: StubNetwork['lines']): number {
  const { road, atStart, length } = stub;
  const fromNode = atStart ? [...road.points].reverse() : road.points;
  const samples = resample(fromNode, null, SAMPLE_M).points;
  const at = lengthsAlong(samples);
  const route = axisDistance(lines);
  let kept = 0;
  samples.forEach((p, k) => {
    if (route(p.x, p.z) <= ROAD_STUBS.routeM) kept = at[k]!;
  });
  // konce jiných živých úseků u osy (mimo uzel) – úsek se nezkrátí za ně
  const node = fromNode[0]!;
  for (const other of roads.roads) {
    if (other === road || other.abandoned || other.points.length < 2) continue;
    for (const e of [other.points[0]!, other.points[other.points.length - 1]!]) {
      if (endKey(e) === endKey(node)) continue;
      let best = Infinity;
      let along = 0;
      samples.forEach((p, k) => {
        const d = length2(p.x - e.x, p.z - e.z);
        if (d < best) {
          best = d;
          along = at[k]!;
        }
      });
      if (best <= ATTACH_M) kept = Math.max(kept, along);
    }
  }
  return Math.min(length, kept);
}

/** Zkrátí úsek na `kept` m od uzlu (konec naproti pahýlu) – mutuje. */
function shortenRoad(stub: Stub, kept: number): void {
  const { road, atStart, length } = stub;
  const from = atStart ? length - kept : 0;
  const to = atStart ? length : kept;
  road.points = axisSlice(road.points, from, to);
  if (road.ground) road.ground = groundPart(road.ground, from, to);
  const axis = axisDistance([road.points]);
  road.spots = road.spots.filter((s) => axis(s.x, s.z) <= ROAD_TREES.offsetM.to + 1);
  if (road.condition) {
    const pieces = road.condition.filter((q) => axis(q.x, q.z) <= 1);
    if (pieces.length > 0) road.condition = pieces;
    else delete road.condition;
  }
  delete road.lined;
}

/** Co s pahýlem: zmizí, zkrátí se na `kept` m od uzlu, nebo zůstane (`keep`). */
type StubAction = { kind: 'drop' } | { kind: 'trim'; kept: number } | { kind: 'keep' };

/**
 * Pahýl (paths.md – Síť – kotvy, pahýly a úklid): kus od pahýlu k nejbližšímu uzlu kratší než
 * `ROAD_STUBS.dropBelowM` zmizí, delší se zkrátí na poslední bod, kudy vede trasa (`keptLength`)
 * – nejvýš k napojení jiné cesty. Delší kus bez uzlu nebo bez trasy (vede-li trasa po méně než
 * MIN_ROAD_M) zůstane a zarůstá po kusech (stará cesta oklikou u vozové). Upravenou cestu postavil
 * hráč (Převod: „upravené a vozové zůstanou“) – zmizí jen kratší než MIN_ROAD_M, jinak zůstane
 * a zarůstá podle druhu (návrh Clauda).
 */
function stubAction(roads: VillageRoads, stub: Stub, lines: StubNetwork['lines']): StubAction {
  if (stub.road.grade !== 'trodden') {
    return stub.length < MIN_ROAD_M ? { kind: 'drop' } : { kind: 'keep' };
  }
  if (stub.length < ROAD_STUBS.dropBelowM) return { kind: 'drop' };
  // samotný kus bez uzlu nemá „nejbližší uzel“ a kus, po kterém trasa nevede, je nepoužívaný –
  // zarůstá podle druhu po kusech (paths.md – Zarůstání), nemizí naráz
  if (stub.alone) return { kind: 'keep' };
  const kept = keptLength(roads, stub, lines);
  if (kept < MIN_ROAD_M) return { kind: 'keep' };
  return kept < stub.length - SAMPLE_M ? { kind: 'trim', kept } : { kind: 'keep' };
}

/** Konec pahýlu (klíč) – po zkrácení nebo ponechání se už jako pahýl neřeší. */
function stubEndKey(stub: Stub): string {
  const { road, atStart } = stub;
  return endKey(atStart ? road.points[0]! : road.points[road.points.length - 1]!);
}

/** Má úklid pahýlů co dělat (`trimStubs` by něco změnil)? Nic nemění. */
export function hasStubWork(
  roads: VillageRoads,
  constructions: readonly Construction[],
  network: StubNetwork,
): boolean {
  const skip = untouchable(constructions, network.trails);
  const accepted = new Set<string>();
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const stub = firstStub(roads, skip, network.isAnchor, accepted);
    if (!stub) return false;
    if (stubAction(roads, stub, network.lines).kind !== 'keep') return true;
    accepted.add(stubEndKey(stub));
  }
  return false;
}

/**
 * Pahýly (paths.md – Síť – kotvy, pahýly a úklid; mutuje): zmizí, nebo se zkrátí (`stubAction`);
 * uzel u zmizelého pahýlu pak spojí `mergeRoadChains`. Vozové cesty, cesty ve stavbě a zemské
 * stezky se nemění. Vrátí, jestli něco změnil.
 */
export function trimStubs(
  roads: VillageRoads,
  constructions: readonly Construction[],
  network: StubNetwork,
): boolean {
  const skip = untouchable(constructions, network.trails);
  const accepted = new Set<string>();
  let changed = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const stub = firstStub(roads, skip, network.isAnchor, accepted);
    if (!stub) break;
    const action = stubAction(roads, stub, network.lines);
    if (action.kind === 'drop') {
      dropRoad(roads, stub.road);
      changed = true;
      continue;
    }
    if (action.kind === 'trim') {
      shortenRoad(stub, action.kept);
      changed = true;
    }
    // konec, kudy trasa odbočí z cesty (pěšina dál vede ke kotvě), a upravená cesta zůstanou
    accepted.add(stubEndKey(stub));
  }
  return changed;
}
