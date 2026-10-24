import { ROAD_LAND, type PathLine } from '@bohemia/game';
import type { SceneRoad } from '../village-view';
import type { Track, TrackDisc, TrackSegment } from './track-mask';
import { hash01 } from './smoke-schedule';
import { smoothstep, type DecalGrid } from './village-layout';

// Pás vyšlapané pěšiny jako obtisk na terénu (docs/design/paths.md): po ose pěšiny průřez ze
// čtyř bodů – měkký okraj (krytí 0), vyšlapaný střed, měkký okraj. Šířka a krytí podle síly,
// osa se lehce vlní a šířka trochu kolísá (pěšina není podle pravítka), volné konce (brána,
// pole, břeh) se vytrácejí. Rozcestí (konec aspoň tří čar v jednom bodě) je udusaný plácek –
// nejvyšlapanější místo pěšin (Martin), kruh širší než nejsilnější přicházející pěšina, do kterého
// pásy plynule vbíhají. Výsledek je síť pro createDecalMesh (village-meshes.ts) – výšky, normály
// a UV doplní ta. Čisté funkce, bez Babylonu.
//
// Vrstvy (Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná. Vyšlapanou cestu nechme jako teď
// a upravená cesta ať je prostě jenom širší“): pěšina dne je slabě prošlapaná tráva (PATH_*),
// pevná vyšlapaná cesta plný pás jako dřív silná pěšina (ROAD_*), upravená cesta tytéž obtisky,
// jen širší (IMPROVED_* – ROAD_WIDTH_M).

/** Vrstva pásu: šířka (m) slabé a silné pěšiny, měkký okraj, krytí a od jaké síly se kreslí. */
export interface RibbonLayer {
  width: { weak: number; strong: number };
  softM: number;
  /** Krytí středu podle síly 0–1. */
  alpha(strength: number): number;
  /** Šířka pásu jako násobek šířky pěšiny (jádro holé hlíny je užší). */
  widthFactor: number;
  /**
   * Plácek rozcestí: poloměr jako násobek šířky (bez údaje JUNCTION.scale) a násobek krytí (bez
   * údaje 1) – u pěšin dne jen jemně.
   */
  junction?: { scale: number; alpha: number };
  /** Jak moc se osa vlní do stran (m) – bez údaje WOBBLE_M (koleje vozové cesty se nevlní). */
  wobble?: number;
}

/**
 * Pěšina dne – slabě prošlapaná tráva (Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná“):
 * úzký průhledný pás 0,6–1,2 m podle síly, krytí 0,2–0,45 (dřív 0,5–0,95) – pevná cesta vedle ní
 * je jasně výraznější (krytí 0,95, šířka 1,9 m).
 */
export const PATH_WORN_LAYER: RibbonLayer = {
  width: { weak: 0.6, strong: 1.2 },
  softM: 0.45,
  alpha: (s) => (s <= 0 ? 0 : 0.2 + 0.25 * s),
  widthFactor: 1,
  junction: { scale: 1, alpha: 0.85 },
};

/** Holá hlína pěšiny dne – jen u silné pěšiny, úzká (do 0,35 m) a slabá. */
export const PATH_EARTH_LAYER: RibbonLayer = {
  width: { weak: 0.6, strong: 1.2 },
  softM: 0.2,
  alpha: (s) => 0.35 * smoothstep(0.45, 1, s),
  widthFactor: 0.3,
  junction: { scale: 1, alpha: 0.7 },
};

/**
 * Šířka pevné cesty (m): vyšlapaná jako dřív silná pěšina, upravená širší – vozová cesta ≈ 3 m
 * (Martin, 19. 10. 2026: „upravená cesta ať je prostě jenom širší“; šířka návrh Clauda –
 * o 60 % víc, z herní kamery jasně širší). Podle ní i délka kmenů hatě a vytyčení úpravy
 * (road-works-layout.ts).
 */
export const ROAD_WIDTH_M = {
  trodden: ROAD_LAND.widthM.trodden,
  improved: ROAD_LAND.widthM.improved,
  cart: ROAD_LAND.widthM.cart,
  wagon: ROAD_LAND.widthM.wagon,
} as const;

