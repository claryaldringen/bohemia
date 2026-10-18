import type { PathLine } from '@bohemia/game';
import type { SceneRoad } from '../village-view';
import { hash01 } from './smoke-schedule';
import { smoothstep, type DecalGrid } from './village-layout';

// Pás vyšlapané pěšiny jako obtisk na terénu (docs/design/paths.md): po ose pěšiny průřez ze
// čtyř bodů – měkký okraj (krytí 0), vyšlapaný střed, měkký okraj. Šířka a krytí podle síly,
// osa se lehce vlní a šířka trochu kolísá (pěšina není podle pravítka), volné konce (brána,
// pole, břeh) se vytrácejí. Rozcestí (konec aspoň tří čar v jednom bodě) je udusaný plácek –
// nejvyšlapanější místo pěšin (Martin), kruh širší než nejsilnější přicházející pěšina, do kterého
// pásy plynule vbíhají. Výsledek je síť pro createDecalMesh (village-meshes.ts) – výšky, normály
// a UV doplní ta. Čisté funkce, bez Babylonu.

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

/** Upravená cesta (roads.md) – širší udusaný pás (2,6 m), hlína skoro po celé šířce. */
export const IMPROVED_WORN_LAYER: RibbonLayer = {
  width: { weak: 2.6, strong: 2.6 },
  softM: 0.55,
  alpha: () => 0.92,
  widthFactor: 1,
};
export const IMPROVED_EARTH_LAYER: RibbonLayer = {
  width: { weak: 2.6, strong: 2.6 },
  softM: 0.3,
  alpha: () => 0.95,
  widthFactor: 0.8,
};
/** Strouha po straně upravené cesty – úzký tmavý pás bahna. */
export const DITCH_LAYER: RibbonLayer = {
  width: { weak: 0.55, strong: 0.55 },
  softM: 0.18,
  alpha: () => 0.9,
  widthFactor: 1,
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

/** Rozcestí – bod, kde končí aspoň JUNCTION.minLines čar, a síla plácku 0–1. */
export interface RibbonJunction {
  x: number;
  z: number;
  strength: number;
}

/**
 * Plácek rozcestí: od kolika čar je to rozcestí, poloměr jako násobek šířky nejsilnější přicházející
 * pěšiny (průměr plácku je víc než dvojnásobek šířky – pásy do něj vbíhají a nezúží se), kolik ze síly ostatních pěšin se přičte
 * k nejsilnější (rozcestí je nejvyšlapanější – sešlapou ho všechny, s mezí 1), počet úseků obvodu
 * a nepravidelnost okraje (podíl poloměru).
 */
export const JUNCTION = {
  minLines: 3,
  scale: 1.3,
  sumShare: 0.3,
  segments: 20,
  jitter: 0.1,
} as const;

/** Klíč bodu na cm – konce čar v rozcestí sdílejí bod. */
function pointKey(p: { x: number; z: number }): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

/**
 * Rozcestí čar: body, kde končí aspoň JUNCTION.minLines čar (konce se stejným bodem na cm). Síla
 * plácku = nejsilnější přicházející pěšina + JUNCTION.sumShare ze síly ostatních, nejvýš 1.
 * Pořadí podle prvního výskytu – deterministicky.
 */
export function ribbonJunctions(lines: readonly PathLine[]): RibbonJunction[] {
  const nodes = new Map<string, { x: number; z: number; strengths: number[] }>();
  const add = (p: { x: number; z: number }, strength: number): void => {
    const key = pointKey(p);
    const node = nodes.get(key) ?? { x: p.x, z: p.z, strengths: [] };
    node.strengths.push(strength);
    nodes.set(key, node);
  };
  for (const line of lines) {
    if (line.points.length < 2) continue;
    add(line.points[0]!, line.strength[0] ?? 0);
    add(line.points[line.points.length - 1]!, line.strength[line.strength.length - 1] ?? 0);
  }
  const out: RibbonJunction[] = [];
  for (const node of nodes.values()) {
    if (node.strengths.length < JUNCTION.minLines) continue;
    const max = Math.max(...node.strengths);
    const rest = node.strengths.reduce((sum, v) => sum + v, 0) - max;
    out.push({ x: node.x, z: node.z, strength: Math.min(1, max + JUNCTION.sumShare * rest) });
  }
  return out;
}

/**
 * Pás všech pěšin jedné vrstvy jako síť obtisku (pozice x, z po dvojicích, krytí, indexy).
 * `widthAt` – násobek šířky v bodě (přes osetý díl jen úzká stopa), bez něj plná; `alphaAt` –
 * násobek krytí v bodě (pěšina dne se ztrácí v pevné cestě), bez něj plné. `junctions` –
 * plácky rozcestí (bez nich z konců čar – `ribbonJunctions`).
 */
export function pathRibbons(
  lines: readonly PathLine[],
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number = () => 1,
  alphaAt: (x: number, z: number) => number = () => 1,
  junctions: readonly RibbonJunction[] = ribbonJunctions(lines),
): DecalGrid {
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  for (const line of lines) addRibbon(line, layer, widthAt, alphaAt, positions, alphas, indices);
  for (const junction of junctions) {
    addJunction(junction, layer, widthAt, alphaAt, positions, alphas, indices);
  }
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

/**
 * Plácek rozcestí: kruh o poloměru JUNCTION.scale × šířka pěšiny síly plácku (vrstva holé hlíny
 * podle svého podílu šířky – `widthFactor`), uvnitř
 * plné krytí, k okraji měkký přechod (`softM` vrstvy) – okraj lehce nepravidelný (podle polohy,
 * stejný plácek = stejný tvar).
 */
function addJunction(
  junction: RibbonJunction,
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number,
  alphaAt: (x: number, z: number) => number,
  positions: number[],
  alphas: number[],
  indices: number[],
): void {
  const { x, z, strength } = junction;
  const width = layer.width.weak + (layer.width.strong - layer.width.weak) * strength;
  const radius = width * layer.widthFactor * widthAt(x, z) * JUNCTION.scale;
  const alpha = layer.alpha(strength) * alphaAt(x, z);
  if (radius <= 0 || alpha <= 0) return;
  const seed = (Math.round(x * 2) * 73856093) ^ (Math.round(z * 2) * 19349663);
  const center = positions.length / 2;
  positions.push(x, z);
  alphas.push(alpha);
  const n = JUNCTION.segments;
  for (let k = 0; k < n; k++) {
    const angle = (k / n) * Math.PI * 2;
    const r = radius * (1 + (hash01(seed, k, 63) - 0.5) * 2 * JUNCTION.jitter);
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    positions.push(x + cx * r, z + cz * r, x + cx * (r + layer.softM), z + cz * (r + layer.softM));
    alphas.push(alpha, 0);
  }
  for (let k = 0; k < n; k++) {
    const inner = center + 1 + k * 2;
    const next = center + 1 + ((k + 1) % n) * 2;
    indices.push(center, inner, next, inner, inner + 1, next, next, inner + 1, next + 1);
  }
}

// --- pevné cesty (roads.md) ------------------------------------------------------------------

/**
 * Pěšina dne se v pevné cestě ztrácí: do `hidden` m od osy cesty se nekreslí, od `full` m plně
 * (trasy vedou po buňkách sítě – osa pěšiny je od osy cesty až o půl buňky vedle).
 */
const ROAD_FADE_M = { hidden: 1.4, full: 3.2 } as const;

/**
 * Krytí pěšiny dne u pevné cesty: u osy cesty 0, od ROAD_FADE_M.full plné – pěšina, která vede
 * po cestě, se v ní ztratí a objeví se, kde z ní odbočí. Za koncem úseku (za jeho prvním
 * a posledním bodem) se neskrývá – pěšina, která z konce cesty pokračuje, na ni navazuje bez
 * mezery (Martin). Bez cest null (plné všude).
 */
export function roadFade(
  roads: readonly SceneRoad[],
): ((x: number, z: number) => number) | undefined {
  const segments = roads.flatMap((r) =>
    r.points.slice(1).map((b, k) => ({
      a: r.points[k]!,
      b,
      first: k === 0,
      last: k === r.points.length - 2,
    })),
  );
  if (segments.length === 0) return undefined;
  return (x, z) => {
    let best = Infinity;
    for (const { a, b, first, last } of segments) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const raw = l2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / l2 : 0;
      // za koncem úseku pěšina dne pokračuje
      if ((first && raw < 0) || (last && raw > 1)) continue;
      const t = Math.min(1, Math.max(0, raw));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
      if (best <= ROAD_FADE_M.hidden) return 0;
    }
    return Math.min(1, (best - ROAD_FADE_M.hidden) / (ROAD_FADE_M.full - ROAD_FADE_M.hidden));
  };
}
