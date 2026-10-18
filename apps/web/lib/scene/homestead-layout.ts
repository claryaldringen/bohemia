// Pozemek polozemnice bez Babylonu (population.md – Umístění obydlí, Martin 18. 10. 2026): celé
// políčko krajiny obehnané polským plotem se zakulacenými rohy, dům uprostřed nebo v rohu
// (varianta – jádro `PLOT_HOUSE_OFFSET_M`), vchodem k brance na přední straně (−z), cestička od
// branky ke dveřím a ve zbytku záhony se zeleninou. Souřadnice světa scény v metrech (x, z).
// Polský plot je pletený plot společný s hřbitovem (woven-fence.ts), tady jen jeho hustota.
import {
  PLOT_HOUSE_OFFSET_M,
  PLOT_HOUSE_ROTATION,
  PLOT_VARIANTS,
  type PlotVariant,
  type Position,
} from '@bohemia/game';
import { seededRandom, type Point } from './village-layout';
import {
  fenceStage,
  wovenFence,
  type FenceStage,
  type FenceStyle,
  type WovenFence,
} from './woven-fence';

/** Políčko pozemku ve světě – střed a strana (m), jako čtverec pole. */
export interface PlotSquare {
  x: number;
  z: number;
  size: number;
}

/** Obdélník ve světě (m). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Plot stojí kousek uvnitř políčka (m) – sousední pozemky mají mezi ploty uličku. */
export const FENCE_INSET_M = 0.5;
/**
 * Polský plot pozemku: kůly nejvýš po metru, sedm větví 0,16–0,88 m (řidší než plot hřbitova)
 * a branka 1,3 m proti vchodu.
 */
export const PLOT_FENCE: FenceStyle = {
  postStep: 1,
  rails: [0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88],
  gateWidth: 1.3,
};

/** Zelenina na záhonech (oblasti atlasu `veg` – tools/blender/dwellings.py). */
export type PlotCrop = 'cabbage' | 'turnip' | 'onion' | 'dill';
export const PLOT_CROPS: readonly PlotCrop[] = ['cabbage', 'turnip', 'onion', 'dill'];
/** Šířka záhonu, mezera mezi záhony a nejdelší záhon (m). */
export const BED_WIDTH_M = 0.8;
const BED_GAP_M = 0.45;
const BED_MAX_M = 3.6;
const BED_MIN_M = 0.9;
/** Záhony začínají tolik od plotu (m). */
const BED_MARGIN_M = 0.6;
/** Rozestup rostlin v řádku a řádky přes záhon (m od osy). */
const PLANT_STEP_M: Record<PlotCrop, number> = {
  cabbage: 0.46,
  turnip: 0.34,
  onion: 0.28,
  dill: 0.36,
};
const PLANT_ROWS_M = [-0.2, 0.2] as const;

/**
 * Dům na pozemku v osách světa (natočený o π – vchod k −z): střecha, valy, trsy trávy u okapu
 * (x ± 3,35), před vchodem šíje a střecha (z − 3,5), vzadu střecha (z + 3,35).
 */
const HOUSE_RECT_M = { halfX: 3.35, front: 3.5, back: 3.35 } as const;
/** Udusaný dvorek před dveřmi a cestička k brance (m). */
const YARD_M = { halfX: 1.9, depth: 1.7 } as const;
const PATH_HALF_M = 0.75;

export interface PlotBed {
  x: number;
  z: number;
  /** Délka podél osy x (m). */
  length: number;
  crop: PlotCrop;
}

export interface PlotPlant {
  x: number;
  z: number;
  crop: PlotCrop;
  rotationY: number;
  scale: number;
  /** Index záhonu v `beds` – rostliny se ukážou se svým záhonem. */
  bed: number;
}

export interface HomesteadLayout {
  house: Position;
  /** Obdélník plotu (osy kůlů na rovných stranách). */
  fenceRect: Rect;
  /** Plot – jeden kus od kůlu branky dokola k druhému. */
  fence: WovenFence;
  beds: PlotBed[];
  plants: PlotPlant[];
  /** Cestička od branky ke dvorku před dveřmi (obdélník). */
  path: Point[];
}

