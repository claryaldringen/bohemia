// Čistá geometrie vsi pro scénu (bez Babylonu): půdorysy, mnohoúhelníky a obtisky na terénu
// (geometrie polí po čtvercích je ve field-cells.ts, vzhled dílů pole ve field-look.ts).
// Souřadnice světa scény v metrech (x, z).
import {
  DWELLING_CLEARING_M,
  DWELLING_FOOTPRINT_M,
  dwellingFrame,
  rotatedSquareCorners,
  shapeRect,
  shapeX,
  shapeZ,
  workshopSideM,
  type Craft,
  type DwellingType,
  type PlotVariant,
  type Position,
  type ShapeFrame,
  type ShapeRect,
} from '@bohemia/game';
import { cellsBounds, cellsContain } from './field-cells';
import type { SceneField } from './village-types';

export type Point = [number, number];

/**
 * Kolik místa obydlí ve scéně zabere i s valy, rekvizitami, staveništěm (hromada hlíny, hráň,
 * snopy – village-construction.ts) a střechou předsazenou 1,05 m před štíty (souřadnice modelu
 * ve scéně: x napříč, z k vchodu). Je to plocha, ze které osadníci odstraní překážky (herní
 * jádro – `DWELLING_CLEARING_M`), proto je jen jedna.
 */
export const DWELLING_CLEARANCE_M: Record<
  DwellingType,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = DWELLING_CLEARING_M;

/** Bod v souřadnicích modelu (x napříč, z k vchodu) → svět, natočení jako `mesh.rotation.y`. */
export function localToWorld(position: Position, lx: number, lz: number): Point {
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  return [position.x + lx * c + lz * s, position.z - lx * s + lz * c];
}

/**
 * Co určuje tvar obydlí ve scéně (population.md – Varianty rozměrů): druh, poloha, varianta
 * pozemku a příznak dnešního tvaru – `SceneDwelling` i zbytek jámy to splňují.
 */
export interface ShapedSceneDwelling {
  readonly type: DwellingType;
  readonly position: { readonly x: number; readonly z: number };
  readonly plot?: { readonly variant?: PlotVariant };
  readonly plainShape?: boolean;
  /** Řemeslo dílny – nadzemní dílna má u boční stěny přístřešek (workshops.md). */
  readonly craft?: Craft | undefined;
}

/** Zobrazení tvaru obydlí (varianta rozměrů) – jedno pro model, jámu i vše kolem domu. */
export function sceneFrame(d: ShapedSceneDwelling): ShapeFrame {
  return dwellingFrame(d);
}

/** Bod modelu obydlí (x napříč, z k vchodu) po změně tvaru `frame` → svět. */
export function shapedToWorld(
  position: Position,
  frame: ShapeFrame,
  lx: number,
  lz: number,
): Point {
  return localToWorld(position, shapeX(frame, lx), shapeZ(frame, lz));
}

/**
 * Půdorys domu v souřadnicích modelu podle varianty (u dílny i s přístřeškem `porchM` vpředu –
 * přístřešek se jen posune se štítem).
 */
export function footprintRect(d: ShapedSceneDwelling, porchM = 0): ShapeRect {
  const { width, depth } = DWELLING_FOOTPRINT_M[d.type];
  return shapeRect(sceneFrame(d), {
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2 + porchM,
  });
}

/**
 * Vyklízená plocha (staveniště) obydlí v souřadnicích modelu podle varianty; u nadzemní dílny
 * rozšířená o přístřešek u boční stěny (+x – jako `dwellingClearing` v jádru).
 */
export function clearanceRect(d: ShapedSceneDwelling): ShapeRect {
  const rect = shapeRect(sceneFrame(d), DWELLING_CLEARANCE_M[d.type]);
  const side = d.craft ? workshopSideM(d.craft, d.type) : 0;
  return side > 0 ? { ...rect, maxX: rect.maxX + side } : rect;
}

/** Rohy obdélníku v souřadnicích modelu ve světě (po obvodu, levý zadní roh první). */
export function rectCorners(position: Position, r: ShapeRect, margin = 0): Point[] {
  return [
    localToWorld(position, r.minX - margin, r.minZ - margin),
    localToWorld(position, r.maxX + margin, r.minZ - margin),
    localToWorld(position, r.maxX + margin, r.maxZ + margin),
    localToWorld(position, r.minX - margin, r.maxZ + margin),
  ];
}

/** Rohy obdélníku width × depth kolem středu obydlí, po obvodu (levý zadní roh první). */
export function footprintCorners(position: Position, width: number, depth: number): Point[] {
  const w = width / 2;
  const d = depth / 2;
  return [
    localToWorld(position, -w, -d),
    localToWorld(position, w, -d),
    localToWorld(position, w, d),
    localToWorld(position, -w, d),
  ];
}

