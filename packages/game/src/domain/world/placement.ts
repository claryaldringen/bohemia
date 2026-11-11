import type { GridCell } from '../village/people/world-grid';
import { SEAT_CELL } from '../village/people/world-grid';
import { WORLD } from './rules-world';

/** Obsazené políčko mřížky světa a hráč, jemuž patří. */
export interface OccupiedCell {
  cell: GridCell;
  ownerId: string;
}

/**
 * Žádost o místo: nezávislý (od středu světa, nebo nejblíž mapám rodů stejného jazyka, když
 * `sameLanguage` není prázdné) nebo pozvaný (nejblíž sídlu pána).
 */
export type PlacementRequest =
  | { kind: 'independent'; sameLanguage?: readonly GridCell[] }
  | { kind: 'invited'; lordSeat: GridCell };

/** Vzdálenost v krocích mřížkou v 8 směrech (Čebyševova). */
export function cellDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Políčka přesně `radius` kroků od středu; pevné pořadí od severu (+y) po směru hodinových
 * ručiček. Poloměr 0 = jen střed.
 */
export function ringCells(center: GridCell, radius: number): GridCell[] {
  if (radius <= 0) return [{ x: center.x, y: center.y }];
  const offsets: GridCell[] = [];
  for (let dx = 0; dx <= radius; dx++) offsets.push({ x: dx, y: radius }); // sever -> severovýchod
  for (let dy = radius - 1; dy >= -radius; dy--) offsets.push({ x: radius, y: dy }); // východ
  for (let dx = radius - 1; dx >= -radius; dx--) offsets.push({ x: dx, y: -radius }); // jih
  for (let dy = -radius + 1; dy <= radius; dy++) offsets.push({ x: -radius, y: dy }); // západ
  for (let dx = -radius + 1; dx < 0; dx++) offsets.push({ x: dx, y: radius }); // severozápad
  return offsets.map((o) => ({ x: center.x + o.x, y: center.y + o.y }));
}

/** Cílová políčka, od nichž se hledá po prstencích (newcomers.md – Svobodný nováček). */
function placementTargets(request: PlacementRequest): readonly GridCell[] {
  if (request.kind === 'invited') return [request.lordSeat];
  return request.sameLanguage && request.sameLanguage.length > 0
    ? request.sameLanguage
    : [SEAT_CELL];
}

/** Odstup od cizích map podle žádosti (vassalage.md – Místo na mapě světa). */
function placementGap(request: PlacementRequest): number {
  return request.kind === 'invited' ? WORLD.invitedGap : WORLD.independentGap;
}

/** Strop hledání: prstenec, který vždy přesáhne všechna obsazená políčka + odstup. */
function searchLimit(
  occupied: readonly OccupiedCell[],
  targets: readonly GridCell[],
  gap: number,
): number {
  let limit = gap;
  for (const t of targets)
    for (const o of occupied) limit = Math.max(limit, cellDistance(t, o.cell) + gap);
  return limit;
}

/** Podmínka políčka s pamětí – každé políčko se ověří nejvýš jednou. */
function memoized(cellOk: (cell: GridCell) => boolean): (x: number, y: number) => boolean {
  const known = new Map<number, boolean>();
  return (x, y) => {
    const key = cellKey(x, y);
    let ok = known.get(key);
    if (ok === undefined) {
      ok = cellOk({ x, y });
      known.set(key, ok);
    }
    return ok;
  };
}

/** Číselný klíč políčka (souřadnice do ±2^25). */
function cellKey(x: number, y: number): number {
  return (x + 33554432) * 67108864 + (y + 33554432);
}

/** Množina obsazených políček pro test odstupu v O(gap²) místo O(počet obsazených). */
function occupiedKeys(occupied: readonly OccupiedCell[]): Set<number> {
  const keys = new Set<number>();
  for (const o of occupied) keys.add(cellKey(o.cell.x, o.cell.y));
  return keys;
}

/** Je políčko obsazené nebo blíž než `gap` kroků k obsazenému? */
function isBlocked(keys: ReadonlySet<number>, x: number, y: number, gap: number): boolean {
  const r = Math.max(gap - 1, 0);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) if (keys.has(cellKey(x + dx, y + dy))) return true;
  return false;
}

