import type { Point } from './polygon';
import type { PlotSquare, SquareGrid, TileCell } from '../types';

// Natočené stavby po čtvercích (fields.md – Natočené stavby; Martin 18. 10. 2026: „Je to 3D,
// takže všechny stavby by měly jít natáčet po 15 stupních“). Pole a sad mají vlastní mřížku
// čtverců o straně políčka krajiny (`SquareGrid` – střed čtverce 0, 0 a natočení), pozemek
// polozemnice je natočený čtverec (`PlotSquare`). Bez mřížky platí mřížka krajiny – čtverec je
// políčko a všechno se počítá jako dřív (bit po bitu).
//
// Deterministická vrstva (síť pěšin ji počítá i v prohlížeči): kosiny a siny násobků 15° jsou
// přesné hodnoty z odmocnin (IEEE 754 je zaokrouhluje přesně), žádné Math.sin / cos.
//
// Natočení jako `rotation.y` v Babylonu (stejně jako poloha obydlí): místní (lx, lz) → svět
// (x + lx·cos + lz·sin, z − lx·sin + lz·cos).

/** Krok natáčení staveb – 15° (jako otáčení budovy v 0 A.D.). */
export const ROTATION_STEP = Math.PI / 12;
/** Kroků na celou otočku. */
export const ROTATION_TURNS = 24;
/** Různých natočení mřížky – čtverec otočený o 90° je týž čtverec (0°, 15° … 75°). */
export const GRID_TURNS = 6;
/** Tolerance, se kterou je natočení násobkem 15° (rad). */
const TURN_EPSILON = 1e-6;
/** Tolerance, se kterou bod leží ve středu políčka (m). */
const CENTER_EPSILON_M = 1e-6;

const SQRT2 = Math.sqrt(2);
const SQRT3 = Math.sqrt(3);
const SQRT6 = Math.sqrt(6);
/** cos a sin pro 0°, 15°, 30°, 45°, 60°, 75°, 90° – přesně z odmocnin. */
const QUADRANT: readonly (readonly [number, number])[] = [
  [1, 0],
  [(SQRT6 + SQRT2) / 4, (SQRT6 - SQRT2) / 4],
  [SQRT3 / 2, 0.5],
  [SQRT2 / 2, SQRT2 / 2],
  [0.5, SQRT3 / 2],
  [(SQRT6 - SQRT2) / 4, (SQRT6 + SQRT2) / 4],
];

/** cos a sin natočení o `turn` kroků po 15° (0–23). */
function turnCosSin(turn: number): readonly [number, number] {
  const t = ((turn % ROTATION_TURNS) + ROTATION_TURNS) % ROTATION_TURNS;
  const [c, s] = QUADRANT[t % 6]!;
  // 0 − x místo −x: žádná záporná nula (stav je JSON a porovnává se po bitech)
  switch (Math.floor(t / 6)) {
    case 0:
      return [c, s];
    case 1:
      return [0 - s, c];
    case 2:
      return [0 - c, 0 - s];
    default:
      return [s, 0 - c];
  }
}

/** Natočení jako počet kroků po 15° (0–23), nebo null, když není násobkem 15°. */
export function rotationTurn(rotation: number): number | null {
  if (!Number.isFinite(rotation)) return null;
  const k = Math.round(rotation / ROTATION_STEP);
  if (Math.abs(rotation - k * ROTATION_STEP) > TURN_EPSILON) return null;
  return ((k % ROTATION_TURNS) + ROTATION_TURNS) % ROTATION_TURNS;
}

/** Natočení v radiánech pro `turn` kroků po 15° – v rozsahu 0 až 2π. */
export function turnRotation(turn: number): number {
  const t = ((turn % ROTATION_TURNS) + ROTATION_TURNS) % ROTATION_TURNS;
  return t * ROTATION_STEP;
}

/**
 * cos a sin natočení – u násobku 15° přesně (tabulka), jinak z nejbližšího násobku 15°
 * (natočení staveb jinak nevznikají).
 */
export function rotationCosSin(rotation: number): readonly [number, number] {
  return turnCosSin(rotationTurn(rotation) ?? Math.round(rotation / ROTATION_STEP));
}

/** Rozměry krajiny – strana v políčkách a strana políčka (m); krajina je splňuje. */
export interface GridGeometry {
  readonly size: number;
  readonly cellSizeM: number;
}

/** Polovina strany krajiny (m) – krajina má střed v počátku světa. */
function halfExtent(geo: GridGeometry): number {
  return (geo.size * geo.cellSizeM) / 2;
}

/** Střed políčka krajiny ve světě (jako `tileCenterWorld`). */
function tileCenter(geo: GridGeometry, x: number, y: number): { x: number; z: number } {
  const half = halfExtent(geo);
  return { x: -half + (x + 0.5) * geo.cellSizeM, z: -half + (y + 0.5) * geo.cellSizeM };
}

