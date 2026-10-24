// Pahýly a okruhy v síti pevných cest (paths.md – Síť – kotvy, pahýly a úklid; Martin, #6: „Každá
// cesta vede odněkud někam … Pahýly bez cíle nevznikají, a když po dělení a spojování cest nějaký
// zbude, sloučí se se sousední cestou nebo zmizí.“). Pahýl je konec úseku mimo kotvu a mimo jinou
// cestu. Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { length2 } from '../../landscape';
import type { Construction, Road, RoadPoint, Trail, VillageRoads } from '../types';
import { ROAD_STUB } from '../rules';
import { fixedRoadIds } from './road-condition';
import { END_SNAP_M, nearestOnRoads, roadLengthM } from './roads-geometry';
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

/**
 * Úseky, které úklid nemění: ve stavbě a zemské stezky; okruhy navíc nedělí vozové cesty (zemní
 * práce). Zbytek vozové cesty jako pahýl ano (`stubAction`).
 */
function untouchable(
  constructions: readonly Construction[],
  trails: readonly Trail[] | undefined,
  wagon: boolean = true,
): (road: Road) => boolean {
  const fixed = fixedRoadIds(constructions, trails);
  return (road) =>
    road.abandoned === true ||
    road.points.length < 2 ||
    (wagon && road.grade === 'wagon') ||
    fixed.has(road.id);
}

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

/**
 * Okruh přes jeden uzel (úsek, který začíná i končí v rozcestí s dalšími úseky) se rozdělí
 * v nejvzdálenějším bodě osy na dva úseky (paths.md – „Jedna cesta hráče se v uzlu nepotká sama
 * se sebou“). Malý okruh se pak uklidí jako copánek a pahýl. Vrátí, jestli něco rozdělil (mutuje).
 */
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
      return { road, atStart, length: roadLengthM(road) };
    }
  }
  return null;
}

/** Odstraní úsek (místa na stromy s ním – stromy stojí dál; jabloně k nejbližší cestě). */
function dropRoad(roads: VillageRoads, road: Road): void {
  roads.roads.splice(roads.roads.indexOf(road), 1);
  relinkApples(roads, road.id);
}

/** Co s pahýlem: zmizí (`drop`), nebo zůstane (`keep`). */
type StubAction = { kind: 'drop' } | { kind: 'keep' };

/**
 * Pahýl (paths.md – Síť – kotvy, pahýly a úklid; Martin, #6: „Pahýly bez cíle nevznikají, a když
 * po dělení a spojování cest nějaký zbude, sloučí se se sousední cestou nebo zmizí.“): vyšlapaný
 * úsek, jehož konec nekončí u kotvy ani na jiné cestě, zmizí v nejbližším úklidu – bez ohledu na
 * délku (konec, který leží u jiné cesty, sloučí `joinRoadGaps`). Upravenou a vozovou cestu postavil
 * hráč (Martin, #6: „Platí to pro každou cestu, i upravenou a vozovou, jen pro ty pomaleji“) – ta
 * zarůstá podle druhu (`ROAD_DECAY`); zmizí jen zbytek kratší než `ROAD_STUB.remnantM` (návrh
 * Clauda – Vlkov: 25 m upravené cesty po uříznutí zarůstáním od kraje mapy).
 */
function stubAction(stub: Stub): StubAction {
  if (stub.road.grade !== 'trodden') {
    return stub.length < ROAD_STUB.remnantM ? { kind: 'drop' } : { kind: 'keep' };
  }
  return { kind: 'drop' };
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
  const skip = untouchable(constructions, network.trails, false);
  const accepted = new Set<string>();
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const stub = firstStub(roads, skip, network.isAnchor, accepted);
    if (!stub) return false;
    if (stubAction(stub).kind !== 'keep') return true;
    accepted.add(stubEndKey(stub));
  }
  return false;
}

/**
 * Pahýly (paths.md – Síť – kotvy, pahýly a úklid; mutuje): zmizí (`stubAction`);
 * uzel u zmizelého pahýlu pak spojí `mergeRoadChains`. Cesty ve stavbě a zemské stezky se
 * nemění. Vrátí, jestli něco změnil.
 */
export function trimStubs(
  roads: VillageRoads,
  constructions: readonly Construction[],
  network: StubNetwork,
): boolean {
  const skip = untouchable(constructions, network.trails, false);
  const accepted = new Set<string>();
  let changed = false;
  for (let guard = roads.roads.length * 2; guard > 0; guard--) {
    const stub = firstStub(roads, skip, network.isAnchor, accepted);
    if (!stub) break;
    const action = stubAction(stub);
    if (action.kind === 'drop') {
      dropRoad(roads, stub.road);
      changed = true;
      continue;
    }
    // upravená a vozová cesta od ROAD_STUB.remnantM zůstane (zarůstá podle druhu)
    accepted.add(stubEndKey(stub));
  }
  return changed;
}
