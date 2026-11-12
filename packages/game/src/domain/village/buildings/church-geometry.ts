import { detCos, detSin } from '../../landscape/det-math';
import { CHURCH, LIME, MORTAR } from '../rules/rules-masonry';
import { STONE } from '../rules/rules-stone';
import type {
  ChurchCost,
  ChurchDims,
  ChurchType,
  ChurchWork,
  MasonryCircle,
} from '../types/types-masonry';
import type { Position } from '../types/types-people';

// Geometrie a cena kostela z rozměrů (churches.md – Velikost a cena, Co kostel dává).
// Místní souřadnice: x = osa vstup → kněžiště, z = napříč, střed hlavní lodi v 0,0; míry částí
// jsou vnitřní (zdi jsou vně). Čistá deterministická doména – ze `churchParts` čerpá cena,
// umístění i scéna.

/** Tvar půdorysu části v místních souřadnicích (vnitřní míry, m). */
export type ChurchPartShape =
  | {
      readonly kind: 'rect';
      readonly cx: number;
      readonly cz: number;
      readonly length: number;
      readonly width: number;
    }
  | { readonly kind: 'circle'; readonly cx: number; readonly cz: number; readonly r: number }
  | {
      readonly kind: 'half';
      readonly cx: number;
      readonly cz: number;
      readonly r: number;
      /** Kam se půlkruh otevírá od středu: 1 = výběžek ve směru +x (východ), -1 = ve směru -x. */
      readonly facing: 1 | -1;
    };

export type ChurchPartKind = 'nave' | 'aisle' | 'chancel' | 'apse' | 'atrium';
export type ChurchRoof = 'gable' | 'cone' | 'halfCone' | 'lean' | 'none';

/** Část kostela – loď, boční loď, kněžiště, apsida nebo atrium. */
export interface ChurchPart {
  readonly kind: ChurchPartKind;
  readonly shape: ChurchPartShape;
  /** Výška vnitřku zdi, m. */
  readonly height: number;
  readonly roof: ChurchRoof;
}

export interface ChurchyardRect {
  readonly length: number;
  readonly width: number;
  /** Střed obdélníku v místní ose x (střed lodi = 0). */
  readonly offsetX: number;
}

type LongDims = Extract<ChurchDims, { kind: 'long' }>;

const SQRT2 = Math.sqrt(2);
const CIRCLE_SEGMENTS = 24;

/** Typy kostelů okruhu huti: menší a větší (churches.md – Typy podle okruhu huti). */
export function churchTypesFor(circle: MasonryCircle): readonly [ChurchType, ChurchType] {
  const t = CHURCH.types[circle];
  return [t.small, t.large];
}

/** Výchozí rozměry (churches.md – Velikost a cena): rotunda Ø 6,5 × 6 m, jednolodní 5 × 8 × 7, bazilika 8 × 20 × 10. */
export function defaultChurchDims(type: ChurchType): ChurchDims {
  if (type === 'rotunda') return { kind: 'round', diameter: 6.5, height: 6 };
  if (type === 'basilica') return { kind: 'long', width: 8, length: 20, height: 10 };
  return { kind: 'long', width: 5, length: 8, height: 7 };
}

/** Krok rozměrů kostela (m) – `clampChurchDims` i tlačítka +/− v rozhraní. */
export const CHURCH_DIMS_STEP_M = 0.5;

function snap(value: number, min: number, max: number): number {
  const half = Math.round(value / CHURCH_DIMS_STEP_M) * CHURCH_DIMS_STEP_M;
  return Math.min(max, Math.max(min, half));
}

/** Rozměry sevřené do mezí `CHURCH.limits`, na 0,5 m; druh `round` jen u rotundy. */
export function clampChurchDims(type: ChurchType, dims: ChurchDims): ChurchDims {
  const lim = CHURCH.limits;
  const height = snap(dims.height, lim.height.min, lim.height.max);
  if (type === 'rotunda') {
    const d = dims.kind === 'round' ? dims.diameter : dims.width;
    return { kind: 'round', diameter: snap(d, lim.diameter.min, lim.diameter.max), height };
  }
  const widthLim = type === 'basilica' ? lim.basilicaWidth : lim.width;
  const defaults = defaultChurchDims(type) as LongDims;
  const width = dims.kind === 'round' ? dims.diameter : dims.width;
  const length = dims.kind === 'long' ? dims.length : defaults.length;
  return {
    kind: 'long',
    width: snap(width, widthLim.min, widthLim.max),
    length: snap(length, lim.length.min, lim.length.max),
    height,
  };
}

