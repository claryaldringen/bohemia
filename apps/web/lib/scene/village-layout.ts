// Čistá geometrie vsi pro scénu (bez Babylonu): půdorysy, mnohoúhelníky, obtisky na terénu
// a vzhled dílů pole podle stavu (geometrie polí po čtvercích je ve field-cells.ts). Souřadnice
// světa scény v metrech (x, z).
import {
  DWELLING_CLEARING_M,
  type DwellingType,
  type PartStage,
  type Position,
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

// --- Vzhled dílů pole ---

export type FieldTexture = 'grass-dirt' | 'mud' | 'grass' | 'grass-lush' | 'grass-dry';

/**
 * Vzhled oseté části podle růstu obilí: zelené obilí, zralé (zlaté) obilí, strniště po sklizni.
 * Zatím ho posílá jen vývojový náhled staveb – pole podle ročního období (fields.md – Co hráč
 * vidí) ve hře ještě není, oseté pole se kreslí jako vzcházející obilí.
 */
export type CropLook = 'growing' | 'ripe' | 'stubble';

export interface PartLook {
  /** Textura terénu (apps/web/public/textures/terrain/<texture>.jpg). */
  texture: FieldTexture;
  /** Násobek barvy textury (lineární RGB). */
  tint: [number, number, number];
  /** Krytí obtisku 0–1 – louka a mladé porosty prosvítají terénem. */
  alpha: number;
  /** Řádky přes díl (brázdy / vzešlé obilí), nebo null. */
  rows: { color: [number, number, number]; alpha: number } | null;
}

/**
 * Vzhled dílu pole podle stavu: zakládané pole = rozrytý drn, připravené = holá zem s brázdami,
 * oseté = zem s řádky zeleného obilí (s `crop` zelené / zralé obilí nebo strniště), mladý úhor
 * = zaplevelená zem, pak čím dál hrubší zeleň (louka, mladý porost, křoviny) až po tmavou zeleň
 * lesa.
 */
export function partLook(stage: PartStage, crop?: CropLook): PartLook {
  if (stage === 'sown' && crop) return cropLook(crop);
  switch (stage) {
    case 'founding':
      return { texture: 'grass-dirt', tint: [0.92, 0.8, 0.66], alpha: 0.95, rows: null };
    case 'ready':
      return {
        texture: 'mud',
        tint: [1.02, 0.86, 0.68],
        alpha: 1,
        rows: { color: [0.32, 0.24, 0.17], alpha: 0.55 },
      };
    case 'sown':
      return {
        texture: 'mud',
        tint: [0.95, 0.84, 0.68],
        alpha: 1,
        rows: { color: [0.38, 0.56, 0.2], alpha: 0.75 },
      };
    case 'young-fallow':
      return { texture: 'grass-dirt', tint: [0.95, 1, 0.78], alpha: 0.9, rows: null };
    case 'meadow':
      return { texture: 'grass', tint: [1.05, 1.05, 0.9], alpha: 0.5, rows: null };
    case 'young-growth':
      return { texture: 'grass-lush', tint: [0.78, 0.92, 0.66], alpha: 0.8, rows: null };
    case 'shrub':
      return { texture: 'grass-lush', tint: [0.58, 0.74, 0.48], alpha: 0.9, rows: null };
    case 'forest':
      return { texture: 'grass-lush', tint: [0.34, 0.48, 0.3], alpha: 0.95, rows: null };
  }
}

function cropLook(crop: CropLook): PartLook {
  switch (crop) {
    case 'growing':
      return {
        texture: 'grass-lush',
        tint: [0.86, 0.98, 0.6],
        alpha: 1,
        rows: { color: [0.16, 0.27, 0.08], alpha: 0.6 },
      };
    case 'ripe':
      return {
        texture: 'grass-dry',
        tint: [1.2, 1.0, 0.6],
        alpha: 1,
        rows: { color: [0.5, 0.38, 0.18], alpha: 0.5 },
      };
    case 'stubble':
      return {
        texture: 'grass-dry',
        tint: [0.98, 0.86, 0.66],
        alpha: 1,
        rows: { color: [0.4, 0.33, 0.22], alpha: 0.55 },
      };
  }
}

// --- Skrytí stromů a kamenů pod stavbami a poli ---

/** Oblast, ve které se skryjí instance stromů a dekorací. */
export interface HideShape {
  bounds: Bounds;
  contains(x: number, z: number): boolean;
}

/** Obydlí nebo staveniště – obdélník kolem modelu i s hlínou před vchodem. */
export function dwellingHideShape(type: DwellingType, position: Position): HideShape {
  const c = DWELLING_CLEARANCE_M[type];
  const corners = [
    localToWorld(position, c.minX, c.minZ),
    localToWorld(position, c.maxX, c.minZ),
    localToWorld(position, c.maxX, c.maxZ),
    localToWorld(position, c.minX, c.maxZ),
  ];
  return { bounds: polygonBounds(corners), contains: (x, z) => pointInPolygon(corners, x, z) };
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
