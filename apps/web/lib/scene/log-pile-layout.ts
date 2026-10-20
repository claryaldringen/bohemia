// Hromada klád u vsi (forest.md – Mýcení a hromada klád) bez Babylonu: kde leží a jak jsou klády
// složené. Vesničané ji založí u obydlí nejblíž lesu na volném místě vedle něj (návrh Clauda);
// kláda = jeden velký strom. Hromada roste s mýcením a ubývá, jak se staví.
import {
  dwellingClearing,
  dwellingShape,
  forestEdgeDistanceM,
  obstacleStatus,
  obstaclesNear,
  pointInPolygon,
  polygonsOverlap,
  rectangleCorners,
  rotatedSquareCorners,
  surfaceAt,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleChanges,
  type ObstacleLayer,
  type Point,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { isRotatedSquare, squareContains } from './field-cells';
import { dwellingArea, footprintRect, localToWorld } from './village-layout';

/** Kláda – délka a poloměr (m): kmen velkého stromu přeřezaný na délku srubu. */
export const LOG_LENGTH_M = 4.2;
export const LOG_RADIUS_M = 0.21;
/** Klád ve spodní řadě hranice – hranice má řady 6, 5, 4, 3, 2, 1 (21 klád). */
const STACK_BASE = 6;
const STACK_SIZE = (STACK_BASE * (STACK_BASE + 1)) / 2;
/** Nejvíc hranic vedle sebe – větší zásobu ukáže jen číslo v liště. */
const MAX_STACKS = 3;
/** Nejvíc klád, které scéna ukáže. */
export const MAX_SHOWN_LOGS = STACK_SIZE * MAX_STACKS;
/** Mezera mezi hranicemi (m). */
const STACK_GAP_M = 0.35;
const STACK_WIDTH_M = STACK_BASE * 2 * LOG_RADIUS_M;
/** Půdorys celé hromady (všech hranic) – podle něj se hledá volné místo, aby neskákala. */
export const PILE_WIDTH_M = MAX_STACKS * STACK_WIDTH_M + (MAX_STACKS - 1) * STACK_GAP_M;
export const PILE_DEPTH_M = LOG_LENGTH_M + 0.6;
/** Odstup hromady od stěny obydlí (m) – za okapem, ještě na udusané ploše u obydlí. */
const SITE_GAP_M = 1.5;
/** Volno kolem hromady bez překážek (m). */
const FREE_MARGIN_M = 0.4;

/** Místo hromady: střed ve světě a natočení (klády leží podél místní osy z). */
export interface LogPileSite {
  x: number;
  z: number;
  rotation: number;
}

/** Kláda hromady v místních souřadnicích (x napříč, y nahoru od země, z podél klád). */
export interface LogPlacement {
  x: number;
  y: number;
  z: number;
  radius: number;
  length: number;
  /** Malé pootočení kolem svislé osy (rad) – klády neleží jako podle pravítka. */
  yaw: number;
}

/** Hash indexu → [0, 1) – drobné odchylky klád jsou jen vzhled. */
function hash(i: number, k: number): number {
  let h = Math.imul(i ^ Math.imul(k, 0x27d4eb2d), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Klády hromady v místních souřadnicích: hranice po 21 (řady 6–5–4–3–2–1) vedle sebe, plní se
 * zdola a hranice po hranici – hromada tak ubývá shora a od poslední hranice. Nejvýš
 * MAX_SHOWN_LOGS.
 */
export function logPileLayout(count: number): LogPlacement[] {
  const shown = Math.max(0, Math.min(MAX_SHOWN_LOGS, Math.floor(count)));
  const logs: LogPlacement[] = [];
  const rowHeight = LOG_RADIUS_M * Math.sqrt(3);
  for (let i = 0; i < shown; i++) {
    const stack = Math.floor(i / STACK_SIZE);
    let k = i % STACK_SIZE;
    let row = 0;
    while (k >= STACK_BASE - row) {
      k -= STACK_BASE - row;
      row++;
    }
    const stackLeft = -PILE_WIDTH_M / 2 + stack * (STACK_WIDTH_M + STACK_GAP_M);
    const inRow = STACK_BASE - row;
    const rowLeft = stackLeft + (STACK_WIDTH_M - inRow * 2 * LOG_RADIUS_M) / 2;
    const radius = LOG_RADIUS_M * (0.88 + 0.12 * hash(i, 1));
    logs.push({
      x: rowLeft + (2 * k + 1) * LOG_RADIUS_M,
      y: radius + row * rowHeight,
      z: (hash(i, 2) - 0.5) * 0.35,
      radius,
      length: LOG_LENGTH_M * (0.92 + 0.12 * hash(i, 3)),
      yaw: (hash(i, 4) - 0.5) * 0.06,
    });
  }
  return logs;
}

/**
 * Jak daleko od středu domu sahá pozemek v místních osách domu: vpravo (+x), vlevo (−x)
 * a dozadu (−z) – hromada klád leží za plotem.
 */
function plotReach(
  position: { x: number; z: number; rotation: number },
  plot: { x: number; z: number; size: number; rotation?: number },
): { right: number; left: number; back: number } {
  const h = plot.size / 2;
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  // rohy pozemku – natočený pozemek (fields.md – Natočené stavby) natočené
  const corners: readonly (readonly [number, number])[] = plot.rotation
    ? rotatedSquareCorners(plot.x, plot.z, plot.size, plot.rotation)
    : [
        [plot.x - h, plot.z - h],
        [plot.x + h, plot.z - h],
        [plot.x + h, plot.z + h],
        [plot.x - h, plot.z + h],
      ];
  const local = corners.map(([x, z]) => {
    const dx = x - position.x;
    const dz = z - position.z;
    return [dx * c - dz * s, dx * s + dz * c] as const;
  });
  return {
    right: Math.max(...local.map((p) => p[0])),
    left: -Math.min(...local.map((p) => p[0])),
    back: -Math.min(...local.map((p) => p[1])),
  };
}

/** Místní (lx, lz) hromady na místě `site` → svět. */
export function pileToWorld(site: LogPileSite, lx: number, lz: number): Point {
  return localToWorld({ x: site.x, z: site.z, rotation: site.rotation }, lx, lz);
}

/**
 * Kde leží hromada klád: u obydlí (i rozestavěného) nejblíž okraji lesa (při shodě menší id), na
 * prvním volném místě vedle něj – po stranách, za ním a pak dál. Volné = v krajině, ne ve vodě,
 * na poli ani hřbitově, mimo vyklizenou plochu jiných obydlí a bez stojících překážek (stromy,
 * kameny, keře). Bez obydlí nebo bez volného místa null – hromada se pak nekreslí (nikdy ne do
 * vody ani na pole).
 */
export function logPileSite(
  landscape: Landscape,
  village: SceneVillage,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
): LogPileSite | null {
  const dwellings = village.dwellings;
  if (dwellings.length === 0) return null;
  let home = dwellings[0]!;
  let best = Infinity;
  for (const d of dwellings) {
    const distance = forestEdgeDistanceM(landscape, d.position.x, d.position.z);
    if (distance < best || (distance === best && d.id < home.id)) {
      best = distance;
      home = d;
    }
  }
  // půdorys podle varianty rozměrů domu (population.md – Varianty rozměrů)
  const footprint = footprintRect(home);
  // obydlí na pozemku: hromada za plotem (místní osy domu – pozemek je kolem něj souměrně
  // jen u varianty uprostřed, proto od okraje políčka, ne od stěny)
  const reach = home.plot
    ? plotReach(home.position, home.plot)
    : {
        right: footprint.maxX,
        left: -footprint.minX,
        back: -footprint.minZ,
      };
  const side = (half: number): number => half + SITE_GAP_M + PILE_DEPTH_M / 2;
  const behind = -reach.back - SITE_GAP_M - PILE_DEPTH_M / 2;
  // hranice podél boční stěny (klády od ní kolmo ven), nebo za obydlím podél zadní stěny
  const candidates: { lx: number; lz: number; turn: number }[] = [];
  for (const extra of [0, 3, 7]) {
    candidates.push(
      { lx: side(reach.right) + extra, lz: 0, turn: Math.PI / 2 },
      { lx: -side(reach.left) - extra, lz: 0, turn: Math.PI / 2 },
      { lx: 0, lz: behind - extra, turn: 0 },
    );
  }
  const sites = candidates.map(({ lx, lz, turn }): LogPileSite => {
    const [x, z] = localToWorld(home.position, lx, lz);
    return { x, z, rotation: home.position.rotation + turn };
  });
  return sites.find((site) => isFree(landscape, village, layer, changes, site, home.id)) ?? null;
}

function isFree(
  landscape: Landscape,
  village: SceneVillage,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  site: LogPileSite,
  homeId: number,
): boolean {
  const corners = rectangleCorners(site.x, site.z, PILE_WIDTH_M, PILE_DEPTH_M, site.rotation);
  const taken = new Set<string>();
  // natočené díly (fields.md – Natočené stavby) nejsou políčka – test bodu v jejich osách
  const squares = [
    ...village.fields.flatMap((f) => f.parts),
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
  ];
  const turned = squares.filter((p) => isRotatedSquare(p));
  for (const p of squares) if (!isRotatedSquare(p)) taken.add(`${p.cell.x},${p.cell.y}`);
  for (const [x, z] of [...corners, [site.x, site.z] as Point]) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile || surfaceAt(landscape, tile.x, tile.y) === 'water') return false;
    if (taken.has(`${tile.x},${tile.y}`)) return false;
    if (turned.some((p) => squareContains(p, x, z))) return false;
  }
  for (const d of village.dwellings) {
    // vlastní pozemek je oplocený a plný záhonů – hromada leží za plotem
    if (d.id === homeId && !d.plot) continue;
    const area = d.plot ? dwellingArea(d) : dwellingClearing(d.type, d.position, dwellingShape(d));
    if (polygonsOverlap(corners, area)) return false;
  }
  const margin = rectangleCorners(
    site.x,
    site.z,
    PILE_WIDTH_M + 2 * FREE_MARGIN_M,
    PILE_DEPTH_M + 2 * FREE_MARGIN_M,
    site.rotation,
  );
  const xs = margin.map((p) => p[0]);
  const zs = margin.map((p) => p[1]);
  const status = obstacleStatus(changes);
  for (const i of obstaclesNear(
    layer,
    Math.min(...xs),
    Math.min(...zs),
    Math.max(...xs),
    Math.max(...zs),
  )) {
    const kind = status.kindOf(layer, i);
    if (kind === null) continue;
    if (pointInPolygon([layer.x[i]!, layer.z[i]!], margin)) return false;
  }
  return true;
}
