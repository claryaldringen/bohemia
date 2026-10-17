// Čistá geometrie polí po čtvercích (bez Babylonu): výběr čtverců při malování pole, obrys
// sjednocení čtverců (mez), měkký okraj pole a směr řádků. Čtverec = políčko krajiny,
// souřadnice světa scény v metrech (x, z), políčko (x, y) jako v herním jádru.
import type { TileCell } from '@bohemia/game';
import type { Bounds, DecalGrid, Point } from './village-layout';

/** Čtverec pole ve scéně – políčko, jeho střed ve světě a strana (m). */
export interface CellSquare {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
}

/** Jak tah myší mění výběr: přidá čtverce, nebo je ubere. */
export type StrokeMode = 'add' | 'remove';

/** Plynulý přechod 0 → 1 (jako ve village-layout.ts – ten importuje tento modul). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Čtverce obdélníku mezi dvěma rohovými čtverci (včetně), po řádcích. */
export function rectangleCells(a: TileCell, b: TileCell): TileCell[] {
  const cells: TileCell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  }
  return cells;
}

/**
 * Vybrané čtverce malovaného pole s historií tahů (zpět o tah). Pořadí čtverců je po řádcích,
 * aby stejný výběr dal vždy stejný seznam.
 */
export class CellSelection {
  private selected = new Map<string, TileCell>();
  private readonly history: Map<string, TileCell>[] = [];

  get count(): number {
    return this.selected.size;
  }

  has(cell: TileCell): boolean {
    return this.selected.has(key(cell.x, cell.y));
  }

  /** Vybrané čtverce po řádcích (y, pak x). */
  cells(): TileCell[] {
    return sortCells([...this.selected.values()]);
  }

  /** Výběr po tahu – bez uložení (náhled během tažení). */
  preview(cells: readonly TileCell[], mode: StrokeMode): TileCell[] {
    return sortCells([...this.applied(cells, mode).values()]);
  }

  /** Provede tah; vrátí false, když se výběr nezměnil (pak nejde ani do historie). */
  apply(cells: readonly TileCell[], mode: StrokeMode): boolean {
    const next = this.applied(cells, mode);
    if (sameKeys(next, this.selected)) return false;
    this.history.push(this.selected);
    this.selected = next;
    return true;
  }

  /** Kliknutí: nevybraný čtverec přidá, vybraný ubere. */
  toggle(cell: TileCell): void {
    this.apply([cell], this.has(cell) ? 'remove' : 'add');
  }

  /** Vrátí poslední tah; false, když není co vracet. */
  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.selected = previous;
    return true;
  }

  private applied(cells: readonly TileCell[], mode: StrokeMode): Map<string, TileCell> {
    const next = new Map(this.selected);
    for (const cell of cells) {
      if (mode === 'add') next.set(key(cell.x, cell.y), { x: cell.x, y: cell.y });
      else next.delete(key(cell.x, cell.y));
    }
    return next;
  }
}

function sortCells(cells: TileCell[]): TileCell[] {
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

function sameKeys(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/** Převod políček na světové souřadnice podle jednoho známého čtverce (mřížka je pravidelná). */
interface GridFrame {
  /** Střed políčka (x, y) ve světě. */
  center(x: number, y: number): Point;
  /** Políčko pod bodem světa. */
  cellAt(wx: number, wz: number): TileCell;
  size: number;
}

function gridFrame(reference: CellSquare): GridFrame {
  const { cell, x: rx, z: rz, size } = reference;
  return {
    size,
    center: (x, y) => [rx + (x - cell.x) * size, rz + (y - cell.y) * size],
    cellAt: (wx, wz) => ({
      x: cell.x + Math.round((wx - rx) / size),
      y: cell.y + Math.round((wz - rz) / size),
    }),
  };
}

/**
 * Hranice sjednocení čtverců (mez kolem pole) jako úsečky [začátek, konec] ve světě. Strany
 * mezi dvěma čtverci pole se vynechají, navazující strany na jedné přímce se spojí.
 */
export function cellsBoundary(squares: readonly CellSquare[]): Point[][] {
  const first = squares[0];
  if (!first) return [];
  const frame = gridFrame(first);
  const inside = new Set(squares.map((s) => key(s.cell.x, s.cell.y)));
  // Hrany v souřadnicích rohů políček: vodorovná (x, y) vede z rohu (x, y) do (x + 1, y).
  const horizontal = new Map<number, number[]>();
  const vertical = new Map<number, number[]>();
  const add = (map: Map<number, number[]>, line: number, at: number): void => {
    const list = map.get(line) ?? [];
    list.push(at);
    map.set(line, list);
  };
  for (const { cell } of squares) {
    const { x, y } = cell;
    if (!inside.has(key(x, y - 1))) add(horizontal, y, x);
    if (!inside.has(key(x, y + 1))) add(horizontal, y + 1, x);
    if (!inside.has(key(x - 1, y))) add(vertical, x, y);
    if (!inside.has(key(x + 1, y))) add(vertical, x + 1, y);
  }
  const half = frame.size / 2;
  const corner = (x: number, y: number): Point => {
    const [cx, cz] = frame.center(x, y);
    return [cx - half, cz - half];
  };
  const segments: Point[][] = [];
  const runs = (
    map: Map<number, number[]>,
    toSegment: (line: number, a: number, b: number) => Point[],
  ): void => {
    for (const [line, list] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
      const sorted = [...new Set(list)].sort((a, b) => a - b);
      let start = sorted[0]!;
      let end = start;
      for (const at of sorted.slice(1)) {
        if (at === end + 1) {
          end = at;
          continue;
        }
        segments.push(toSegment(line, start, end + 1));
        start = at;
        end = at;
      }
      segments.push(toSegment(line, start, end + 1));
    }
  };
  runs(horizontal, (y, a, b) => [corner(a, y), corner(b, y)]);
  runs(vertical, (x, a, b) => [corner(x, a), corner(x, b)]);
  return segments;
}

/**
 * Krytí pole s měkkým okrajem: 1 uvnitř sjednocení čtverců dál než `softM` od jeho hranice,
 * k hranici klesá na 0 (venku 0). Mezi sousedními čtverci pole žádný šev. Vzdálenost se měří
 * jen k sousedům (3 × 3 políčka) – `softM` musí být menší než strana čtverce.
 */
export function cellsCoverage(
  squares: readonly CellSquare[],
  softM: number,
): (x: number, z: number) => number {
  const first = squares[0];
  if (!first) return () => 0;
  const frame = gridFrame(first);
  const inside = new Set(squares.map((s) => key(s.cell.x, s.cell.y)));
  const half = frame.size / 2;
  return (x, z) => {
    const cell = frame.cellAt(x, z);
    if (!inside.has(key(cell.x, cell.y))) return 0;
    let distance = softM;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || inside.has(key(cell.x + dx, cell.y + dy))) continue;
        const [nx, nz] = frame.center(cell.x + dx, cell.y + dy);
        const ox = Math.max(0, Math.abs(x - nx) - half);
        const oz = Math.max(0, Math.abs(z - nz) - half);
        distance = Math.min(distance, Math.hypot(ox, oz));
      }
    }
    return smoothstep(0, softM, distance);
  };
}

