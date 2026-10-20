import { detCos, detSin, length2 } from '../det-math';
import type { StreamPoint } from '../types';
import type { TileGrid } from '../world';

// Tvary prvků prémiových krajin ve světě scény (m) – obrysy a osy, které hledá server
// i prohlížeč. Jen přesně zaokrouhlované operace (det-math), složka je v deterministické vrstvě.

export type WorldPoint = [number, number];

/** Vrcholy kruhu (obrysu oblasti kolem vsi) – dost na hladký kruh ve velikosti mapy. */
const CIRCLE_VERTICES = 48;

function halfExtent(grid: TileGrid): number {
  return (grid.size * grid.cellSizeM) / 2;
}

/** Vzdálenost políčka od místa pro vesnici (políčka, mezi středy). */
export function tileDistance(x: number, y: number, site: { x: number; y: number }): number {
  return length2(x - site.x, y - site.y);
}

/** Bod osy potoka (souřadnice v políčkách, celé číslo = střed políčka) ve světě. */
export function streamPointWorld(grid: TileGrid, p: StreamPoint): WorldPoint {
  const half = halfExtent(grid);
  return [-half + (p.x + 0.5) * grid.cellSizeM, -half + (p.y + 0.5) * grid.cellSizeM];
}

/** Kruh se středem a poloměrem ve světě jako mnohoúhelník, oříznutý na krajinu. */
export function circleOutline(
  grid: TileGrid,
  cx: number,
  cz: number,
  radiusM: number,
): WorldPoint[] {
  const ring: WorldPoint[] = [];
  for (let k = 0; k < CIRCLE_VERTICES; k++) {
    const angle = (k / CIRCLE_VERTICES) * Math.PI * 2;
    ring.push([cx + detCos(angle) * radiusM, cz + detSin(angle) * radiusM]);
  }
  return clipToSquare(ring, halfExtent(grid));
}

/** Mnohoúhelník oříznutý na čtverec krajiny [−half, half]² (Sutherland–Hodgman). */
function clipToSquare(points: readonly WorldPoint[], half: number): WorldPoint[] {
  let result: WorldPoint[] = [...points];
  // Poloroviny: souřadnice (0 = x, 1 = z) a strana (−1 = ≥ −half, 1 = ≤ half).
  for (const [axis, side] of [
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    const limit = side * half;
    const keep = (p: WorldPoint): boolean => (side < 0 ? p[axis] >= limit : p[axis] <= limit);
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!;
      const previous = input[(i + input.length - 1) % input.length]!;
      const inCurrent = keep(current);
      if (inCurrent !== keep(previous)) {
        const t = (limit - previous[axis]) / (current[axis] - previous[axis]);
        const cut: WorldPoint = [
          previous[0] + t * (current[0] - previous[0]),
          previous[1] + t * (current[1] - previous[1]),
        ];
        cut[axis] = limit;
        result.push(cut);
      }
      if (inCurrent) result.push(current);
    }
  }
  return result;
}

/**
 * Vnější obrys souvislého celku políček (4-sousedství) ve světě – po hranách políček, díry uvnitř
 * celku obrys nemá (patří do něj). Celek se dvěma políčky, která se dotýkají jen rohem, obrys
 * v tom rohu nepropojí (otočí se dovnitř celku). Rovné úseky jsou jedna hrana.
 */
export function cellsOutline(cells: readonly number[], grid: TileGrid): WorldPoint[] {
  const { size } = grid;
  if (cells.length === 0) return [];
  const member = new Uint8Array(size * size);
  let first = cells[0]!;
  for (const i of cells) {
    member[i] = 1;
    if (i < first) first = i;
  }
  const corners = size + 1;
  // Hrany po směru hodinových ručiček v mřížce (y dolů) – celek je vpravo. Z rohu vedou nejvýš
  // dvě (když se v něm dvě políčka celku dotýkají jen rohem).
  const outA = new Int32Array(corners * corners).fill(-1);
  const outB = new Int32Array(corners * corners).fill(-1);
  const addEdge = (ax: number, ay: number, bx: number, by: number): void => {
    const from = ay * corners + ax;
    const to = by * corners + bx;
    if (outA[from] === -1) outA[from] = to;
    else outB[from] = to;
  };
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && member[y * size + x] === 1;
  for (const i of cells) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
    if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
  }

  // Obrys začíná horní hranou prvního políčka (nejvyšší řada leží vždy na vnějším obrysu).
  const startX = first % size;
  const startY = Math.floor(first / size);
  const start = startY * corners + startX;
  const vertices: number[] = [start];
  let from = start;
  let to = startY * corners + startX + 1;
  for (let guard = 0; guard <= 4 * cells.length; guard++) {
    if (to === start) break;
    vertices.push(to);
    const dx = (to % corners) - (from % corners);
    const dy = Math.floor(to / corners) - Math.floor(from / corners);
    const a = outA[to]!;
    const b = outB[to]!;
    let next = a;
    if (b !== -1) {
      // Dvě hrany z rohu: zahni doprava (dovnitř celku) – políčka spojená jen rohem se nespojí.
      const right = (to % corners) - dy + (Math.floor(to / corners) + dx) * corners;
      next = a === right ? a : b;
    }
    from = to;
    to = next;
  }

  // Jen rohy, kde se mění směr.
  const half = halfExtent(grid);
  const outline: WorldPoint[] = [];
  for (let k = 0; k < vertices.length; k++) {
    const previous = vertices[(k + vertices.length - 1) % vertices.length]!;
    const current = vertices[k]!;
    const next = vertices[(k + 1) % vertices.length]!;
    const inX = (current % corners) - (previous % corners);
    const inY = Math.floor(current / corners) - Math.floor(previous / corners);
    const outX = (next % corners) - (current % corners);
    const outY = Math.floor(next / corners) - Math.floor(current / corners);
    if (inX === outX && inY === outY) continue;
    outline.push([
      -half + (current % corners) * grid.cellSizeM,
      -half + Math.floor(current / corners) * grid.cellSizeM,
    ]);
  }
  return outline;
}

/** Plocha mnohoúhelníku (m², bez ohledu na směr obíhání). */
export function polygonAreaM2(points: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    twice += ax * bz - bx * az;
  }
  return Math.abs(twice) / 2;
}

/**
 * Elipsa (čočka) ve světě po 45° – osa `(tx, tz)` (jednotkový směr) s poloosou `halfLength`,
 * napříč `halfWidth`. Cos a sin násobků 45° přesně: 0, ±√½, ±1.
 */
export function ellipseOutline(
  x: number,
  z: number,
  tx: number,
  tz: number,
  halfLength: number,
  halfWidth: number,
): WorldPoint[] {
  const out: WorldPoint[] = [];
  const r = Math.SQRT1_2;
  const steps: [number, number][] = [
    [1, 0],
    [r, r],
    [0, 1],
    [-r, r],
    [-1, 0],
    [-r, -r],
    [0, -1],
    [r, -r],
  ];
  for (const [c, s] of steps) {
    const u = c * halfLength;
    const v = s * halfWidth;
    out.push([x + tx * u - tz * v, z + tz * u + tx * v]);
  }
  return out;
}
