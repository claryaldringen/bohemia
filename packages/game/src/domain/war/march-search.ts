import { PathHeap } from '../village/paths/network-search';
import type { MarchGrid } from './march-grid';

// Hledání trasy pochodu s rovnoměrnou cenou (war.md – Pohyb – Terén; plán 2026-11-16-dense-forest
// – Rozhodnutí 5 a brána po Úloze 1): krajina je pro hledání jen průchozí (`pace` > 0)
// a neprůchozí – krok rovně stojí 1000, úhlopříčně 1414 tisícin buňky, tempo buňky (cesta, val,
// les) platí jen pro chůzi (`pathAlong` v `march-smooth.ts`). Algoritmus je JPS bez řezání rohů:
// na trasách přes mapu ≈ 3,4× rychlejší než A* se stejnou cenou (měření Úlohy 1). Souvislé oblasti
// (`marchAreas`) řeknou dosažitelnost předem – nedosažitelný cíl by hledání vyčerpal celou
// dosažitelnou plochu. Jen det-math a celá čísla – počítá server i prohlížeč.

/** Cena kroku rovně v tisícinách buňky (Rozhodnutí 5). */
export const STEP_STRAIGHT = 1000;
/** Cena kroku úhlopříčně v tisícinách buňky (≈ √2 × 1000 – celé číslo, součty jsou přesné). */
export const STEP_DIAGONAL = 1414;

/**
 * Klíč haldy (Rozhodnutí 5): f × 2²² + (2²² − 1 − g) – při stejném f jde dřív hlubší uzel. `g` se
 * pro klíč ořízne na 2²² − 1 – mění to jen pořadí remíz, ne cenu.
 */
const KEY_SCALE = 4194304;
const G_CAP = 4194303;

function heapKey(f: number, g: number): number {
  return f * KEY_SCALE + (G_CAP - (g > G_CAP ? G_CAP : g));
}

/**
 * Nejlevnější cena kroků o `di` sloupců a `dj` řádků po volné mřížce v tisícinách buňky:
 * 1000 × (max − min) + 1414 × min absolutních hodnot – odhad hledání, nikdy víc než skutečná cena.
 */
export function octileCost(di: number, dj: number): number {
  const a = di < 0 ? -di : di;
  const b = dj < 0 ? -dj : dj;
  return a > b
    ? STEP_STRAIGHT * (a - b) + STEP_DIAGONAL * b
    : STEP_STRAIGHT * (b - a) + STEP_DIAGONAL * a;
}

/** Sousedé buňky: posun sloupce a řádku – nejdřív přímé, pak úhlopříčné (stálé pořadí). */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

// Pracovní pole hledání – jedna na proces, rostou s největší mřížkou. Razítko běhu (`seen`,
// `closed`) místo nulování celé mřížky při každém hledání; cena `g` se pod razítkem vždy zapíše.
let capacity = 0;
let gBuf = new Int32Array(0);
let parentBuf = new Int32Array(0);
let seenBuf = new Uint32Array(0);
let closedBuf = new Uint32Array(0);
let stamp = 0;
const heap = new PathHeap();

/** Razítko dalšího běhu; pole zvětší pro `size` buněk mřížky s okrajem. */
function nextStamp(size: number): number {
  if (size > capacity) {
    capacity = size;
    gBuf = new Int32Array(size);
    parentBuf = new Int32Array(size);
    seenBuf = new Uint32Array(size);
    closedBuf = new Uint32Array(size);
    stamp = 0;
  } else if (stamp === 0xffffffff) {
    seenBuf.fill(0);
    closedBuf.fill(0);
    stamp = 0;
  }
  stamp++;
  return stamp;
}

/**
 * Nejkratší trasa po mřížce z buňky `start` do první buňky, pro kterou platí `goal` (Rozhodnutí 5):
 * souvislý řetěz buněk (8 sousedů) od startu po cíl, null = cíl nedosažitelný. Průchodná je buňka
 * s `pace` > 0, start vždy (skupina na něm stojí); úhlopříčně jen kolem průchodných rohů – roh zdi
 * ani břeh vody se neproklouzne. `toward(i, j)` je celočíselný odhad zbytku v tisícinách buňky
 * (`octileCost` k cíli). JPS bez řezání rohů (prořezání sousedů jako PathFinding.js – úhlopříčně
 * jen bez překážek): skoky se rozvinou na řetěz buněk. Stejně drahé trasy rozhodne klíč haldy
 * a ze stejně drahých předchůdců vyšší index – výsledek závisí jen na vstupu.
 */
