import { createNoise2D } from 'simplex-noise';
import { SURFACE_CODES, type Landscape } from './types';

/** Bodů sítě na stranu políčka (≈ 3,75 m) – stejně jako splat mapa terénu. */
const POINTS_PER_TILE = 4;
/** Poloměr krabicového rozmazání masky lesa (body sítě); dva průchody ≈ Gaussovo σ 7,5 m. */
const BLUR_RADIUS = 2;
/** Zvlnění hranice: šum ve dvou měřítkách (m) a jeho síla vůči rozmazané masce 0–1. */
const WAVE_LARGE_M = 32;
const WAVE_SMALL_M = 11;
const WAVE_LARGE = 0.16;
const WAVE_SMALL = 0.07;

/**
 * Hladká hranice lesa – podle ní stojí stromy vrstvy překážek (okraj lesa, impostory, lem)
 * a kreslí se les ve scéně. Herní data políček se nemění. Změna tohoto pole po ostrém spuštění
 * = nová verze vrstvy překážek (stromy by se posunuly).
 */
export interface ForestField {
  /** Bodů na stranu; bod (i, j) leží ve středu buňky sítě přes celou krajinu. */
  resolution: number;
  /** Znaménková vzdálenost od hranice lesa (m): kladná v lese, záporná mimo něj. */
  distance: Float32Array;
  /** Vzdálenost od hranice (m) kdekoli – bilineárně mezi body sítě. */
  distanceAt(worldX: number, worldZ: number): number;
}

/**
 * Pole lesa: maska lesních políček se rozmaže (zaoblí rohy a schody), zvlní šumem a z hranice
 * na úrovni 0,5 se spočítá znaménková vzdálenost. Hranice zůstává do zhruba třetiny políčka
 * od hran políček – herní plocha lesa a vykreslený les se tak téměř kryjí.
 */
export function buildForestField(l: Landscape, options: { remember?: boolean } = {}): ForestField {
  const cached = fieldCache.get(l.surface);
  if (cached) return cached;
  const field = computeForestField(l);
  if (options.remember ?? true) fieldCache.set(l.surface, field);
  return field;
}

/**
 * Mezipaměť podle pole povrchu: pole lesa závisí jen na povrchu políček (a mřížce). Scéna si ho
 * zapamatuje (`remember`, výchozí) a vrstva překážek ho pak jen převezme – i když dostane jiný
 * objekt krajiny se stejným povrchem (`transferPrecision`). Vrstva překážek sama si ho
 * nepamatuje: na serveru by jinak ≈ 1 MB pole lesa žilo s každou krajinou v mezipaměti.
 */
const fieldCache = new WeakMap<Uint8Array, ForestField>();

function computeForestField(l: Landscape): ForestField {
  const n = l.size * POINTS_PER_TILE;
  const extent = l.size * l.cellSizeM;
  const step = extent / n;
  const half = extent / 2;

  let mask: Float32Array = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const tile = Math.floor(j / POINTS_PER_TILE) * l.size + Math.floor(i / POINTS_PER_TILE);
      mask[j * n + i] = l.surface[tile] === SURFACE_CODES.forest ? 1 : 0;
    }
  }
  for (let pass = 0; pass < 2; pass++) mask = boxBlur(boxBlur(mask, n, 1, 0), n, 0, 1);

  const wave = createNoise2D(seededRandom(0x5eed));
  const value = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * step;
      const z = -half + (j + 0.5) * step;
      value[j * n + i] =
        mask[j * n + i]! -
        0.5 +
        WAVE_LARGE * wave(x / WAVE_LARGE_M, z / WAVE_LARGE_M) +
        WAVE_SMALL * wave(x / WAVE_SMALL_M + 40, z / WAVE_SMALL_M - 17);
    }
  }

  const distance = signedDistance(value, n, step);
  const distanceAt = (worldX: number, worldZ: number): number => {
    const fi = Math.min(n - 1, Math.max(0, (worldX + half) / step - 0.5));
    const fj = Math.min(n - 1, Math.max(0, (worldZ + half) / step - 0.5));
    const i0 = Math.min(n - 2, Math.floor(fi));
    const j0 = Math.min(n - 2, Math.floor(fj));
    const ti = fi - i0;
    const tj = fj - j0;
    const d = (i: number, j: number): number => distance[j * n + i]!;
    const top = d(i0, j0) + (d(i0 + 1, j0) - d(i0, j0)) * ti;
    const bottom = d(i0, j0 + 1) + (d(i0 + 1, j0 + 1) - d(i0, j0 + 1)) * ti;
    return top + (bottom - top) * tj;
  };
  return { resolution: n, distance, distanceAt };
}

/** Krabicové rozmazání v jednom směru (dx, dy), okraje se opakují. */
function boxBlur(src: Float32Array, n: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(n * n);
  const width = 2 * BLUR_RADIUS + 1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k++) {
        const ii = Math.min(n - 1, Math.max(0, i + k * dx));
        const jj = Math.min(n - 1, Math.max(0, j + k * dy));
        sum += src[jj * n + ii]!;
      }
      out[j * n + i] = sum / width;
    }
  }
  return out;
}

/**
 * Znaménková vzdálenost (m) od nulové hladiny pole: body u hranice dostanou vzdálenost
 * k průsečíku hladiny se spojnicí k sousedovi (hranice tak není schodovitá po buňkách sítě),
 * dál se šíří chamfer vzdáleností.
 */
function signedDistance(value: Float32Array, n: number, step: number): Float32Array {
  const unsigned = new Float32Array(n * n).fill(Infinity);
  const at = (i: number, j: number): number =>
    value[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))]!;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = at(i, j);
      for (const w of [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)]) {
        if (w > 0 === v > 0) continue;
        // Lineárně mezi body: dvojice na opačných stranách hranice má součet vzdáleností = krok.
        const toCrossing = (Math.abs(v) / (Math.abs(v) + Math.abs(w))) * step;
        unsigned[j * n + i] = Math.min(unsigned[j * n + i]!, toCrossing);
      }
    }
  }

  const diagonal = step * Math.SQRT2;
  const relax = (k: number, i: number, j: number, di: number, dj: number, cost: number): void => {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) return;
    unsigned[k] = Math.min(unsigned[k]!, unsigned[nj * n + ni]! + cost);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      relax(k, i, j, -1, 0, step);
      relax(k, i, j, 0, -1, step);
      relax(k, i, j, -1, -1, diagonal);
      relax(k, i, j, 1, -1, diagonal);
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      relax(k, i, j, 1, 0, step);
      relax(k, i, j, 0, 1, step);
      relax(k, i, j, 1, 1, diagonal);
      relax(k, i, j, -1, 1, diagonal);
    }
  }

  const signed = new Float32Array(n * n);
  for (let k = 0; k < signed.length; k++) {
    // Krajina úplně bez lesa (nebo jen z lesa) nemá hranici – vzdálenost je „nekonečná“.
    const d = Number.isFinite(unsigned[k]!) ? unsigned[k]! : n * step;
    signed[k] = value[k]! > 0 ? d : -d;
  }
  return signed;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