/**
 * Vyšlapaná pevná cesta – plně prošlapaná tráva (krytí 0,95), jako dřív nejsilnější pěšina; kreslí
 * se se silou 1 (vzhled se nemění – Martin: „Vyšlapanou cestu nechme jako teď“).
 */
export const ROAD_WORN_LAYER: RibbonLayer = {
  width: { weak: 0.9, strong: ROAD_WIDTH_M.trodden },
  softM: 0.6,
  alpha: (s) => (s <= 0 ? 0 : 0.5 + 0.45 * s),
  widthFactor: 1,
};

/** Holá udusaná hlína uprostřed pevné cesty (krytí 0,95, 55 % šířky). */
export const ROAD_EARTH_LAYER: RibbonLayer = {
  width: { weak: 0.9, strong: ROAD_WIDTH_M.trodden },
  softM: 0.35,
  alpha: (s) => 0.95 * smoothstep(0.2, 0.75, s),
  widthFactor: 0.55,
};

/** Upravená cesta (roads.md) – tytéž obtisky jako vyšlapaná, jen širší (ROAD_WIDTH_M). */
export const IMPROVED_WORN_LAYER: RibbonLayer = {
  ...ROAD_WORN_LAYER,
  width: { weak: ROAD_WIDTH_M.improved, strong: ROAD_WIDTH_M.improved },
};
export const IMPROVED_EARTH_LAYER: RibbonLayer = {
  ...ROAD_EARTH_LAYER,
  width: { weak: ROAD_WIDTH_M.improved, strong: ROAD_WIDTH_M.improved },
};

/**
 * Vozová cesta (wagons.md – Vyjeté cesty, návrh Clauda): širší prošlapaný pás (2,6 m – vůz je
 * široký ≈ 2,5 m) bez holé hlíny uprostřed – tráva mezi kolejemi.
 */
export const CART_WORN_LAYER: RibbonLayer = {
  ...ROAD_WORN_LAYER,
  width: { weak: ROAD_WIDTH_M.cart, strong: ROAD_WIDTH_M.cart },
};
/** Dvě koleje vozové cesty – úzké pásy holé hlíny po CART_RUT_OFFSET_M od osy, nevlní se. */
export const CART_RUT_LAYER: RibbonLayer = {
  width: { weak: 0.42, strong: 0.42 },
  softM: 0.15,
  alpha: (s) => (s <= 0 ? 0 : 0.92),
  widthFactor: 1,
  wobble: 0,
};
/** Koleje jsou od osy cesty tolik (m) – rozchod vozu ≈ 1,3 m. */
export const CART_RUT_OFFSET_M = 0.65;

/**
 * Vozová cesta (roads.md – Vozová cesta; Martin, 20. 10. 2026: „bude mít vyježděné, ale zpevněné
 * koleje“; návrh Clauda): pás 3,5 m – po krajích prošlapaná tráva, uprostřed udusaná hlína,
 * v kolejích štěrk a kameny (textura štěrku z 0 A.D.) – nevlní se, je stavěná.
 */
export const WAGON_WORN_LAYER: RibbonLayer = {
  ...ROAD_WORN_LAYER,
  width: { weak: ROAD_WIDTH_M.wagon, strong: ROAD_WIDTH_M.wagon },
  wobble: 0.08,
};
export const WAGON_EARTH_LAYER: RibbonLayer = {
  ...ROAD_EARTH_LAYER,
  width: { weak: ROAD_WIDTH_M.wagon, strong: ROAD_WIDTH_M.wagon },
  widthFactor: 0.72,
  wobble: 0.04,
};
/** Zpevněné koleje vozové cesty – štěrk a kameny po CART_RUT_OFFSET_M od osy. */
export const WAGON_GRAVEL_LAYER: RibbonLayer = {
  width: { weak: 0.55, strong: 0.55 },
  softM: 0.12,
  alpha: (s) => (s <= 0 ? 0 : 0.97),
  widthFactor: 1,
  wobble: 0,
};
/**
 * Štěrk plácku křižovatky vozových cest: ramena přes obě koleje (2 × CART_RUT_OFFSET_M + šířka
 * koleje), jinak by plácek byl jen holá světlá hlína bez štěrku jako navazující pásy.
 */
