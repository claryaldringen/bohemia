// Trasy sítě pěšin ve stavu vsi (paths.md – Kdy se trasy počítají a co se ukládá): buňky trasy
// jako řetězový kód – počáteční buňka světa a kroky po 8 směrech, 3 bity na krok, dva kroky na
// znak base64 (lichý konec: poslední znak nese jeden krok a za ním `=`). Server i prohlížeč
// z nich dopočítají osu trasy stejnými funkcemi – jen celá čísla, sčítání a násobení.

import { length2 } from '../../landscape';
import { FENCE_CLEARANCE } from '../rules-roads';
import { type StoredRoute } from '../types';
import { type FenceOutline } from './entrances';
import { fenceClearance } from './fences';
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

/** Nejvýš tolik bodů trasy se kvůli plotu podrží (každý jedno vyhlazení navíc). */
const FENCE_PINS = 12;
/** Krok kontroly odstupu osy od plotu (m). */
const FENCE_CHECK_M = 0.5;

/** Středy buněk zjednodušené a vyhlazené jako čáry pěšin (network-lines.ts). */
function smoothRun(points: readonly PathPoint[]): PathPoint[] {
  const simple = simplifyPathLine(points, [], SIMPLIFY_M);
  return smoothPathLine(simple.points, [], SMOOTH_PASSES).points;
}

/** Vyhlazení po kusech mezi podrženými body `pins` (vzestupné vnitřní indexy) – ty zůstanou. */
function smoothPinned(points: readonly PathPoint[], pins: readonly number[]): PathPoint[] {
  const out: PathPoint[] = [];
  let from = 0;
  for (const k of [...pins, points.length - 1]) {
    const piece = smoothRun(points.slice(from, k + 1));
    out.push(...(out.length > 0 ? piece.slice(1) : piece));
    from = k;
  }
  return out;
}

/**
 * První místo osy `line` blíž plotu než `FENCE_CLEARANCE.axisM` (mimo `gateM` od začátku a konce
 * trasy) → nejbližší nepodržený vnitřní bod trasy `raw` do dvou buněk, který se podrží; jinak −1.
 */
function fencePin(
  line: readonly PathPoint[],
  raw: readonly PathPoint[],
  pins: readonly number[],
  fences: readonly FenceOutline[],
  cellM: number,
): number {
  const { axisM, gateM } = FENCE_CLEARANCE;
  const start = raw[0]!;
  const end = raw[raw.length - 1]!;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!;
    const b = line[k]!;
    const steps = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / FENCE_CHECK_M));
    for (let i = k === 1 ? 0 : 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const z = a.z + ((b.z - a.z) * i) / steps;
      if (length2(x - start.x, z - start.z) < gateM || length2(x - end.x, z - end.z) < gateM) {
        continue;
      }
      if (fenceClearance(fences, x, z, axisM) >= axisM) continue;
      // při shodě bod s menším indexem
      let best = -1;
      let bestD = Infinity;
      for (let j = 1; j < raw.length - 1; j++) {
        if (pins.includes(j)) continue;
        const d = length2(raw[j]!.x - x, raw[j]!.z - z);
        if (d < bestD) {
          best = j;
          bestD = d;
        }
      }
      if (best >= 0 && bestD <= 2 * cellM) return best;
    }
  }
  return -1;
}

/**
 * Osa trasy ve světě – středy buněk zjednodušené a vyhlazené jako čáry pěšin (network-lines.ts).
 * S ploty vsi (`fences` – paths.md, Odstup od plotu): kde by vyhlazená osa šla k plotu blíž než
 * `FENCE_CLEARANCE.axisM` (usekla roh), podrží se nejbližší střed buňky trasy a vyhladí se kusy
 * mezi podrženými body zvlášť. Trasa daleko od plotů beze změny.
 */
export function routeLine(
  route: RouteCode,
  cellM: number,
  fences: readonly FenceOutline[] = [],
): PathPoint[] {
  const raw = routePoints(route, cellM);
  if (fences.length === 0 || raw.length < 3) return smoothRun(raw);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of raw) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  const reach = FENCE_CLEARANCE.axisM + cellM;
  const near = fences.filter(
    (f) =>
      f.minX - reach <= maxX &&
      f.maxX + reach >= minX &&
      f.minZ - reach <= maxZ &&
      f.maxZ + reach >= minZ,
  );
  if (near.length === 0) return smoothRun(raw);
  const pins: number[] = [];
  let line = smoothRun(raw);
  for (let round = 0; round < FENCE_PINS; round++) {
    const pin = fencePin(line, raw, pins, near, cellM);
    if (pin < 0) break;
    pins.push(pin);
    pins.sort((a, b) => a - b);
    line = smoothPinned(raw, pins);
  }
  return line;
}

/**
 * Trasy sítě k uložení do stavu vsi (`VillageRoutes.list`): cesty za den v setinách, trasy pod
 * MIN_TRIP se neukládají. Síť musí být spočítaná s `keepRoutes` (jinak žádné trasy).
 */
export function storedRoutes(
  network: Pick<PathNetwork, 'routes' | 'traffic'>,
  /** Trasy k práci dne (`StoredRoute.daily`). */
  daily = false,
): StoredRoute[] {
  return (network.routes ?? [])
    .filter((r) => r.trips >= MIN_TRIP)
    .map((r) => {
      const trips = Math.round(r.trips * 100);
      const base = Math.min(trips, Math.round((r.base ?? 0) * 100));
      return {
        from: r.from,
        to: r.to,
        purpose: r.purpose,
        trips,
        ...(base > 0 ? { base } : {}),
        ...(r.scale !== undefined && r.scale < 1 ? { scale: r.scale } : {}),
        ...(daily ? { daily: true as const } : {}),
        ...encodeRoute(r.cells, network.traffic),
        ...(r.visit ? { visit: r.visit } : {}),
      };
    });
}
