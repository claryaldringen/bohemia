import type { Landscape } from '@bohemia/game';
import {
  BANK_REACH_M,
  nearestWaterPair,
  riverCenterline,
  streamCenterline,
  watersCenterline,
  type StreamCenterline,
  type StreamSample,
} from './stream-geometry';
import { tileCenter } from './tile-at';

/** Body sítě na stranu políčka – terén je ve scéně hladší a koryto může být užší než políčko. */
export const RENDER_SUBDIVISION = 4;
/** Nejhlubší místo koryta pod hladinou (m): běžný úsek, tůň a mělčina (brod). */
const CHANNEL_DEPTH_M = 1;
/**
 * Koryto řeky prémiových krajin (premium-landscapes.md – splavná řeka „širší, hlubší“): hlubší
 * než potok – tmavší hladina uprostřed, brod zůstává mělký (SHALLOW_DEPTH_M).
 */
const RIVER_DEPTH_M = 2;
const POOL_DEPTH_M = 2.2;
const SHALLOW_DEPTH_M = 0.35;
/**
 * Břeh: nejdřív sotva nad hladinou, pak stoupá nejvýš tímto sklonem (m/m), než naváže na terén.
 * Na vnitřní straně oblouku pozvolný náplav, na vnější strmější nárazový břeh.
 */
const BANK_MIN_SLOPE = { inner: 0.012, outer: 0.05 };
/** Kde (m od okraje vody) úprava břehu začíná dozívat a kde už platí jen původní terén. */
const BANK_FADE_M = { from: 6, to: 18 };
/**
 * Šíje meandru: souš mezi dvěma úseky toku užší než tolik metrů (součet vzdáleností od obou
 * okrajů vody) se srovná do plynulé rampy mezi jejich hladinami – data po políčkách tam mívají
 * sráz. Plně do NECK_WIDTH_M.from, pak dozní; jen při rozdílu hladin od NECK_DROP_M.
 */
const NECK_WIDTH_M = { from: 30, to: 45 };
const NECK_DROP_M = { from: 0.3, to: 1 };
/**
 * Břeh se nad původní terén zvedne nejvýš o tolik metrů (hloubka vody v datech). Kde údolí
 * sousedního, níž položeného úseku podřízlo terén, by jinak vznikla hráz a za ní sráz.
 */
const MAX_BANK_RAISE_M = 0.6;
const BANK_MAX_SLOPE = { inner: 0.06, outer: 0.22 };
/**
 * Strmý břeh a skalní stěna (terén 2 – výška stěny `StreamSample.bank`): od okraje vody suťový
 * svah (`apronShare` šířky čela, do `apronRise` výšky), nad ním čelo stěny – šířka `faceShare` ×
 * výška (m, mezi `face.min` a `face.max`); na vnitřní straně oblouku (svah ostrožny) až
 * `innerWiden` × širší, tedy mírnější. Nahoře drží výšku stěny `holdM` metrů a do `fadeM` naváže
 * na terén. Nízký břeh (pod `fullFromM`) se prolne s běžným.
 */
const CLIFF = {
  faceShare: 0.8,
  face: { min: 1.5, max: 9 },
  apronShare: 0.3,
  apronRise: 0.2,
  innerWiden: 2,
  holdM: 6,
  fadeM: 10,
  fullFromM: 1.5,
} as const;

/** Výšková síť pro vykreslení (jen vzhled – herní data krajiny se nemění). */
export interface RenderSurface {
  /** Počet bodů na stranu: (políčka − 1) × RENDER_SUBDIVISION + 1, od středu krajního políčka. */
  resolution: number;
  /** Výška terénu v bodě (m, bez převýšení). */
  heights: Float32Array;
  /** Hladina potoka (či řeky) v bodě (m), nebo −Infinity daleko od vody. */
  waterLevel: Float32Array;
  /**
   * Dotazy „co je tady za vodu“ – potok i řeka (`watersCenterline`), `points` jsou body osy
   * potoka. Krajina bez řeky = osa potoka.
   */
  stream: StreamCenterline;
  /** Osa řeky prémiové krajiny (stanice podél řeky – rákos, ryby, zvuk), jinak null. */
  river: StreamCenterline | null;
  /** Světové souřadnice bodu sítě. */
  position(v: number): { x: number; z: number };
  /** Výška terénu (m) kdekoli – bilineárně mezi body sítě. */
  heightAt(x: number, z: number): number;
}

