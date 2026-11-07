import { detAtan2, length2, smoothstep, wrapAngle } from './det-math';
import type { Landscape, StreamPoint } from './types';

// Osa potoka ve světě scény – podle ní stojí stromy a kameny vrstvy překážek u vody a kreslí se
// koryto, hladina i porost. Jen deterministická matematika (det-math.ts): počítá ji server
// i prohlížeč. Změna po ostrém spuštění = nová verze vrstvy překážek.

/** Kam až od okraje vody (m) umí `nearest` odpovídat – břehy, náplavy a porost. */
export const BANK_REACH_M = 45;
const BUCKET_M = 30;
/** Spád hladiny se měří na úseku ± tolik metrů podél toku. */
const SLOPE_WINDOW_M = 120;
/** Stočení toku se měří na úseku ± tolik metrů; při tomto stočení (rad) je oblouk „plný“. */
const BEND_WINDOW_M = 40;
const FULL_BEND_RAD = 1.2;
/** Druhý úsek v `nearestPair` musí ležet podél toku dál než tolik metrů od prvního. */
const OTHER_REACH_M = 60;

export interface StreamCenterPoint {
  x: number;
  z: number;
  /** Hladina (m, herní výška bez převýšení). */
  level: number;
  /** Poloviční šířka vody vlevo a vpravo od osy (m); levá strana leží ve směru (−tz, tx). */
  halfLeft: number;
  halfRight: number;
  /** Rychlost proudu 0 (stojatá tůň) – 1 (peřej). */
  speed: number;
  /** 0–1: jak moc je místo tůní (široké, hluboké, klidné). */
  pool: number;
  /** 0–1: mělčina nebo brod. */
  shallow: number;
  /** Stočení toku (rad na BEND_WINDOW_M): kladné doleva. */
  turn: number;
  /** Výška strmého břehu nebo skalní stěny nad hladinou vlevo a vpravo (m, terén 2; jinak 0). */
  bankLeft: number;
  bankRight: number;
}

/** Odpověď na dotaz „co je tady za potok“. Daleko od potoka je `distance` Infinity. */
export interface StreamSample {
  /** Vzdálenost od osy (m). */
  distance: number;
  level: number;
  /** Poloviční šířka vody na straně dotazovaného bodu (m). */
  halfWidth: number;
  /** Vzdálenost od okraje vody (m): ve vodě záporná, na břehu kladná. */
  bankDistance: number;
  speed: number;
  /** Jednotkový směr toku. */
  flowX: number;
  flowZ: number;
  pool: number;
  shallow: number;
  /** Strana oblouku −1 (vnější, nárazový břeh) … +1 (vnitřní, náplav); v rovném úseku 0. */
  innerBend: number;
  /** Výška strmého břehu nebo skalní stěny na straně dotazovaného bodu (m, terén 2; jinak 0). */
  bank: number;
}

export interface StreamCenterline {
  /** Osa potoka od pramene (vyšší konec) k ústí. */
  points: StreamCenterPoint[];
  /** Nejbližší místo potoka; dál než maxDistance od okraje vody → distance Infinity. */
  nearest(x: number, z: number, maxDistance?: number): StreamSample;
  /**
   * Nejbližší místo potoka a nejbližší místo z jiné části toku (podél osy dál než
   * OTHER_REACH_M) – v šíji meandru se pak dají prolnout úpravy obou břehů.
   */
  nearestPair(x: number, z: number, maxDistance?: number): [StreamSample, StreamSample];
}

const FAR: StreamSample = {
  distance: Infinity,
  level: 0,
  halfWidth: 0,
  bankDistance: Infinity,
  speed: 0,
  flowX: 0,
  flowZ: 0,
  pool: 0,
  shallow: 0,
  innerBend: 0,
  bank: 0,
};

/**
 * Osa potoka ve světových souřadnicích z dat krajiny (meandry, šířky břehů a hladinu určil
 * generátor), prodloužená k okrajům mapy. Hladina podél osy nikdy nestoupá. Rychlost proudu
 * se odvodí ze spádu hladiny a šířky: úzký strmý úsek a mělčina rychle, široká tůň pomalu.
 */
export function streamCenterline(l: Landscape): StreamCenterline {
  // Tůň od poloviční šířky 1,2 políčka, plná od 1,6 (generátor dělá tůně 1,5–2,5).
  return centerlineOf(l, l.stream, { poolOf: (width) => smoothstep(1.2, 1.6, width) });
}