/** Obdélník plotu na políčku. */
export function plotFenceRect(square: PlotSquare): Rect {
  const half = square.size / 2 - FENCE_INSET_M;
  return {
    minX: square.x - half,
    maxX: square.x + half,
    minZ: square.z - half,
    maxZ: square.z + half,
  };
}

/** Poloha domu na pozemku (stejně jako jádro – `plotHousePosition`). */
export function plotHouse(square: PlotSquare, variant: PlotVariant): Position {
  const offset = PLOT_HOUSE_OFFSET_M[variant];
  return { x: square.x + offset.x, z: square.z + offset.z, rotation: PLOT_HOUSE_ROTATION };
}

/** Další / předchozí varianta pozemku (klávesy ] a [). */
export function nextPlotVariant(variant: PlotVariant, step: 1 | -1): PlotVariant {
  const n = PLOT_VARIANTS.length;
  const i = PLOT_VARIANTS.indexOf(variant);
  return PLOT_VARIANTS[(((i + step) % n) + n) % n]!;
}

/** Obdélník plotu jako uzavřená čára (ohrazení vlevo, začíná na přední straně). */
function rectPath(rect: Rect): { points: Point[]; closed: true } {
  return {
    points: [
      [rect.minX, rect.minZ],
      [rect.maxX, rect.minZ],
      [rect.maxX, rect.maxZ],
      [rect.minX, rect.maxZ],
    ],
    closed: true,
  };
}