/**
 * Nejmenší loď typu `type`, která pojme `need` lidí (`churchCapacity`; churches.md – Stavba, NPC
 * rod): rotunda roste v průměru, ostatní v délce lodi po `CHURCH_DIMS_STEP_M` od dolní meze; šířka
 * a výška z `defaultChurchDims`. Větší než meze `CHURCH.limits` nebude – pak největší možná.
 */
export function churchDimsForCapacity(type: ChurchType, need: number): ChurchDims {
  const base = defaultChurchDims(type);
  const lim = CHURCH.limits;
  let dims = clampChurchDims(
    type,
    base.kind === 'round'
      ? { ...base, diameter: lim.diameter.min }
      : { ...base, length: lim.length.min },
  );
  while (churchCapacity(type, dims) < need) {
    const grown: ChurchDims =
      dims.kind === 'round'
        ? { ...dims, diameter: dims.diameter + CHURCH_DIMS_STEP_M }
        : { ...dims, length: dims.length + CHURCH_DIMS_STEP_M };
    const next = clampChurchDims(type, grown);
    const same =
      next.kind === 'round' && dims.kind === 'round'
        ? next.diameter === dims.diameter
        : next.kind === 'long' && dims.kind === 'long' && next.length === dims.length;
    if (same) break;
    dims = next;
  }
  return dims;
}

/** Tloušťka zdi podle výšky (churches.md – Velikost a cena). */
export function wallThickness(height: number): number {
  return CHURCH.wall.baseM + CHURCH.wall.perHeightM * height;
}

/** Rozměry převedené na druh odpovídající typu (neplatný druh se nesmí dostat do výpočtu). */
function normalized(
  type: ChurchType,
  dims: ChurchDims,
): { round: { diameter: number; height: number } | null; long: LongDims | null } {
  if (type === 'rotunda') {
    const diameter = dims.kind === 'round' ? dims.diameter : dims.width;
    return { round: { diameter, height: dims.height }, long: null };
  }
  if (dims.kind === 'long') return { round: null, long: dims };
  const d = defaultChurchDims(type) as LongDims;
  return { round: null, long: { ...d, width: dims.diameter, height: dims.height } };
}

/** Části kostela v místních souřadnicích (churches.md – Velikost a cena, poměry v `CHURCH.parts`). */
export function churchParts(type: ChurchType, dims: ChurchDims): readonly ChurchPart[] {
  const p = CHURCH.parts;
  const n = normalized(type, dims);
  if (n.round) {
    const r = n.round.diameter / 2;
    const ra = (n.round.diameter * p.rotundaApseDiameter) / 2;
    const ha = n.round.height * p.rotundaApseHeight;
    return [
      {
        kind: 'nave',
        shape: { kind: 'circle', cx: 0, cz: 0, r },
        height: n.round.height,
        roof: 'cone',
      },
      {
        kind: 'apse',
        shape: { kind: 'half', cx: r, cz: 0, r: ra, facing: 1 },
        height: ha,
        roof: 'halfCone',
      },
      {
        kind: 'apse',
        shape: { kind: 'half', cx: -r, cz: 0, r: ra, facing: -1 },
        height: ha,
        roof: 'halfCone',
      },
    ];
  }
  const { width, length, height } = n.long as LongDims;
  const nave: ChurchPart = {
    kind: 'nave',
    shape: { kind: 'rect', cx: 0, cz: 0, length, width },
    height,
    roof: 'gable',
  };
  const eastHeight = height * p.chancelHeight;
  const eastWidth = width * p.chancelWidth;
  if (type === 'chancel') {
    const depth = width * p.chancelDepth;
    return [
      nave,
      {
        kind: 'chancel',
        shape: { kind: 'rect', cx: length / 2 + depth / 2, cz: 0, length: depth, width: eastWidth },
        height: eastHeight,
        roof: 'gable',
      },
    ];
  }
  // Půlkruhová apsida: průměr = šířka kněžiště (hloubka apsidy je pak půl průměru).
  const apse: ChurchPart = {
    kind: 'apse',
    shape: { kind: 'half', cx: length / 2, cz: 0, r: eastWidth / 2, facing: 1 },
    height: eastHeight,
    roof: 'halfCone',
  };
  if (type === 'apse') return [nave, apse];
  const aisleWidth = width * p.aisleWidth;
  const aisleZ = width / 2 + aisleWidth / 2;
  const aisle = (side: 1 | -1): ChurchPart => ({
    kind: 'aisle',
    shape: { kind: 'rect', cx: 0, cz: side * aisleZ, length, width: aisleWidth },
    height: height * p.aisleHeight,
    roof: 'lean',
  });
  const atriumDepth = length * p.atriumDepth;
  return [
    nave,
    aisle(1),
    aisle(-1),
    apse,
    {
      kind: 'atrium',
      shape: {
        kind: 'rect',
        cx: -(length / 2 + atriumDepth / 2),
        cz: 0,
        length: atriumDepth,
        width,
      },
      height: height * p.atriumHeight,
      roof: 'none',
    },
  ];
}

