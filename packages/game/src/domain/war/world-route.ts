import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { PathHeap } from '../village/paths/network-search';
import type { Direction8 } from '../village/types';
import { directionBetween, GRID_STEPS, type GridCell } from '../village/people/world-grid';
import type { Pos } from './march-grid';
import { WAR } from './rules-war';

// Cesta mapu po mapě (war.md – Pohyb – mapu po mapě; Martin 2. 11. 2026: „Hráč musí k cíli dojít
// mapu po mapě“): trasa po mřížce světa ve 4 směrech a přechod okrajem na opačný okraj sousední
// mapy (Martin 18. 10.). Úhlopříčný soused se dosáhne dvěma kolmými kroky přes sousední mapu
// (návrh Clauda – plán 2026-11-16-dense-forest, oprava Úlohy 5): úhlopříčný přechod vedl jedinou
// rohovou buňkou mřížky pochodu (2,5 m), průchozí na obou mapách – v rozích, kde je les, skupina
// stála. Objížďka zavřeného okraje to není (Martin 16. 11. 2026: „Má zůstat stát.“).

/** O kolik políček za obdélník startu a cíle smí trasa uhnout (mez hledání – návrh Clauda). */
const ROUTE_MARGIN = 8;

/** Cena kroku po mřížce světa (celá čísla – remízy přesně). */
const STRAIGHT = 5;

/** Směry v pevném pořadí – jen kolmé (čtyřsousedná cesta). */
const STEPS: readonly GridCell[] = [GRID_STEPS.N, GRID_STEPS.E, GRID_STEPS.S, GRID_STEPS.W];

/** Manhattanský odhad v cenách kroků – nikdy víc než skutečná cena. */
function estimate(a: GridCell, b: GridCell): number {
  return STRAIGHT * (Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
}

/**
 * Trasa tažení po mřížce světa z políčka `from` do `to` ve 4 směrech – každé dvě sousední políčka
 * trasy sdílejí stranu, takže se přechází okrajem, ne rohem mapy. Políčka, pro která `avoid` platí,
 * obejde (start a cíl nikdy); uhne nejvýš `ROUTE_MARGIN` políček za obdélník startu a cíle. Vrací
 * políčka od startu do cíle včetně; nedosažitelný cíl []. Remízy: vyhraje první nalezený předchůdce
 * (pevné pořadí směrů a haldy) – stejný vstup, stejná trasa.
 */
export function worldRoute(
  from: GridCell,
  to: GridCell,
  avoid: (c: GridCell) => boolean,
): GridCell[] {
  const x0 = Math.min(from.x, to.x) - ROUTE_MARGIN;
  const y0 = Math.min(from.y, to.y) - ROUTE_MARGIN;
  const w = Math.abs(from.x - to.x) + 2 * ROUTE_MARGIN + 1;
  const h = Math.abs(from.y - to.y) + 2 * ROUTE_MARGIN + 1;
  const index = (c: GridCell): number => (c.y - y0) * w + (c.x - x0);
  const cellOf = (k: number): GridCell => ({ x: x0 + (k % w), y: y0 + Math.floor(k / w) });
  const dist = new Float64Array(w * h).fill(Infinity);
  const parent = new Int32Array(w * h).fill(-1);
  const blocked = new Int8Array(w * h);
  const heap = new PathHeap();
  const start = index(from);
  const goal = index(to);
  dist[start] = 0;
  heap.push(start, estimate(from, to));
  while (heap.size > 0) {
    const k = heap.pop();
    const cell = cellOf(k);
    const d = dist[k]!;
    if (heap.topKey > d + estimate(cell, to)) continue;
    if (k === goal) {
      const route: GridCell[] = [];
      for (let p = k; p >= 0; p = parent[p]!) route.push(cellOf(p));
      return route.reverse();
    }
    for (const step of STEPS) {
      const next = { x: cell.x + step.x, y: cell.y + step.y };
      if (next.x < x0 || next.y < y0 || next.x >= x0 + w || next.y >= y0 + h) continue;
      const n = index(next);
      if (n !== goal) {
        if (blocked[n] === 0) blocked[n] = avoid(next) ? 1 : 2;
        if (blocked[n] === 1) continue;
      }
      const nd = d + STRAIGHT;
      if (nd < dist[n]!) {
        dist[n] = nd;
        parent[n] = k;
        heap.push(n, nd + estimate(next, to));
      }
    }
  }
  return [];
}

/**
 * Směr prvního kroku trasy (`worldRoute`) k sousednímu políčku ve směru `direction`: přímý soused
 * týž směr, úhlopříčný kolmý krok, kterým trasa začne – přes jeho okraj skupina mapu opustí
 * (kurzor nad rohem mapy v prohlížeči).
 */
export function firstRouteStep(direction: Direction8): Direction8 {
  const route = worldRoute({ x: 0, y: 0 }, GRID_STEPS[direction], () => false);
  return directionBetween(route[0]!, route[1]!)!;
}

/**
 * Trasa `route` (bez políčka `cell`) bez úhlopříčných kroků – starší bod, kdy `worldRoute` vedl
 * i rohem mapy: úhlopříčný krok nahradí dvěma kolmými jako `worldRoute`. Trasa bez nich – táž
 * políčka (nové pole).
 */
export function sideBySide(cell: GridCell, route: readonly GridCell[]): GridCell[] {
  const out: GridCell[] = [];
  let prev = cell;
  for (const next of route) {
    if (prev.x !== next.x && prev.y !== next.y) {
      out.push(...worldRoute(prev, next, () => false).slice(1, -1));
    }
    out.push({ ...next });
    prev = next;
  }
  return out;
}

/** Polovina strany mapy bez půl buňky pochodu – střed okrajové buňky mřížky pochodu (m). */
const EDGE_M = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2 - WAR.march.cellM / 2;

/**
 * Přechod okrajem (war.md – Pohyb – Přechod okrajem): vojsko na okraji mapy `cellFrom` se objeví
 * na opačném okraji sousední mapy `cellTo` – osa, ve které se jde, se převrátí na opačný okraj,
 * druhá zůstane (v mapě). Úhlopříčně z rohu do protějšího rohu. Nesousední políčka – chyba.
 */
export function edgeCrossing(cellFrom: GridCell, cellTo: GridCell, pos: Pos): Pos {
  const direction = directionBetween(cellFrom, cellTo);
  if (direction === null) {
    throw new RangeError(
      `Políčka (${cellFrom.x}, ${cellFrom.y}) a (${cellTo.x}, ${cellTo.y}) spolu nesousedí.`,
    );
  }
  const step = GRID_STEPS[direction];
  const clamp = (v: number): number => Math.min(EDGE_M, Math.max(-EDGE_M, v));
  return {
    x: step.x !== 0 ? -step.x * EDGE_M : clamp(pos.x),
    z: step.y !== 0 ? -step.y * EDGE_M : clamp(pos.z),
  };
}
