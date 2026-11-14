// Pozemek polozemnice bez Babylonu (population.md – Umístění obydlí, Martin 18. 10. 2026): celé
// políčko krajiny obehnané polským plotem se zakulacenými rohy, dům uprostřed nebo v rohu
// (varianta – jádro `PLOT_HOUSE_OFFSET_M`), vchodem k brance na přední straně (−z), cestička od
// branky ke dveřím a ve zbytku záhony se zeleninou. Souřadnice světa scény v metrech (x, z).
// Polský plot je pletený plot společný s hřbitovem (woven-fence.ts), tady jen jeho hustota.
import {
  DWELLING_FOOTPRINT_M,
  FENCE_INSET_M as CORE_FENCE_INSET_M,
  PLAIN_FRAME,
  PLOT_HOUSE_OFFSET_M,
  PLOT_HOUSE_ROTATION,
  PLOT_VARIANTS,
  dwellingFrame,
  plotHouseRotation,
  rotationCosSin,
  rotationTurn,
  shapeRect,
  type DwellingType,
  type PlotVariant,
  type Position,
  type ShapeFrame,
} from '@bohemia/game';
import { seededRandom, shapedToWorld, type Point } from './village-layout';
import { rangeStrip } from './training-ground-layout';
import {
  decayFence,
  fenceStage,
  wovenFence,
  type FenceRun,
  type FenceStage,
  type FenceStyle,
  type WovenFence,
} from './woven-fence';

/**
 * Políčko pozemku ve světě – střed a strana (m), jako čtverec pole; u dvorce vojvody (trade.md)
 * i střed dvora – druhého políčka vedle.
 */
export interface PlotSquare {
  x: number;
  z: number;
  size: number;
  yard?: { x: number; z: number };
  /**
   * Natočený pozemek (Martin 18. 10. 2026 – varianta a, fields.md – Natočené stavby): natočení
   * celého pozemku kolem středu (rad, po 15°) – plot, záhony, cestička i dům. Bez údaje 0.
   */
  rotation?: number;
  /** Kde na pozemku dům stojí (ScenePlot) – v rohu je varianta rozměrů domu menší. */
  variant?: PlotVariant;
}

/** Osy natočeného pozemku (cos, sin), nebo null u pozemku v osách světa (i dvorce). */
function plotAxes(square: PlotSquare): readonly [number, number] | null {
  if (square.rotation === undefined || square.yard) return null;
  if (rotationTurn(square.rotation) === 0) return null;
  return rotationCosSin(square.rotation);
}

/** Bod v osách pozemku (kolem jeho středu) → svět – natočení jako rotation.y v Babylonu. */
function plotToWorld(square: PlotSquare, axes: readonly [number, number], p: Point): Point {
  const [c, s] = axes;
  const dx = p[0] - square.x;
  const dz = p[1] - square.z;
  return [square.x + dx * c + dz * s, square.z - dx * s + dz * c];
}

/** Bod světa → osy pozemku (inverze `plotToWorld`). */
function worldToPlot(square: PlotSquare, axes: readonly [number, number], p: Point): Point {
  const [c, s] = axes;
  const dx = p[0] - square.x;
  const dz = p[1] - square.z;
  return [square.x + dx * c - dz * s, square.z + dx * s + dz * c];
}

/** Pozemek v osách světa se stejným středem (pro rozmístění v osách pozemku). */
function unturned(square: PlotSquare): PlotSquare {
  return { x: square.x, z: square.z, size: square.size };
}

/** Obdélník ve světě (m). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Plot stojí kousek uvnitř políčka (m) – sousední pozemky mají mezi ploty uličku. */
export const FENCE_INSET_M = CORE_FENCE_INSET_M;
/**
 * Polský plot pozemku: kůly nejvýš po metru, sedm větví 0,16–0,88 m (řidší než plot hřbitova)
 * a branka 1,3 m proti vchodu.
 */
export const PLOT_FENCE: FenceStyle = {
  postStep: 1,
  rails: [0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88],
  gateWidth: 1.3,
};

/**
 * Plot pozemku dvorce vojvody (trade.md): stejný polský plot, jen se širokou bránou
 * (dvorec-gate.glb – sloupy 2,6 m od sebe, průchod 2,4 m).
 */