export function buildRenderSurface(l: Landscape): RenderSurface {
  const resolution = (l.size - 1) * RENDER_SUBDIVISION + 1;
  const step = l.cellSizeM / RENDER_SUBDIVISION;
  const origin = tileCenter(l, 0, 0);
  const course = streamCenterline(l);
  const river = riverCenterline(l);
  const heights = new Float32Array(resolution * resolution);
  const waterLevel = new Float32Array(resolution * resolution).fill(-Infinity);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const v = j * resolution + i;
      const base = bicubicHeight(l, i / RENDER_SUBDIVISION, j / RENDER_SUBDIVISION);
      const x = origin.worldX + i * step;
      const z = origin.worldZ + j * step;
      // potok i řeka (bez řeky přesně osa potoka); u řeky hlubší koryto
      const { near, other, second } = nearestWaterPair(course, river, x, z, BANK_REACH_M);
      if (!Number.isFinite(near.distance)) {
        heights[v] = base;
        continue;
      }
      waterLevel[v] = near.level;
      heights[v] = blendBanks(base, near, other, second ? RIVER_DEPTH_M : CHANNEL_DEPTH_M);
    }
  }
  const stream = watersCenterline(l);

  const position = (v: number): { x: number; z: number } => ({
    x: origin.worldX + (v % resolution) * step,
    z: origin.worldZ + Math.floor(v / resolution) * step,
  });
  const heightAt = (x: number, z: number): number => {
    const fi = Math.min(resolution - 1, Math.max(0, (x - origin.worldX) / step));
    const fj = Math.min(resolution - 1, Math.max(0, (z - origin.worldZ) / step));
    const i0 = Math.min(resolution - 2, Math.floor(fi));
    const j0 = Math.min(resolution - 2, Math.floor(fj));
    const ti = fi - i0;
    const tj = fj - j0;
    const h = (i: number, j: number): number => heights[j * resolution + i]!;
    const top = h(i0, j0) + (h(i0 + 1, j0) - h(i0, j0)) * ti;
    const bottom = h(i0, j0 + 1) + (h(i0 + 1, j0 + 1) - h(i0, j0 + 1)) * ti;
    return top + (bottom - top) * tj;
  };
  return { resolution, heights, waterLevel, stream, river, position, heightAt };
}

/**
 * Profil koryta (podle 0 A.D. – dno, náběh břehu „fadeDist“): uvnitř dno pod hladinou, tůně
 * hlubší, mělčiny mělké; v oblouku je vnitřní strana mělčí (náplav) a vnější hlubší. Na břehu
 * terén mezi „sotva nad hladinou“ a „mírný svah“ – zasype schodovité zbytky koryta z mřížky
 * políček a nevytvoří útes.
 */
function channelHeight(base: number, near: StreamSample, channelDepth: number): number {
  const inner = Math.max(0, near.innerBend);
  const outer = Math.max(0, -near.innerBend);
  if (near.bankDistance < 0) {
    const t = Math.min(1, near.distance / Math.max(near.halfWidth, 0.5));
    let depth = channelDepth + (POOL_DEPTH_M - channelDepth) * near.pool;
    depth += (SHALLOW_DEPTH_M - depth) * near.shallow;
    // Náplav: dno k vnitřnímu břehu stoupá dřív; nárazový břeh: hloubka drží až ke kraji.
    // Menší exponent = dno stoupá ke břehu dřív (mělčí), větší = koryto hluboké až ke kraji.
    const profile = 1 - Math.pow(t, 2 - inner + 1.5 * outer);
    return near.level - depth * profile * (1 - 0.45 * inner * t) * (1 + 0.25 * outer);
  }
  const beyond = near.bankDistance;
  const minSlope =
    BANK_MIN_SLOPE.inner + (BANK_MIN_SLOPE.outer - BANK_MIN_SLOPE.inner) * (1 - inner);
  const maxSlope =
    BANK_MAX_SLOPE.inner + (BANK_MAX_SLOPE.outer - BANK_MAX_SLOPE.inner) * (1 - inner);
  const lowest = Math.min(near.level + 0.15 + beyond * minSlope, base + MAX_BANK_RAISE_M);
  const highest = near.level + 0.3 + beyond * maxSlope;
  const bank = Math.min(Math.max(base, lowest), highest);
  // Úprava břehu jen kousek od vody (údolí už vyhladil generátor), dál plynule dozní do
  // původního terénu. Kde se meandr vrací k sobě, úseky s různou hladinou tak nevytvoří schod.
  const fade = smoothstep(BANK_FADE_M.from, BANK_FADE_M.to, beyond);
  const usual = bank + (base - bank) * fade;
  return near.bank > 0 ? cliffBank(usual, base, near) : usual;
}

