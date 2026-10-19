import { ROAD_LAND } from '../rules';
import { rotationCosSin, type GridGeometry } from '../square-grid';
import type { RoadGrade, RoadPoint, SquareGrid, TileCell } from '../types';

// Cesta ubírá poli plochu (roads.md a fields.md – Cesta přes pole; Martin, 19. 10. 2026: „Ano má.
// Ono to stejně ve výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude
// pak moci vzniknout takový růžek…“). Pás pevné cesty v šířce obtisku a plácek rozcestí se neorou
// (ROAD_LAND). Kus pole, který cesty oddělí od zbytku, se obdělává jen, když se do něj vejde obrat
// spřežení (plocha `cornerMinM2`) a má místo širší než `stripMinM` – jinak zůstane loukou (mez
// u cesty). Počítá se po buňkách (ROAD_LAND.cells × cells na čtverec) v mřížce pole – stejně na
// serveru (plocha dílů) i v prohlížeči (kde obilí neroste); jen přesná aritmetika (det-math).

/**
 * Rám pole: střed čtverce (0, 0) ve světě, cos a sin natočení mřížky a strana čtverce (m). Čtverec
 * (i, j) má střed `x + i·size·c + j·size·s`, `z − i·size·s + j·size·c` (jako `squareCenter`).
 */
export interface FieldFrame {
  x: number;
  z: number;
  c: number;
  s: number;
  size: number;
}

/** Rám pole s mřížkou `grid` (bez ní mřížka krajiny – čtverec = políčko). */
export function fieldFrame(geo: GridGeometry, grid: SquareGrid | undefined): FieldFrame {
  if (grid) {
    const [c, s] = rotationCosSin(grid.rotation);
    return { x: grid.x, z: grid.z, c, s, size: geo.cellSizeM };
  }
  const half = (geo.size * geo.cellSizeM) / 2;
  return {
    x: -half + 0.5 * geo.cellSizeM,
    z: -half + 0.5 * geo.cellSizeM,
    c: 1,
    s: 0,
    size: geo.cellSizeM,
  };
}

/** Pole pro výpočet – rám a čtverce dílů (id dílu a čtverec v mřížce pole). */
export interface RoadLandField {
  frame: FieldFrame;
  squares: readonly { id: number; cell: TileCell }[];
}

/** Pevná cesta pro výpočet – osa, stupeň a vozová. */
export interface RoadLandRoad {
  points: readonly RoadPoint[];
  grade: RoadGrade;
  cart?: boolean;
}

/**
 * Co cesty vezmou dílu: plocha pod pásem cest a plácky rozcestí (`roadM2`), plocha oddělených
 * kousků, které zůstanou loukou (`cutM2`), a které buňky to jsou (`cut` – řádky po ROAD_LAND.cells
 * bitech: bit i řádku j = buňka i napříč, j podél mřížky pole; bez oddělených kousků null).
 */
export interface PartRoadLand {
  roadM2: number;
  cutM2: number;
  cut: number[] | null;
}

/** Šířka pásu cesty (m) – vyšlapaná, vozová, upravená, hať (ROAD_LAND.widthM). */
export function roadLandWidthM(road: Pick<RoadLandRoad, 'grade' | 'cart'>): number {
  if (road.grade !== 'trodden') return ROAD_LAND.widthM[road.grade];
  return road.cart ? ROAD_LAND.widthM.cart : ROAD_LAND.widthM.trodden;
}

/** Kus pásu cesty (úsečka a–b s poloměrem r) nebo plácek rozcestí (a = b). */
interface Capsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Strana přihrádky rejstříku kusů cest (m). */
const BIN_M = 8;

/** Kusy pásů cest a plácky rozcestí s rejstříkem po přihrádkách. */
class RoadBands {
  private readonly capsules: Capsule[] = [];
  private readonly bins = new Map<string, number[]>();
  /** Přesah rejstříku – bod najde i kusy do tolika metrů od svého pásu (široké místo). */
  private readonly margin = ROAD_LAND.stripMinM / 2;

