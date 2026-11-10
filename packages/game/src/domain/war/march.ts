import { length2 } from '../landscape';
import { PathHeap, quantizedStep } from '../village/paths/network-search';
import type { Direction8 } from '../village/types';
import { GRID_STEPS } from '../village/world-grid';
import {
  MARCH_BUILDING,
  marchCellAt,
  marchCellCenter,
  type MarchGrid,
  type Pos,
} from './march-grid';
import { WAR } from './rules-war';
import { isMarchWinter } from './season';

// Pochod vojska po mapě (war.md – Pohyb – mapu po mapě): A* po mřížce pochodu (`marchGrid`),
// cena kroku = délka ÷ násobek tempa („metry louky“), a tempo skupiny ve skutečném čase. Jen
// det-math – tažení počítá server i prohlížeč a musí jim vyjít stejně.

/** Trasa pochodu: start, středy buněk a cíl. */
export interface MarchPath {
  points: Pos[];
  /** Buňka mřížky každého bodu. */
  cells: number[];
  /**
   * Metry louky od startu ke každému bodu – délka úseku ÷ násobek tempa jeho buněk, po kvantech
   * (`quantizedStep` – součty přesné); poslední = celá trasa. Čas = metry louky ÷ tempo skupiny.
   */
  meadowM: number[];
  /** Délka trasy (m). */
  lengthM: number;
}

/** Sousedé buňky: posun sloupce, řádku a délka kroku v buňkách – nejdřív přímé, pak úhlopříčné. */
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Odhad v buňkách po 8 směrech (oktilová vzdálenost) – nikdy víc než skutečná délka. */
function octile(di: number, dj: number): number {
  const a = Math.abs(di);
  const b = Math.abs(dj);
  return a > b ? a - b + b * Math.SQRT2 : b - a + a * Math.SQRT2;
}

/** Cena metru buňky (1 ÷ násobek tempa); neprůchodná Infinity. */
function costOf(grid: MarchGrid, c: number): number {
  const pace = grid.pace[c]!;
  return pace > 0 ? 1 / pace : Infinity;
}

/** Cena metru buňky, na které vojsko stojí – neprůchodná (stojí v ní) jako louka. */
function startCost(grid: MarchGrid, c: number): number {
  const cost = costOf(grid, c);
  return cost === Infinity ? 1 : cost;
}

/**
 * A* z buňky `start` do první vyjmuté buňky, pro kterou platí `goal`. Odhad = oktilová vzdálenost
 * (`toward` v buňkách) × strana buňky ÷ nejrychlejší tempo (cesta). Úhlopříčně jen kolem
 * průchodných rohů – roh zdi ani břeh vody se neproklouzne. Start je průchodný vždy (vojsko na
 * něm stojí). Remízy: ceny kroků po kvantech, ze stejně drahých předchůdců vyhraje vyšší index
 * (jako pěšiny – paths.md, pravidlo 3) – výsledek závisí jen na vstupu.
 */
function search(
  grid: MarchGrid,
  start: number,
  goal: (c: number) => boolean,
  toward: (i: number, j: number) => number,
): number[] | null {
  const w = grid.width;
  const h = grid.height;
  const all = w * h;
  const dist = new Float64Array(all).fill(Infinity);
  const parent = new Int32Array(all).fill(-1);
  const heap = new PathHeap();
  const weight = grid.cellM / WAR.pace.road;
  const estimate = (c: number): number => {
    const i = c % w;
    return toward(i, (c - i) / w) * weight;
  };
  const passable = (c: number): boolean => c === start || grid.pace[c]! > 0;
  dist[start] = 0;
  heap.push(start, estimate(start));
  while (heap.size > 0) {
    const c = heap.pop();
    const d = dist[c]!;
    if (heap.topKey > d + estimate(c) + 1e-9) continue;
    if (goal(c)) {
      const cells: number[] = [];
      for (let k = c; k >= 0; k = parent[k]!) cells.push(k);
      return cells.reverse();
    }
    const i = c % w;
    const j = (c - i) / w;
    const own = c === start ? startCost(grid, c) : costOf(grid, c);
    for (const [di, dj, len] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      if (!passable(n)) continue;
      if (di !== 0 && dj !== 0 && (!passable(j * w + ii) || !passable(jj * w + i))) continue;
      const nd = d + quantizedStep(((own + costOf(grid, n)) / 2) * len * grid.cellM);
      if (nd < dist[n]!) {
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, nd + estimate(n));
      } else if (nd === dist[n]! && c > parent[n]!) {
        parent[n] = c;
      }
    }
  }
  return null;
}