/** Šířka čela stěny (m) od okraje vody podle její výšky – podle ní i textura skály. */
export function cliffFaceM(height: number, innerBend = 0): number {
  const face = Math.min(CLIFF.face.max, Math.max(CLIFF.face.min, CLIFF.faceShare * height));
  return face * (1 + CLIFF.innerWiden * Math.max(0, innerBend));
}

/** Šířka suťového svahu pod čelem stěny (m od okraje vody). */
export function cliffApronM(height: number, innerBend = 0): number {
  return cliffFaceM(height, innerBend) * CLIFF.apronShare;
}

/** Podíl výšky stěny 0–1 ve vzdálenosti `beyond` (m) od okraje vody: suť, čelo, horní hrana. */
export function cliffProfile(beyond: number, face: number): number {
  const apron = face * CLIFF.apronShare;
  if (beyond <= 0) return 0;
  if (beyond < apron) return (CLIFF.apronRise * beyond) / apron;
  return CLIFF.apronRise + (1 - CLIFF.apronRise) * smoothstep(apron, face, beyond);
}

/**
 * Strmý nárazový břeh nebo skalní stěna nad okrajem vody (terén 2): čelo začíná přesně na okraji
 * vody (do koryta nezasáhne), nahoře plynule naváže na terén krajiny, který stěnu nese.
 */
function cliffBank(usual: number, base: number, near: StreamSample): number {
  const height = near.bank;
  const beyond = near.bankDistance;
  const face = cliffFaceM(height, near.innerBend);
  const wall = near.level + 0.15 + (height - 0.15) * cliffProfile(beyond, face);
  const top = Math.max(wall, base);
  const release = smoothstep(face + CLIFF.holdM, face + CLIFF.holdM + CLIFF.fadeM, beyond);
  const cliff = top + (base - top) * release;
  return usual + (cliff - usual) * smoothstep(0.3, CLIFF.fullFromM, height);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Výška u vody s ohledem na druhou část toku: v šíji meandru se úpravy obou břehů prolnou podle
 * vzdálenosti od vody. Váha úseku plynule klesá tam, kde jeho úprava stejně dozní, takže
 * přepnutí „nejbližšího úseku“ nevytvoří schod. Ve vodě rozhoduje jen vlastní koryto.
 */
function blendBanks(
  base: number,
  near: StreamSample,
  other: StreamSample,
  channelDepth: number,
): number {
  const own = channelHeight(base, near, channelDepth);
  if (near.bankDistance < 0 || !Number.isFinite(other.distance)) return own;
  const weight = (sample: StreamSample): number =>
    (1 - smoothstep(BANK_FADE_M.from, BANK_FADE_M.to, sample.bankDistance)) /
    (Math.max(sample.bankDistance, 0) + 2) ** 2;
  const w1 = weight(near);
  const w2 = weight(other);
  // na břehu hloubka koryta nehraje roli – druhé místo stejnou hloubkou
  const banks =
    w1 + w2 > 0 ? (own * w1 + channelHeight(base, other, channelDepth) * w2) / (w1 + w2) : own;
  // Rampa přes šíji: od hladiny u jednoho okraje k hladině u druhého, kousek nad vodou.
  const d1 = Math.max(near.bankDistance, 0);
  const d2 = Math.max(other.bankDistance, 0);
  const neck =
    (1 - smoothstep(NECK_WIDTH_M.from, NECK_WIDTH_M.to, d1 + d2)) *
    smoothstep(NECK_DROP_M.from, NECK_DROP_M.to, Math.abs(near.level - other.level));
  if (neck <= 0) return banks;
  const t = d1 + d2 > 0 ? d1 / (d1 + d2) : 0;
  const ramp = near.level + (other.level - near.level) * smoothstep(0, 1, t) + 0.25;
  return banks + (ramp - banks) * neck;
}

/** Catmull-Rom interpolace výšek středů políček – hladká a ve středech políček přesná. */
function bicubicHeight(l: Landscape, u: number, v: number): number {
  const x1 = Math.floor(u);
  const y1 = Math.floor(v);
  const tx = u - x1;
  const ty = v - y1;
  const h = (x: number, y: number): number => {
    const cx = Math.min(l.size - 1, Math.max(0, x));
    const cy = Math.min(l.size - 1, Math.max(0, y));
    return l.heights[cy * l.size + cx]!;
  };
  const row = (y: number): number =>
    catmullRom(h(x1 - 1, y), h(x1, y), h(x1 + 1, y), h(x1 + 2, y), tx);
  return catmullRom(row(y1 - 1), row(y1), row(y1 + 1), row(y1 + 2), ty);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