/** Bod mřížky v místních souřadnicích (v čtvercích: střed čtverce i, j = i, j) → svět. */
function gridPoint(geo: GridGeometry, grid: SquareGrid, i: number, j: number): Point {
  const [c, s] = rotationCosSin(grid.rotation);
  const lx = i * geo.cellSizeM;
  const lz = j * geo.cellSizeM;
  return [grid.x + lx * c + lz * s, grid.z - lx * s + lz * c];
}

/** Střed čtverce `cell` mřížky `grid` ve světě (bez mřížky střed políčka krajiny). */
export function squareCenter(
  geo: GridGeometry,
  grid: SquareGrid | undefined,
  cell: TileCell,
): { x: number; z: number } {
  if (!grid) return tileCenter(geo, cell.x, cell.y);
  const [x, z] = gridPoint(geo, grid, cell.x, cell.y);
  return { x, z };
}

/**
 * Rohy čtverce `cell` mřížky `grid` ve světě – v pořadí jako `rectangleCorners` (místní −−, +−,
 * ++, −+). Sousední čtverce téže mřížky sdílejí rohy bit po bitu. Bez mřížky rohy políčka
 * krajiny (jako `cellCorners`).
 */
export function squareCorners(
  geo: GridGeometry,
  grid: SquareGrid | undefined,
  cell: TileCell,
): Point[] {
  if (!grid) {
    const { x, z } = tileCenter(geo, cell.x, cell.y);
    const h = geo.cellSizeM / 2;
    return [
      [x - h, z - h],
      [x + h, z - h],
      [x + h, z + h],
      [x - h, z + h],
    ];
  }
  return [
    gridPoint(geo, grid, cell.x - 0.5, cell.y - 0.5),
    gridPoint(geo, grid, cell.x + 0.5, cell.y - 0.5),
    gridPoint(geo, grid, cell.x + 0.5, cell.y + 0.5),
    gridPoint(geo, grid, cell.x - 0.5, cell.y + 0.5),
  ];
}

/** Rohy čtverce o straně `side` se středem (x, z) natočeného o `rotation` (násobek 15°). */
export function rotatedSquareCorners(
  x: number,
  z: number,
  side: number,
  rotation: number,
): Point[] {
  const [c, s] = rotationCosSin(rotation);
  const h = side / 2;
  const local: Point[] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  return local.map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
}

/** Bod v místních souřadnicích čtverce (x napříč, z dopředu) → svět. */
export function squareLocalToWorld(square: PlotSquare, lx: number, lz: number): Point {
  const [c, s] = rotationCosSin(square.rotation);
  return [square.x + lx * c + lz * s, square.z - lx * s + lz * c];
}

/** Bod světa → místní souřadnice natočeného čtverce (inverze `squareLocalToWorld`). */
export function worldToSquareLocal(square: PlotSquare, x: number, z: number): Point {
  const [c, s] = rotationCosSin(square.rotation);
  const dx = x - square.x;
  const dz = z - square.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/**
 * Čtverec mřížky pod bodem světa (nejbližší střed čtverce). Bez mřížky políčko krajiny – i mimo
 * krajinu (souřadnice pak leží mimo 0 … size − 1).
 */
export function gridCellAt(
  geo: GridGeometry,
  grid: SquareGrid | undefined,
  x: number,
  z: number,
): TileCell {
  if (!grid) {
    const half = halfExtent(geo);
    return {
      x: Math.floor((x + half) / geo.cellSizeM),
      y: Math.floor((z + half) / geo.cellSizeM),
    };
  }
  const [c, s] = rotationCosSin(grid.rotation);
  const dx = x - grid.x;
  const dz = z - grid.z;
  // + 0: Math.round(−0,3) je −0
  return {
    x: Math.round((dx * c - dz * s) / geo.cellSizeM) + 0,
    y: Math.round((dx * s + dz * c) / geo.cellSizeM) + 0,
  };
}

/** Políčko krajiny, jehož středem bod (x, z) je (v toleranci), jinak null. */
export function tileCenteredAt(geo: GridGeometry, x: number, z: number): TileCell | null {
  const half = halfExtent(geo);
  const fx = (x + half) / geo.cellSizeM - 0.5;
  const fz = (z + half) / geo.cellSizeM - 0.5;
  const tx = Math.round(fx);
  const ty = Math.round(fz);
  if (Math.abs(fx - tx) * geo.cellSizeM > CENTER_EPSILON_M) return null;
  if (Math.abs(fz - ty) * geo.cellSizeM > CENTER_EPSILON_M) return null;
  if (tx < 0 || ty < 0 || tx >= geo.size || ty >= geo.size) return null;
  return { x: tx, y: ty };
}

/**
 * Index políčka krajiny (y × size + x), které čtverec `cell` mřížky `grid` přesně zabírá – bez
 * mřížky políčko samo (uvnitř krajiny), u natočené mřížky null (žádné políčko přesně nezabírá).
 */
export function squareTile(
  geo: GridGeometry,
  grid: SquareGrid | undefined,
  cell: TileCell,
): number | null {
  if (grid) return null;
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return null;
  if (cell.x < 0 || cell.y < 0 || cell.x >= geo.size || cell.y >= geo.size) return null;
  return cell.y * geo.size + cell.x;
}

/**
 * Políčko krajiny, které natočený čtverec pozemku přesně zabírá – natočení o násobek 90° a střed
 * ve středu políčka; jinak null.
 */
export function plotSquareTile(geo: GridGeometry, square: PlotSquare): number | null {
  const turn = rotationTurn(square.rotation);
  if (turn === null || turn % GRID_TURNS !== 0) return null;
  const tile = tileCenteredAt(geo, square.x, square.z);
  return tile ? tile.y * geo.size + tile.x : null;
}

/** Klíč mřížky pro mapy: prázdný pro mřížku krajiny, jinak počátek a krok natočení. */
export function gridKey(grid: SquareGrid | undefined): string {
  if (!grid) return '';
  const turn = rotationTurn(grid.rotation) ?? grid.rotation;
  return `${Math.round(grid.x * 1e6) / 1e6}:${Math.round(grid.z * 1e6) / 1e6}:${turn}`;
}

/** Klíč čtverce pro mapy – mřížka a souřadnice v ní. */
export function squareKey(grid: SquareGrid | undefined, cell: TileCell): string {
  return `${gridKey(grid)}|${cell.x},${cell.y}`;
}

/** Je to tatáž mřížka (počátek v toleranci, stejný krok natočení)? Obě bez mřížky = krajina. */
export function sameGrid(a: SquareGrid | undefined, b: SquareGrid | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    Math.abs(a.x - b.x) <= CENTER_EPSILON_M &&
    Math.abs(a.z - b.z) <= CENTER_EPSILON_M &&
    rotationTurn(a.rotation) === rotationTurn(b.rotation)
  );
}

