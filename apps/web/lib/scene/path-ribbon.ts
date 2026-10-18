import type { PathLine } from '@bohemia/game';
import type { SceneRoad } from '../village-view';
import { hash01 } from './smoke-schedule';
import { smoothstep, type DecalGrid } from './village-layout';

// Pás vyšlapané pěšiny jako obtisk na terénu (docs/design/paths.md): po ose pěšiny průřez ze
// čtyř bodů – měkký okraj (krytí 0), vyšlapaný střed, měkký okraj. Šířka a krytí podle síly,
// osa se lehce vlní a šířka trochu kolísá (pěšina není podle pravítka), volné konce (brána,
// pole, břeh) se vytrácejí. Výsledek je síť pro createDecalMesh (village-meshes.ts) – výšky,
// normály a UV doplní ta. Čisté funkce, bez Babylonu.

/** Vrstva pásu: šířka (m) slabé a silné pěšiny, měkký okraj, krytí a od jaké síly se kreslí. */
export interface RibbonLayer {
  width: { weak: number; strong: number };
  softM: number;
  /** Krytí středu podle síly 0–1. */
  alpha(strength: number): number;
  /** Šířka pásu jako násobek šířky pěšiny (jádro holé hlíny je užší). */
  widthFactor: number;
}

/**
 * Prošlapaná tráva – široký měkký pás (0,9–1,9 m podle síly), z výchozí kamery (120 m) má být
 * pěšina čitelná (Martin).
 */
export const WORN_LAYER: RibbonLayer = {
  width: { weak: 0.9, strong: 1.9 },
  softM: 0.6,
  alpha: (s) => (s <= 0 ? 0 : 0.5 + 0.45 * s),
  widthFactor: 1,
};

/** Holá udusaná hlína uprostřed pěšiny – už u středně silné, u silné skoro plná. */
export const EARTH_LAYER: RibbonLayer = {
  width: { weak: 0.9, strong: 1.9 },
  softM: 0.35,
  alpha: (s) => 0.95 * smoothstep(0.2, 0.75, s),
  widthFactor: 0.55,
};

/** Krok průřezů podél osy (m). */
const STEP_M = 0.9;
/** Jak moc se osa vlní do stran (m) a na jakou délku vlny (m). */
const WOBBLE_M = 0.35;
const WOBBLE_WAVE_M = 9;
/** Kolísání šířky (podíl). */
const WIDTH_JITTER = 0.18;
/** Volný konec se vytrácí na takové délce (m); vlnění osy u konců mizí na takové délce. */
const END_FADE_M = 3;
const WOBBLE_FADE_M = 4;

/** Hladký šum 0–1 podél osy (hodnotový šum s plynulým přechodem). */
function noise1(seed: number, t: number): number {
  const k = Math.floor(t);
  const f = t - k;
  const u = f * f * (3 - 2 * f);
  return hash01(seed, k, 61) * (1 - u) + hash01(seed, k + 1, 61) * u;
}

/** Seed pěšiny ze souřadnic jejích konců – stejná pěšina = stejné vlnění. */
function lineSeed(line: PathLine): number {
  const a = line.points[0]!;
  const b = line.points[line.points.length - 1]!;
  return (
    (Math.round(a.x * 2) * 73856093) ^
    (Math.round(a.z * 2) * 19349663) ^
    (Math.round(b.x * 2) * 83492791) ^
    Math.round(b.z * 2)
  );
}

/**
 * Pás všech pěšin jedné vrstvy jako síť obtisku (pozice x, z po dvojicích, krytí, indexy).
 * `widthAt` – násobek šířky v bodě (přes osetý díl jen úzká stopa), bez něj plná; `alphaAt` –
 * násobek krytí v bodě (pěšina dne se ztrácí v pevné cestě), bez něj plné.
 */
export function pathRibbons(
  lines: readonly PathLine[],
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number = () => 1,
  alphaAt: (x: number, z: number) => number = () => 1,
): DecalGrid {
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  for (const line of lines) addRibbon(line, layer, widthAt, alphaAt, positions, alphas, indices);
  return {
    positions: Float32Array.from(positions),
    alphas: Float32Array.from(alphas),
    indices: Uint32Array.from(indices),
  };
}

