// Kotvy cest (paths.md – Síť – kotvy, pahýly a úklid; Martin, #6: „Každá cesta vede odněkud
// někam: od vchodu budovy, křižovatky nebo kraje mapy k jinému takovému místu. Pahýly bez cíle
// nevznikají.“). Návrh Clauda: kotvy dá sama sada tras – trasa začíná v bráně domu a končí ve
// vchodu stavby (síť ji tam vede – `network-targets.ts`), nebo u cíle bez vchodu (voda, dřevo,
// pole, sad, louka, pastva), nebo na kraji mapy. Vchod stavby, kam nikdo nechodí, kotvou být
// nemusí – cesta k němu nevznikne. Kotvou je i pevná cesta (nová se k ní připojí – `joinPoint`).
// Deterministická vrstva (jen přesná aritmetika – soubor hlídá ESLint jako síť pěšin).

import { type Landscape } from '../../landscape';
import { ROAD_ANCHORS } from '../rules-roads';
import type { RoadPoint, RoutePurpose, StoredRoute } from '../types';
import { routeCells } from './routes';
import { pathCellM } from './terrain';

export type RoadAnchorKind = 'entrance' | 'goal' | 'edge';

/** Místo, kde smí cesta končit: bod a dosah (m). */
export interface RoadAnchor {
  x: number;
  z: number;
  kind: RoadAnchorKind;
  reachM: number;
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

function anchorOf(p: RoadPoint, kind: RoadAnchorKind): RoadAnchor {
  return {
    x: p.x,
    z: p.z,
    kind,
    reachM: kind === 'entrance' ? ROAD_ANCHORS.entranceM : ROAD_ANCHORS.goalM,
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
  const add = (cell: [number, number] | undefined, kind: RoadAnchorKind): void => {
    if (!cell) return;
    const key = `${kind}:${cell[0]},${cell[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(anchorOf({ x: cell[0] * cellM, z: cell[1] * cellM }, kind));
  };
  for (const route of routes) {
    const cells = routeCells(route);
    add(cells[0], 'entrance');
    add(cells[cells.length - 1], anchorKindOf(route.to, route.purpose));
  }
  return { points, halfM: (landscape.size * landscape.cellSizeM) / 2 };
}

/** Smí cesta končit v bodě (x, z)? Do dosahu kotvy, nebo u kraje mapy. */
export function nearAnchor(anchors: RoadAnchors, x: number, z: number): boolean {
  const edge = anchors.halfM - ROAD_ANCHORS.goalM;
  if (Math.abs(x) >= edge || Math.abs(z) >= edge) return true;
  return anchors.points.some((a) => {
    const dx = a.x - x;
    const dz = a.z - z;
    return dx * dx + dz * dz <= a.reachM * a.reachM;
  });
}
