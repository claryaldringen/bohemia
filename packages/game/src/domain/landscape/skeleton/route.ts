import { length2 } from '../det-math';
import { distanceToMask } from '../grid';
import type { WorldPoint } from '../premium/geometry';
import {
  cellWorld,
  cellXY,
  lineKeepsAway,
  routeLeg,
  smoothLine,
  toEdge,
  trailCellCost,
  VILLAGE_ROUTE,
  villageBypass,
} from '../premium/route';
import { SURFACE_CODES, type Landscape, type StreamPoint } from '../types';
import { tileCenterWorld } from '../world';
import { portTile } from './ports-map';
import { riversOf } from './rivers';
import type { MapSide } from './types';

// Stezka kostry na mapě (world-skeleton.md – Mapa z kostry): od každého bodu stezky na okraji
// nejlevnější cesta po souši k bodu obejití vsi (`villageBypass`, ves leží aspoň 150 m od stezky),
// přes řeku jen brodem. Počítá server i prohlížeč z krajiny, proto jen det-math.

/** Čísla trasy stezky kostry na mapě (návrh Clauda). */
export const SKELETON_ROUTE = {
  /** Břeh řeky: souš blíž než tolik políček od vody řeky stezka míjí (kromě brodu a začátku). */
  bankCells: 1.5,
  /** Brod: voda a břeh do tolika políček od mělkého bodu osy (navíc k polovině šířky). */
  fordReachCells: 1.5,
  /** Příplatek za krok potokem mapy (násobek ceny políčka) – potok se přebrodí, ale jen kde musí. */
  streamPenalty: 6,
  /** Prvních tolik políček od okraje smí vést i podél vody řeky (bod stezky blízko řeky). */
  startFreeCells: 4,
  /** Vyhlazení úseků. */
  smoothPasses: 2,
} as const;

/** Trasa stezky kostry na mapě. */
export interface SkeletonRoute {
  /** Úsek od každého bodu stezky (od okraje mapy) k bodu obejití vsi; ve světě (x, z). */
  readonly legs: readonly (readonly WorldPoint[])[];
  /** Konce úseků na okraji mapy – strana a bod ve světě. */
  readonly ends: readonly { readonly side: MapSide; readonly point: WorldPoint }[];
  /** Brody řek, kterými trasa vede (střed mělčiny na ose řeky ve světě). */
  readonly fords: readonly WorldPoint[];
}

/** Osy řek s polohou jako ve Float32 (stejně jako je dostane prohlížeč). */
function riverAxes(l: Landscape): StreamPoint[][] {
  return riversOf(l).map((course) =>
    course.map((p) => ({ ...p, x: Math.fround(p.x), y: Math.fround(p.y) })),
  );
}

/** Voda řek kostry: vodní políčka do poloviny šířky od osy (jako `riverCorridorMask`). */
function riverWaterMask(l: Landscape, axes: readonly (readonly StreamPoint[])[]): Uint8Array {
  const { size } = l;
  const water = new Uint8Array(size * size);
  if (axes.length === 0) return water;
  const axis = new Uint8Array(size * size);
  let half = 0;
  for (const course of axes) {
    for (const p of course) {
      axis[Math.round(p.y) * size + Math.round(p.x)] = 1;
      half = Math.max(half, p.halfWidthLeft, p.halfWidthRight);
    }
  }
  const toAxis = distanceToMask(axis, size);
  for (let i = 0; i < water.length; i++) {
    if (l.surface[i] === SURFACE_CODES.water && toAxis[i]! <= half + 1.5) water[i] = 1;
  }
  return water;
}

/** Souvislé mělčiny na ose řeky – všechny jejich body; prostřední je střed brodu. */
function fordRuns(course: readonly StreamPoint[]): StreamPoint[][] {
  const runs: StreamPoint[][] = [];
  let start = -1;
  course.forEach((p, k) => {
    if (p.shallow && start < 0) start = k;
    if ((!p.shallow || k === course.length - 1) && start >= 0) {
      runs.push(course.slice(start, p.shallow ? k + 1 : k));
      start = -1;
    }
  });
  return runs;
}

const wide = (p: StreamPoint): number => Math.max(p.halfWidthLeft, p.halfWidthRight);

