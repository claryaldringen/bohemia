import type { EntranceSquare, FenceArc, FenceCorners, FenceSegment } from '../paths/entrances';
import { FORTIFICATIONS } from '../rules-fortifications';
import { rotationCosSin, squareCenter, type GridGeometry } from '../square-grid';
import type { FortKind, SquareGrid, TileCell } from '../types';

// Obvod opevnění (fortifications.md – Obvod): plocha po čtvercích jako pole, opevnění vede po
// vnějším okraji se zakulacenými rohy (poloměr podle druhu), pás leží uvnitř podél okraje.
// Deterministická vrstva – tvar počítá server i prohlížeč ze stejné funkce, jen přesná aritmetika
// a odmocnina (ESLint jako síť pěšin).

/** Plocha opevnění – souvislé čtverce bez děr v mřížce stavby. */
export interface FortArea {
  /** Mřížka čtverců; null = mřížka krajiny (čtverec = políčko). */
  grid: SquareGrid | null;
  /** Rozměry krajiny – strana v políčkách a strana políčka (m). */
  geo: GridGeometry;
  /** Čtverce po zaplnění děr, seřazené po řádcích (y, pak x). */
  cells: TileCell[];
  /** Čtverce ve světě – podklad pro `fenceOutline` (plot, scéna). */
  squares: EntranceSquare[];
}

/** Proč plocha neprojde: žádný čtverec, nesouvislá stranou, nevejde se do ní 2 × 2. */
export interface FortAreaError {
  error: 'empty' | 'disconnected' | 'too-small';
}

/** Roh na konci strany obvodu: vnější (opevnění se stáčí dovnitř), vnitřní (tvar L), žádný. */
export type FortCorner = 'outer' | 'inner' | null;

/**
 * Strana okrajového čtverce na obvodu – po směru hodin (plocha vpravo), od severu. Začátek
 * (roh čtverce) a jednotkový směr ve světě; délka je strana čtverce.
 */
export interface FortSide {
  cell: TileCell;
  /** Strana čtverce v mřížce: 0 −z, 1 +x, 2 +z, 3 −x. */
  side: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Roh na konci strany a jeho poloměr (m; bez rohu 0). */
  end: FortCorner;
  endRadius: number;
}

/** Rovný kus vnějšího okraje (přes víc stran na jedné přímce) a oblouk rohu na jeho konci. */
export interface FortRun {
  line: FenceSegment;
  arc: FenceArc;
}

/** Obvod opevnění daného druhu. */
export interface FortOutline {
  kind: FortKind;
  area: FortArea;
  /** Poloměry rohů (m) – podle druhu; když se dva rohy na jednu stranu nevejdou, menší. */
  corners: FenceCorners;
  /** Strany okrajových čtverců po směru hodin od severu (podklad úseků – `fortSegments`). */
  sides: FortSide[];
  /** Rovné kusy a oblouky vnějšího okraje po směru hodin. */
  runs: FortRun[];
  /** Délka vnějšího okraje se zakulacenými rohy (m) – jedno číslo pro všechny druhy. */
  lengthM: number;
  /** Šířka pásu uvnitř plochy (m). */
  bandM: number;
  /** Plocha útočiště – uvnitř vnitřní hrany pásu (m²). */
  innerAreaM2: number;
}

/** Strany čtverce po směru hodin (plocha vpravo): soused, počáteční vrchol, směr. */
const SIDES = [
  // spodní (−z): od pravého dolního rohu k západu
  { di: 0, dj: -1, vertex: [1, 0], dir: [-1, 0] },
  // pravá (+x): od pravého horního rohu k jihu
  { di: 1, dj: 0, vertex: [1, 1], dir: [0, -1] },
  // horní (+z): od levého horního rohu k východu
  { di: 0, dj: 1, vertex: [0, 1], dir: [1, 0] },
  // levá (−x): od levého dolního rohu k severu
  { di: -1, dj: 0, vertex: [0, 0], dir: [0, 1] },
] as const;

/** Sousedé stranou. */
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Tolerance shody souřadnic při hledání nejsevernějšího úseku (m). */
const NORTH_EPSILON_M = 1e-6;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Plocha opevnění z nakreslených čtverců (fortifications.md – Obvod): souvislá stranou, díry se
 * zaplní (opevnění má jen vnější obvod), nejméně 2 × 2 čtverce. Čtverce `cells` jsou v mřížce
 * `grid` (null = mřížka krajiny `geo`).
 */
