import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { ForestField } from './forest-field';
import type { StreamCenterline } from './stream-geometry';
import { buildRelief } from './terrain-relief';
import type { TreePlacement } from './tree-placement';

/**
 * Vrstvy povrchu terénu – pořadí odpovídá kanálům splat textur: první RGBA, druhá RG (+ stín
 * v B, kvetoucí louka v A), třetí RGBA.
 */
export const GROUND_LAYERS = [
  'grass',
  'grassLush',
  'grassDirt',
  'forestFloor',
  'shore',
  'mud',
  'gravel',
  'sand',
  'flowers',
  'dryGrass',
  'rocky',
] as const;
export type GroundLayer = (typeof GROUND_LAYERS)[number];

/** 4 texely na políčko (≈ 3,75 m) – přechody mezi povrchy jsou jemnější než mřížka políček. */
const TEXELS_PER_TILE = 4;
/** Síla šumu, který rozbíjí rovné hranice mezi povrchy. */
const NOISE_STRENGTH = 0.45;
/** Šířka přechodu po „height blendu“ – menší = ostřejší, členitější hranice. */
const BLEND_WIDTH = 0.3;

export interface GroundWeights {
  resolution: number;
  /** Váha každé vrstvy 0–255 pro každý texel (index y * resolution + x); součet ≈ 255. */
  layers: Uint8Array[];
  /** Ztmavení půdy pod stromy 0–255 (stín koruny, jako „decal“ pod stromy v 0 A.D.). */
  shade: Uint8Array;
}

/** Vyhlazená hranice lesa a stromy – v lese tráva místo lesní půdy, pod stromy se ztmaví. */
export interface ForestGround {
  field: ForestField;
  trees: readonly TreePlacement[];
}

/** Poloměr (m, při měřítku 1) a síla ztmavení pod stromem. */
const TREE_SHADE = { radiusM: 6, strength: 0.6 };
/** Kamenitá půda tam, kde vystupuje skála (`Relief.rockinessAt`) – nejvýš tento podíl trávy. */
const ROCKY_MAX = 0.5;
/** Sušší tráva na svazích ke slunci (sklon ke slunci, m/m) a na hřbetech (vypouklost, m). */
const DRY_SUNWARD = { from: 0.015, to: 0.06 };
const DRY_CREST = { from: 0.3, to: 0.9 };
const DRY_MAX = 0.85;
/** Ostrůvky kvetoucí louky – šum s velikostí skvrn ≈ FLOWER_SCALE_M a třetinovými laloky. */
const FLOWER_SCALE_M = 190;
const FLOWER_MAX = 0.7;

const LAYER = Object.fromEntries(GROUND_LAYERS.map((name, i) => [name, i])) as Record<
  GroundLayer,
  number
>;

/**
 * Váhy povrchů terénu (splat mapa) z dat krajiny – deterministicky, bez náhody. S osou potoka
 * se bahno a břeh řídí vzdáleností od vyhlazeného koryta, jinak vodními políčky. S vyhlazenou
 * hranicí lesa je v lese tráva (stromy kreslí impostory, pod nimi stín), jinak lesní půda.
 */