/**
 * Nejbližší posun shluku vsí (místní souřadnice, první = sídlo), kde mají všechny buňky shluku
 * odstup aspoň `gap` od cizích políček. Hledá po prstencích kolem cílů (víc cílů = nejblíž
 * kterémukoli) a zachovává vzájemnou polohu buněk (newcomers.md – Odříznutá krajina). S `cellOk`
 * musí podmínku splnit každá buňka shluku (odříznutý shluk jen na suchá políčka kostry).
 */
export function placeCluster(
  occupied: readonly OccupiedCell[],
  cluster: readonly GridCell[],
  request: PlacementRequest,
  cellOk?: (cell: GridCell) => boolean,
): { offset: GridCell; cells: GridCell[] } {
  const first = cluster[0];
  if (!first) throw new Error('Prázdný shluk vsí');
  const targets = placementTargets(request);
  const gap = placementGap(request);
  const local = cluster.map((c) => ({ x: c.x - first.x, y: c.y - first.y }));
  const extent = local.reduce((m, l) => Math.max(m, cellDistance(l, { x: 0, y: 0 })), 0);
  const limit = searchLimit(occupied, targets, gap) + extent;
  // S podmínkou políčka (jen suchá políčka kostry – world-skeleton.md – Hustota a stejné podmínky)
  // může být vhodné až za obsazenými políčky: hledá se dál, nejvýš `WORLD.searchRings` prstenců.
  const ok = cellOk ? memoized(cellOk) : null;
  const maxRadius = ok ? limit + WORLD.searchRings : limit;
  // Obsazená políčka v množině; zakázané je to do `gap - 1` kroků od obsazeného.
  const keys = occupiedKeys(occupied);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (const target of targets) {
      for (const seat of ringCells(target, radius)) {
        let fits = true;
        for (const l of local) {
          if (isBlocked(keys, seat.x + l.x, seat.y + l.y, gap)) {
            fits = false;
            break;
          }
        }
        // Podmínka políčka (drahá – výřez kostry) až po odstupu všech buněk.
        if (fits && ok)
          for (const l of local) {
            if (!ok(seat.x + l.x, seat.y + l.y)) {
              fits = false;
              break;
            }
          }
        if (fits)
          return { offset: seat, cells: local.map((l) => ({ x: seat.x + l.x, y: seat.y + l.y })) };
      }
    }
  }
  // Bez podmínky nedosažitelné: na prstenci `limit` je vždy volno.
  throw new Error('Nenalezeno volné políčko mřížky světa');
}

/**
 * Volná políčka (odstup podle žádosti) po prstencích kolem cílů žádosti v pořadí `placeCluster`,
 * každé jednou, s poloměrem = vzdálenost k nejbližšímu cíli. Za prstencem, na kterém je vždy
 * volno, pokračuje ještě `extraRings` prstenců (`placeSeat` – políčko musí mít i místo kostry).
 */
export function* freeCellsByRing(
  occupied: readonly OccupiedCell[],
  request: PlacementRequest,
  extraRings: number,
): Generator<{ cell: GridCell; radius: number }> {
  const targets = placementTargets(request);
  const gap = placementGap(request);
  const maxRadius = searchLimit(occupied, targets, gap) + extraRings;
  const keys = occupiedKeys(occupied);
  const seen = new Set<number>();
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (const target of targets) {
      for (const cell of ringCells(target, radius)) {
        if (isBlocked(keys, cell.x, cell.y, gap)) continue;
        const key = cellKey(cell.x, cell.y);
        // Políčko blíž jinému cíli už prošlo na menším prstenci.
        if (seen.has(key)) continue;
        seen.add(key);
        yield { cell, radius };
      }
    }
  }
}

/** Nejbližší volné políčko od cíle, které je od všech obsazených aspoň `gap` daleko. */
export function placeNewPlayer(
  occupied: readonly OccupiedCell[],
  request: PlacementRequest,
): GridCell {
  return placeCluster(occupied, [{ x: 0, y: 0 }], request).offset;
}