  constructor(roads: readonly RoadLandRoad[]) {
    const nodes = new Map<string, { x: number; z: number; count: number; width: number }>();
    for (const road of roads) {
      if (road.points.length < 2) continue;
      const r = roadLandWidthM(road) / 2;
      for (let k = 1; k < road.points.length; k++) {
        const a = road.points[k - 1]!;
        const b = road.points[k]!;
        this.add(a.x, a.z, b.x, b.z, r);
      }
      for (const p of [road.points[0]!, road.points[road.points.length - 1]!]) {
        const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
        const node = nodes.get(key) ?? { x: p.x, z: p.z, count: 0, width: 0 };
        node.count++;
        node.width = Math.max(node.width, r * 2);
        nodes.set(key, node);
      }
    }
    // plácek rozcestí – kde končí aspoň tři úseky (roads.md – Úseky a rozcestí)
    for (const node of nodes.values()) {
      if (node.count >= 3)
        this.add(node.x, node.z, node.x, node.z, node.width * ROAD_LAND.junctionScale);
    }
  }

  private add(ax: number, az: number, bx: number, bz: number, r: number): void {
    const capsule: Capsule = {
      ax,
      az,
      bx,
      bz,
      r,
      minX: Math.min(ax, bx) - r,
      maxX: Math.max(ax, bx) + r,
      minZ: Math.min(az, bz) - r,
      maxZ: Math.max(az, bz) + r,
    };
    const index = this.capsules.length;
    this.capsules.push(capsule);
    const m = this.margin;
    for (
      let i = Math.floor((capsule.minX - m) / BIN_M);
      i <= Math.floor((capsule.maxX + m) / BIN_M);
      i++
    ) {
      for (
        let j = Math.floor((capsule.minZ - m) / BIN_M);
        j <= Math.floor((capsule.maxZ + m) / BIN_M);
        j++
      ) {
        const key = `${i},${j}`;
        const list = this.bins.get(key);
        if (list) list.push(index);
        else this.bins.set(key, [index]);
      }
    }
  }

  get empty(): boolean {
    return this.capsules.length === 0;
  }

  /** Kusy, jejichž obdélník (s přesahem) zasahuje do obdélníku. */
  near(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
    for (let i = Math.floor(minX / BIN_M); i <= Math.floor(maxX / BIN_M); i++) {
      for (let j = Math.floor(minZ / BIN_M); j <= Math.floor(maxZ / BIN_M); j++) {
        for (const index of this.bins.get(`${i},${j}`) ?? []) {
          const c = this.capsules[index]!;
          if (c.maxX >= minX && c.minX <= maxX && c.maxZ >= minZ && c.minZ <= maxZ) return true;
        }
      }
    }
    return false;
  }

  /** Čtverec vzdálenosti bodu od osy kusu. */
  private static distance2(c: Capsule, x: number, z: number): number {
    const dx = c.bx - c.ax;
    const dz = c.bz - c.az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - c.ax) * dx + (z - c.az) * dz) / l2)) : 0;
    const ex = x - (c.ax + dx * t);
    const ez = z - (c.az + dz * t);
    return ex * ex + ez * ez;
  }

  /** Leží bod v pásu cesty nebo na plácku rozcestí? */
  covers(x: number, z: number): boolean {
    for (const index of this.bins.get(`${Math.floor(x / BIN_M)},${Math.floor(z / BIN_M)}`) ?? []) {
      const c = this.capsules[index]!;
      if (RoadBands.distance2(c, x, z) <= c.r * c.r) return true;
    }
    return false;
  }

  /** Je bod aspoň `d` m od okraje každého pásu (`d` nejvýš ROAD_LAND.stripMinM / 2)? */
  clear(x: number, z: number, d: number): boolean {
    for (const index of this.bins.get(`${Math.floor(x / BIN_M)},${Math.floor(z / BIN_M)}`) ?? []) {
      const c = this.capsules[index]!;
      const reach = c.r + d;
      if (RoadBands.distance2(c, x, z) < reach * reach) return false;
    }
    return true;
  }
}

/** Buňka je volná (pole), pod cestou, nebo zatím neprošlá / obdělávaná / oddělená. */
const FREE = 0;
const ROAD = 1;
const UNSEEN = 0;
const QUEUED = 1;
const KEPT = 2;
const CUT = 3;