export function groundWeights(
  l: Landscape,
  stream?: StreamCenterline,
  forest?: ForestGround,
): GroundWeights {
  const tileWeights = weightsPerTile(l, !stream, !forest);
  const relief = buildRelief(l);
  const half = (l.size * l.cellSizeM) / 2;
  const resolution = l.size * TEXELS_PER_TILE;
  const layers = GROUND_LAYERS.map(() => new Uint8Array(resolution * resolution));
  const w = new Float32Array(GROUND_LAYERS.length);
  const present = new Uint8Array(GROUND_LAYERS.length);

  for (let ty = 0; ty < resolution; ty++) {
    for (let tx = 0; tx < resolution; tx++) {
      // Bilineárně mezi středy čtyř okolních políček.
      const u = Math.min(l.size - 1, Math.max(0, (tx + 0.5) / TEXELS_PER_TILE - 0.5));
      const v = Math.min(l.size - 1, Math.max(0, (ty + 0.5) / TEXELS_PER_TILE - 0.5));
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(l.size - 1, x0 + 1);
      const y1 = Math.min(l.size - 1, y0 + 1);
      const fx = u - x0;
      const fy = v - y0;
      let max = -Infinity;
      for (let k = 0; k < w.length; k++) {
        const at = (x: number, y: number): number => tileWeights[(y * l.size + x) * w.length + k]!;
        const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
        const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
        const base = top + (bottom - top) * fy;
        w[k] = base;
      }
      const x = -half + ((tx + 0.5) / resolution) * l.size * l.cellSizeM;
      const z = -half + ((ty + 0.5) / resolution) * l.size * l.cellSizeM;
      if (forest) {
        // Pod stromy tráva jako na louce (hrabanka mezi impostory působila rušivě), v lese mírně
        // svěžejší; les od louky odliší stromy a ztmavení pod nimi.
        const lush = 0.35 * smoothstep(0, 12, forest.field.distanceAt(x, z));
        const shift = lush * (w[LAYER.grass]! + w[LAYER.grassDirt]!);
        w[LAYER.grass] = w[LAYER.grass]! * (1 - lush);
        w[LAYER.grassDirt] = w[LAYER.grassDirt]! * (1 - lush);
        w[LAYER.grassLush] = w[LAYER.grassLush]! + shift;
      }
      // Vzdálenost od okraje vody – potok mění šířku, tůně jsou široké.
      const near = stream?.nearest(x, z);
      // Louky podle tvaru terénu: kamenitá půda na prudkých svazích a hřbetech, sušší tráva na
      // osluněných svazích, jinde ostrůvky kvetoucí louky. Nahrazují část trávy, v lese nejsou.
      const grass = w[LAYER.grass]! + w[LAYER.grassLush]! + w[LAYER.grassDirt]!;
      const meadow = forest ? 1 - smoothstep(-8, 0, forest.field.distanceAt(x, z)) : 1;
      if (grass > 0 && meadow > 0) {
        const convexity = relief.convexityAt(x, z);
        const rocky = ROCKY_MAX * relief.rockinessAt(x, z);
        const wet = near ? 1 - smoothstep(15, 40, near.bankDistance) : 0;
        const dry =
          DRY_MAX *
          (1 - wet) *
          Math.min(
            1,
            0.75 * smoothstep(DRY_SUNWARD.from, DRY_SUNWARD.to, relief.sunwardAt(x, z)) +
              0.4 * smoothstep(DRY_CREST.from, DRY_CREST.to, convexity),
          );
        const patches =
          0.65 * flowerNoise(x / FLOWER_SCALE_M, z / FLOWER_SCALE_M) +
          0.35 * flowerNoise(x / (FLOWER_SCALE_M / 3) + 17.3, z / (FLOWER_SCALE_M / 3) - 4.1);
        const flowers = FLOWER_MAX * smoothstep(0.15, 0.5, patches) * (1 - 0.6 * dry);
        const keep = (1 - rocky) * (1 - dry) * (1 - flowers);
        const taken = meadow * (1 - keep);
        w[LAYER.grass] = w[LAYER.grass]! * (1 - taken);
        w[LAYER.grassLush] = w[LAYER.grassLush]! * (1 - taken);
        w[LAYER.grassDirt] = w[LAYER.grassDirt]! * (1 - taken);
        w[LAYER.rocky] = grass * meadow * rocky;
        w[LAYER.dryGrass] = grass * meadow * (1 - rocky) * dry;
        w[LAYER.flowers] = grass * meadow * (1 - rocky) * (1 - dry) * flowers;
      }
      if (near) {
        const d = near.bankDistance;
        const channel = 1 - smoothstep(-1.5, 2.5, d);
        // Náplav na vnitřní straně oblouku – i nad hladinou, kde proud ukládá štěrk a písek.
        const bar =
          smoothstep(0.15, 0.5, near.innerBend) *
          smoothstep(0.2, 0.4, near.speed) *
          (1 - smoothstep(3, 10, d));
        const bed = Math.max(channel, bar);
        const mix = bar > channel ? barMix(near.speed) : bedMix(near.speed, near.pool);
        const shore = Math.max(0, 1 - smoothstep(4, 16, d) - bed);
        const land = 1 - bed - shore;
        for (let k = 0; k < w.length; k++) w[k] = w[k]! * land;
        w[LAYER.mud] = bed * mix.mud;
        w[LAYER.sand] = bed * mix.sand;
        w[LAYER.gravel] = bed * mix.gravel;
        w[LAYER.shore] = shore;
      }
      for (let k = 0; k < w.length; k++) {
        // Šum jen tam, kde vrstva vůbec je – jinak by se objevovala uprostřed cizích ploch.
        present[k] = w[k]! > 0 ? 1 : 0;
        w[k] = present[k] ? w[k]! + (layerNoise(tx, ty, k) - 0.5) * NOISE_STRENGTH : -Infinity;
        max = Math.max(max, w[k]!);
      }
      // Height blend: vyhraje vrstva s nejvyšší (zašuměnou) vahou, okolní jen v úzkém pásu;
      // vrstva, která v texelu není, zůstane nulová.
      let sum = 0;
      for (let k = 0; k < w.length; k++) {
        w[k] = present[k] ? Math.max(0, w[k]! - max + BLEND_WIDTH) : 0;
        sum += w[k]!;
      }
      const i = ty * resolution + tx;
      for (let k = 0; k < w.length; k++) layers[k]![i] = Math.round((w[k]! / sum) * 255);
    }
  }
  return {
    resolution,
    layers,
    shade: forest
      ? treeShade(l, forest.trees, resolution)
      : new Uint8Array(resolution * resolution),
  };
}