/** Úseky osy x, které z [from, to] zbydou po odečtení `blocked`. */
function freeIntervals(
  from: number,
  to: number,
  blocked: readonly [number, number][],
): [number, number][] {
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of sorted) {
    if (b <= cursor) continue;
    if (a > cursor) out.push([cursor, Math.min(a, to)]);
    cursor = Math.max(cursor, b);
    if (cursor >= to) break;
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

/**
 * Pozemek polozemnice: dům podle varianty, polský plot se zakulacenými rohy a brankou proti
 * vchodu, cestička od branky ke dveřím, ve zbytku řady záhonů podél osy x (zelí, řepa, cibule,
 * kopr) s rostlinami. Deterministicky podle políčka – stejný pozemek vypadá pořád stejně.
 */
export function homesteadLayout(
  square: PlotSquare,
  variant: PlotVariant,
  seed = 0,
): HomesteadLayout {
  const house = plotHouse(square, variant);
  const fenceRect = plotFenceRect(square);
  // branka na přední straně proti vchodu
  const fence = wovenFence([rectPath(fenceRect)], PLOT_FENCE, {
    toward: { x: house.x, z: fenceRect.minZ - 1 },
  });
  const gatePosts = fence.runs[0]!.posts;
  const gateX = (gatePosts[0]!.x + gatePosts[gatePosts.length - 1]!.x) / 2;
  const doorZ = house.z - HOUSE_RECT_M.front;
  const exclusions: Rect[] = [
    {
      minX: house.x - HOUSE_RECT_M.halfX,
      maxX: house.x + HOUSE_RECT_M.halfX,
      minZ: doorZ,
      maxZ: house.z + HOUSE_RECT_M.back,
    },
    {
      minX: house.x - YARD_M.halfX,
      maxX: house.x + YARD_M.halfX,
      minZ: doorZ - YARD_M.depth,
      maxZ: doorZ,
    },
    {
      minX: gateX - PATH_HALF_M,
      maxX: gateX + PATH_HALF_M,
      minZ: fenceRect.minZ - 1,
      maxZ: doorZ,
    },
  ];
  const inner: Rect = {
    minX: fenceRect.minX + BED_MARGIN_M,
    maxX: fenceRect.maxX - BED_MARGIN_M,
    minZ: fenceRect.minZ + BED_MARGIN_M,
    maxZ: fenceRect.maxZ - BED_MARGIN_M,
  };
  const random = seededRandom(Math.round(square.x * 31 + square.z * 977) + seed * 7919 + 3);
  const shift = PLOT_VARIANTS.indexOf(variant);
  const beds: PlotBed[] = [];
  const pitch = BED_WIDTH_M + BED_GAP_M;
  const rows = Math.floor((inner.maxZ - inner.minZ - BED_WIDTH_M) / pitch) + 1;
  for (let row = 0; row < rows; row++) {
    const z = inner.minZ + BED_WIDTH_M / 2 + row * pitch;
    const band: [number, number] = [z - BED_WIDTH_M / 2 - 0.2, z + BED_WIDTH_M / 2 + 0.2];
    const blocked = exclusions
      .filter((e) => e.maxZ > band[0] && e.minZ < band[1])
      .map((e): [number, number] => [e.minX - 0.2, e.maxX + 0.2]);
    const crop = PLOT_CROPS[(row + shift) % PLOT_CROPS.length]!;
    for (const [a, b] of freeIntervals(inner.minX, inner.maxX, blocked)) {
      const span = b - a;
      if (span < BED_MIN_M) continue;
      const n = Math.ceil((span + BED_GAP_M) / (BED_MAX_M + BED_GAP_M));
      const length = (span - BED_GAP_M * (n - 1)) / n;
      if (length < BED_MIN_M) continue;
      for (let k = 0; k < n; k++) {
        beds.push({ x: a + length / 2 + k * (length + BED_GAP_M), z, length, crop });
      }
    }
  }
  const plants: PlotPlant[] = [];
  beds.forEach((bed, index) => {
    const step = PLANT_STEP_M[bed.crop];
    PLANT_ROWS_M.forEach((offset, r) => {
      let x = bed.x - bed.length / 2 + 0.2 + (r % 2 ? step / 2 : 0);
      while (x < bed.x + bed.length / 2 - 0.15) {
        plants.push({
          x: x + (random() - 0.5) * 0.05,
          z: bed.z + offset + (random() - 0.5) * 0.05,
          crop: bed.crop,
          rotationY: random() * Math.PI * 2,
          scale: 0.85 + random() * 0.3,
          bed: index,
        });
        x += step;
      }
    });
  });
  const path: Point[] = [
    [gateX - PATH_HALF_M + 0.2, fenceRect.minZ - 0.6],
    [gateX + PATH_HALF_M - 0.2, fenceRect.minZ - 0.6],
    [gateX + PATH_HALF_M - 0.2, doorZ - 0.5],
    [gateX - PATH_HALF_M + 0.2, doorZ - 0.5],
  ];
  return { house, fenceRect, fence, beds, plants, path };
}

/** Bod uvnitř ohrazení pozemku (s okrajem `margin` od plotu, m)? */
export function insidePlot(square: PlotSquare, x: number, z: number, margin = 0): boolean {
  const r = plotFenceRect(square);
  return x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin;
}

/** Co z pozemku stojí: plot (kůly a větve), záhony a rostliny (podle průběhu stavby 0–1). */
export interface PlotStage {
  fence: FenceStage;
  beds: PlotBed[];
  plants: PlotPlant[];
}

/**
 * Pozemek podle průběhu: kůly se zatloukají po obvodu od branky (`posts`), až stojí všechny,
 * proplétají se větve zdola nahoru (`rails` – podíl výšek), nakonec záhony se zeleninou jeden po
 * druhém (`beds`).
 */
export function plotStage(
  layout: HomesteadLayout,
  progress: { posts: number; rails: number; beds: number },
): PlotStage {
  const bedCount = Math.round(layout.beds.length * clamp01(progress.beds));
  return {
    fence: fenceStage(layout.fence, PLOT_FENCE, progress),
    beds: layout.beds.slice(0, bedCount),
    plants: layout.plants.filter((plant) => plant.bed < bedCount),
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Směr ze středu domu do středu pozemku v osách modelu domu (znaménka x a z) – rekvizity
 * staveniště rohového domu se zrcadlí dovnitř pozemku (`sitePropPlace`). Dům je natočený o π,
 * osy modelu jsou proti osám světa.
 */
export function plotInward(variant: PlotVariant): { x: number; z: number } {
  const offset = PLOT_HOUSE_OFFSET_M[variant];
  return { x: Math.sign(offset.x), z: Math.sign(offset.z) };
}

/**
 * Vytyčení pozemku při zadání stavby (průběh 0 %): kolíky a provázek po obdélníku budoucího
 * plotu – rohy vytyčení zakulacené být nemusí. Uzavřená čára (první bod i na konci).
 */
export function plotStakingLine(square: PlotSquare): Point[] {
  const r = plotFenceRect(square);
  return [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
    [r.minX, r.minZ],
  ];
}
