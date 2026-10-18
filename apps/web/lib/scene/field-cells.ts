// Čistá geometrie polí po čtvercích (bez Babylonu): výběr čtverců při malování pole, obrys
// sjednocení čtverců (mez), měkký okraj pole a směr řádků. Čtverec = políčko krajiny,
// souřadnice světa scény v metrech (x, z), políčko (x, y) jako v herním jádru. Čtverce natočené
// stavby (fields.md – Natočené stavby) mají natočení `rotation` a `cell` v mřížce stavby –
// výpočty běží v „rovném prostoru“ mřížky (natočení kolem prvního čtverce zpět), u nenatočených
// čtverců je to svět beze změny.
import { rotationCosSin, rotationTurn, type SquareGrid, type TileCell } from '@bohemia/game';
import type { Bounds, DecalGrid, Point } from './village-layout';

/** Čtverec pole ve scéně – políčko, jeho střed ve světě, strana (m) a natočení (rad). */
export interface CellSquare {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  /** Natočení čtverce natočené stavby (rad, po 15°); bez údaje 0 – políčko krajiny. */
  rotation?: number;
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

/**
 * Převod čtverců mřížky na souřadnice podle jednoho známého čtverce (mřížka je pravidelná). Počítá
 * se v „rovném prostoru“ mřížky: u natočené mřížky je to svět otočený kolem známého čtverce zpět
 * (`toSpace` / `toWorld`), u nenatočené svět sám.
 */
export interface GridFrame {
  /** Střed čtverce (x, y) v rovném prostoru. */
  center(x: number, y: number): Point;
  /** Čtverec pod bodem rovného prostoru. */
  cellAt(u: number, v: number): TileCell;
  /** Bod světa → rovný prostor. */
  toSpace(x: number, z: number): Point;
  /** Bod rovného prostoru → svět. */
  toWorld(u: number, v: number): Point;
  /** Jednotkové směry os mřížky ve světě (osa x čtverců, osa y čtverců). */
  axes: [Point, Point];
  rotated: boolean;
  size: number;
}

/**
 * Mřížka stavby po čtvercích (pole, sad), ve které leží bod (x, z) – `grid` stavby; undefined =
 * stavba v mřížce krajiny, null = bod neleží na žádné (malování se chytí mřížky stavby pod
 * kurzorem – fields.md, Natočené stavby).
 */
export function structureGridAt(
  structures: readonly { grid?: SquareGrid; squares: readonly CellSquare[] }[],
  x: number,
  z: number,
): SquareGrid | undefined | null {
  for (const s of structures) {
    if (s.squares.some((square) => squareContains(square, x, z))) return s.grid;
  }
  return null;
}

/** Je čtverec natočený (ne v mřížce krajiny)? */
export function isRotatedSquare(square: { rotation?: number }): boolean {
  if (square.rotation === undefined) return false;
  const turn = rotationTurn(square.rotation);
  return turn === null || turn % 24 !== 0;
}

export function gridFrame(reference: CellSquare): GridFrame {
  const { cell, x: rx, z: rz, size } = reference;
  const center = (x: number, y: number): Point => [
    rx + (x - cell.x) * size,
    rz + (y - cell.y) * size,
  ];
  const cellAt = (u: number, v: number): TileCell => ({
    x: cell.x + Math.round((u - rx) / size),
    y: cell.y + Math.round((v - rz) / size),
  });
  if (!isRotatedSquare(reference)) {
    return {
      size,
      center,
      cellAt,
      toSpace: (x, z) => [x, z],
      toWorld: (u, v) => [u, v],
      axes: [
        [1, 0],
        [0, 1],
      ],
      rotated: false,
    };
  }
  // místní (lx, lz) → svět (rx + lx·c + lz·s, rz − lx·s + lz·c) jako rotation.y v Babylonu
  const [c, s] = rotationCosSin(reference.rotation!);
  return {
    size,
    center,
    cellAt,
    toSpace: (x, z) => {
      const dx = x - rx;
      const dz = z - rz;
      return [rx + dx * c - dz * s, rz + dx * s + dz * c];
    },
    toWorld: (u, v) => {
      const lx = u - rx;
      const lz = v - rz;
      return [rx + lx * c + lz * s, rz - lx * s + lz * c];
    },
    axes: [
      [c, -s],
      [s, c],
    ],
    rotated: true,
  };
}

/** Leží čtverec `square` ve stejné mřížce jako rámec (natočení a střed sedí na čtverec)? */
export function inFrame(frame: GridFrame, reference: CellSquare, square: CellSquare): boolean {
  if (isRotatedSquare(square) !== frame.rotated) return false;
  if (frame.rotated && rotationTurn(square.rotation!) !== rotationTurn(reference.rotation!)) {
    return false;
  }
  const [u, v] = frame.toSpace(square.x, square.z);
  const [cu, cv] = frame.center(square.cell.x, square.cell.y);
  return Math.abs(u - cu) < 1e-3 && Math.abs(v - cv) < 1e-3;
}

/** Rohy čtverce ve světě (místní −−, +−, ++, −+ – jako rohy políčka). */
export function squareCornersOf(square: CellSquare): Point[] {
  const h = square.size / 2;
  if (!isRotatedSquare(square)) {
    return [
      [square.x - h, square.z - h],
      [square.x + h, square.z - h],
      [square.x + h, square.z + h],
      [square.x - h, square.z + h],
    ];
  }
  const [c, s] = rotationCosSin(square.rotation!);
  return (
    [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ] as const
  ).map(([lx, lz]): Point => [square.x + lx * c + lz * s, square.z - lx * s + lz * c]);
}

/** Leží bod ve čtverci (nebo do `marginM` od jeho stran – v osách čtverce)? */
export function squareContains(square: CellSquare, x: number, z: number, marginM = 0): boolean {
  const h = square.size / 2 + marginM;
  if (!isRotatedSquare(square)) {
    return Math.abs(x - square.x) <= h && Math.abs(z - square.z) <= h;
  }
  const [c, s] = rotationCosSin(square.rotation!);
  const dx = x - square.x;
  const dz = z - square.z;
  return Math.abs(dx * c - dz * s) <= h && Math.abs(dx * s + dz * c) <= h;
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
    return frame.toWorld(cx - half, cz - half);
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
  return (wx, wz) => {
    const [x, z] = frame.toSpace(wx, wz);
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

/**
 * Čtverce z `others`, které se čtverců `own` dotýkají stranou nebo rohem (8-sousedství) – pro
 * měkký okraj pole: kde pole navazuje na jiné pole, okraj se netlumí a pole na sebe plynule
 * navážou (bez švu).
 */
export function touchingSquares<T extends CellSquare>(
  own: readonly CellSquare[],
  others: readonly T[],
): T[] {
  const first = own[0];
  if (!first) return [];
  const frame = gridFrame(first);
  const mine = new Set(own.map((s) => key(s.cell.x, s.cell.y)));
  return others.filter((o) => {
    // sousedství po čtvercích jen ve stejné mřížce (natočené stavby – fields.md)
    if (!inFrame(frame, first, o)) return false;
    if (mine.has(key(o.cell.x, o.cell.y))) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (mine.has(key(o.cell.x + dx, o.cell.y + dy))) return true;
      }
    }
    return false;
  });
}

/** Obdélník kolem čtverců ve světě (s okrajem `marginM`). */
export function cellsBounds(squares: readonly CellSquare[], marginM = 0): Bounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const s of squares) {
    // natočený čtverec zabírá v osách světa víc (|cos| + |sin| násobek)
    let spread = 1;
    if (isRotatedSquare(s)) {
      const [c, sn] = rotationCosSin(s.rotation!);
      spread = Math.abs(c) + Math.abs(sn);
    }
    const half = (s.size / 2) * spread + marginM;
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
  return (wx, wz) => {
    const [x, z] = frame.toSpace(wx, wz);
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

/**
 * Leží bod v některém ze čtverců z různých staveb (každá ve své mřížce – fields.md, Natočené
 * stavby)? Čtverce se rozdělí po mřížkách a v každé se hledá jako `cellsContain`.
 */
export function squaresContain(
  squares: readonly CellSquare[],
  marginM = 0,
): (x: number, z: number) => boolean {
  const groups: { frame: GridFrame; reference: CellSquare; squares: CellSquare[] }[] = [];
  for (const square of squares) {
    const group = groups.find((g) => inFrame(g.frame, g.reference, square));
    if (group) group.squares.push(square);
    else groups.push({ frame: gridFrame(square), reference: square, squares: [square] });
  }
  const tests = groups.map((g) => cellsContain(g.squares, marginM));
  if (tests.length === 1) return tests[0]!;
  return (x, z) => tests.some((test) => test(x, z));
}

/**
 * Směr řádků obilí a brázd – podél delší strany pole (jednotkový vektor); u natočeného pole podél
 * os jeho mřížky.
 */
export function rowDirection(squares: readonly CellSquare[]): Point {
  const first = squares[0];
  if (!first) return [1, 0];
  if (!isRotatedSquare(first)) {
    const b = cellsBounds(squares);
    return b.maxX - b.minX >= b.maxZ - b.minZ ? [1, 0] : [0, 1];
  }
  const xs = squares.map((s) => s.cell.x);
  const ys = squares.map((s) => s.cell.y);
  const [alongX, alongY] = gridFrame(first).axes;
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? alongX : alongY;
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