/** Čtverec pole v rastru – stav buněk (pole / cesta) a značky průchodu. */
interface RasterSquare {
  id: number;
  i: number;
  j: number;
  /** Střed čtverce ve světě. */
  x: number;
  z: number;
  ground: Uint8Array | null;
  mark: Uint8Array;
}

/**
 * Co pevné cesty vezmou dílům polí (`PartRoadLand` podle id dílu – jen díly, kterým něco vezmou).
 * Pás cesty a plácky rozcestí jsou buňky pod cestou; z ostatních buněk pole, které s cestou
 * sousedí, se po souvislých kusech (přes čtverce téhož pole, čtyřokolí) zjistí, jestli je kus
 * velký aspoň ROAD_LAND.cornerMinM2 a má široké místo (buňku aspoň `stripMinM / 2` od pásů cest
 * i od okraje pole) – jinak zůstane loukou. Kusy, které cesty nedělí, se nemění. Výsledek nezávisí
 * na pořadí polí ani dílů.
 */
export function roadLand(
  fields: readonly RoadLandField[],
  roads: readonly RoadLandRoad[],
): Map<number, PartRoadLand> {
  const out = new Map<number, PartRoadLand>();
  const bands = new RoadBands(roads);
  if (bands.empty) return out;
  const n = ROAD_LAND.cells;
  const half = ROAD_LAND.stripMinM / 2;
  for (const field of fields) {
    const { frame } = field;
    const step = frame.size / n;
    const cellM2 = step * step;
    const cornerCells = Math.ceil(ROAD_LAND.cornerMinM2 / cellM2 - 1e-9);
    const reach = (frame.size * Math.SQRT2) / 2;
    const squares = new Map<string, RasterSquare>();
    for (const sq of field.squares) {
      const x = frame.x + sq.cell.x * frame.size * frame.c + sq.cell.y * frame.size * frame.s;
      const z = frame.z - sq.cell.x * frame.size * frame.s + sq.cell.y * frame.size * frame.c;
      squares.set(`${sq.cell.x},${sq.cell.y}`, {
        id: sq.id,
        i: sq.cell.x,
        j: sq.cell.y,
        x,
        z,
        ground: null,
        mark: new Uint8Array(n * n),
      });
    }
    /** Bod buňky (a, b) čtverce ve světě. */
    const world = (sq: RasterSquare, a: number, b: number): [number, number] => {
      const lu = ((a + 0.5) / n - 0.5) * frame.size;
      const lv = ((b + 0.5) / n - 0.5) * frame.size;
      return [sq.x + lu * frame.c + lv * frame.s, sq.z - lu * frame.s + lv * frame.c];
    };
    const near = (sq: RasterSquare): boolean =>
      bands.near(sq.x - reach, sq.x + reach, sq.z - reach, sq.z + reach);
    /** Stav buněk čtverce (líně) – daleko od cest celý volný. */
    const groundOf = (sq: RasterSquare): Uint8Array => {
      if (sq.ground) return sq.ground;
      const ground = new Uint8Array(n * n);
      if (near(sq)) {
        for (let b = 0; b < n; b++) {
          for (let a = 0; a < n; a++) {
            const [x, z] = world(sq, a, b);
            if (bands.covers(x, z)) ground[b * n + a] = ROAD;
          }
        }
      }
      sq.ground = ground;
      return ground;
    };
    const at = (i: number, j: number): RasterSquare | undefined => squares.get(`${i},${j}`);
    /** Široké místo: kruh o poloměru `half` kolem buňky je celý v poli a mimo pásy cest. */
    const wide = (sq: RasterSquare, a: number, b: number): boolean => {
      const [x, z] = world(sq, a, b);
      if (!bands.clear(x, z, half)) return false;
      const lu = ((a + 0.5) / n) * frame.size;
      const lv = ((b + 0.5) / n) * frame.size;
      const left = lu < half;
      const right = frame.size - lu < half;
      const down = lv < half;
      const up = frame.size - lv < half;
      const di = left ? -1 : right ? 1 : 0;
      const dj = down ? -1 : up ? 1 : 0;
      if (di !== 0 && !at(sq.i + di, sq.j)) return false;
      if (dj !== 0 && !at(sq.i, sq.j + dj)) return false;
      if (di !== 0 && dj !== 0 && !at(sq.i + di, sq.j + dj)) {
        const cu = di < 0 ? lu : frame.size - lu;
        const cv = dj < 0 ? lv : frame.size - lv;
        if (cu * cu + cv * cv < half * half) return false;
      }
      return true;
    };
    /** Soused buňky ve čtyřokolí (i přes hranu čtverce), nebo null mimo pole. */
    const neighbour = (
      sq: RasterSquare,
      a: number,
      b: number,
      da: number,
      db: number,
    ): [RasterSquare, number] | null => {
      let na = a + da;
      let nb = b + db;
      let target: RasterSquare | undefined = sq;
      if (na < 0 || na >= n || nb < 0 || nb >= n) {
        target = at(sq.i + (na < 0 ? -1 : na >= n ? 1 : 0), sq.j + (nb < 0 ? -1 : nb >= n ? 1 : 0));
        if (!target) return null;
        na = (na + n) % n;
        nb = (nb + n) % n;
      }
      return [target, nb * n + na];
    };
    const DIRS: readonly [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    /** Projde souvislý kus pole od buňky – obdělávaný (KEPT), nebo oddělený (CUT). */
    const walk = (start: RasterSquare, index: number): void => {
      const seen: [RasterSquare, number][] = [[start, index]];
      start.mark[index] = QUEUED;
      let head = 0;
      let area = 0;
      let isWide = false;
      let kept = false;
      while (head < seen.length && !kept) {
        const [sq, k] = seen[head++]!;
        const a = k % n;
        const b = (k - a) / n;
        area++;
        if (!isWide && wide(sq, a, b)) isWide = true;
        if (isWide && area >= cornerCells) {
          kept = true;
          break;
        }
        for (const [da, db] of DIRS) {
          const next = neighbour(sq, a, b, da, db);
          if (!next) continue;
          const [nsq, nk] = next;
          if (groundOf(nsq)[nk] === ROAD) continue;
          const mark = nsq.mark[nk]!;
          if (mark === KEPT) {
            kept = true;
            break;
          }
          if (mark === UNSEEN) {
            nsq.mark[nk] = QUEUED;
            seen.push([nsq, nk]);
          }
        }
      }
      const label = kept ? KEPT : CUT;
      for (const [sq, k] of seen) sq.mark[k] = label;
    };
    // kusy pole u cest – od buněk, které s pásem cesty sousedí
    const order = [...squares.values()].filter(near).sort((p, q) => p.id - q.id);
    for (const sq of order) {
      const ground = groundOf(sq);
      for (let k = 0; k < n * n; k++) {
        if (ground[k] !== FREE || sq.mark[k] !== UNSEEN) continue;
        const a = k % n;
        const b = (k - a) / n;
        const byRoad = DIRS.some(([da, db]) => {
          const next = neighbour(sq, a, b, da, db);
          return next !== null && groundOf(next[0])[next[1]] === ROAD;
        });
        if (byRoad) walk(sq, k);
      }
    }
    for (const sq of squares.values()) {
      if (!sq.ground) continue;
      let road = 0;
      let cut = 0;
      const rows: number[] = new Array<number>(n).fill(0);
      for (let k = 0; k < n * n; k++) {
        if (sq.ground[k] === ROAD) road++;
        else if (sq.mark[k] === CUT) {
          cut++;
          const a = k % n;
          const b = (k - a) / n;
          rows[b] = rows[b]! | (1 << a);
        }
      }
      if (road === 0 && cut === 0) continue;
      out.set(sq.id, {
        roadM2: road * cellM2,
        cutM2: cut * cellM2,
        cut: cut > 0 ? rows : null,
      });
    }
  }
  return out;
}

/** Je buňka (a, b) dílu oddělená (`PartRoadLand.cut`)? */
export function roadCutAt(
  cut: readonly number[] | null | undefined,
  a: number,
  b: number,
): boolean {
  if (!cut) return false;
  return ((cut[b] ?? 0) & (1 << a)) !== 0;
}