/**
 * Platná natočená mřížka stavby: konečný počátek a natočení o násobek 15° mezi 15° a 75°
 * (natočení se srovná do tohoto rozsahu – mřížka otočená o 90° je táž, jen čtverce se jinak
 * jmenují, proto jiné natočení neplatí). Vrátí kopii se srovnaným natočením, nebo null.
 */
export function normalizeGrid(grid: SquareGrid): SquareGrid | null {
  if (!Number.isFinite(grid.x) || !Number.isFinite(grid.z)) return null;
  const turn = rotationTurn(grid.rotation);
  if (turn === null || turn === 0 || turn >= GRID_TURNS) return null;
  return { x: grid.x, z: grid.z, rotation: turnRotation(turn) };
}

/** Kopie mřížky (stav vsi jsou data jako v JSON). */
export function copyGrid(grid: SquareGrid): SquareGrid {
  return { x: grid.x, z: grid.z, rotation: grid.rotation };
}

/** Body vzorkování krajiny pod čtvercem – mřížka n × n středů podčtverců, po řádcích. */
export function squareSamples(
  geo: GridGeometry,
  grid: SquareGrid | undefined,
  cell: TileCell,
  n: number,
): Point[] {
  const points: Point[] = [];
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const i = cell.x - 0.5 + (a + 0.5) / n;
      const j = cell.y - 0.5 + (b + 0.5) / n;
      if (!grid) {
        const half = halfExtent(geo);
        points.push([-half + (i + 0.5) * geo.cellSizeM, -half + (j + 0.5) * geo.cellSizeM]);
      } else {
        points.push(gridPoint(geo, grid, i, j));
      }
    }
  }
  return points;
}

/** Body vzorkování pod natočeným čtvercem pozemku – mřížka n × n středů podčtverců. */
export function plotSquareSamples(square: PlotSquare, side: number, n: number): Point[] {
  const points: Point[] = [];
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const lx = ((a + 0.5) / n - 0.5) * side;
      const lz = ((b + 0.5) / n - 0.5) * side;
      points.push(squareLocalToWorld(square, lx, lz));
    }
  }
  return points;
}

/** Obdélník kolem bodů (minX, minZ, maxX, maxZ). */
export function pointsBounds(points: readonly Point[]): [number, number, number, number] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minZ, maxX, maxZ];
}

/**
 * Políčka krajiny (indexy), do jejichž obdélníku zasahuje obdélník kolem bodů – kandidáti pro
 * přesný test překryvu (`shrink` m se obdélník zúží, ať se dotyk hranou nepočítá).
 */
export function tilesAround(geo: GridGeometry, points: readonly Point[], shrink = 1e-7): number[] {
  const [minX, minZ, maxX, maxZ] = pointsBounds(points);
  const half = halfExtent(geo);
  const toTile = (v: number): number =>
    Math.min(geo.size - 1, Math.max(0, Math.floor((v + half) / geo.cellSizeM)));
  const out: number[] = [];
  for (let y = toTile(minZ + shrink); y <= toTile(maxZ - shrink); y++) {
    for (let x = toTile(minX + shrink); x <= toTile(maxX - shrink); x++) {
      out.push(y * geo.size + x);
    }
  }
  return out;
}