function addRibbon(
  line: PathLine,
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number,
  alphaAt: (x: number, z: number) => number,
  positions: number[],
  alphas: number[],
  indices: number[],
): void {
  const pts = line.points;
  if (pts.length < 2) return;
  const at = [0];
  for (let k = 1; k < pts.length; k++) {
    at.push(at[k - 1]! + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.z - pts[k - 1]!.z));
  }
  const length = at[at.length - 1]!;
  if (length < 0.5) return;
  const seed = lineSeed(line);
  const steps = Math.max(1, Math.ceil(length / STEP_M));
  let segment = 1;
  let previous = -1;
  for (let k = 0; k <= steps; k++) {
    const d = (k / steps) * length;
    while (segment < pts.length - 1 && at[segment]! < d) segment++;
    const a = pts[segment - 1]!;
    const b = pts[segment]!;
    const span = Math.max(1e-6, at[segment]! - at[segment - 1]!);
    const u = Math.min(1, Math.max(0, (d - at[segment - 1]!) / span));
    const strength =
      line.strength[segment - 1]! + (line.strength[segment]! - line.strength[segment - 1]!) * u;
    // směr osy: průměr sousedních úseků v bodech zlomu (pás se v ohybu nezkroutí)
    let tx = (b.x - a.x) / span;
    let tz = (b.z - a.z) / span;
    if (u === 1 && segment < pts.length - 1) {
      const c = pts[segment + 1]!;
      const l = Math.max(1e-6, Math.hypot(c.x - b.x, c.z - b.z));
      tx += (c.x - b.x) / l;
      tz += (c.z - b.z) / l;
      const n = Math.max(1e-6, Math.hypot(tx, tz));
      tx /= n;
      tz /= n;
    }
    const nx = -tz;
    const nz = tx;
    const ends = smoothstep(0, WOBBLE_FADE_M, d) * smoothstep(0, WOBBLE_FADE_M, length - d);
    const wobble = (noise1(seed, d / WOBBLE_WAVE_M) - 0.5) * 2 * WOBBLE_M * ends;
    const cx = a.x + (b.x - a.x) * u + nx * wobble;
    const cz = a.z + (b.z - a.z) * u + nz * wobble;
    const width = layer.width.weak + (layer.width.strong - layer.width.weak) * strength;
    const half =
      (width / 2) *
      layer.widthFactor *
      widthAt(cx, cz) *
      (1 + (noise1(seed + 17, d / (WOBBLE_WAVE_M * 0.6)) - 0.5) * 2 * WIDTH_JITTER);
    const fadeStart = line.openStart ? smoothstep(0, END_FADE_M, d) : 1;
    const fadeEnd = line.openEnd ? smoothstep(0, END_FADE_M, length - d) : 1;
    const alpha = layer.alpha(strength) * fadeStart * fadeEnd * alphaAt(cx, cz);
    const offsets = [-(half + layer.softM), -half * 0.35, half * 0.35, half + layer.softM];
    const base = positions.length / 2;
    for (let i = 0; i < 4; i++) {
      positions.push(cx + nx * offsets[i]!, cz + nz * offsets[i]!);
      alphas.push(i === 0 || i === 3 ? 0 : alpha);
    }
    if (previous >= 0) {
      for (let i = 0; i < 3; i++) {
        const p = previous + i;
        const q = base + i;
        indices.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
    previous = base;
  }
}

// --- pevné cesty (roads.md) ------------------------------------------------------------------

/**
 * Pěšina dne se v pevné cestě ztrácí: do `hidden` m od osy cesty se nekreslí, od `full` m plně
 * (trasy vedou po buňkách sítě – osa pěšiny je od osy cesty až o půl buňky vedle).
 */
const ROAD_FADE_M = { hidden: 1.4, full: 3.2 } as const;
/** Pevná cesta (vyšlapaná) se kreslí jako plně vyšlapaná pěšina (síla 0–1). */
const ROAD_STRENGTH = 1;
/** Konec pevné cesty, u kterého nekončí jiná cesta, se vytrácí (volný konec – brána, pole). */
const ROAD_JOIN_M = 0.5;

/** Pevné cesty jako pěšiny pro obtisk: plně vyšlapané, volný konec se vytrácí. */
export function roadLines(roads: readonly SceneRoad[]): PathLine[] {
  const ends = roads.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]);
  const joined = (p: { x: number; z: number } | undefined, own: number): boolean =>
    p !== undefined &&
    ends.some(
      (q, i) =>
        Math.floor(i / 2) !== own &&
        q !== undefined &&
        Math.hypot(q.x - p.x, q.z - p.z) <= ROAD_JOIN_M,
    );
  // napojení doprostřed jiné cesty se v datech vždy rozdělí – stačí porovnat konce
  return roads
    .filter((r) => r.points.length >= 2)
    .map((r) => {
      const k = roads.indexOf(r);
      return {
        points: r.points,
        strength: r.points.map(() => ROAD_STRENGTH),
        years: r.points.map(() => 0),
        openStart: !joined(r.points[0], k),
        openEnd: !joined(r.points[r.points.length - 1], k),
      };
    });
}

/**
 * Krytí pěšiny dne u pevné cesty: u osy cesty 0, od ROAD_FADE_M.full plné – pěšina, která vede
 * po cestě, se v ní ztratí a objeví se, kde z ní odbočí. Bez cest null (plné všude).
 */
export function roadFade(
  roads: readonly SceneRoad[],
): ((x: number, z: number) => number) | undefined {
  const segments = roads.flatMap((r) =>
    r.points.slice(1).map((b, k) => [r.points[k]!, b] as const),
  );
  if (segments.length === 0) return undefined;
  return (x, z) => {
    let best = Infinity;
    for (const [a, b] of segments) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
      if (best <= ROAD_FADE_M.hidden) return 0;
    }
    return Math.min(1, (best - ROAD_FADE_M.hidden) / (ROAD_FADE_M.full - ROAD_FADE_M.hidden));
  };
}