/** Kruhové ztmavení pod každým stromem a keřem (silnější uprostřed, k okraji slábne). */
function treeShade(l: Landscape, trees: readonly TreePlacement[], resolution: number): Uint8Array {
  const shade = new Float32Array(resolution * resolution);
  const extent = l.size * l.cellSizeM;
  const step = extent / resolution;
  for (const tree of trees) {
    const { radiusM, strength } = TREE_SHADE;
    const r = radiusM * tree.scale;
    const ci = (tree.worldX + extent / 2) / step - 0.5;
    const cj = (tree.worldZ + extent / 2) / step - 0.5;
    const reach = Math.ceil(r / step);
    for (
      let j = Math.max(0, Math.floor(cj - reach));
      j <= Math.min(resolution - 1, Math.ceil(cj + reach));
      j++
    ) {
      for (
        let i = Math.max(0, Math.floor(ci - reach));
        i <= Math.min(resolution - 1, Math.ceil(ci + reach));
        i++
      ) {
        const t = (Math.hypot(i - ci, j - cj) * step) / r;
        if (t >= 1) continue;
        const k = j * resolution + i;
        shade[k] = Math.max(shade[k]!, strength * (1 - t * t));
      }
    }
  }
  return Uint8Array.from(shade, (v) => Math.round(v * 255));
}

/**
 * Tři RGBA textury pro shader: [trávy + lesní půda], [břeh + bahno + ztmavení pod stromy +
 * kvetoucí louka], [štěrk + písek + suchá tráva + kamenitá půda].
 */
export function packSplatTextures(weights: GroundWeights): [Uint8Array, Uint8Array, Uint8Array] {
  const n = weights.resolution * weights.resolution;
  const first = new Uint8Array(n * 4);
  const second = new Uint8Array(n * 4);
  const third = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) first[i * 4 + c] = weights.layers[c]![i]!;
    second[i * 4] = weights.layers[4]![i]!;
    second[i * 4 + 1] = weights.layers[5]![i]!;
    second[i * 4 + 2] = weights.shade[i]!;
    second[i * 4 + 3] = weights.layers[8]![i]!;
    third[i * 4] = weights.layers[6]![i]!;
    third[i * 4 + 1] = weights.layers[7]![i]!;
    third[i * 4 + 2] = weights.layers[9]![i]!;
    third[i * 4 + 3] = weights.layers[10]![i]!;
  }
  return [first, second, third];
}

/**
 * Dno koryta podle proudu jako v přírodě: v rychlém proudu štěrk (jemný sediment voda odnese),
 * v mírném písek, v pomalém a v tůních bahno.
 */
export function bedMix(speed: number, pool: number): { mud: number; sand: number; gravel: number } {
  const gravel = smoothstep(0.5, 0.78, speed) * (1 - pool);
  const sand = smoothstep(0.22, 0.45, speed) * (1 - gravel) * (1 - pool);
  return { mud: 1 - gravel - sand, sand, gravel };
}

/** Náplav: v rychlejším proudu štěrkový, v pomalejším písčitý. */
function barMix(speed: number): { mud: number; sand: number; gravel: number } {
  const gravel = smoothstep(0.45, 0.7, speed);
  return { mud: 0, sand: 1 - gravel, gravel };
}

