// Trasy sítě pěšin ve stavu vsi (paths.md – Kdy se trasy počítají a co se ukládá): buňky trasy
// jako řetězový kód – počáteční buňka světa a kroky po 8 směrech, 3 bity na krok, dva kroky na
// znak base64 (lichý konec: poslední znak nese jeden krok a za ním `=`). Server i prohlížeč
// z nich dopočítají osu trasy stejnými funkcemi – jen celá čísla, sčítání a násobení.

import { type StoredRoute } from '../types';
import { type GridWindow } from './network-grid';
import { simplifyPathLine, smoothPathLine } from './network-lines';
import {
  MIN_TRIP,
  type PathNetwork,
  type PathPoint,
  SIMPLIFY_M,
  SMOOTH_PASSES,
} from './network-types';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_VALUE: ReadonlyMap<string, number> = new Map(
  [...BASE64].map((ch, i): [string, number] => [ch, i]),
);

/** Kroky (dx, dz) po 8 směrech – index je hodnota 3 bitů kroku. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Kód trasy – počáteční buňka světa a kroky. */
export type RouteCode = Pick<StoredRoute, 'start' | 'steps'>;

/**
 * Buňka světa levého horního rohu okna: mřížka pěšin je vůči krajině pevná (terrain.ts – `gridOf`,
 * okno začíná na celé buňce), takže počátek okna je celý násobek buňky.
 */
function windowCell(grid: GridWindow): [number, number] {
  return [Math.round(grid.originX / grid.cellM), Math.round(grid.originZ / grid.cellM)];
}

/** Buňky okna `cells` (sousední po 8 směrech, od brány k cíli) jako kód trasy. */
export function encodeRoute(cells: readonly number[], grid: GridWindow): RouteCode {
  const first = cells[0];
  if (first === undefined) throw new Error('Trasa bez buněk.');
  const [cx, cz] = windowCell(grid);
  let x = first % grid.width;
  let z = (first - x) / grid.width;
  const start: [number, number] = [x + cx, z + cz];
  let steps = '';
  let pending = -1;
  for (let i = 1; i < cells.length; i++) {
    const c = cells[i]!;
    const nx = c % grid.width;
    const nz = (c - nx) / grid.width;
    const dir = DIRECTIONS.findIndex(([dx, dz]) => dx === nx - x && dz === nz - z);
    if (dir < 0) throw new Error(`Trasa skáče mezi nesousedními buňkami (${cells[i - 1]} → ${c}).`);
    if (pending < 0) {
      pending = dir;
    } else {
      steps += BASE64[(pending << 3) | dir];
      pending = -1;
    }
    x = nx;
    z = nz;
  }
  if (pending >= 0) steps += `${BASE64[pending << 3]}=`;
  return { start, steps };
}

/** Buňky světa trasy od brány k cíli. */
export function routeCells(route: RouteCode): [number, number][] {
  let [x, z] = route.start;
  const cells: [number, number][] = [[x, z]];
  const odd = route.steps.endsWith('=');
  const chars = odd ? route.steps.length - 1 : route.steps.length;
  const step = (dir: number): void => {
    const [dx, dz] = DIRECTIONS[dir]!;
    x += dx;
    z += dz;
    cells.push([x, z]);
  };
  for (let i = 0; i < chars; i++) {
    const value = BASE64_VALUE.get(route.steps[i]!);
    if (value === undefined) throw new Error(`Neplatný kód trasy: ${route.steps}`);
    step(value >> 3);
    if (!odd || i < chars - 1) step(value & 7);
  }
  return cells;
}

/** Středy buněk trasy ve světě (m) – buňka světa × strana buňky `cellM`. */
export function routePoints(route: RouteCode, cellM: number): PathPoint[] {
  return routeCells(route).map(([x, z]) => ({ x: x * cellM, z: z * cellM }));
}

/** Osa trasy ve světě – středy buněk zjednodušené a vyhlazené jako čáry pěšin (network-lines.ts). */
export function routeLine(route: RouteCode, cellM: number): PathPoint[] {
  const simple = simplifyPathLine(routePoints(route, cellM), [], SIMPLIFY_M);
  return smoothPathLine(simple.points, [], SMOOTH_PASSES).points;
}

/**
 * Trasy sítě k uložení do stavu vsi (`VillageRoutes.list`): cesty za den v setinách, trasy pod
 * MIN_TRIP se neukládají. Síť musí být spočítaná s `keepRoutes` (jinak žádné trasy).
 */
export function storedRoutes(network: Pick<PathNetwork, 'routes' | 'traffic'>): StoredRoute[] {
  return (network.routes ?? [])
    .filter((r) => r.trips >= MIN_TRIP)
    .map((r) => ({
      from: r.from,
      to: r.to,
      purpose: r.purpose,
      trips: Math.round(r.trips * 100),
      ...encodeRoute(r.cells, network.traffic),
      ...(r.visit ? { visit: r.visit } : {}),
    }));
}