export const WAGON_GRAVEL_JUNCTION_LAYER: RibbonLayer = {
  ...WAGON_GRAVEL_LAYER,
  width: { weak: 2 * CART_RUT_OFFSET_M + 0.55, strong: 2 * CART_RUT_OFFSET_M + 0.55 },
  softM: 0.3,
  junction: { scale: 1, alpha: 0.75 },
};

/**
 * Čára pásu – pěšina z jádra, u pevné cesty navíc zúžení konců (roads.md – Cesta pro hráče;
 * Martin: navazující úseky různého stupně jsou jedna cesta): kde na pás navazuje užší pás jiného
 * stupně, zúží se na NARROW_M k jeho šířce (`narrowStart` / `narrowEnd` – poměr šířek 0–1) –
 * přechod bez schodu.
 */
export type RibbonLine = PathLine & { narrowStart?: number; narrowEnd?: number };

/** Na jaké délce se pás zúží k navazujícímu užšímu pásu (m). */
export const NARROW_M = 6;

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
  /**
   * Obrys křižovatky pevných cest (junction-shape.ts) – mnohoúhelník kolem středu místo kruhu;
   * `widthM` je šířka jeho ramen, podle ní se obrys pro vrstvu užší (holá hlína) zmenší.
   */
  outline?: readonly { x: number; z: number }[];
  widthM?: number;
  /**
   * Obrys pro užší vrstvu (šířka ramen v m): ramena užší, ale vchody na stejném místě – holá
   * hlína plácku navazuje na hlínu pásů cest ve vchodech (bez něj se obrys zmenší od středu).
   */
  outlineFor?: (widthM: number) => readonly { x: number; z: number }[];
}

/** Poměr, kterým vrstva zmenší obrys křižovatky: šířka vrstvy ku šířce ramen (nejvýš 1,2). */
function outlineScale(junction: RibbonJunction, layer: RibbonLayer): number {
  const width = layer.width.strong * layer.widthFactor;
  return Math.min(1.2, width / Math.max(0.1, junction.widthM ?? width));
}

/** Obrys křižovatky vrstvy: zmenšený (zvětšený) od středu. */
function layerOutline(
  junction: RibbonJunction,
  layer: RibbonLayer,
): readonly { x: number; z: number }[] {
  const s = outlineScale(junction, layer);
  if (junction.outlineFor && junction.widthM !== undefined) {
    return Math.abs(s - 1) < 1e-6
      ? (junction.outline ?? [])
      : junction.outlineFor(junction.widthM * s);
  }
  return (junction.outline ?? []).map((p) => ({
    x: junction.x + (p.x - junction.x) * s,
    z: junction.z + (p.z - junction.z) * s,
  }));
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
  lines: readonly RibbonLine[],
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

/**
 * Průřez pásu v bodě osy: střed (s vlněním osy), kolmice, poloviční šířka (s kolísáním a `widthAt`),
 * síla pěšiny a vytrácení – volné konce (`fadeStart`, `fadeEnd`) a `alphaAt` v bodě.
 */
export interface RibbonSection {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
  half: number;
  strength: number;
  fadeStart: number;
  fadeEnd: number;
  alphaAt: number;
}

/**
 * Průřezy pásu pěšiny po ose (krok STEP_M) – stejné body jako obtisk (`pathRibbons`) i maska polí
 * pod cestou (`ribbonTrack`). Krátká čára (pod 0,5 m) průřezy nemá.
 */
export function ribbonSections(
  line: RibbonLine,
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number,
  alphaAt: (x: number, z: number) => number,
): RibbonSection[] {
  const pts = line.points;
  if (pts.length < 2) return [];
  const at = [0];
  for (let k = 1; k < pts.length; k++) {
    at.push(at[k - 1]! + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.z - pts[k - 1]!.z));
  }
  const length = at[at.length - 1]!;
  if (length < 0.5) return [];
  const seed = lineSeed(line);
  const steps = Math.max(1, Math.ceil(length / STEP_M));
  const sections: RibbonSection[] = [];
  let segment = 1;
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
    const wobble = (noise1(seed, d / WOBBLE_WAVE_M) - 0.5) * 2 * (layer.wobble ?? WOBBLE_M) * ends;
    const cx = a.x + (b.x - a.x) * u + nx * wobble;
    const cz = a.z + (b.z - a.z) * u + nz * wobble;
    const width = layer.width.weak + (layer.width.strong - layer.width.weak) * strength;
    // zúžení k navazujícímu užšímu pásu (jiný stupeň cesty)
    const narrow = Math.min(
      line.narrowStart === undefined
        ? 1
        : line.narrowStart + (1 - line.narrowStart) * smoothstep(0, NARROW_M, d),
      line.narrowEnd === undefined
        ? 1
        : line.narrowEnd + (1 - line.narrowEnd) * smoothstep(0, NARROW_M, length - d),
    );
    const half =
      (width / 2) *
      layer.widthFactor *
      narrow *
      widthAt(cx, cz) *
      (1 + (noise1(seed + 17, d / (WOBBLE_WAVE_M * 0.6)) - 0.5) * 2 * WIDTH_JITTER);
    sections.push({
      cx,
      cz,
      nx,
      nz,
      half,
      strength,
      fadeStart: line.openStart ? smoothstep(0, END_FADE_M, d) : 1,
      fadeEnd: line.openEnd ? smoothstep(0, END_FADE_M, length - d) : 1,
      alphaAt: alphaAt(cx, cz),
    });
  }
  return sections;
}