/** Políčka brodů: kolem mělkých bodů osy řeky (voda i břeh), kudy smí stezka přes řeku. */
function fordZoneMask(l: Landscape, axes: readonly (readonly StreamPoint[])[]): Uint8Array {
  const { size } = l;
  const zone = new Uint8Array(size * size);
  for (const course of axes) {
    for (const p of course) {
      if (!p.shallow) continue;
      const reach = wide(p) + SKELETON_ROUTE.fordReachCells;
      const r = Math.ceil(reach);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.round(p.x) + dx;
          const y = Math.round(p.y) + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          if (length2(x - p.x, y - p.y) <= reach) zone[y * size + x] = 1;
        }
      }
    }
  }
  return zone;
}

/**
 * Trasa stezky kostry na mapě, nebo null (mapa bez stezky, ves obejít nejde, úsek neexistuje,
 * stezka by vedla blíž než 150 m od vsi). Úseky vedou od okraje k jednomu bodu obejití vsi:
 * dva body = stezka kolem vsi, víc = křižovatka, jeden = konec stezky.
 */
export function skeletonRoute(l: Landscape): SkeletonRoute | null {
  const trails = l.skeleton?.trails ?? [];
  if (trails.length === 0) return null;
  const { size } = l;
  const axes = riverAxes(l);
  const riverWater = riverWaterMask(l, axes);
  const nearRiver = distanceToMask(riverWater, size);
  const fordZone = fordZoneMask(l, axes);
  const village = l.villageSite;
  const cellCost = trailCellCost(l);
  const cost = (i: number): number =>
    cellCost(i) *
    (l.surface[i] === SURFACE_CODES.water && !riverWater[i] ? SKELETON_ROUTE.streamPenalty : 1);
  const ports = trails.map((t) => ({ trail: t, tile: portTile(t.side, t.at, size) }));
  const starts = ports.map((p) => p.tile.y * size + p.tile.x);

  const allowedFrom =
    (start: number) =>
    (i: number): boolean => {
      const c = cellXY(i, size);
      if (length2(c.x - village.x, c.y - village.y) < VILLAGE_ROUTE.villageMinCells) return false;
      const s = cellXY(start, size);
      if (length2(c.x - s.x, c.y - s.y) <= SKELETON_ROUTE.startFreeCells) return !riverWater[i];
      if (fordZone[i]) return true;
      return !riverWater[i] && nearRiver[i]! >= SKELETON_ROUTE.bankCells;
    };

  // Bod obejití: zkusí se bokem ke směru od každého bodu stezky, první, ze kterého vedou všechny úseky.
  const tried = new Set<number>();
  for (const from of starts) {
    const pass = villageBypass(size, village, cellXY(from, size), allowedFrom(from));
    if (pass < 0 || tried.has(pass)) continue;
    tried.add(pass);
    const cellLegs: number[][] = [];
    for (const start of starts) {
      const leg = routeLeg(size, start, allowedFrom(start), cost, (i) => i === pass);
      if (!leg) break;
      cellLegs.push(leg);
    }
    if (cellLegs.length !== starts.length) continue;
    const route = buildRoute(l, cellLegs, ports, riverWater, axes);
    if (route) return route;
  }
  return null;
}

function buildRoute(
  l: Landscape,
  cellLegs: readonly number[][],
  ports: readonly { trail: { side: MapSide; at: number } }[],
  riverWater: Uint8Array,
  axes: readonly (readonly StreamPoint[])[],
): SkeletonRoute | null {
  const { size } = l;
  const v = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const legs: WorldPoint[][] = [];
  const ends: { side: MapSide; point: WorldPoint }[] = [];
  cellLegs.forEach((cells, k) => {
    const line = smoothLine(
      cells.map((i) => cellWorld(l, i)),
      SKELETON_ROUTE.smoothPasses,
    );
    const edge = toEdge(l, line[0]!);
    legs.push([edge, ...line.slice(1)]);
    ends.push({ side: ports[k]!.trail.side, point: edge });
  });
  for (const line of legs) {
    if (!lineKeepsAway(line, v, VILLAGE_ROUTE.villageMinM)) return null;
  }
  // Brody, kterými trasa opravdu vede: v mělčině je vodní políčko trasy.
  const fords: WorldPoint[] = [];
  for (const course of axes) {
    for (const run of fordRuns(course)) {
      const crossed = cellLegs.some((cells) =>
        cells.some((i) => {
          if (!riverWater[i]) return false;
          const c = cellXY(i, size);
          return run.some(
            (p) => length2(c.x - p.x, c.y - p.y) <= wide(p) + SKELETON_ROUTE.fordReachCells,
          );
        }),
      );
      const center = run[Math.round((run.length - 1) / 2)]!;
      if (crossed) fords.push(cellWorld(l, Math.round(center.y) * size + Math.round(center.x)));
    }
  }
  return { legs, ends, fords };
}