export const MANOR_FENCE: FenceStyle = { ...PLOT_FENCE, gateWidth: 2.4 };

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
export const HOUSE_RECT_M = { halfX: 3.35, front: 3.5, back: 3.35 } as const;
/** Dvorec vojvody (dwellings.py – DVOREC_*): okap 2,78 m s valy, střecha 5,25 m od středu. */
const MANOR_HOUSE_RECT_M = { halfX: 3.55, front: 5.7, back: 5.6 } as const;
/**
 * Nadzemní dům a srubový dvorec (log-house.md – LOG_HOUSES v dwellings.py): okap 2,75 / 3,75 m,
 * střecha vpředu 3,55 / 6,1 m a vzadu 3,2 / 6,1 m od středu, kozy kousek dál – návrh Clauda.
 * Vypletený dům (WATTLE_HOUSE) má střechu skoro stejnou (3,6 a 3,25 m) – týž obdélník.
 */
const LOG_HOUSE_RECT_M = { halfX: 3.35, front: 3.85, back: 3.45 } as const;
const LOG_MANOR_RECT_M = { halfX: 4.2, front: 6.45, back: 6.45 } as const;

/** Obdélník domu na pozemku podle typu obydlí (dvorec – pozemek se dvorem). */
function houseRectOf(
  square: PlotSquare,
  type: DwellingType,
): { halfX: number; front: number; back: number } {
  if (type === 'dvorec-srub') return LOG_MANOR_RECT_M;
  if (square.yard) return MANOR_HOUSE_RECT_M;
  return type === 'srub' || type === 'vypleteny' ? LOG_HOUSE_RECT_M : HOUSE_RECT_M;
}
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
  /**
   * Obdélník plotu (osy kůlů na rovných stranách) – u natočeného pozemku v osách pozemku (kolem
   * jeho středu), ne ve světě.
   */
  fenceRect: Rect;
  /**
   * Natočení pozemku (rad) – záhony leží podél osy x pozemku; ve světě je natočený i plot,
   * cestička a rostliny. Pozemek v osách světa 0.
   */
  rotation: number;
  /**
   * Plot – jeden kus od kůlu branky dokola k druhému; u domu stojícího přes plot přerušený
   * (stěna domu je ohradou, s vchodem ven z pozemku i bez branky).
   */
  fence: WovenFence;
  beds: PlotBed[];
  plants: PlotPlant[];
  /** Cestička od branky ke dvorku před dveřmi (obdélník); bez branky null. */
  path: Point[] | null;
  /**
   * Brána pozemku dvorce vojvody (trade.md) – uprostřed průchodu, natočení modelu (průchod podél
   * osy z modelu); u ostatních pozemků null.
   */
  gate: Position | null;
}

/** Obdélník plotu na políčku (u dvorce přes obě políčka – dům i dvůr). */
export function plotFenceRect(square: PlotSquare): Rect {
  const half = square.size / 2 - FENCE_INSET_M;
  const yard = square.yard ?? square;
  return {
    minX: Math.min(square.x, yard.x) - half,
    maxX: Math.max(square.x, yard.x) + half,
    minZ: Math.min(square.z, yard.z) - half,
    maxZ: Math.max(square.z, yard.z) + half,
  };
}

/**
 * Poloha domu na pozemku (stejně jako jádro – `plotHousePosition`); dvorec uprostřed políčka
 * domu vchodem ke dvoru (`yardRotation`).
 */
export function plotHouse(square: PlotSquare, variant: PlotVariant): Position {
  const axes = plotAxes(square);
  if (axes) {
    const offset = PLOT_HOUSE_OFFSET_M[variant];
    const [x, z] = plotToWorld(square, axes, [square.x + offset.x, square.z + offset.z]);
    return { x, z, rotation: plotHouseRotation(square.rotation!) };
  }
  if (square.yard) {
    const dx = square.yard.x - square.x;
    const dz = square.yard.z - square.z;
    const rotation =
      Math.abs(dz) >= Math.abs(dx) ? (dz < 0 ? Math.PI : 0) : dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    return { x: square.x, z: square.z, rotation };
  }
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
  actualHouse?: Position,
  plainShape = false,
  type: DwellingType = 'polozemnice',
): HomesteadLayout {
  // dům podle varianty rozměrů (population.md – Varianty rozměrů) – z polohy ve světě, i u
  // natočeného pozemku (rozmístění v jeho osách dostane hotové zobrazení)
  const house = actualHouse ?? plotHouse(square, variant);
  const frame = houseFrame(square, variant, house, plainShape, type);
  const rect = houseRectOf(square, type);
  const axes = plotAxes(square);
  if (axes) return turnedLayout(square, axes, variant, seed, actualHouse, frame, rect);
  return flatLayout(square, variant, seed, actualHouse, frame, rect);
}

