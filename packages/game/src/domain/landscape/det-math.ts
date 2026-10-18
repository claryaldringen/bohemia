import { createRandom } from './random';

// Deterministická matematika pro vrstvy, které počítá server i prohlížeč (vrstva překážek):
// jen operace, které IEEE 754 zaokrouhluje přesně (+ − × ÷ √, floor, round). Math.sin, cos,
// atan2, hypot nebo pow jsou „implementation-approximated“ – různé JS enginy (V8, SpiderMonkey,
// JavaScriptCore) se mohou lišit v posledním bitu a strom by pak v prohlížeči stál jinde než
// na serveru.

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
/** tan(π/8) – nad touto hodnotou se arkustangens počítá přes posun o π/4. */
const TAN_PI_8 = 0.41421356237309503;

/** Vzdálenost bodu (dx, dz) od počátku – √(dx² + dz²) bez Math.hypot. */
export function length2(dx: number, dz: number): number {
  return Math.sqrt(dx * dx + dz * dz);
}

/** Sinus s přesností ≈ 1e-11 (Taylorova řada po redukci do ±π/4). */
export function detSin(angle: number): number {
  const quadrant = Math.round(angle / HALF_PI);
  const r = angle - quadrant * HALF_PI;
  const r2 = r * r;
  const sin =
    r *
    (1 +
      r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800))))));
  const cos =
    1 +
    r2 *
      (-1 / 2 +
        r2 *
          (1 / 24 +
            r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600))))));
  switch (((quadrant % 4) + 4) % 4) {
    case 0:
      return sin;
    case 1:
      return cos;
    case 2:
      return -sin;
    default:
      return -cos;
  }
}

/** Kosinus s přesností ≈ 1e-11. */
export function detCos(angle: number): number {
  return detSin(angle + HALF_PI);
}

/** Arkustangens y / x v (−π, π] s přesností ≈ 1e-10. */
export function detAtan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const steep = ay > ax;
  const t = steep ? ax / ay : ay / ax;
  let u = t;
  let offset = 0;
  if (t > TAN_PI_8) {
    u = (t - 1) / (t + 1);
    offset = Math.PI / 4;
  }
  const u2 = u * u;
  let angle =
    offset +
    u *
      (1 +
        u2 *
          (-1 / 3 +
            u2 *
              (1 / 5 +
                u2 *
                  (-1 / 7 +
                    u2 *
                      (1 / 9 +
                        u2 *
                          (-1 / 11 +
                            u2 *
                              (1 / 13 +
                                u2 * (-1 / 15 + u2 * (1 / 17 + u2 * (-1 / 19 + u2 / 21))))))))));
  if (steep) angle = HALF_PI - angle;
  if (x < 0) angle = Math.PI - angle;
  return y < 0 ? -angle : angle;
}

/** Úhel převedený do [−π, π] (−π a π jsou týž směr – pro stočení toku je to jedno). */
export function wrapAngle(angle: number): number {
  return angle - TWO_PI * Math.round(angle / TWO_PI);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Hash celočíselných souřadnic a pořadí → číslo v [0, 1), promíchaný se seedem vrstvy. Každý
 * rozmisťovač má vlastní seed (`deriveSeed`), takže jejich náhody spolu nesouvisí.
 */
export type ScatterHash = (x: number, y: number, k: number) => number;

export function scatterHash(seed: number): ScatterHash {
  const s = seed | 0;
  return (x, y, k) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647) ^ s;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
}

/** Zdroj náhody pro `createNoise2D` ze seedu (sfc32) – šum je pak deterministický. */
export function noiseRandom(seed: number): () => number {
  const random = createRandom(seed);
  return () => random.next();
}