export function fortificationArea(
  cells: readonly TileCell[],
  grid: SquareGrid | null,
  geo: GridGeometry,
): FortArea | FortAreaError {
  const present = new Set<string>();
  const unique: TileCell[] = [];
  for (const c of cells) {
    const key = cellKey(c.x, c.y);
    if (present.has(key)) continue;
    present.add(key);
    unique.push({ x: c.x, y: c.y });
  }
  const first = unique[0];
  if (!first) return { error: 'empty' };
  // souvislost stranou – průchod do šířky od prvního čtverce
  const seen = new Set([cellKey(first.x, first.y)]);
  const queue = [first];
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k]!;
    for (const [dx, dy] of NEIGHBOURS) {
      const key = cellKey(c.x + dx, c.y + dy);
      if (!present.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: c.x + dx, y: c.y + dy });
    }
  }
  if (seen.size !== unique.length) return { error: 'disconnected' };
  // díry: prázdné čtverce v obdélníku kolem, kam se zvenku nedostane stranou
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of unique) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  const outside = new Set<string>();
  const flood: TileCell[] = [];
  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      if (x === minX - 1 || x === maxX + 1 || y === minY - 1 || y === maxY + 1) {
        outside.add(cellKey(x, y));
        flood.push({ x, y });
      }
    }
  }
  for (let k = 0; k < flood.length; k++) {
    const c = flood[k]!;
    for (const [dx, dy] of NEIGHBOURS) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const key = cellKey(x, y);
      if (present.has(key) || outside.has(key)) continue;
      outside.add(key);
      flood.push({ x, y });
    }
  }
  const filled: TileCell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (!outside.has(cellKey(x, y))) filled.push({ x, y });
  }
  const inArea = new Set(filled.map((c) => cellKey(c.x, c.y)));
  const has = (x: number, y: number): boolean => inArea.has(cellKey(x, y));
  const block = filled.some((c) => has(c.x + 1, c.y) && has(c.x, c.y + 1) && has(c.x + 1, c.y + 1));
  if (!block) return { error: 'too-small' };
  const g = grid ?? undefined;
  const squares = filled.map((cell): EntranceSquare => {
    const { x, z } = squareCenter(geo, g, cell);
    return grid
      ? { cell, x, z, size: geo.cellSizeM, rotation: grid.rotation }
      : { cell, x, z, size: geo.cellSizeM };
  });
  return {
    grid: grid ? { x: grid.x, z: grid.z, rotation: grid.rotation } : null,
    geo: { size: geo.size, cellSizeM: geo.cellSizeM },
    cells: filled,
    squares,
  };
}

/** Prostor mřížky plochy: bod (u, v – m od vrcholu 0, 0 mřížky) a směr → svět. */
interface AreaFrame {
  point(u: number, v: number): [number, number];
  dir(du: number, dv: number): [number, number];
}

/** Jako `squareCorners`: vrchol (i, j) = levý dolní roh čtverce (i, j). */
export function areaFrame(area: FortArea): AreaFrame {
  const size = area.geo.cellSizeM;
  const grid = area.grid;
  if (!grid) {
    const half = (area.geo.size * size) / 2;
    return { point: (u, v) => [-half + u, -half + v], dir: (du, dv) => [du, dv] };
  }
  const [c, s] = rotationCosSin(grid.rotation);
  return {
    point: (u, v) => {
      const lx = u - size / 2;
      const lz = v - size / 2;
      return [grid.x + lx * c + lz * s, grid.z - lx * s + lz * c];
    },
    dir: (du, dv) => [du * c + dv * s, -du * s + dv * c],
  };
}

/** Strana obrysu v mřížce – počáteční vrchol, směr a roh na konci. */
interface GridSide {
  cell: TileCell;
  side: number;
  i: number;
  j: number;
  di: number;
  dj: number;
  end: FortCorner;
}

/**
 * Obrys plochy po směru hodin (plocha vpravo): strany čtverců bez souseda, každá začíná tam, kde
 * předchozí končí. Plocha je souvislá a bez děr, takže obrys je jedna smyčka a každým vrcholem
 * vede nejvýš jedna strana (dva čtverce na sebe jen rohem by měly díru mezi sebou).
 */
