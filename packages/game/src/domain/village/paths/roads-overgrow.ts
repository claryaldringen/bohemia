// Zarůstání nepoužívané vyšlapané cesty po kusech (roads.md – Zarůstá jen nepoužívaný kus).

import { length2 } from '../../landscape';
import { roadAppleStage } from '../road-trees';
import { CART_ROADS, ROADS, ROAD_TREES } from '../rules';
import {
  type ChronicleEvent,
  type Road,
  type RoadPoint,
  type RoadQuietPiece,
  type VillageRoads,
  type VillageState,
} from '../types';
import { axisDistance, axisSlice, groundPart, lengthsAlong } from './roads-geometry';
import { roadsInWork } from './roads-form';

/** Provoz kusu osy (cest za den) – z provozního pole tras, nebo z jízd vozů. */
export type TrafficOf = (points: readonly RoadPoint[]) => number;

/**
 * Jabloně, které drží cestu (roads.md – Cesta s prací hráče nezaroste): živá jabloň nebo jabloň,
 * která se teprve sází. Až dožijí (souš), kus cesty u nich může zarůst jako jiný.
 */
export function keepingApples(
  roads: Pick<VillageRoads, 'apples'>,
  day: number,
): NonNullable<VillageRoads['apples']> {
  return (roads.apples ?? []).filter((apple) => {
    const stage = roadAppleStage(apple, day);
    return stage === 'tree' || stage === 'planting';
  });
}

/** Kus osy úseku: od–do (m od začátku osy) a jeho střed ve světě (na cm). */
export interface RoadPiece {
  from: number;
  to: number;
  x: number;
  z: number;
}

/**
 * Kusy osy pro zarůstání (roads.md – Zarůstá jen nepoužívaný kus): osa rozdělená na stejně
 * dlouhé kusy co nejblíž ROADS.pieceM (kratší úsek je jeden kus).
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

/** Jabloň stojí u kusu cesty, když je od jeho osy nejvýš tak daleko (m) – místa 2,6–3,4 m. */
const APPLE_KEEP_M = 6;

/**
 * Zarůstání vyšlapaných cest po kusech (mutuje – roads.md, Zarůstá jen nepoužívaný kus; Martin,
 * 19. 10. 2026): každý kus osy (`roadPieces`) s provozem roční sítě pod polovinou prahu přičte rok
 * (`Road.quiet` – tichý kus loni do půl kusu odsud), jinak se počítá od nuly. Kus tichý
 * ROADS.overgrowYears let po sobě zaroste, když u něj nestojí živá jabloň (`keepingApples`);
 * celý tichý úsek zaroste jako dřív, jinak se tichý kus vyřízne (`cutOvergrown`) a zbytek zůstane
 * pevnou cestou se starým id. Upravená cesta, hať a cesta, která se vylepšuje, nezarůstají
 * (a počítat nemusí). Vrátí události kroniky (`road-overgrown` jen pro zaniklé kusy).
 */
export function overgrowRoads(
  state: VillageState,
  roads: VillageRoads,
  day: number,
  traffic: TrafficOf,
  carts: TrafficOf | null = null,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const building = roadsInWork(state.constructions);
  const apples = keepingApples(roads, day);
  const quietBelow = ROADS.tripsPerDay * ROADS.overgrowShare;
  for (const road of [...roads.roads]) {
    if (road.grade !== 'trodden' || building.has(road.id) || road.points.length < 2) {
      delete road.quiet;
      continue;
    }
    const pieces = roadPieces(road.points);
    const before = road.quiet ?? [];
    const quiet: RoadQuietPiece[] = [];
    const dead = pieces.map((piece) => {
      const axis = axisSlice(road.points, piece.from, piece.to);
      if (traffic(axis) >= quietBelow) return false;
      // kus, kudy jezdí vozy, není tichý (wagons.md – Vyjeté cesty)
      if (carts && carts(axis) >= CART_ROADS.tripsPerDay * CART_ROADS.dropShare) {
        return false;
      }
      let years = 1;
      let nearest = ROADS.pieceM / 2;
      for (const old of before) {
        const d = length2(old.x - piece.x, old.z - piece.z);
        if (d <= nearest) {
          nearest = d;
          years = Math.min(ROADS.overgrowYears, old.years + 1);
        }
      }
      quiet.push({ x: piece.x, z: piece.z, years });
      if (years < ROADS.overgrowYears) return false;
      const along = axisDistance([axisSlice(road.points, piece.from, piece.to)]);
      return !apples.some((a) => a.roadId === road.id && along(a.x, a.z) <= APPLE_KEEP_M);
    });
    if (quiet.length > 0) road.quiet = quiet;
    else delete road.quiet;
    if (!dead.some(Boolean)) continue;
    if (dead.every(Boolean)) {
      roads.roads.splice(roads.roads.indexOf(road), 1);
      events.push({ day, kind: 'road-overgrown', roadId: road.id });
      continue;
    }
    for (const roadId of cutOvergrown(roads, road, pieces, dead, traffic)) {
      events.push({ day, kind: 'road-overgrown', roadId });
    }
  }
  return events;
}

