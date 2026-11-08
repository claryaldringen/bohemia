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
// přes řeku jen brodem – rovně napříč řekou přes střed mělčiny. Počítá server i prohlížeč
// z krajiny, proto jen det-math.

/** Čísla trasy stezky kostry na mapě (návrh Clauda). */
export const SKELETON_ROUTE = {
  /** Břeh řeky: souš blíž než tolik políček od vody řeky stezka míjí (kromě brodu a začátku). */
  bankCells: 1.5,
  /**
   * Brod: stezka přejde řeku rovně napříč přes střed mělčiny – pás políček do tolika políček od
   * přímky přechodu, přechod sahá tolik políček za břehové pásmo `bankCells` (navíc k polovině
   * šířky vody v brodu).
   */
  fordCorridorCells: 0.75,
  fordLandCells: 1,
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
  /** Brody řek, kterými trasa vede (střed mělčiny na ose řeky ve světě – trasa jím prochází). */
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

type Cell = { x: number; y: number };

/** Souvislé mělčiny na ose řeky – index prvního a posledního bodu. */
function fordRuns(course: readonly StreamPoint[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  course.forEach((p, k) => {
    if (p.shallow && start < 0) start = k;
    if ((!p.shallow || k === course.length - 1) && start >= 0) {
      runs.push([start, p.shallow ? k : k - 1]);
      start = -1;
    }
  });
  return runs;
}

const wide = (p: StreamPoint): number => Math.max(p.halfWidthLeft, p.halfWidthRight);

/** Přechod brodem: střed mělčiny na ose řeky a konce přímky přechodu napříč řekou (políčka). */
interface FordCrossing {
  readonly center: Cell;
  readonly ends: readonly [Cell, Cell];
}

/** Přechody všech brodů – kolmo na osu ve středu mělčiny, přes vodu a břehové pásmo. */
function fordCrossings(axes: readonly (readonly StreamPoint[])[]): FordCrossing[] {
  const crossings: FordCrossing[] = [];
  for (const course of axes) {
    for (const [first, last] of fordRuns(course)) {
      const k = Math.round((first + last) / 2);
      const c = course[k]!;
      const a = course[Math.max(0, k - 2)]!;
      const b = course[Math.min(course.length - 1, k + 2)]!;
      const length = length2(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / length;
      const ny = (b.x - a.x) / length;
      const half = wide(c) + SKELETON_ROUTE.bankCells + SKELETON_ROUTE.fordLandCells;
      crossings.push({
        center: { x: c.x, y: c.y },
        ends: [
          { x: c.x - nx * half, y: c.y - ny * half },
          { x: c.x + nx * half, y: c.y + ny * half },
        ],
      });
    }
  }
  return crossings;
}

/** Vzdálenost bodu od úsečky (políčka). */
function toSegment(p: Cell, a: Cell, b: Cell): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return length2(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** Políčka přechodů brodem (číslo přechodu + 1): jen tudy smí stezka přes řeku. */
function fordZoneMask(size: number, crossings: readonly FordCrossing[]): Uint16Array {
  const zone = new Uint16Array(size * size);
  crossings.forEach(({ ends: [a, b] }, k) => {
    const r = SKELETON_ROUTE.fordCorridorCells;
    for (
      let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - r));
      y <= Math.min(size - 1, Math.ceil(Math.max(a.y, b.y) + r));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - r));
        x <= Math.min(size - 1, Math.ceil(Math.max(a.x, b.x) + r));
        x++
      ) {
        if (toSegment({ x, y }, a, b) <= r) zone[y * size + x] = k + 1;
      }
    }
  });
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
  const crossings = fordCrossings(axes);
  const fordZone = fordZoneMask(size, crossings);
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
    const route = buildRoute(l, cellLegs, ports, riverWater, crossings, fordZone);
    if (route) return route;
  }
  return null;
}

/**
 * Úseky trasy z políček: přechod brodem (políčka pásu přechodu s vodou řeky) se nahradí přesnou
 * přímkou přes střed mělčiny a vyhladí se po kusech od středu brodu ke středu brodu – střed zůstane
 * na místě a voda se přejde rovně (vyhlazení zaobluje až roh na břehu).
 */
function buildRoute(
  l: Landscape,
  cellLegs: readonly number[][],
  ports: readonly { trail: { side: MapSide; at: number } }[],
  riverWater: Uint8Array,
  crossings: readonly FordCrossing[],
  fordZone: Uint16Array,
): SkeletonRoute | null {
  const { size } = l;
  const v = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const world = (c: Cell): WorldPoint => {
    const p = tileCenterWorld(l, c.x, c.y);
    return [p.x, p.z];
  };
  const legs: WorldPoint[][] = [];
  const ends: { side: MapSide; point: WorldPoint }[] = [];
  const used = new Set<number>();
  cellLegs.forEach((cells, k) => {
    // Kusy mezi středy brodů – každý přechod končí kus středem brodu a další jím začíná.
    const parts: WorldPoint[][] = [[]];
    for (let j = 0; j < cells.length; j++) {
      const id = fordZone[cells[j]!]!;
      let last = j;
      while (id > 0 && last + 1 < cells.length && fordZone[cells[last + 1]!] === id) last++;
      if (id > 0 && cells.slice(j, last + 1).some((i) => riverWater[i])) {
        const crossing = crossings[id - 1]!;
        const before = cellXY(cells[Math.max(0, j - 1)]!, size);
        const [a, b] = crossing.ends;
        const aFirst =
          length2(a.x - before.x, a.y - before.y) <= length2(b.x - before.x, b.y - before.y);
        const center = world(crossing.center);
        parts.at(-1)!.push(world(aFirst ? a : b), center);
        parts.push([center, world(aFirst ? b : a)]);
        used.add(id - 1);
        j = last;
        continue;
      }
      parts.at(-1)!.push(cellWorld(l, cells[j]!));
    }
    const line = parts.flatMap((part, m) =>
      smoothLine(part, SKELETON_ROUTE.smoothPasses).slice(m > 0 ? 1 : 0),
    );
    const edge = toEdge(l, line[0]!);
    legs.push([edge, ...line.slice(1)]);
    ends.push({ side: ports[k]!.trail.side, point: edge });
  });
  for (const line of legs) {
    if (!lineKeepsAway(line, v, VILLAGE_ROUTE.villageMinM)) return null;
  }
  // Brody, kterými trasa opravdu vede – střed mělčiny, přes který přechod jde.
  const fords = crossings.flatMap((c, k) => (used.has(k) ? [world(c.center)] : []));
  return { legs, ends, fords };
}