function boundaryWalk(cells: readonly TileCell[]): GridSide[] {
  const present = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const startsAt = new Map<string, GridSide>();
  const all: GridSide[] = [];
  for (const cell of cells) {
    for (let side = 0; side < SIDES.length; side++) {
      const s = SIDES[side]!;
      if (present.has(cellKey(cell.x + s.di, cell.y + s.dj))) continue;
      const g: GridSide = {
        cell,
        side,
        i: cell.x + s.vertex[0],
        j: cell.y + s.vertex[1],
        di: s.dir[0],
        dj: s.dir[1],
        end: null,
      };
      startsAt.set(cellKey(g.i, g.j), g);
      all.push(g);
    }
  }
  const first = all[0];
  const walk: GridSide[] = [];
  for (let s = first; s && walk.length < all.length;) {
    walk.push(s);
    const next = startsAt.get(cellKey(s.i + s.di, s.j + s.dj));
    if (next === first) break;
    s = next;
  }
  walk.forEach((s, k) => {
    const n = walk[(k + 1) % walk.length]!;
    // otočení doprava (po směru hodin) = vnější roh, doleva = vnitřní
    const cross = s.di * n.dj - s.dj * n.di;
    s.end = cross < 0 ? 'outer' : cross > 0 ? 'inner' : null;
  });
  return walk;
}

/**
 * Poloměry rohů druhu – zmenšené, když se dva rohy nevejdou na rovný kus mezi nimi (val na
 * pruhu širokém jeden čtverec: 2 × 8 m > 15 m – návrh Clauda, všechny rohy stejným poměrem).
 */
function fittedCorners(walk: readonly GridSide[], kind: FortKind, size: number): FenceCorners {
  const { outer, inner } = FORTIFICATIONS.cornerM[kind];
  const radius = (c: FortCorner): number => (c === 'outer' ? outer : c === 'inner' ? inner : 0);
  let scale = 1;
  let start = radius(walk[walk.length - 1]!.end);
  let length = 0;
  for (const s of walk) {
    length += size;
    if (!s.end) continue;
    const end = radius(s.end);
    scale = Math.min(scale, length / (start + end));
    start = end;
    length = 0;
  }
  return { outer: outer * scale, inner: inner * scale };
}

/** Oblouk rohu ve vrcholu (x, z) mezi směry `d` a `n` s tečnami `t` od vrcholu. */
export function cornerArc(
  x: number,
  z: number,
  d: readonly [number, number],
  n: readonly [number, number],
  t: number,
): FenceArc {
  // střed = vrchol − d·t + n·t; začátek oblouku (konec rovného kusu) ve směru −n, konec ve směru d
  return {
    x: x - d[0] * t + n[0] * t,
    z: z - d[1] * t + n[1] * t,
    r: t,
    ux: 0 - n[0],
    uz: 0 - n[1],
    vx: d[0],
    vz: d[1],
  };
}

/**
 * Plocha útočiště – uvnitř vnitřní hrany pásu šířky `band` (fortifications.md – Útočiště):
 * ostrá eroze plochy čtvercem (přesně – stlačená mřížka zlomů na hranách čtverců ± pás) a na
 * jejích rozích zakulacení: vnější roh vnitřní hrany má poloměr (vnější − pás, nejméně 0), vnitřní
 * (vnitřní + pás). Pruh užší než dva pásy (val) zmizí sám.
 */