/** Trasa z buněk hledání: body (start a cíl přesně), metry louky po úsecích a délka. */
function pathOf(grid: MarchGrid, found: number[], from: Pos, to: Pos): MarchPath {
  const cells = found.length === 1 ? [found[0]!, found[0]!] : found;
  const points = cells.map((c) => marchCellCenter(grid, c));
  points[0] = { x: from.x, z: from.z };
  points[points.length - 1] = { x: to.x, z: to.z };
  const start = cells[0]!;
  const cost = (c: number): number => (c === start ? startCost(grid, c) : costOf(grid, c));
  const meadowM = [0];
  let lengthM = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const len = length2(b.x - a.x, b.z - a.z);
    lengthM += len;
    const step = len > 0 ? quantizedStep(((cost(cells[k - 1]!) + cost(cells[k]!)) / 2) * len) : 0;
    meadowM.push(meadowM[k - 1]! + step);
  }
  return { points, cells, meadowM, lengthM };
}

/** Nejdál (v buňkách) od stavby hledáme nejbližší volnou buňku pro start či cíl uvnitř stavby. */
const BUILDING_REACH = 8;

/**
 * Start nebo cíl uvnitř stavby vsi (dům, pozemek, ohrada) se přesune na nejbližší průchodnou
 * buňku – vojsko stavbou neprojde, ale k domu jako cíli dojde a z vsi vyjde. Nejbližší podle
 * čtverce vzdálenosti, remíza – nižší index (determinismus). Ostatní buňky beze změny.
 */
function outOfBuilding(grid: MarchGrid, c: number): number {
  if ((grid.flags[c]! & MARCH_BUILDING) === 0) return c;
  const w = grid.width;
  const ci = c % w;
  const cj = (c - ci) / w;
  let best = c;
  let bestD = Infinity;
  for (let dj = -BUILDING_REACH; dj <= BUILDING_REACH; dj++) {
    for (let di = -BUILDING_REACH; di <= BUILDING_REACH; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= w || j >= grid.height) continue;
      const n = j * w + i;
      if (grid.pace[n]! <= 0) continue;
      const d = di * di + dj * dj;
      if (d < bestD || (d === bestD && n < best)) {
        bestD = d;
        best = n;
      }
    }
  }
  return best;
}

/**
 * Trasa pochodu z bodu `from` do bodu `to` po mřížce mapy (war.md – Pohyb – Terén): nejlevnější
 * v metrech louky – hustý les čtyřikrát dražší, cesta levnější, voda jen přes brod, do opevněné vsi
 * branou, mezerou nebo přes val. Neprůchodný nebo nedosažitelný cíl null.
 */
export function marchPath(grid: MarchGrid, from: Pos, to: Pos): MarchPath | null {
  const start = outOfBuilding(grid, marchCellAt(grid, from));
  const target = outOfBuilding(grid, marchCellAt(grid, to));
  if (target !== start && grid.pace[target]! <= 0) return null;
  const w = grid.width;
  const ti = target % w;
  const tj = (target - ti) / w;
  const cells = search(
    grid,
    start,
    (c) => c === target,
    (i, j) => octile(i - ti, j - tj),
  );
  return cells ? pathOf(grid, cells, from, to) : null;
}

/**
 * Buňky dosažitelné z buňky `start` – zaplavení po sousedech ve stálém pořadí (`NEIGHBOURS`) se
 * stejným pravidlem jako A* (`search`): start průchodný vždy, úhlopříčně jen kolem průchodných rohů.
 */
function reachableCells(grid: MarchGrid, start: number): Uint8Array {
  const w = grid.width;
  const h = grid.height;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const passable = (c: number): boolean => c === start || grid.pace[c]! > 0;
  let head = 0;
  let tail = 0;
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++]!;
    const i = c % w;
    const j = (c - i) / w;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      if (seen[n] === 1 || !passable(n)) continue;
      if (di !== 0 && dj !== 0 && (!passable(j * w + ii) || !passable(jj * w + i))) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return seen;
}

/**
 * Cíl pochodu jako v 0 A.D. (war.md – Pohyb – Cíl v neprůchodné buňce; návrh Clauda): cíl
 * v neprůchodné buňce (voda bez brodu, sráz, hotová hradba) se posune na střed nejbližší průchodné
 * buňky dosažitelné z `from` (`reachableCells`). Nejbližší podle čtverce vzdálenosti v buňkách,
 * remíza – nejmenší index (determinismus). Průchodný cíl a cíl ve stavbě (`outOfBuilding` ho
 * v `marchPath` vyřeší) vrátí beze změny – týž objekt. Null = dosažitelná průchodná buňka není
 * žádná (vojsko stojí v neprůchodné buňce sevřené ze všech stran).
 */