/** Tok podle druhu: tůň podle poloviční šířky (políčka) a nejmenší rychlost proudu 0–1. */
interface CourseKind {
  poolOf(halfWidthCells: number): number;
  minSpeed?: number;
}

/**
 * Řeka (návrh Clauda): bez tůní a teče vždy aspoň jako středně rychlý potok (0,5 ≈ 0,9 m/s ve
 * scéně) – splavná řeka nestojí ani v rovině; v zimě zamrzne jen u břehů a v klidu u brodu
 * neztichne jako tůň.
 */
const RIVER_COURSE: CourseKind = { poolOf: () => 0, minSpeed: 0.5 };

/**
 * Osa toku `course` (body ve tvaru osy potoka) ve světě: tůň podle poloviční šířky v políčkách
 * (`kind.poolOf`), hladina po proudu nestoupá, konce prodloužené k okraji mapy, proud a oblouky.
 */
function centerlineOf(
  l: Landscape,
  course: readonly StreamPoint[],
  kind: CourseKind,
): StreamCenterline {
  const half = (l.size * l.cellSizeM) / 2;
  let points: StreamCenterPoint[] = course.map((p) => {
    const width = (p.halfWidthLeft + p.halfWidthRight) / 2;
    return {
      x: -half + (p.x + 0.5) * l.cellSizeM,
      z: -half + (p.y + 0.5) * l.cellSizeM,
      level: p.level,
      halfLeft: p.halfWidthLeft * l.cellSizeM,
      halfRight: p.halfWidthRight * l.cellSizeM,
      speed: 0,
      pool: kind.poolOf(width),
      shallow: p.shallow ? 1 : 0,
      turn: 0,
      bankLeft: p.bankLeft ?? 0,
      bankRight: p.bankRight ?? 0,
    };
  });
  for (let k = 1; k < points.length; k++) {
    points[k]!.level = Math.min(points[k]!.level, points[k - 1]!.level);
  }
  if (points.length >= 2) {
    points = extendToEdges(points, l.cellSizeM);
    deriveFlow(points);
  }
  const minSpeed = kind.minSpeed;
  if (minSpeed !== undefined) for (const p of points) p.speed = Math.max(p.speed, minSpeed);
  return withNearestQuery(points);
}

const riverCache = new WeakMap<Landscape, StreamCenterline | null>();

/**
 * Osa řeky prémiové krajiny (`Landscape.river`) – stejná geometrie jako osa potoka (šířky,
 * hladina, brody, proud, oblouky), jen bez tůní a s proudem aspoň `RIVER_COURSE.minSpeed`: řeka
 * je souvislý tok 25–45 m široký (tůně potoka se poznají podle šířky nad 36 m – řeka by s prahy
 * potoka vyšla jako stojatá tůň a led, ryby i hladina by ji braly jako klidnou vodu). Krajina bez
 * řeky null. Mezipaměť podle objektu krajiny.
 */
export function riverCenterline(l: Landscape): StreamCenterline | null {
  const cached = riverCache.get(l);
  if (cached !== undefined) return cached;
  const river = l.river && l.river.length >= 2 ? centerlineOf(l, l.river, RIVER_COURSE) : null;
  riverCache.set(l, river);
  return river;
}

const watersCache = new WeakMap<Landscape, StreamCenterline>();

/**
 * Všechny toky krajiny pro dotazy „co je tady za vodu“ – potok a řeka (prémiové krajiny).
 * `nearest` a `nearestPair` vrací nejbližší místo kteréhokoli toku (druhý úsek může být
 * i z druhého toku), `points` jsou body osy potoka – stanice podél potoka (břehový porost,
 * zvuky) zůstanou, kde byly. Krajina bez řeky vrací přesně `streamCenterline` – vrstva
 * překážek i pěšiny průměrné krajiny jsou bit po bitu stejné. Mezipaměť podle objektu krajiny.
 */
export function watersCenterline(l: Landscape): StreamCenterline {
  const cached = watersCache.get(l);
  if (cached) return cached;
  const stream = streamCenterline(l);
  const river = riverCenterline(l);
  const waters = river ? combineCenterlines(stream, river) : stream;
  watersCache.set(l, waters);
  return waters;
}

/** Nejbližší místo vody ze dvou toků a odkud je (`nearestWaterPair`). */
export interface WaterPair {
  near: StreamSample;
  /** Nejbližší místo z jiné části toku, nebo z druhého toku (jako `nearestPair`). */
  other: StreamSample;
  /** `near` leží na druhém toku (řece), ne na prvním (potoce). */
  second: boolean;
}