/** Bod uvnitř mnohoúhelníku (pravidlo sudé-liché – funguje i pro nekonvexní obrys). */
export function pointInPolygon(polygon: readonly Point[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Vzdálenost bodu od úsečky. */
function segmentDistance(x: number, z: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz;
  const t =
    length2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Znaménková vzdálenost od obrysu (m): kladná uvnitř, záporná venku. */
export function signedDistance(polygon: readonly Point[], x: number, z: number): number {
  if (polygon.length < 2) return -Infinity;
  let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    distance = Math.min(distance, segmentDistance(x, z, polygon[j]!, polygon[i]!));
  }
  return pointInPolygon(polygon, x, z) ? distance : -distance;
}

/** Plocha mnohoúhelníku (m², vzorec tkaničky – bez ohledu na směr obíhání). */
export function polygonArea(polygon: readonly Point[]): number {
  let twice = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    twice += polygon[j]![0] * polygon[i]![1] - polygon[i]![0] * polygon[j]![1];
  }
  return Math.abs(twice) / 2;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function polygonBounds(polygon: readonly Point[]): Bounds {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, z] of polygon) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  return bounds;
}

/**
 * Výplň plochy jako pravidelná síť bodů s průhledností: obtisk pak jde položit na terén bod po
 * bodu (velké trojúhelníky by se do kopců zabořily) a okraj je měkký. `alphaAt` vrací krytí
 * 0–1; čtverce sítě se všemi rohy průhlednými se vynechají.
 */
export interface DecalGrid {
  /** x, z po dvojicích. */
  positions: Float32Array;
  alphas: Float32Array;
  indices: Uint32Array;
}

export function decalGrid(
  bounds: Bounds,
  step: number,
  alphaAt: (x: number, z: number) => number,
): DecalGrid {
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / step - 1e-9));
  const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / step - 1e-9));
  const sx = (bounds.maxX - bounds.minX) / nx;
  const sz = (bounds.maxZ - bounds.minZ) / nz;
  const columns = nx + 1;
  const count = columns * (nz + 1);
  const positions = new Float32Array(count * 2);
  const alphas = new Float32Array(count);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const v = j * columns + i;
      const x = bounds.minX + i * sx;
      const z = bounds.minZ + j * sz;
      positions[v * 2] = x;
      positions[v * 2 + 1] = z;
      alphas[v] = Math.min(1, Math.max(0, alphaAt(x, z)));
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      if (alphas[a]! + alphas[b]! + alphas[c]! + alphas[d]! <= 0) continue;
      // Stejné dělení čtverce jako terén (terrain-mesh.ts) – obtisk na něm leží bez zubů.
      indices.push(a, b, c, b, d, c);
    }
  }
  return { positions, alphas, indices: Uint32Array.from(indices) };
}

/**
 * Síť obtisku v „rovném prostoru“ natočené mřížky (field-cells.ts – `GridFrame`): body a krytí se
 * počítají v rovném prostoru, polohy se pak převedou do světa (`toWorld`). Bez převodu `decalGrid`.
 */
export function decalGridIn(
  toWorld: ((u: number, v: number) => Point) | null,
  bounds: Bounds,
  step: number,
  alphaAt: (u: number, v: number) => number,
): DecalGrid {
  const grid = decalGrid(bounds, step, alphaAt);
  if (!toWorld) return grid;
  const p = grid.positions;
  for (let k = 0; k < p.length; k += 2) {
    const [x, z] = toWorld(p[k]!, p[k + 1]!);
    p[k] = x;
    p[k + 1] = z;
  }
  return grid;
}

