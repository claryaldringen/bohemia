// Konce cesty hráče (paths.md – pravidlo 11, Kotvy; Martin 25. 10. 2026: „Žádná cesta nemůže
// existovat jen tak sama v prostoru, vždycky musí spojovat dvě místa – kombinaci budov
// a křižovatek. Pokud cestu označím, měl bych v panelu cesty vidět, která místa to jsou a moci je
// také označit.“). Co leží na obou koncích řetězu úseků (`roadChain`): křižovatka, místo z kotev
// (vchod stavby, cíl bez vchodu, kraj mapy), jiná cesta, nebo nic – konec nikam porušuje
// pravidlo 11. Kotvy jsou tytéž jako v úklidu (`roadAnchors`, `nearAnchor`, `TERMINUS_M`) –
// druhá logika kotev tu není. Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint
// jako síť pěšin), stejně na serveru i v prohlížeči.

import { type Landscape } from '../../landscape';
import type { Direction8, Road, RoadJunction, RoadPoint, VillageState } from '../types';
import {
  edgeDirectionAt,
  roadAnchors,
  type RoadAnchorKind,
  type RoadAnchors,
} from './road-anchors';
import { roadChain, type ChainLink } from './road-chains';
import { landmarkTerrain, type LandmarkTerrain } from './road-landmarks';
import { END_SNAP_M, nearestOnRoads } from './roads-geometry';
import { TERMINUS_M } from './roads-tidy';

/**
 * Nejdál od středu křižovatky, kde ještě končí cesta v jejím rameni (m): vchod je 1,5 × šířka
 * nejširší cesty (`junctionEntranceM`, vozová ≈ 6 m), s rezervou.
 */
export const JUNCTION_END_M = 12;

/** Co je na konci cesty hráče. */
export type RoadEnd =
  /** Místo z kotev – klíč trasy (`d:<id>`, `cemetery:<id>`, `field:<id>`, `water`…). */
  | { kind: 'place'; place: string; anchor: Exclude<RoadAnchorKind, 'edge'> }
  /** Křižovatka (id `RoadJunction`) – cesta končí ve vchodu jejího ramene. */
  | { kind: 'junction'; id: number }
  /** Kraj mapy – směr (sever = +z). */
  | { kind: 'edge'; direction: Direction8 }
  /** Napojení na jiný úsek bez křižovatky (id úseku). */
  | { kind: 'road'; roadId: number }
  /** Nikam – porušení pravidla 11. */
  | { kind: 'none' };

/** Síť, ve které se konce hledají: úseky, křižovatky a kotvy z tras. */
export interface RoadEndsNetwork {
  roads: readonly Road[];
  junctions: readonly RoadJunction[];
  anchors: RoadAnchors;
  /** Výšky a voda krajiny pro popis křižovatek (`roadEndLandmarks`); bez nich jen stavby. */
  terrain?: LandmarkTerrain;
}

/** Síť konců ze stavu vsi – kotvy z uložených tras jako v úklidu. */
export function roadEndsNetwork(state: VillageState, landscape: Landscape): RoadEndsNetwork {
  return {
    roads: state.roads?.roads ?? [],
    junctions: state.roads?.junctions ?? [],
    anchors: roadAnchors(state.routes?.list ?? [], landscape),
    terrain: landmarkTerrain(landscape),
  };
}

function dist2(a: RoadPoint, b: RoadPoint): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Co je v bodě `at`, kde končí úsek `road`: křižovatka s tímto úsekem v rameni (do
 * `JUNCTION_END_M` a blíž než druhý konec úseku – krátký úsek od křižovatky k bráně tak na druhém
 * konci křižovatku nemá), nejbližší kotva v dosahu (do jejího dosahu nebo `TERMINUS_M` – jako
 * `anchorTermini`), kraj mapy, jiný úsek do `END_SNAP_M`, jinak nic.
 */
export function roadEndAt(net: RoadEndsNetwork, road: Road, at: RoadPoint): RoadEnd {
  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  const far = dist2(first, at) <= dist2(last, at) ? last : first;
  let junction: RoadJunction | null = null;
  for (const j of net.junctions) {
    if (!j.arms.includes(road.id)) continue;
    const d = dist2(j, at);
    if (d > JUNCTION_END_M * JUNCTION_END_M || d >= dist2(j, far)) continue;
    if (!junction || d < dist2(junction, at)) junction = j;
  }
  if (junction) return { kind: 'junction', id: junction.id };
  let best: { place: string; kind: RoadAnchorKind; d: number } | null = null;
  for (const a of net.anchors.points) {
    if (a.place === undefined) continue;
    const reach = Math.max(a.reachM, TERMINUS_M);
    const d = dist2(a, at);
    if (d > reach * reach || (best && d >= best.d)) continue;
    best = { place: a.place, kind: a.kind, d };
  }
  if (best) {
    if (best.kind !== 'edge') return { kind: 'place', place: best.place, anchor: best.kind };
    const direction = best.place.split(':')[1];
    if (direction) return { kind: 'edge', direction: direction as Direction8 };
  }
  const edge = edgeDirectionAt(net.anchors, at.x, at.z);
  if (edge) return { kind: 'edge', direction: edge };
  const others = net.roads.filter((r) => r !== road && !r.abandoned && r.points.length >= 2);
  const hit = nearestOnRoads(others, at.x, at.z);
  if (hit && hit.distance <= END_SNAP_M) return { kind: 'road', roadId: others[hit.road]!.id };
  return { kind: 'none' };
}

/** Body obou konců řetězu (začátek prvního úseku, konec posledního – podle směru v řetězu). */
export function chainEndPoints(
  chain: readonly ChainLink<Road>[],
): [{ road: Road; at: RoadPoint }, { road: Road; at: RoadPoint }] | null {
  const head = chain[0];
  const tail = chain[chain.length - 1];
  if (!head || !tail) return null;
  const first = (r: Road): RoadPoint => r.points[0]!;
  const last = (r: Road): RoadPoint => r.points[r.points.length - 1]!;
  return [
    { road: head.road, at: head.reversed ? last(head.road) : first(head.road) },
    { road: tail.road, at: tail.reversed ? first(tail.road) : last(tail.road) },
  ];
}

/** Konce řetězu úseků v pořadí cesty (od začátku řetězu); prázdný řetěz null. */
export function chainEnds(
  net: RoadEndsNetwork,
  chain: readonly ChainLink<Road>[],
): [RoadEnd, RoadEnd] | null {
  const ends = chainEndPoints(chain);
  if (!ends) return null;
  return [roadEndAt(net, ends[0].road, ends[0].at), roadEndAt(net, ends[1].road, ends[1].at)];
}

/** Konce cesty hráče, do které patří úsek `roadId` (`roadChain`); bez úseku null. */
export function roadChainEnds(net: RoadEndsNetwork, roadId: number): [RoadEnd, RoadEnd] | null {
  return chainEnds(net, roadChain(net.roads, roadId));
}