/** Délka zdi části po ose zdi; stěna sdílená s lodí patří lodi (počítá se jednou, bez otvorů). */
function wallLength(part: ChurchPart, t: number): number {
  const s = part.shape;
  if (s.kind === 'circle') return 2 * Math.PI * (s.r + t / 2);
  if (s.kind === 'half') return Math.PI * (s.r + t / 2);
  if (part.kind === 'nave') return 2 * (s.length + t) + 2 * (s.width + t);
  // aisle: vnější dlouhá strana a dva štítové konce; ostatní (kněžiště, atrium): čelo a dvě boční
  if (part.kind === 'aisle') return s.length + 2 * s.width + 2 * t;
  return s.width + 2 * s.length + 2 * t;
}

/** Vnitřní obvod zdi, ze kterého se počítá výzdoba (bez stěny sdílené s lodí). */
function innerWallLength(part: ChurchPart): number {
  const s = part.shape;
  if (s.kind === 'circle') return 2 * Math.PI * s.r;
  if (s.kind === 'half') return Math.PI * s.r;
  if (part.kind === 'nave') return 2 * (s.length + s.width);
  if (part.kind === 'aisle') return s.length + 2 * s.width;
  return s.width + 2 * s.length;
}

/** Plocha podlahy části (vnitřní míry). */
function floorArea(part: ChurchPart): number {
  const s = part.shape;
  if (s.kind === 'circle') return Math.PI * s.r * s.r;
  if (s.kind === 'half') return (Math.PI * s.r * s.r) / 2;
  return s.length * s.width;
}

/** Plocha střechy části, sklon 45° (rovná se vodorovný průmět × √2). */
function roofArea(part: ChurchPart, t: number): number {
  const s = part.shape;
  switch (part.roof) {
    case 'none':
      return 0;
    case 'cone': {
      const r = s.kind === 'circle' || s.kind === 'half' ? s.r + t / 2 : 0;
      return Math.PI * r * r * SQRT2;
    }
    case 'halfCone': {
      const r = s.kind === 'half' ? s.r + t / 2 : 0;
      return (Math.PI * r * r * SQRT2) / 2;
    }
    case 'gable':
    case 'lean':
      return s.kind === 'rect' ? SQRT2 * (s.width + t) * (s.length + t) : 0;
  }
}

/** Cena kostela z objemu zdiva (churches.md – Velikost a cena). */
export function churchCost(type: ChurchType, dims: ChurchDims): ChurchCost {
  const parts = churchParts(type, dims);
  const w = CHURCH.work;
  let wallsM3 = 0;
  let foundationM3 = 0;
  let roofM2 = 0;
  let decorM2 = 0;
  for (const part of parts) {
    const t = wallThickness(part.height);
    const len = wallLength(part, t);
    wallsM3 += len * part.height * t;
    foundationM3 += len * CHURCH.wall.foundationDepthM * t;
    roofM2 += roofArea(part, t);
    if (part.kind !== 'atrium') decorM2 += innerWallLength(part) * part.height;
  }
  const masonryM3 = wallsM3 + foundationM3;
  const limeT = masonryM3 * MORTAR.limeTPerMasonryM3;
  const limestoneT = limeT * LIME.limestonePerLimeT;
  const sandM3 = masonryM3 * MORTAR.m3PerMasonryM3 * MORTAR.sandShare;
  const woodKg = roofM2 * w.roofWoodKgPerM2 + limeT * LIME.woodKgPerLimeT;
  const limestoneM3 = limestoneT / LIME.limestoneTPerM3;
  const work: Record<ChurchWork, number> = {
    foundation: foundationM3 * (w.foundationDigManDaysPerM3 + w.wallsManDaysPerM3),
    quarry: (masonryM3 + limestoneM3) * STONE.quarryManDaysPerM3,
    lime: limeT * LIME.manDaysPerLimeT + LIME.kilnBuildManDays,
    sand: sandM3 * MORTAR.sandDigManDaysPerM3,
    walls: wallsM3 * (w.wallsManDaysPerM3 + w.dressingManDaysPerM3),
    roof: roofM2 * w.roofManDaysPerM2,
    decor: decorM2 * w.decorManDaysPerM2,
  };
  return { masonryM3, stoneM3: masonryM3, limeT, limestoneT, sandM3, woodKg, work };
}