/** Krytí s měkkým okrajem: 0 venku, 1 dál než `softM` uvnitř obrysu. */
export function softCoverage(
  polygon: readonly Point[],
  softM: number,
): (x: number, z: number) => number {
  return (x, z) => smoothstep(-softM * 0.5, softM * 0.5, signedDistance(polygon, x, z));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pás podél lomené čáry (obrys pole, okraj půdorysu) jako dvojice bodů vlevo a vpravo od osy,
 * s body nejvýš po `stepM`, aby šel položit na terén. Rohy se nespojují – pás je tenký.
 */
export function stripSegments(
  points: readonly Point[],
  closed: boolean,
  widthM: number,
  stepM: number,
): Point[][] {
  const segments: Point[][] = [];
  const count = closed ? points.length : points.length - 1;
  for (let k = 0; k < count; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const nx = (-(b[1] - a[1]) / length) * (widthM / 2);
    const nz = ((b[0] - a[0]) / length) * (widthM / 2);
    const steps = Math.max(1, Math.ceil(length / stepM));
    // Pás přesahuje o půl šířky za konce, aby se v rozích úseky překryly a nevznikla mezera.
    const ext = widthM / 2 / length;
    const strip: Point[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = -ext + (s / steps) * (1 + 2 * ext);
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      strip.push([x + nx, z + nz], [x - nx, z - nz]);
    }
    segments.push(strip);
  }
  return segments;
}

// --- Skrytí stromů a kamenů pod stavbami a poli ---

/** Oblast, ve které se skryjí instance stromů a dekorací. */
export interface HideShape {
  bounds: Bounds;
  contains(x: number, z: number): boolean;
}

/**
 * Pozemek obydlí ve scéně – střed políčka a strana (jako `ScenePlot` ve village-view.ts), natočený
 * pozemek i natočení (fields.md – Natočené stavby).
 */
interface PlotArea {
  x: number;
  z: number;
  size: number;
  rotation?: number;
  /** Kde na pozemku dům stojí – v rohu je jeho varianta rozměrů menší (population.md). */
  variant?: PlotVariant;
}

/**
 * Místo obydlí ve scéně (rohy po obvodu): celé políčko pozemku, nebo u volného obydlí
 * obdélník kolem modelu i s hlínou před vchodem (`DWELLING_CLEARANCE_M`).
 */
export function dwellingArea(d: {
  type: DwellingType;
  position: Position;
  plot?: PlotArea;
  plainShape?: boolean;
  craft?: Craft | undefined;
}): Point[] {
  if (d.plot) {
    const h = d.plot.size / 2;
    const { x, z } = d.plot;
    if (d.plot.rotation) {
      return rotatedSquareCorners(x, z, d.plot.size, d.plot.rotation).map(([cx, cz]): Point => [
        cx,
        cz,
      ]);
    }
    return [
      [x - h, z - h],
      [x + h, z - h],
      [x + h, z + h],
      [x - h, z + h],
    ];
  }
  return houseArea(d);
}

/**
 * Místo domu bez pozemku – obdélník kolem modelu i s hlínou před vchodem podle varianty (u domu
 * na pozemku se z pozemku bere jen varianta – kde na něm dům stojí).
 */
export function houseArea(d: {
  type: DwellingType;
  position: Position;
  plot?: PlotArea;
  plainShape?: boolean;
  craft?: Craft | undefined;
}): Point[] {
  const { plot, ...house } = d;
  const variant = plot?.variant;
  return rectCorners(d.position, clearanceRect(variant ? { ...house, plot: { variant } } : house));
}

/** Obydlí nebo staveniště – jeho místo (pozemek, nebo obdélník kolem modelu). */
export function dwellingHideShape(d: {
  type: DwellingType;
  position: Position;
  plot?: PlotArea;
  plainShape?: boolean;
  craft?: Craft | undefined;
}): HideShape {
  const corners = dwellingArea(d);
  if (!d.plot) {
    return { bounds: polygonBounds(corners), contains: (x, z) => pointInPolygon(corners, x, z) };
  }
  // pozemek i dům – dům převedené starší polozemnice může z políčka vyčnívat
  const house = houseArea(d);
  const a = polygonBounds(corners);
  const b = polygonBounds(house);
  return {
    bounds: {
      minX: Math.min(a.minX, b.minX),
      maxX: Math.max(a.maxX, b.maxX),
      minZ: Math.min(a.minZ, b.minZ),
      maxZ: Math.max(a.maxZ, b.maxZ),
    },
    contains: (x, z) => pointInPolygon(corners, x, z) || pointInPolygon(house, x, z),
  };
}

/** Pole – ve čtvercích jeho dílů (s malým přesahem). */
export function fieldHideShape(field: SceneField, marginM = 1): HideShape | null {
  if (field.parts.length === 0) return null;
  return {
    bounds: cellsBounds(field.parts, marginM),
    contains: cellsContain(field.parts, marginM),
  };
}

/** Které body (x, z po dvojicích) leží v některé oblasti – 1 = skrýt. */
export function hiddenMask(positions: Float32Array, shapes: readonly HideShape[]): Uint8Array {
  const count = positions.length / 2;
  const mask = new Uint8Array(count);
  if (shapes.length === 0) return mask;
  const all = shapes.reduce(
    (b, s) => ({
      minX: Math.min(b.minX, s.bounds.minX),
      maxX: Math.max(b.maxX, s.bounds.maxX),
      minZ: Math.min(b.minZ, s.bounds.minZ),
      maxZ: Math.max(b.maxZ, s.bounds.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2]!;
    const z = positions[i * 2 + 1]!;
    if (x < all.minX || x > all.maxX || z < all.minZ || z > all.maxZ) continue;
    for (const shape of shapes) {
      const b = shape.bounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (shape.contains(x, z)) {
        mask[i] = 1;
        break;
      }
    }
  }
  return mask;
}

/** Deterministická náhoda (mulberry32) – rozmístění trsů a skvrn se při překreslení nemění. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