/** Zobrazení tvaru domu na pozemku – dvorec (pozemek se dvorem) variantu nemá. */
export function houseFrame(
  square: PlotSquare,
  variant: PlotVariant,
  house: Position,
  plainShape = false,
  type: DwellingType = 'polozemnice',
): ShapeFrame {
  if (square.yard) return PLAIN_FRAME;
  return dwellingFrame({ type, position: house, plot: { variant }, plainShape });
}

/** Pozemek v osách světa (bez natočení) s hotovým zobrazením tvaru domu. */
function flatLayout(
  square: PlotSquare,
  variant: PlotVariant,
  seed: number,
  actualHouse: Position | undefined,
  frame: ShapeFrame,
  houseRect: { halfX: number; front: number; back: number },
): HomesteadLayout {
  const house = actualHouse ?? plotHouse(square, variant);
  const fenceRect = plotFenceRect(square);
  // dvorec vojvody (trade.md): větší dům, brána na vzdálené straně dvora
  const style = square.yard ? MANOR_FENCE : PLOT_FENCE;
  // vchod míří do (sin r, cos r) – branka na straně plotu, kam vchod míří (u varianty vpředu, −z)
  const door = shapedToWorld(house, frame, 0, houseRect.front);
  const facing: Point = [Math.sin(house.rotation), Math.cos(house.rotation)];
  const toward =
    Math.abs(facing[1]) >= Math.abs(facing[0])
      ? { x: door[0], z: facing[1] < 0 ? fenceRect.minZ - 1 : fenceRect.maxZ + 1 }
      : { x: facing[0] < 0 ? fenceRect.minX - 1 : fenceRect.maxX + 1, z: door[1] };
  // dům převedené starší polozemnice může stát přes plot – tam plot nahradí stěna domu; když
  // vchod vede ven z ohrazení, branka ani cestička nejsou
  const doorInside =
    door[0] > fenceRect.minX &&
    door[0] < fenceRect.maxX &&
    door[1] > fenceRect.minZ &&
    door[1] < fenceRect.maxZ;
  const fence = withoutPostsUnder(
    wovenFence([rectPath(fenceRect)], style, doorInside ? { toward } : null),
    house,
    frame,
  );
  // kůly branky – první a poslední kůl plotu (i když se plot u domu rozdělil na víc kusů)
  const [first, last] = fence.runs.flatMap((run) => run.posts).filter((p) => p.gate);
  const gate =
    first && last
      ? {
          at: [(first.x + last.x) / 2, (first.z + last.z) / 2] as Point,
          out: [first.outX, first.outZ] as Point,
        }
      : null;
  // dům i dvorek před dveřmi podle varianty – záhony se větší variantě vyhnou
  const local = (lx: number, lz: number): Point => shapedToWorld(house, frame, lx, lz);
  const { halfX, front, back } = houseRect;
  const yardHalf = square.size / 2;
  const exclusions: Rect[] = [
    boundsOf([
      local(-halfX, front),
      local(halfX, front),
      local(halfX, -back),
      local(-halfX, -back),
    ]),
    boundsOf([
      local(-YARD_M.halfX, front),
      local(YARD_M.halfX, front),
      local(YARD_M.halfX, front + YARD_M.depth),
      local(-YARD_M.halfX, front + YARD_M.depth),
    ]),
    ...(gate
      ? [widen(boundsOf([[gate.at[0] + gate.out[0], gate.at[1] + gate.out[1]], door]), PATH_HALF_M)]
      : []),
    // dvůr dvorce zůstává volný – záhony jen kolem domu
    ...(square.yard
      ? [
          {
            minX: square.yard.x - yardHalf,
            maxX: square.yard.x + yardHalf,
            minZ: square.yard.z - yardHalf,
            maxZ: square.yard.z + yardHalf,
          },
          // pruh střelnice vedle domu (lord.md – Terče a cvičiště na dvorku)
          rangeStrip(square),
        ]
      : []),
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
  return {
    house,
    fenceRect,
    rotation: 0,
    fence,
    beds,
    plants,
    path: gate ? plotPath(gate, door, facing) : null,
    gate:
      square.yard && gate
        ? { x: gate.at[0], z: gate.at[1], rotation: Math.atan2(gate.out[0], gate.out[1]) }
        : null,
  };
}

/**
 * Natočený pozemek: rozmístění v osách pozemku (jako by nebyl natočený, se stejným středem
 * a seedem), pak se plot, záhony, rostliny, cestička a dům otočí kolem středu do světa.
 */
function turnedLayout(
  square: PlotSquare,
  axes: readonly [number, number],
  variant: PlotVariant,
  seed: number,
  actualHouse: Position | undefined,
  frame: ShapeFrame,
  houseRect: { halfX: number; front: number; back: number },
): HomesteadLayout {
  const rotation = square.rotation!;
  const local = unturned(square);
  const houseLocal = actualHouse
    ? (() => {
        const [x, z] = worldToPlot(square, axes, [actualHouse.x, actualHouse.z]);
        return { x, z, rotation: actualHouse.rotation - rotation };
      })()
    : undefined;
  const layout = flatLayout(local, variant, seed, houseLocal, frame, houseRect);
  const [c, s] = axes;
  const point = (p: Point): Point => plotToWorld(square, axes, p);
  const turn = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
  const [hx, hz] = point([layout.house.x, layout.house.z]);
  return {
    house: actualHouse ?? { x: hx, z: hz, rotation: plotHouseRotation(rotation) },
    fenceRect: layout.fenceRect,
    rotation,
    fence: {
      runs: layout.fence.runs.map((run) => ({
        closed: run.closed,
        posts: run.posts.map((post) => {
          const [x, z] = point([post.x, post.z]);
          const [outX, outZ] = turn(post.outX, post.outZ);
          return { ...post, x, z, outX, outZ };
        }),
      })),
    },
    beds: layout.beds.map((bed) => {
      const [x, z] = point([bed.x, bed.z]);
      return { ...bed, x, z };
    }),
    plants: layout.plants.map((plant) => {
      const [x, z] = point([plant.x, plant.z]);
      return { ...plant, x, z, rotationY: plant.rotationY + rotation };
    }),
    path: layout.path ? layout.path.map(point) : null,
    gate: null,
  };
}

/** Cestička od branky (kousek za plotem) ke dvorku před dveřmi – pás široký 1,1 m. */
function plotPath(gate: { at: Point; out: Point }, door: Point, facing: Point): Point[] {
  const from: Point = [gate.at[0] + gate.out[0] * 0.6, gate.at[1] + gate.out[1] * 0.6];
  const to: Point = [door[0] + facing[0] * 0.5, door[1] + facing[1] * 0.5];
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const w = PATH_HALF_M - 0.2;
  const px = (-(to[1] - from[1]) / length) * w;
  const pz = ((to[0] - from[0]) / length) * w;
  return [
    [from[0] + px, from[1] + pz],
    [from[0] - px, from[1] - pz],
    [to[0] - px, to[1] - pz],
    [to[0] + px, to[1] + pz],
  ];
}

function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function widen(rect: Rect, by: number): Rect {
  return { minX: rect.minX - by, maxX: rect.maxX + by, minZ: rect.minZ - by, maxZ: rect.maxZ + by };
}

/** Rezerva kolem stěn domu, ve které kůl plotu nestojí (m). */
const HOUSE_WALL_GAP_M = 0.3;

/**
 * Plot bez kůlů, které by stály v domě (dům převedené starší polozemnice stojí přes plot): kus
 * plotu se v domě přeruší – stěna domu je tam ohradou. Dům uvnitř plotu nic nezmění.
 */
function withoutPostsUnder(fence: WovenFence, house: Position, frame: ShapeFrame): WovenFence {
  const { width, depth } = DWELLING_FOOTPRINT_M.polozemnice;
  const r = shapeRect(frame, {
    minX: -width / 2 - HOUSE_WALL_GAP_M,
    maxX: width / 2 + HOUSE_WALL_GAP_M,
    minZ: -depth / 2 - HOUSE_WALL_GAP_M,
    maxZ: depth / 2 + HOUSE_WALL_GAP_M,
  });
  const c = Math.cos(house.rotation);
  const s = Math.sin(house.rotation);
  const inside = (x: number, z: number): boolean => {
    const dx = x - house.x;
    const dz = z - house.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ;
  };
  if (!fence.runs.some((run) => run.posts.some((p) => inside(p.x, p.z)))) return fence;
  const runs: FenceRun[] = [];
  for (const run of fence.runs) {
    const posts = run.posts;
    const removed = posts.map((p) => inside(p.x, p.z));
    if (!removed.some(Boolean)) {
      runs.push(run);
      continue;
    }
    // uzavřený kus začne za prvním vynechaným kůlem, aby se kusy nerozpadly přes začátek
    const start = run.closed ? removed.indexOf(true) + 1 : 0;
    const order = posts.map((_, i) => (start + i) % posts.length);
    let current: FenceRun['posts'] = [];
    for (const i of order) {
      if (removed[i]) {
        if (current.length > 0) runs.push({ posts: current, closed: false });
        current = [];
      } else {
        current.push(posts[i]!);
      }
    }
    if (current.length > 0) runs.push({ posts: current, closed: false });
  }
  return { runs };
}

/** Bod uvnitř ohrazení pozemku (s okrajem `margin` od plotu, m)? I natočeného – v jeho osách. */
export function insidePlot(square: PlotSquare, x: number, z: number, margin = 0): boolean {
  const axes = plotAxes(square);
  const [px, pz] = axes ? worldToPlot(square, axes, [x, z]) : [x, z];
  const r = plotFenceRect(axes ? unturned(square) : square);
  return (
    px > r.minX + margin && px < r.maxX - margin && pz > r.minZ + margin && pz < r.maxZ - margin
  );
}

/** Rohy obdélníku plotu ve světě (u natočeného pozemku natočené). */
export function plotFenceCorners(square: PlotSquare): Point[] {
  const axes = plotAxes(square);
  const r = plotFenceRect(axes ? unturned(square) : square);
  const corners: Point[] = [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
  return axes ? corners.map((p) => plotToWorld(square, axes, p)) : corners;
}

/** Trs plevele (trávy) na zarostlém záhonu – pata na vršku záhonu `bed`. */
export interface PlotWeed {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  bed: number;
}

/** Co z pozemku stojí: plot (kůly a větve), záhony a rostliny (podle průběhu stavby 0–1). */
export interface PlotStage {
  fence: FenceStage;
  beds: PlotBed[];
  plants: PlotPlant[];
  /** Plevel na záhonech rozpadajícího se pozemku (jinak prázdné). */
  weeds: PlotWeed[];
}

/**
 * Rozpad pozemku opuštěného nebo chátrajícího obydlí (dwelling-decay.ts): plot 0–1 (`decayFence`),
 * jak moc záhony zarostly plevelem 0–1 a seed (id obydlí) – rozpadá se pořád stejně.
 */
export interface PlotDecay {
  fence: number;
  beds: number;
  seed: number;
}

/** Trsů plevele na metr záhonu, když je zarostlý celý. */
const WEEDS_PER_M = 2.6;

/**
 * Pozemek podle průběhu: kůly se zatloukají po obvodu od branky (`posts`), až stojí všechny,
 * proplétají se větve zdola nahoru (`rails` – podíl výšek), nakonec záhony se zeleninou jeden po
 * druhém (`beds`). S rozpadem (`decay`) plot padá, zelenina mizí a záhony zarůstají plevelem.
 */
export function plotStage(
  layout: HomesteadLayout,
  progress: { posts: number; rails: number; beds: number },
  decay?: PlotDecay,
): PlotStage {
  const bedCount = Math.round(layout.beds.length * clamp01(progress.beds));
  const fence = fenceStage(layout.fence, PLOT_FENCE, progress);
  const beds = layout.beds.slice(0, bedCount);
  const plants = layout.plants.filter((plant) => plant.bed < bedCount);
  if (!decay || (decay.fence <= 0 && decay.beds <= 0)) return { fence, beds, plants, weeds: [] };
  const overgrown = clamp01(decay.beds);
  const rnd = seededRandom(5_300_000 + decay.seed * 6_151);
  // nikdo nesází – zelenina mizí, záhony zarůstají trávou
  const kept = plants.filter(() => rnd() >= overgrown * 0.95);
  const weeds = beds.flatMap((bed, i): PlotWeed[] =>
    Array.from({ length: Math.round(bed.length * WEEDS_PER_M * overgrown) }, () => ({
      x: bed.x + (rnd() - 0.5) * (bed.length - 0.2),
      z: bed.z + (rnd() - 0.5) * (BED_WIDTH_M - 0.25),
      rotationY: rnd() * Math.PI * 2,
      scale: 0.9 + 0.6 * rnd(),
      bed: i,
    })),
  );
  return { fence: decayFence(fence, decay.fence, decay.seed), beds, plants: kept, weeds };
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
  const corners = plotFenceCorners(square);
  return [...corners, corners[0]!];
}