/** Kapacita = plocha lodí (hlavní a boční) ÷ 0,75 m² na člověka, dolů (churches.md – Co kostel dává). */
export function churchCapacity(type: ChurchType, dims: ChurchDims): number {
  const area = churchParts(type, dims)
    .filter((p) => p.kind === 'nave' || p.kind === 'aisle')
    .reduce((sum, p) => sum + floorArea(p), 0);
  return Math.floor(area / CHURCH.m2PerPerson);
}

interface Extent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Vnější obdélník části včetně zdí (místní souřadnice). */
function partExtent(part: ChurchPart): Extent {
  const t = wallThickness(part.height);
  const s = part.shape;
  if (s.kind === 'rect') {
    return {
      minX: s.cx - s.length / 2 - t,
      maxX: s.cx + s.length / 2 + t,
      minZ: s.cz - s.width / 2 - t,
      maxZ: s.cz + s.width / 2 + t,
    };
  }
  const r = s.r + t;
  if (s.kind === 'circle')
    return { minX: s.cx - r, maxX: s.cx + r, minZ: s.cz - r, maxZ: s.cz + r };
  return {
    minX: s.facing === 1 ? s.cx - t : s.cx - r,
    maxX: s.facing === 1 ? s.cx + r : s.cx + t,
    minZ: s.cz - r,
    maxZ: s.cz + r,
  };
}

function churchExtent(type: ChurchType, dims: ChurchDims): Extent {
  const all = churchParts(type, dims).map(partExtent);
  return {
    minX: Math.min(...all.map((e) => e.minX)),
    maxX: Math.max(...all.map((e) => e.maxX)),
    minZ: Math.min(...all.map((e) => e.minZ)),
    maxZ: Math.max(...all.map((e) => e.maxZ)),
  };
}

/** Obdélník hřbitůvku – o pás `churchyardBeltM` větší než vnější obrys kostela. */
export function churchyardRect(type: ChurchType, dims: ChurchDims): ChurchyardRect {
  const e = churchExtent(type, dims);
  const belt = CHURCH.churchyardBeltM;
  return {
    length: e.maxX - e.minX + 2 * belt,
    width: e.maxZ - e.minZ + 2 * belt,
    offsetX: (e.minX + e.maxX) / 2,
  };
}

/** Počet hrobů na hřbitůvku = (plocha obdélníku − půdorys kostela) ÷ plocha hrobu, dolů. */
export function churchyardGraves(type: ChurchType, dims: ChurchDims): number {
  const rect = churchyardRect(type, dims);
  let footprint = 0;
  for (const part of churchParts(type, dims)) {
    const t = wallThickness(part.height);
    footprint += floorArea(part) + wallLength(part, t) * t;
  }
  return Math.max(0, Math.floor((rect.length * rect.width - footprint) / CHURCH.graveM2));
}

type Point = { x: number; z: number };

/** Vnější obrys části v místních souřadnicích (zdi započtené; kruh a půlkruh jako mnohoúhelník). */
function partOutline(part: ChurchPart): Point[] {
  const t = wallThickness(part.height);
  const s = part.shape;
  if (s.kind === 'rect') {
    const x0 = s.cx - s.length / 2 - t;
    const x1 = s.cx + s.length / 2 + t;
    const z0 = s.cz - s.width / 2 - t;
    const z1 = s.cz + s.width / 2 + t;
    return [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ];
  }
  const r = s.r + t;
  const out: Point[] = [];
  if (s.kind === 'circle') {
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
      out.push({ x: s.cx + r * detCos(a), z: s.cz + r * detSin(a) });
    }
    return out;
  }
  const half = CIRCLE_SEGMENTS / 2;
  for (let i = 0; i <= half; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / half;
    out.push({ x: s.cx + s.facing * r * detCos(a), z: s.cz + r * detSin(a) });
  }
  return out;
}

/**
 * Bod v místních souřadnicích kostela (x = osa vstup → kněžiště, z = napříč) ve světě – stejné
 * natočení jako budovy (`rectangleSamples`, `buildingLocalToWorld`) a model ve scéně (Babylon
 * `rotation.y` = `position.rotation`): místní +x míří do (cos r, −sin r). Jen `detSin` / `detCos`.
 */
export function churchLocalToWorld(position: Position, x: number, z: number): Point {
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  return { x: position.x + x * c + z * s, z: position.z - x * s + z * c };
}

/** Vnější obrysy částí ve světě (pro kontrolu terénu a scénu); jen deterministická matematika. */
export function churchFootprintWorld(
  type: ChurchType,
  dims: ChurchDims,
  position: Position,
): readonly Point[][] {
  return churchParts(type, dims).map((part) =>
    partOutline(part).map((p) => churchLocalToWorld(position, p.x, p.z)),
  );
}