export function gridSearch(
  grid: MarchGrid,
  start: number,
  goal: (c: number) => boolean,
  toward: (i: number, j: number) => number,
): number[] | null {
  const w = grid.width;
  const { stride, labels } = marchAreas(grid);
  const run = nextStamp(labels.length);
  const g = gBuf;
  const parent = parentBuf;
  const seen = seenBuf;
  const closed = closedBuf;
  /** Index buňky mřížky z indexu s okrajem. */
  const original = (p: number): number => {
    const row = Math.floor(p / stride);
    return (row - 1) * w + (p - row * stride - 1);
  };
  const estimate = (p: number): number => {
    const row = Math.floor(p / stride);
    return toward(p - row * stride - 1, row - 1);
  };
  // Rovný skok z p (index mřížky o) krokem d (v mřížce od), kolmý krok e: první buňka s cílem
  // nebo s nuceným sousedem (vedle je volno, za ním zeď), −1 = narazí na neprůchodnou.
  const straight = (p: number, o: number, d: number, od: number, e: number): number => {
    for (;;) {
      if (labels[p] === 0) return -1;
      if (goal(o)) return p;
      if (
        (labels[p + e] !== 0 && labels[p - d + e] === 0) ||
        (labels[p - e] !== 0 && labels[p - d - e] === 0)
      ) {
        return p;
      }
      p += d;
      o += od;
    }
  };
  // Úhlopříčný skok (dx, dy): buňka s cílem, nebo odkud vede rovný skok; dál jen kolem volných rohů.
  const diagonal = (p: number, o: number, dx: number, dy: number): number => {
    const dyP = dy * stride;
    const dyO = dy * w;
    for (;;) {
      if (labels[p] === 0) return -1;
      if (goal(o)) return p;
      if (
        straight(p + dx, o + dx, dx, dx, stride) >= 0 ||
        straight(p + dyP, o + dyO, dyP, dyO, 1) >= 0
      ) {
        return p;
      }
      if (labels[p + dx] === 0 || labels[p + dyP] === 0) return -1;
      p += dx + dyP;
      o += dx + dyO;
    }
  };
  /** Řetěz buněk od startu po skokový bod `end`. */
  const chainTo = (end: number): number[] => {
    const jumps: number[] = [];
    for (let k = end; k >= 0; k = parent[k]!) jumps.push(k);
    jumps.reverse();
    const cells = [original(jumps[0]!)];
    for (let q = 1; q < jumps.length; q++) {
      const a = jumps[q - 1]!;
      const b = jumps[q]!;
      const ai = a % stride;
      const bi = b % stride;
      const si = Math.sign(bi - ai);
      const sj = Math.sign((b - bi) / stride - (a - ai) / stride);
      let o = original(a);
      for (let k = a; k !== b; k += si + sj * stride) {
        o += si + sj * w;
        cells.push(o);
      }
    }
    return cells;
  };
  const si = start % w;
  const sp = ((start - si) / w + 1) * stride + si + 1;
  // start je průchodný vždy – neprůchodnému se na dobu hledání dá nenulový štítek
  const saved = labels[sp]!;
  if (saved === 0) labels[sp] = 1;
  try {
    heap.clear();
    g[sp] = 0;
    parent[sp] = -1;
    seen[sp] = run;
    heap.push(sp, heapKey(estimate(sp), 0));
    const dirs: number[] = [];
    while (heap.size > 0) {
      const p = heap.pop();
      if (closed[p] === run) continue;
      closed[p] = run;
      const o = original(p);
      if (goal(o)) return chainTo(p);
      // směry skoků: ze startu všech 8, jinak prořezané podle směru příchodu
      dirs.length = 0;
      const par = parent[p]!;
      if (par < 0) {
        for (const [dx, dy] of NEIGHBOURS) {
          if (labels[p + dx + dy * stride] === 0) continue;
          if (dx !== 0 && dy !== 0 && (labels[p + dx] === 0 || labels[p + dy * stride] === 0)) {
            continue;
          }
          dirs.push(dx, dy);
        }
      } else {
        const pi = p % stride;
        const qi = par % stride;
        const dx = Math.sign(pi - qi);
        const dy = Math.sign((p - pi) / stride - (par - qi) / stride);
        if (dx !== 0 && dy !== 0) {
          const vertical = labels[p + dy * stride] !== 0;
          const horizontal = labels[p + dx] !== 0;
          if (vertical) dirs.push(0, dy);
          if (horizontal) dirs.push(dx, 0);
          if (vertical && horizontal) dirs.push(dx, dy);
        } else if (dx !== 0) {
          const ahead = labels[p + dx] !== 0;
          const up = labels[p + stride] !== 0;
          const down = labels[p - stride] !== 0;
          if (ahead) {
            dirs.push(dx, 0);
            if (up) dirs.push(dx, 1);
            if (down) dirs.push(dx, -1);
          }
          if (up) dirs.push(0, 1);
          if (down) dirs.push(0, -1);
        } else {
          const ahead = labels[p + dy * stride] !== 0;
          const right = labels[p + 1] !== 0;
          const left = labels[p - 1] !== 0;
          if (ahead) {
            dirs.push(0, dy);
            if (right) dirs.push(1, dy);
            if (left) dirs.push(-1, dy);
          }
          if (right) dirs.push(1, 0);
          if (left) dirs.push(-1, 0);
        }
      }
      const gp = g[p]!;
      const pi = p % stride;
      for (let q = 0; q < dirs.length; q += 2) {
        const dx = dirs[q]!;
        const dy = dirs[q + 1]!;
        const n = p + dx + dy * stride;
        const on = o + dx + dy * w;
        const jp =
          dx !== 0 && dy !== 0
            ? diagonal(n, on, dx, dy)
            : dx !== 0
              ? straight(n, on, dx, dx, stride)
              : straight(n, on, dy * stride, dy * w, 1);
        if (jp < 0 || closed[jp] === run) continue;
        const steps = dx !== 0 ? Math.abs((jp % stride) - pi) : Math.abs(jp - p) / stride;
        const ng = gp + steps * (dx !== 0 && dy !== 0 ? STEP_DIAGONAL : STEP_STRAIGHT);
        if (seen[jp] !== run || ng < g[jp]!) {
          seen[jp] = run;
          g[jp] = ng;
          parent[jp] = p;
          heap.push(jp, heapKey(ng + estimate(jp), ng));
        } else if (ng === g[jp]! && p > parent[jp]!) {
          parent[jp] = p;
        }
      }
    }
    return null;
  } finally {
    labels[sp] = saved;
  }
}