/**
 * Nejbližší místo vody ze dvou toků – potoka `a` a řeky `b` (null = jen potok) – stejně jako
 * `watersCenterline` (při shodě vyhrává potok) a s tím, ze kterého toku je; scéna podle toho
 * hloubí řece hlubší koryto.
 */
export function nearestWaterPair(
  a: StreamCenterline,
  b: StreamCenterline | null,
  x: number,
  z: number,
  maxDistance = BANK_REACH_M,
): WaterPair {
  const [a1, a2] = a.nearestPair(x, z, maxDistance);
  if (!b) return { near: a1, other: a2, second: false };
  const [b1, b2] = b.nearestPair(x, z, maxDistance);
  if (a1.bankDistance <= b1.bankDistance) {
    return { near: a1, other: a2.bankDistance <= b1.bankDistance ? a2 : b1, second: false };
  }
  return { near: b1, other: b2.bankDistance < a1.bankDistance ? b2 : a1, second: true };
}

/** Dotazy nad dvěma toky – nejbližší místo z obou, body osy prvního. */
function combineCenterlines(a: StreamCenterline, b: StreamCenterline): StreamCenterline {
  const nearestPair = (
    x: number,
    z: number,
    maxDistance = BANK_REACH_M,
  ): [StreamSample, StreamSample] => {
    const pair = nearestWaterPair(a, b, x, z, maxDistance);
    return [pair.near, pair.other];
  };
  return {
    points: a.points,
    nearest: (x, z, maxDistance) => nearestPair(x, z, maxDistance)[0],
    nearestPair,
  };
}

/** Prodlouží konce osy o políčko ven – voda pak sahá až za okraj mapy. */
function extendToEdges(points: StreamCenterPoint[], cellSizeM: number): StreamCenterPoint[] {
  const extend = (end: StreamCenterPoint, inner: StreamCenterPoint): StreamCenterPoint => {
    const dx = end.x - inner.x;
    const dz = end.z - inner.z;
    const length = length2(dx, dz) || 1;
    return { ...end, x: end.x + (dx / length) * cellSizeM, z: end.z + (dz / length) * cellSizeM };
  };
  return [extend(points[0]!, points[1]!), ...points, extend(points.at(-1)!, points.at(-2)!)];
}

/** Rychlost proudu ze spádu hladiny a šířky, stočení toku pro vnitřní a vnější břeh. */
function deriveFlow(points: StreamCenterPoint[]): void {
  const along = [0];
  for (let k = 1; k < points.length; k++) {
    along.push(
      along[k - 1]! + length2(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z),
    );
  }
  const indexAt = (s: number): number => {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (along[mid]! < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const direction = (k: number): number => {
    const a = points[Math.max(0, k - 1)]!;
    const b = points[Math.min(points.length - 1, k + 1)]!;
    return detAtan2(b.z - a.z, b.x - a.x);
  };

  const raw = points.map((p, k) => {
    const up = indexAt(along[k]! - SLOPE_WINDOW_M);
    const down = indexAt(along[k]! + SLOPE_WINDOW_M);
    const slope =
      (points[up]!.level - points[down]!.level) / Math.max(1, along[down]! - along[up]!);
    const width = (p.halfLeft + p.halfRight) / 2;
    // Spád 0,1 % = líný tok, 1,5 % = bystřina; užší koryto proud zrychlí.
    const fall = smoothstep(0.001, 0.015, slope);
    const narrow = Math.min(1.3, Math.max(0.35, 8 / Math.max(width, 1)));
    let speed = 0.12 + 0.88 * Math.min(1, fall * narrow);
    if (p.shallow) speed = Math.max(speed, 0.8);
    speed *= 1 - 0.85 * p.pool;
    return speed;
  });
  // Vyhlazení podél toku – proud se mění plynule.
  points.forEach((p, k) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, k - 8); j <= Math.min(points.length - 1, k + 8); j++) {
      sum += raw[j]!;
      count++;
    }
    p.speed = Math.min(1, Math.max(0, sum / count));
    const before = direction(indexAt(along[k]! - BEND_WINDOW_M));
    const after = direction(indexAt(along[k]! + BEND_WINDOW_M));
    p.turn = wrapAngle(after - before);
  });
}