function addRibbon(
  line: RibbonLine,
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number,
  alphaAt: (x: number, z: number) => number,
  positions: number[],
  alphas: number[],
  indices: number[],
): void {
  let previous = -1;
  for (const s of ribbonSections(line, layer, widthAt, alphaAt)) {
    const { cx, cz, nx, nz, half } = s;
    const alpha = layer.alpha(s.strength) * s.fadeStart * s.fadeEnd * s.alphaAt;
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

/** Pás pěšin dne (z tras) – bez kruhových plácků v rozcestí (roads-v2 plán, Úloha 4a). */
export function dayPathRibbons(
  lines: readonly RibbonLine[],
  layer: RibbonLayer,
  widthAt?: (x: number, z: number) => number,
  alphaAt?: (x: number, z: number) => number,
): DecalGrid {
  return pathRibbons(lines, layer, widthAt, alphaAt, []);
}

/** Maska polí pod pěšinami dne – bez plácků (viz `dayPathRibbons`). */
export function dayPathTrack(
  lines: readonly RibbonLine[],
  layer: RibbonLayer,
  widthAt?: (x: number, z: number) => number,
  alphaAt?: (x: number, z: number) => number,
): Track {
  return ribbonTrack(lines, layer, widthAt, alphaAt, []);
}

/**
 * Pás pěšin či cest pro masku polí (fields.md – Co hráč vidí, Martin 19. 10. 2026: „Tam, kde je
 * cesta, prostě obilí neroste.“): úsečky mezi průřezy pásu (`ribbonSections` – stejné vlnění
 * a šířka jako obtisk) a kruhy plácků rozcestí, každý s hloubkou masky 0–1 (vytrácení volných
 * konců a `alphaAt`; pěšina bez síly 0). Čáry v pořadí, kus nese index své čáry (`line`, plácky
 * za čarami).
 */
export function ribbonTrack(
  lines: readonly RibbonLine[],
  layer: RibbonLayer,
  widthAt: (x: number, z: number) => number = () => 1,
  alphaAt: (x: number, z: number) => number = () => 1,
  junctions: readonly RibbonJunction[] = ribbonJunctions(lines),
): Track {
  const segments: TrackSegment[] = [];
  lines.forEach((line, index) => {
    const sections = ribbonSections(line, layer, widthAt, alphaAt);
    const depth = (s: RibbonSection): number =>
      layer.alpha(s.strength) > 0 ? s.fadeStart * s.fadeEnd * s.alphaAt : 0;
    for (let k = 1; k < sections.length; k++) {
      const a = sections[k - 1]!;
      const b = sections[k]!;
      segments.push({
        line: index,
        ax: a.cx,
        az: a.cz,
        bx: b.cx,
        bz: b.cz,
        halfA: a.half,
        halfB: b.half,
        depthA: depth(a),
        depthB: depth(b),
      });
    }
  });
  const discs = junctions.flatMap((junction, k): TrackDisc[] => {
    const { x, z, strength } = junction;
    if (junction.outline && junction.outline.length > 0) {
      // maska polí je kruh o poloměru obrysu (průměr vzdáleností rohů od středu)
      const ring = layerOutline(junction, layer);
      const radius = ring.reduce((sum, p) => sum + Math.hypot(p.x - x, p.z - z), 0) / ring.length;
      const depth = layer.alpha(strength) > 0 ? alphaAt(x, z) : 0;
      return radius > 0 && depth > 0 ? [{ line: lines.length + k, x, z, radius, depth }] : [];
    }
    const width = layer.width.weak + (layer.width.strong - layer.width.weak) * strength;
    const radius =
      width * layer.widthFactor * widthAt(x, z) * (layer.junction?.scale ?? JUNCTION.scale);
    const depth = layer.alpha(strength) > 0 ? alphaAt(x, z) : 0;
    return radius > 0 && depth > 0 ? [{ line: lines.length + k, x, z, radius, depth }] : [];
  });
  return { segments, discs };
}

/**
 * Plácek rozcestí: kruh o poloměru JUNCTION.scale (u vrstvy s `junction` její `scale`) × šířka
 * pěšiny síly plácku (vrstva holé hlíny podle svého podílu šířky – `widthFactor`), uvnitř
 * plné krytí (krát `junction.alpha`), k okraji měkký přechod (`softM` vrstvy) – okraj lehce
 * nepravidelný (podle polohy, stejný plácek = stejný tvar).
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
  const radius =
    width * layer.widthFactor * widthAt(x, z) * (layer.junction?.scale ?? JUNCTION.scale);
  const alpha = layer.alpha(strength) * (layer.junction?.alpha ?? 1) * alphaAt(x, z);
  if (radius <= 0 || alpha <= 0) return;
  if (junction.outline && junction.outline.length > 0) {
    addOutline(junction, layer, alpha, positions, alphas, indices);
    return;
  }
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

/**
 * Plácek křižovatky pevných cest: vějíř trojúhelníků ze středu po obrysu (plné krytí) a měkký
 * okraj ven – u rohů ve vchodech kolmo na rameno (pás cesty tam pokračuje), u vnitřních rohů od
 * středu. Žádný kruh.
 */
function addOutline(
  junction: RibbonJunction,
  layer: RibbonLayer,
  alpha: number,
  positions: number[],
  alphas: number[],
  indices: number[],
): void {
  const ring = layerOutline(junction, layer);
  const { x, z } = junction;
  const n = ring.length;
  const center = positions.length / 2;
  positions.push(x, z);
  alphas.push(alpha);
  // rohy ve vchodu jsou po dvou za sebou (indexy 3k, 3k + 1), třetí je vnitřní roh
  ring.forEach((p, k) => {
    positions.push(p.x, p.z);
    alphas.push(alpha);
    const entrance = k % 3 !== 2;
    let dx = p.x - x;
    let dz = p.z - z;
    if (entrance) {
      // směr od druhého rohu téhož vchodu – měkký okraj jde po straně pásu
      const other = ring[k % 3 === 0 ? k + 1 : k - 1]!;
      dx = p.x - other.x;
      dz = p.z - other.z;
    }
    const len = Math.max(1e-6, Math.hypot(dx, dz));
    positions.push(p.x + (dx / len) * layer.softM, p.z + (dz / len) * layer.softM);
    alphas.push(0);
  });
  for (let k = 0; k < n; k++) {
    const a = center + 1 + k * 2;
    const b = center + 1 + ((k + 1) % n) * 2;
    indices.push(center, a, b, a, a + 1, b, b, a + 1, b + 1);
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