/** Obdélník kolem čtverců ve světě (s okrajem `marginM`). */
export function cellsBounds(squares: readonly CellSquare[], marginM = 0): Bounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const s of squares) {
    const half = s.size / 2 + marginM;
    bounds.minX = Math.min(bounds.minX, s.x - half);
    bounds.maxX = Math.max(bounds.maxX, s.x + half);
    bounds.minZ = Math.min(bounds.minZ, s.z - half);
    bounds.maxZ = Math.max(bounds.maxZ, s.z + half);
  }
  return bounds;
}

/** Leží bod ve čtverci pole (nebo do `marginM` od něj)? Vyhledání v mřížce, ne přes všechny čtverce. */
export function cellsContain(
  squares: readonly CellSquare[],
  marginM = 0,
): (x: number, z: number) => boolean {
  const first = squares[0];
  if (!first) return () => false;
  const frame = gridFrame(first);
  const inside = new Set(squares.map((s) => key(s.cell.x, s.cell.y)));
  const half = frame.size / 2 + marginM;
  return (x, z) => {
    const cell = frame.cellAt(x, z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inside.has(key(cell.x + dx, cell.y + dy))) continue;
        const [cx, cz] = frame.center(cell.x + dx, cell.y + dy);
        if (Math.abs(x - cx) <= half && Math.abs(z - cz) <= half) return true;
      }
    }
    return false;
  };
}

/** Směr řádků obilí a brázd – podél delší strany pole (jednotkový vektor). */
export function rowDirection(squares: readonly CellSquare[]): Point {
  if (squares.length === 0) return [1, 0];
  const b = cellsBounds(squares);
  return b.maxX - b.minX >= b.maxZ - b.minZ ? [1, 0] : [0, 1];
}

/**
 * Spojí sítě obtisků do jedné – každá s vlastní barvou a násobkem krytí (barvy po vrcholech
 * jako RGB trojice za sebou).
 */
export function mergeDecalGrids(
  items: readonly { grid: DecalGrid; color: readonly [number, number, number]; alpha: number }[],
): { grid: DecalGrid; colors: Float32Array } {
  const total = items.reduce((sum, item) => sum + item.grid.alphas.length, 0);
  const totalIndices = items.reduce((sum, item) => sum + item.grid.indices.length, 0);
  const positions = new Float32Array(total * 2);
  const alphas = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  const indices = new Uint32Array(totalIndices);
  let v = 0;
  let k = 0;
  for (const { grid, color, alpha } of items) {
    const count = grid.alphas.length;
    positions.set(grid.positions, v * 2);
    for (let i = 0; i < count; i++) {
      alphas[v + i] = grid.alphas[i]! * alpha;
      colors.set(color, (v + i) * 3);
    }
    for (let i = 0; i < grid.indices.length; i++) indices[k + i] = grid.indices[i]! + v;
    v += count;
    k += grid.indices.length;
  }
  return { grid: { positions, alphas, indices }, colors };
}