/**
 * Vyřízne z úseku zarostlé kusy (`dead` po kusech `pieces`) – mutuje. Živé zbytky zůstanou
 * úseky (první se starým id a dnem vzniku, další s novým id), letošní provoz každého podle jeho
 * osy, tiché kusy, místa na stromy a jabloně k nejbližšímu zbytku (místa zarostlého kusu zmizí –
 * stromy na nich stojí dál), mokřina a brody po kusech. Konce u zarostlého kusu jsou volné
 * (`openEnds`, `VillageRoads.cutEnds`). Vrátí id zarostlých kusů (nová id – pro kroniku).
 */
function cutOvergrown(
  roads: VillageRoads,
  road: Road,
  pieces: readonly RoadPiece[],
  dead: readonly boolean[],
  traffic: TrafficOf,
): number[] {
  const alive: { a: number; b: number }[] = [];
  const gone: number[] = [];
  pieces.forEach((piece, k) => {
    const last = k > 0 ? dead[k - 1] : undefined;
    if (dead[k]) {
      if (last !== true) gone.push(roads.nextId++);
      return;
    }
    if (last === false) alive[alive.length - 1]!.b = piece.to;
    else alive.push({ a: piece.from, b: piece.to });
  });
  const length = pieces[pieces.length - 1]!.to;
  const made: Road[] = alive.map(({ a, b }, k) => {
    const points = axisSlice(road.points, a, b);
    const openEnds: [boolean, boolean] = [
      a > 0 ? true : (road.openEnds?.[0] ?? false),
      b < length ? true : (road.openEnds?.[1] ?? false),
    ];
    return {
      id: k === 0 ? road.id : roads.nextId++,
      points,
      bornDay: road.bornDay,
      grade: road.grade,
      traffic: [...road.traffic.slice(0, -1), traffic(points)],
      spots: [],
      ...(road.ground ? { ground: groundPart(road.ground, a, b) } : {}),
      openEnds,
      ...(road.cart ? { cart: true as const } : {}),
      ...(road.swath ? { swath: true as const } : {}),
      ...(road.cartTraffic ? { cartTraffic: [...road.cartTraffic] } : {}),
    };
  });
  const axes = made.map((r) => axisDistance([r.points]));
  const nearest = (x: number, z: number, within: number): Road | null => {
    let best: Road | null = null;
    let bestD = within;
    made.forEach((r, k) => {
      const d = axes[k]!(x, z);
      if (d <= bestD) {
        best = r;
        bestD = d;
      }
    });
    return best;
  };
  for (const spot of road.spots) {
    nearest(spot.x, spot.z, ROAD_TREES.offsetM.to + 1)?.spots.push(spot);
  }
  for (const piece of road.quiet ?? []) {
    const owner = nearest(piece.x, piece.z, ROADS.pieceM / 2);
    if (owner) (owner.quiet ??= []).push(piece);
  }
  for (const apple of roads.apples ?? []) {
    if (apple.roadId === road.id) apple.roadId = nearest(apple.x, apple.z, Infinity)!.id;
  }
  // konce u zarostlého kusu
  const cuts = made.flatMap((r, k) => [
    ...(alive[k]!.a > 0 ? [{ ...r.points[0]! }] : []),
    ...(alive[k]!.b < length ? [{ ...r.points[r.points.length - 1]! }] : []),
  ]);
  roads.cutEnds = [...(roads.cutEnds ?? []), ...cuts];
  roads.roads.splice(roads.roads.indexOf(road), 1, ...made);
  return gone;
}

/** Bod osy `d` m od začátku (na cm). */
function pointAlong(points: readonly RoadPoint[], d: number): RoadPoint {
  return axisSlice(points, d, d)[0]!;
}