function innerArea(
  cells: readonly TileCell[],
  size: number,
  band: number,
  corners: FenceCorners,
): number {
  const present = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const w = band / size;
  const us = new Set<number>();
  const vs = new Set<number>();
  for (const c of cells) {
    for (const e of [c.x, c.x + 1]) us.add(e - w).add(e + w);
    for (const e of [c.y, c.y + 1]) vs.add(e - w).add(e + w);
  }
  const u = [...us].sort((a, b) => a - b);
  const v = [...vs].sort((a, b) => a - b);
  // buňka stlačené mřížky patří do eroze, když čtverec ± pás kolem jejího středu leží celý v ploše
  const inside: boolean[][] = [];
  let sharp = 0;
  for (let a = 0; a + 1 < u.length; a++) {
    const row: boolean[] = [];
    const pu = (u[a]! + u[a + 1]!) / 2;
    for (let b = 0; b + 1 < v.length; b++) {
      const pv = (v[b]! + v[b + 1]!) / 2;
      let ok = true;
      for (let x = Math.floor(pu - w); ok && x <= Math.floor(pu + w); x++) {
        for (let y = Math.floor(pv - w); ok && y <= Math.floor(pv + w); y++)
          ok = present.has(cellKey(x, y));
      }
      row.push(ok);
      if (ok) sharp += (u[a + 1]! - u[a]!) * (v[b + 1]! - v[b]!);
    }
    inside.push(row);
  }
  const at = (a: number, b: number): boolean => inside[a]?.[b] ?? false;
  let convex = 0;
  let reflex = 0;
  for (let a = 0; a < u.length; a++) {
    for (let b = 0; b < v.length; b++) {
      const ll = at(a - 1, b - 1);
      const rl = at(a, b - 1);
      const lu = at(a - 1, b);
      const ru = at(a, b);
      const count = (ll ? 1 : 0) + (rl ? 1 : 0) + (lu ? 1 : 0) + (ru ? 1 : 0);
      if (count === 1) convex++;
      else if (count === 3) reflex++;
      else if (count === 2 && ll === ru) convex += 2;
    }
  }
  const fillet = 1 - Math.PI / 4;
  const ro = Math.max(0, corners.outer - band);
  const ri = corners.inner + band;
  return sharp * size * size - convex * fillet * ro * ro + reflex * fillet * ri * ri;
}

/**
 * Obvod opevnění druhu `kind` na ploše (fortifications.md – Obvod): strany okrajových čtverců
 * po směru hodin od severu (nejsevernější střed strany, při shodě nejzápadnější), rovné kusy
 * zkrácené o tečny zakulacených rohů a oblouky, délka vnějšího okraje, pás a útočiště.
 */
export function fortificationOutline(area: FortArea, kind: FortKind): FortOutline {
  const size = area.geo.cellSizeM;
  const frame = areaFrame(area);
  const walk = boundaryWalk(area.cells);
  const corners = fittedCorners(walk, kind, size);
  const radius = (c: FortCorner): number =>
    c === 'outer' ? corners.outer : c === 'inner' ? corners.inner : 0;
  const all: FortSide[] = walk.map((s) => {
    const [x, z] = frame.point(s.i * size, s.j * size);
    const [dx, dz] = frame.dir(s.di, s.dj);
    return { cell: s.cell, side: s.side, x, z, dx, dz, end: s.end, endRadius: radius(s.end) };
  });
  // začátek po směru hodin od severu
  let north = 0;
  all.forEach((s, k) => {
    const best = all[north]!;
    const mz = s.z + (s.dz * size) / 2;
    const bz = best.z + (best.dz * size) / 2;
    const mx = s.x + (s.dx * size) / 2;
    const bx = best.x + (best.dx * size) / 2;
    if (
      mz > bz + NORTH_EPSILON_M ||
      (Math.abs(mz - bz) <= NORTH_EPSILON_M && mx < bx - NORTH_EPSILON_M)
    )
      north = k;
  });
  const sides = [...all.slice(north), ...all.slice(0, north)];
  // rovné kusy od první strany za rohem
  const firstRun = sides.findIndex(
    (_, k) => sides[(k + sides.length - 1) % sides.length]!.end !== null,
  );
  const runs: FortRun[] = [];
  let lengthM = 0;
  for (let k = 0; k < sides.length; k++) {
    const s = sides[(firstRun + k) % sides.length]!;
    const prev = sides[(firstRun + k + sides.length - 1) % sides.length]!;
    if (prev.end === null) continue;
    let count = 1;
    let last = s;
    while (last.end === null) {
      last = sides[(firstRun + k + count) % sides.length]!;
      count++;
    }
    const next = sides[(firstRun + k + count) % sides.length]!;
    const ta = prev.endRadius;
    const tb = last.endRadius;
    const length = count * size - ta - tb;
    const ex = s.x + s.dx * count * size;
    const ez = s.z + s.dz * count * size;
    runs.push({
      line: { x: s.x + s.dx * ta, z: s.z + s.dz * ta, dx: s.dx, dz: s.dz, length },
      arc: cornerArc(ex, ez, [s.dx, s.dz], [next.dx, next.dz], tb),
    });
    lengthM += length + (Math.PI / 2) * tb;
  }
  const bandM = FORTIFICATIONS.bandM[kind];
  return {
    kind,
    area,
    corners,
    sides,
    runs,
    lengthM,
    bandM,
    innerAreaM2: innerArea(area.cells, size, bandM, corners),
  };
}