export function reachableGoal(grid: MarchGrid, from: Pos, to: Pos): Pos | null {
  const start = outOfBuilding(grid, marchCellAt(grid, from));
  const target = outOfBuilding(grid, marchCellAt(grid, to));
  if (target === start || grid.pace[target]! > 0) return to;
  const w = grid.width;
  const ti = target % w;
  const tj = (target - ti) / w;
  const seen = reachableCells(grid, start);
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < seen.length; c++) {
    if (seen[c] !== 1 || grid.pace[c]! <= 0) continue;
    const i = c % w;
    const di = i - ti;
    const dj = (c - i) / w - tj;
    const d = di * di + dj * dj;
    // vzestupně po indexech – při shodě zůstane nižší index
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best < 0 ? null : marchCellCenter(grid, best);
}

/**
 * Trasa k okraji mapy ve směru `direction` (war.md – Přechod okrajem): k nejlevnější buňce okraje
 * (sever = +z, východ = +x – `GRID_STEPS`); úhlopříčný směr vede do rohu mapy. Konec trasy je
 * střed okrajové buňky – odtud `edgeCrossing` převede vojsko na sousední mapu. Nedosažitelný
 * okraj null.
 */
export function marchPathToEdge(
  grid: MarchGrid,
  from: Pos,
  direction: Direction8,
): MarchPath | null {
  const step = GRID_STEPS[direction];
  const w = grid.width;
  const h = grid.height;
  const gi = step.x > 0 ? w - 1 : 0;
  const gj = step.y > 0 ? h - 1 : 0;
  const onEdge = (c: number): boolean => {
    const i = c % w;
    const j = (c - i) / w;
    return (step.x === 0 || i === gi) && (step.y === 0 || j === gj);
  };
  const cells = search(grid, marchCellAt(grid, from), onEdge, (i, j) =>
    octile(step.x === 0 ? 0 : i - gi, step.y === 0 ? 0 : j - gj),
  );
  if (!cells) return null;
  return pathOf(grid, cells, from, marchCellCenter(grid, cells[cells.length - 1]!));
}

/** Skutečné sekundy pochodu celé trasy tempem `speed` (m/s – `marchSpeed`). */
export function marchSeconds(path: MarchPath, speed: number): number {
  return path.meadowM[path.meadowM.length - 1]! / speed;
}

/** Poloha na trase po ušlých `meadow` metrech louky (tempo × čas); za koncem cíl. */
export function marchProgress(path: Pick<MarchPath, 'points' | 'meadowM'>, meadow: number): Pos {
  const m = path.meadowM;
  const last = path.points.length - 1;
  if (meadow <= 0) return { ...path.points[0]! };
  if (meadow >= m[last]!) return { ...path.points[last]! };
  let k = 1;
  while (m[k]! < meadow) k++;
  const a = path.points[k - 1]!;
  const b = path.points[k]!;
  const t = (meadow - m[k - 1]!) / (m[k]! - m[k - 1]!);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Složení skupiny pro tempo (war.md – Pohyb – skupina jde tempem nejpomalejšího). */
export interface GroupPace {
  /** Zdraví pěší muži. */
  onFoot: number;
  /** Jezdci. */
  riders: number;
  /** Pěší ranění (war.md – Ztráty). */
  woundedOnFoot: number;
  /** Kusů dobytka ve stádě. */
  herd: number;
}

/**
 * Tempo skupiny (m/s skutečného času, war.md – Pohyb – Tempo): ≈ 3,5 m/s pěšky, skupina jen
 * z jezdců × 1,5, s pěšími raněnými × 0,75, se stádem × 0,5 – platí nejpomalejší; v zimě
 * (`isMarchWinter`) sníh × 0,75. Terén přidá mřížka (`marchGrid` – násobek tempa buňky).
 */
export function marchSpeed(group: GroupPace, day: number): number {
  let factor = Infinity;
  if (group.riders > 0) factor = Math.min(factor, WAR.pace.riders);
  if (group.onFoot > 0) factor = Math.min(factor, 1);
  if (group.woundedOnFoot > 0) factor = Math.min(factor, WAR.pace.wounded);
  if (group.herd > 0) factor = Math.min(factor, WAR.pace.herd);
  if (factor === Infinity) factor = 1;
  const snow = isMarchWinter(day) ? WAR.snowPace : 1;
  return WAR.pace.metersPerSecond * factor * snow;
}
