import type { Landscape } from '@bohemia/game';

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

export interface StreamPoint {
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
}

export interface StreamCenterline {
  /** Osa potoka od pramene (vyšší konec) k ústí. */
  points: StreamPoint[];
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
};

/**
 * Osa potoka ve světových souřadnicích z dat krajiny (meandry, šířky břehů a hladinu určil
 * generátor), prodloužená k okrajům mapy. Hladina podél osy nikdy nestoupá. Rychlost proudu
 * se odvodí ze spádu hladiny a šířky: úzký strmý úsek a mělčina rychle, široká tůň pomalu.
 */
export function streamCenterline(l: Landscape): StreamCenterline {
  const half = (l.size * l.cellSizeM) / 2;
  let points: StreamPoint[] = l.stream.map((p) => {
    const width = (p.halfWidthLeft + p.halfWidthRight) / 2;
    return {
      x: -half + (p.x + 0.5) * l.cellSizeM,
      z: -half + (p.y + 0.5) * l.cellSizeM,
      level: p.level,
      halfLeft: p.halfWidthLeft * l.cellSizeM,
      halfRight: p.halfWidthRight * l.cellSizeM,
      speed: 0,
      // Tůň od poloviční šířky 1,2 políčka, plná od 1,6 (generátor dělá tůně 1,5–2,5).
      pool: smoothstep(1.2, 1.6, width),
      shallow: p.shallow ? 1 : 0,
      turn: 0,
    };
  });
  for (let k = 1; k < points.length; k++) {
    points[k]!.level = Math.min(points[k]!.level, points[k - 1]!.level);
  }
  if (points.length >= 2) {
    points = extendToEdges(points, l.cellSizeM);
    deriveFlow(points);
  }
  return withNearestQuery(points);
}

/** Prodlouží konce osy o políčko ven – voda pak sahá až za okraj mapy. */
function extendToEdges(points: StreamPoint[], cellSizeM: number): StreamPoint[] {
  const extend = (end: StreamPoint, inner: StreamPoint): StreamPoint => {
    const dx = end.x - inner.x;
    const dz = end.z - inner.z;
    const length = Math.hypot(dx, dz) || 1;
    return { ...end, x: end.x + (dx / length) * cellSizeM, z: end.z + (dz / length) * cellSizeM };
  };
  return [extend(points[0]!, points[1]!), ...points, extend(points.at(-1)!, points.at(-2)!)];
}

/** Rychlost proudu ze spádu hladiny a šířky, stočení toku pro vnitřní a vnější břeh. */
function deriveFlow(points: StreamPoint[]): void {
  const along = [0];
  for (let k = 1; k < points.length; k++) {
    along.push(
      along[k - 1]! + Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z),
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
    return Math.atan2(b.z - a.z, b.x - a.x);
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
    p.turn = Math.atan2(Math.sin(after - before), Math.cos(after - before));
  });
}

function withNearestQuery(points: StreamPoint[]): StreamCenterline {
  const buckets = new Map<string, number[]>();
  const key = (bx: number, bz: number): string => `${bx},${bz}`;
  const along = [0];
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s]!;
    const b = points[s + 1]!;
    along.push(along[s]! + Math.hypot(b.x - a.x, b.z - a.z));
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
    const length = Math.hypot(abx, abz) || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / (length * length)));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const distance = Math.hypot(x - px, z - pz);
    const tx = abx / length;
    const tz = abz / length;
    const left = -(x - px) * tz + (z - pz) * tx >= 0;
    const halfWidth = left
      ? a.halfLeft + (b.halfLeft - a.halfLeft) * t
      : a.halfRight + (b.halfRight - a.halfRight) * t;
    const turn = a.turn + (b.turn - a.turn) * t;
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
