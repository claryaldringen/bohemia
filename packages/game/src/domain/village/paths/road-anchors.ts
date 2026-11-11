// Kotvy cest (paths.md – Síť – kotvy, pahýly a úklid; Martin, #6: „Každá cesta vede odněkud
// někam: od vchodu budovy, křižovatky nebo kraje mapy k jinému takovému místu. Pahýly bez cíle
// nevznikají.“). Návrh Clauda: kotvy dá sama sada tras – trasa začíná v bráně domu a končí ve
// vchodu stavby (síť ji tam vede – `network-targets.ts`), nebo u cíle bez vchodu (voda, dřevo,
// pole, sad, louka, pastva), nebo na kraji mapy. Vchod stavby, kam nikdo nechodí, kotvou být
// nemusí – cesta k němu nevznikne. Kotvou je i pevná cesta (nová se k ní připojí – `joinPoint`).
// Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { type Landscape } from '../../landscape';
import { ROAD_ANCHORS, TRAIL } from '../rules/rules-roads';
import type { Direction8, RoadPoint, RoutePurpose, StoredRoute } from '../types';
import { routeCells } from './routes';
import { EDGE_MARGIN_M, pathCellM } from './terrain';

export type RoadAnchorKind = 'entrance' | 'goal' | 'edge';

/** Místo, kde smí cesta končit: bod a dosah (m). */
export interface RoadAnchor {
  x: number;
  z: number;
  kind: RoadAnchorKind;
  reachM: number;
  /**
   * Místo kotvy – klíč z trasy (`StoredRoute.from` na začátku, `to` na konci: `d:<id>`,
   * `cemetery:<id>`, `field:<id>`, `water`, `edge:N`…) pro panel cesty (konce cesty). Úklid ho
   * nepotřebuje.
   */
  place?: string;
}

/** Kotvy vsi: konce tras a kraj mapy (polovina strany krajiny, m). */
export interface RoadAnchors {
  points: RoadAnchor[];
  halfM: number;
}

/** Cíle se vchodem (klíč trasy `StoredRoute.to` před dvojtečkou) – trasa končí ve vchodu. */
const ENTRANCE_TARGETS: ReadonlySet<string> = new Set([
  'd',
  'dwelling',
  'site',
  'cemetery',
  'pen',
  'threshing-floor',
  'idol',
  'shrine',
  'sacred',
]);

/** Druh kotvy na konci trasy podle jejího cíle. */
export function anchorKindOf(to: string, purpose: RoutePurpose): RoadAnchorKind {
  const prefix = to.split(':')[0]!;
  if (prefix === 'edge') return 'edge';
  if (purpose === 'water' || purpose === 'wood' || purpose === 'herd') return 'goal';
  return ENTRANCE_TARGETS.has(prefix) ? 'entrance' : 'goal';
}

function anchorOf(p: RoadPoint, kind: RoadAnchorKind, place: string): RoadAnchor {
  return {
    x: p.x,
    z: p.z,
    kind,
    reachM: kind === 'entrance' ? ROAD_ANCHORS.entranceM : ROAD_ANCHORS.goalM,
    place,
  };
}

/**
 * Kotvy z uložených tras: začátek trasy je brána domu (vchod), konec podle cíle (vchod stavby,
 * cíl bez vchodu, kraj mapy); stejný bod a druh jednou.
 */
export function roadAnchors(routes: readonly StoredRoute[], landscape: Landscape): RoadAnchors {
  const cellM = pathCellM(landscape);
  const points: RoadAnchor[] = [];
  const seen = new Set<string>();
  const add = (cell: [number, number] | undefined, kind: RoadAnchorKind, place: string): void => {
    if (!cell) return;
    const key = `${kind}:${cell[0]},${cell[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(anchorOf({ x: cell[0] * cellM, z: cell[1] * cellM }, kind, place));
  };
  for (const route of routes) {
    const cells = routeCells(route);
    add(cells[0], 'entrance', route.from);
    add(cells[cells.length - 1], anchorKindOf(route.to, route.purpose), route.to);
  }
  return { points, halfM: (landscape.size * landscape.cellSizeM) / 2 };
}

/**
 * Smí cesta končit v bodě (x, z)? Do dosahu kotvy, nebo u kraje mapy: terén pěšin končí
 * `EDGE_MARGIN_M` před okrajem a zemská stezka k sousedovi končí do `TRAIL.edgeBandM` od něj
 * (cesta k sousedovi má konec tam), s tolerancí `goalM` na vzorkování.
 */
export function nearAnchor(anchors: RoadAnchors, x: number, z: number): boolean {
  if (edgeDirectionAt(anchors, x, z)) return true;
  return anchors.points.some((a) => {
    const dx = a.x - x;
    const dz = a.z - z;
    return dx * dx + dz * dz <= a.reachM * a.reachM;
  });
}

/**
 * Leží bod (x, z) u kraje mapy (pás jako v `nearAnchor`)? Směr kraje (sever = +z, východ = +x;
 * v rohu šikmo), jinak null.
 */
export function edgeDirectionAt(anchors: RoadAnchors, x: number, z: number): Direction8 | null {
  const edge = anchors.halfM - EDGE_MARGIN_M - TRAIL.edgeBandM - ROAD_ANCHORS.goalM;
  const ns = z >= edge ? 'N' : z <= -edge ? 'S' : '';
  const ew = x >= edge ? 'E' : x <= -edge ? 'W' : '';
  const direction = `${ns}${ew}`;
  return direction === '' ? null : (direction as Direction8);
}