/**
 * Buňky dosažitelné z buňky `start` – zaplavení po sousedech ve stálém pořadí se stejným pravidlem
 * jako hledání (`gridSearch`): start průchodný vždy, úhlopříčně jen kolem průchodných rohů.
 */
export function reachableCells(grid: MarchGrid, start: number): Uint8Array {
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
 * Souvislé oblasti mřížky s okrajem jedné neprůchodné buňky kolem (řádek má `stride` = width + 2
 * buněk, buňka (i, j) je na indexu (j + 1) × stride + i + 1). Štítek > 0 = průchodná buňka a číslo
 * její oblasti, 0 = neprůchodná buňka nebo okraj. Jedno pole na mřížku slouží hledání jako
 * průchodnost (bez kontroly mezí mapy) i dosažitelnosti jako oblasti: `Uint16Array`, nad 65 535
 * oblastí `Int32Array` (paměť – mřížka 2,5 m má 590 tisíc buněk).
 */
export interface MarchAreas {
  readonly stride: number;
  readonly labels: Uint16Array | Int32Array;
}

const areaCache = new WeakMap<MarchGrid, MarchAreas>();

/**
 * Souvislé oblasti mřížky (brána po Úloze 1): průchodná buňka nese číslo oblasti od 1 – oblasti
 * číslované v pořadí své první buňky podle indexu –, neprůchodná 0. Sousedé jako při hledání:
 * 8 směrů, úhlopříčně jen kolem průchodných rohů – úhlopříčný krok tak spojí jen buňky spojené
 * i přes roh, oblasti jsou tytéž jako po 4 sousedech. Dvě průchodné buňky se stejným číslem jsou
 * navzájem dosažitelné – „dojde tam?“ se pozná bez hledání (nedosažitelný cíl by hledání vyčerpal
 * celou dosažitelnou plochu). Počítá se jednou na mřížku (WeakMap – mřížka se po postavení
 * nemění); stejně v prohlížeči (kurzor nad místem, kam skupina nedojde) i na serveru.
 */
export function marchAreas(grid: MarchGrid): MarchAreas {
  const known = areaCache.get(grid);
  if (known) return known;
  const stride = grid.width + 2;
  const areas = { stride, labels: labelAreas(grid, stride) };
  areaCache.set(grid, areas);
  return areas;
}

/**
 * Číslo souvislé oblasti buňky `c` mřížky šířky `width` z jejích oblastí `areas` (`marchAreas`):
 * od 1, neprůchodná 0. Dvě buňky se stejným nenulovým číslem jsou navzájem dosažitelné.
 */
export function marchAreaOf(areas: MarchAreas, width: number, c: number): number {
  const i = c % width;
  return areas.labels[((c - i) / width + 1) * areas.stride + i + 1]!;
}

/** Číslo souvislé oblasti buňky `c` mřížky (`marchAreas`, `marchAreaOf`). */
export function marchArea(grid: MarchGrid, c: number): number {
  return marchAreaOf(marchAreas(grid), grid.width, c);
}

/**
 * Očísluje oblasti po úsecích řádků: průchodné úseky řádku, spojení úseků sousedních řádků, které
 * se překrývají ve sloupcích (sjednocení – find s půlením cesty), a čísla kořenů v pořadí prvních
 * úseků podle indexu. Výsledek do pole s okrajem; přes 65 535 oblastí `Int32Array`.
 */
function labelAreas(grid: MarchGrid, stride: number): Uint16Array | Int32Array {
  const w = grid.width;
  const h = grid.height;
  const pace = grid.pace;
  // úseky: řádek, začátek a konec (bez něj); v řádku nejvýš ⌈w ÷ 2⌉
  const cap = h * ((w + 1) >> 1);
  const runStart = new Int32Array(cap);
  const runEnd = new Int32Array(cap);
  const rowFirst = new Int32Array(h + 1);
  const parent = new Int32Array(cap);
  let runs = 0;
  const find = (r: number): number => {
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]!]!;
      r = parent[r]!;
    }
    return r;
  };
  for (let j = 0; j < h; j++) {
    rowFirst[j] = runs;
    const row = j * w;
    let i = 0;
    while (i < w) {
      if (!(pace[row + i]! > 0)) {
        i++;
        continue;
      }
      const start = i;
      while (i < w && pace[row + i]! > 0) i++;
      runStart[runs] = start;
      runEnd[runs] = i;
      parent[runs] = runs;
      runs++;
    }
    // spojení s úseky předchozího řádku, které se překrývají ve sloupcích
    if (j > 0) {
      let a = rowFirst[j - 1]!;
      const aEnd = rowFirst[j]!;
      for (let b = aEnd; b < runs; b++) {
        while (a < aEnd && runEnd[a]! <= runStart[b]!) a++;
        for (let k = a; k < aEnd && runStart[k]! < runEnd[b]!; k++) {
          const ra = find(k);
          const rb = find(b);
          // menší kořen zůstane – kořen je pak první úsek oblasti
          if (ra < rb) parent[rb] = ra;
          else if (rb < ra) parent[ra] = rb;
        }
      }
    }
  }
  rowFirst[h] = runs;
  // čísla oblastí v pořadí prvních úseků (úseky jdou po indexech buněk)
  const number = new Int32Array(runs);
  let count = 0;
  for (let r = 0; r < runs; r++) {
    const root = find(r);
    if (root === r) number[r] = ++count;
    else number[r] = number[root]!;
  }
  const labels: Uint16Array | Int32Array =
    count > 0xffff ? new Int32Array(stride * (h + 2)) : new Uint16Array(stride * (h + 2));
  for (let j = 0; j < h; j++) {
    const row = (j + 1) * stride + 1;
    for (let r = rowFirst[j]!; r < rowFirst[j + 1]!; r++) {
      labels.fill(number[r]!, row + runStart[r]!, row + runEnd[r]!);
    }
  }
  return labels;
}