function weightsPerTile(l: Landscape, tileWater: boolean, tileForest: boolean): Float32Array {
  const { size } = l;
  const waterDistance = tileDistanceToWater(l);
  const weights = new Float32Array(size * size * GROUND_LAYERS.length);
  const set = (i: number, layer: GroundLayer, value: number): void => {
    const j = i * GROUND_LAYERS.length + LAYER[layer];
    weights[j] = weights[j]! + value;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const surface = l.surface[i];
      if (surface === SURFACE_CODES.water && tileWater) {
        set(i, 'mud', 1);
        continue;
      }
      const d = waterDistance[i]!;
      const shore = !tileWater ? 0 : d <= 1.5 ? 1 : d <= 2.5 ? 0.5 : 0;
      if (shore > 0) set(i, 'shore', shore);
      const rest = 1 - shore;
      if (rest <= 0) continue;

      if (surface === SURFACE_CODES.forest && tileForest) {
        // Okraj lesa je rozcuchaný: lesní půda prolnutá trávou s hlínou (jako v 0 A.D.).
        const edge = isForestEdge(l, x, y);
        set(i, 'forestFloor', rest * (edge ? 0.55 : 1));
        if (edge) set(i, 'grassDirt', rest * 0.45);
        continue;
      }
      const fertility = l.fertility[i]!;
      const lush = Math.min(1, Math.max(0, (fertility - 55) / 25));
      const dirt = Math.min(1, Math.max(0, (45 - fertility) / 30));
      set(i, 'grassLush', rest * lush);
      set(i, 'grassDirt', rest * dirt);
      set(i, 'grass', rest * Math.max(0, 1 - lush - dirt));
    }
  }
  return weights;
}

function isForestEdge(l: Landscape, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= l.size || ny >= l.size) continue;
      if (l.surface[ny * l.size + nx] !== SURFACE_CODES.forest) return true;
    }
  }
  return false;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Vzdálenost políček k vodě (v políčkách, osmisměrná chamfer vzdálenost). */
function tileDistanceToWater(l: Landscape): Float32Array {
  const { size } = l;
  const distance = new Float32Array(size * size).fill(Infinity);
  for (let i = 0; i < distance.length; i++) {
    if (l.surface[i] === SURFACE_CODES.water) distance[i] = 0;
  }
  // Dva průchody (dopředu a zpět) stačí pro chamfer vzdálenost 1 / √2.
  const relax = (i: number, x: number, y: number, dx: number, dy: number, cost: number): void => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
    distance[i] = Math.min(distance[i]!, distance[ny * size + nx]! + cost);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      relax(i, x, y, -1, 0, 1);
      relax(i, x, y, 0, -1, 1);
      relax(i, x, y, -1, -1, Math.SQRT2);
      relax(i, x, y, 1, -1, Math.SQRT2);
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      relax(i, x, y, 1, 0, 1);
      relax(i, x, y, 0, 1, 1);
      relax(i, x, y, 1, 1, Math.SQRT2);
      relax(i, x, y, -1, 1, Math.SQRT2);
    }
  }
  return distance;
}

// Simplex šum (bez mřížkových artefaktů hodnotového šumu), pro každou vrstvu vlastní,
// deterministický – generátor náhody je pevně daný, krajina se liší vahami, ne šumem.
const layerNoises = Array.from({ length: GROUND_LAYERS.length }, (_, k) => {
  let state = 0x9e3779b9 ^ (k * 0x85ebca6b);
  const random = (): number => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
  return createNoise2D(random);
});

// Ostrůvky kvetoucí louky – pevný šum, krajiny se liší tvarem terénu a lesa.
const flowerNoise = createNoise2D(
  (() => {
    let state = 0xf10e5;
    return (): number => {
      state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return state / 4294967296;
    };
  })(),
);

/** Šum 0–1 pro vrstvu k ve dvou měřítkách (≈ 40 m a ≈ 12 m). */
function layerNoise(x: number, y: number, k: number): number {
  const noise = layerNoises[k]!;
  const value = 0.65 * noise(x / 11, y / 11) + 0.35 * noise(x / 3.2 + 31.7, y / 3.2 - 12.9);
  return 0.5 + 0.5 * value;
}