function withNearestQuery(points: StreamCenterPoint[]): StreamCenterline {
  const buckets = new Map<string, number[]>();
  const key = (bx: number, bz: number): string => `${bx},${bz}`;
  const along = [0];
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s]!;
    const b = points[s + 1]!;
    along.push(along[s]! + length2(b.x - a.x, b.z - a.z));
    const reach = Math.max(a.halfLeft, a.halfRight, b.halfLeft, b.halfRight) + BANK_REACH_M;
    const minX = Math.floor((Math.min(a.x, b.x) - reach) / BUCKET_M);
    const maxX = Math.floor((Math.max(a.x, b.x) + reach) / BUCKET_M);
    const minZ = Math.floor((Math.min(a.z, b.z) - reach) / BUCKET_M);
    const maxZ = Math.floor((Math.max(a.z, b.z) + reach) / BUCKET_M);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        const k = key(bx, bz);
        const list = buckets.get(k);
        if (list) list.push(s);
        else buckets.set(k, [s]);
      }
    }
  }

  /** Místo potoka na úseku s pro bod (x, z). */
  const sampleOn = (s: number, x: number, z: number): StreamSample => {
    const a = points[s]!;
    const b = points[s + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const length = length2(abx, abz) || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / (length * length)));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const distance = length2(x - px, z - pz);
    const tx = abx / length;
    const tz = abz / length;
    const left = -(x - px) * tz + (z - pz) * tx >= 0;
    const halfWidth = left
      ? a.halfLeft + (b.halfLeft - a.halfLeft) * t
      : a.halfRight + (b.halfRight - a.halfRight) * t;
    const turn = a.turn + (b.turn - a.turn) * t;
    const bank = left
      ? a.bankLeft + (b.bankLeft - a.bankLeft) * t
      : a.bankRight + (b.bankRight - a.bankRight) * t;
    return {
      distance,
      level: a.level + (b.level - a.level) * t,
      halfWidth,
      bankDistance: distance - halfWidth,
      speed: a.speed + (b.speed - a.speed) * t,
      flowX: tx,
      flowZ: tz,
      pool: a.pool + (b.pool - a.pool) * t,
      shallow: a.shallow + (b.shallow - a.shallow) * t,
      innerBend: Math.max(-1, Math.min(1, (turn / FULL_BEND_RAD) * (left ? 1 : -1))),
      bank,
    };
  };

  const nearestPair = (
    x: number,
    z: number,
    maxDistance = BANK_REACH_M,
  ): [StreamSample, StreamSample] => {
    const segments = buckets.get(key(Math.floor(x / BUCKET_M), Math.floor(z / BUCKET_M))) ?? [];
    // Nejbližší úsek podle vzdálenosti od okraje vody (tůň „přitahuje“ víc než osa vedle).
    let first: StreamSample = FAR;
    let firstAlong = 0;
    for (const s of segments) {
      const sample = sampleOn(s, x, z);
      if (sample.bankDistance >= first.bankDistance) continue;
      first = sample;
      firstAlong = along[s]!;
    }
    let other: StreamSample = FAR;
    for (const s of segments) {
      if (Math.abs(along[s]! - firstAlong) <= OTHER_REACH_M) continue;
      const sample = sampleOn(s, x, z);
      if (sample.bankDistance < other.bankDistance) other = sample;
    }
    return [
      first.bankDistance <= maxDistance ? first : FAR,
      other.bankDistance <= maxDistance ? other : FAR,
    ];
  };

  return {
    points,
    nearest: (x, z, maxDistance) => nearestPair(x, z, maxDistance)[0],
    nearestPair,
  };
}

export interface StreamStation {
  index: number;
  /** Vzdálenost podél osy od pramene (m). */
  s: number;
  x: number;
  z: number;
  /** Jednotková normála osy (vodorovně). */
  nx: number;
  nz: number;
}

/** Body na ose potoka po krocích `step` metrů. */
export function streamStations(stream: StreamCenterline, step: number): StreamStation[] {
  const result: StreamStation[] = [];
  const points = stream.points;
  let next = 0;
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (length === 0) continue;
    const tx = (b.x - a.x) / length;
    const tz = (b.z - a.z) / length;
    while (next <= travelled + length) {
      const t = next - travelled;
      result.push({
        index: result.length,
        s: next,
        x: a.x + tx * t,
        z: a.z + tz * t,
        nx: -tz,
        nz: tx,
      });
      next += step;
    }
    travelled += length;
  }
  return result;
}
