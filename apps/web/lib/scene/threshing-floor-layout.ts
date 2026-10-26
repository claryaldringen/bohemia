import { HUMNO, threshingFloorFootprint, type Position } from '@bohemia/game';
import type { SceneThreshingFloor } from '../village-view';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';
import type { Point } from './village-layout';

// Humno ve scéně (production-chains.md – Humno; Martin 21. 10. 2026: „jen mlat bez přístřešku“,
// „ať do něj mlátí holemi“): udusaná mlatová plocha HUMNO.sizeM (obtisk – village-renderer.ts),
// stoh slámy na kraji (kupka z models/fields/haystack.glb, roste po výmlatu), rozprostřené klasy
// uprostřed, kolem nich páry mlatců s holemi, v rohu hromádka vymláceného zrna a prohazovači
// s lopatou proti větru. Při stavbě kolíky a provázek (vytyčení), hromada drnů a hlíny na mazanici.
// Místa jsou v osách humna (x napříč 8 m, z podél 10 m, počátek uprostřed) – stejná pro scénu
// i postavy (villager-plan-fields.ts). Jen čisté funkce bez Babylonu (testy).

/** Poloosy mlatu (m). */
export const FLOOR_HALF = { x: HUMNO.sizeM.x / 2, z: HUMNO.sizeM.z / 2 } as const;

/** Bod v osách humna (lx napříč, lz podél) ve světě – jako `threshingFloorFootprint`. */
export function floorPoint(position: Position, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  return { x: position.x + lx * cos + lz * sin, z: position.z - lx * sin + lz * cos };
}

/** Směr v osách humna ve světě (jednotkový, když je jednotkový vstup). */
export function floorDirection(
  position: Position,
  dx: number,
  dz: number,
): { x: number; z: number } {
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
}

/** Stoh slámy: střed (v osách humna) a měřítko kupky haystack.glb (plný ≈ 2,5 m – kupka 3,6 m). */
export const STRAW_STACK = { lx: 2.4, lz: -3.3, scale: 0.7 } as const;
/** Rozprostřené klasy (pás uprostřed mlatu, v osách humna). */
export const SHEAF_BED = { lx: -1.2, lz: -1.2, halfX: 1.5, halfZ: 2.8 } as const;
/** Vstup na humno – před předkem mlatu (+z), jako `threshingFloorEntrance` v jádru. */
export const FLOOR_ENTRANCE = { lx: 0, lz: FLOOR_HALF.z + 1 } as const;
/** Hromádka vymláceného zrna (v osách humna). */
export const GRAIN_HEAP = { lx: -2.1, lz: 3.1 } as const;

/**
 * Prohazovači stojí kolem hromádky zrna čelem proti větru (vítr vsi vane k +x a +z jako
 * `WIND` ve field-renderer.ts – lopatou se hází proti němu, plevy odletí za záda).
 */
export const WINNOW_FACING = { x: -0.8, z: -0.6 } as const;

/** Nejvýš tolik párů mlatců u rozprostřených klasů (rešerše – 4 páry a 4 pomocníci). */
export const THRESHER_PAIRS = 4;
/** Nejvýš tolik prohazovačů u hromádky zrna. */
export const WINNOWERS = 3;

/** Místo mlatce `k` (0–7) – páry naproti sobě přes pás klasů, čelem k němu (v osách humna). */
export function thresherSpot(k: number): { lx: number; lz: number; fx: number; fz: number } {
  const pair = Math.floor(k / 2) % THRESHER_PAIRS;
  const side = k % 2 === 0 ? -1 : 1;
  const lz = SHEAF_BED.lz - SHEAF_BED.halfZ + 0.7 + pair * ((2 * SHEAF_BED.halfZ - 1.4) / 3);
  return { lx: SHEAF_BED.lx + side * (SHEAF_BED.halfX + 0.25), lz, fx: -side, fz: 0 };
}

/** Místo prohazovače `k` (0–2) vedle hromádky zrna (v osách humna). */
export function winnowerSpot(k: number): { lx: number; lz: number } {
  const spots = [
    { lx: GRAIN_HEAP.lx + 1.1, lz: GRAIN_HEAP.lz - 0.6 },
    { lx: GRAIN_HEAP.lx + 0.2, lz: GRAIN_HEAP.lz - 1.3 },
    { lx: GRAIN_HEAP.lx + 1.6, lz: GRAIN_HEAP.lz + 0.6 },
  ];
  return spots[k % spots.length]!;
}

/** Fáze stavby humna podle průběhu (rešerše – sejmutí drnu 4–9 čd, hlína 4–6, dusání ≈ 10). */
export type FloorPhase = 'staking' | 'turf' | 'clay' | 'ramming' | 'smearing' | 'built';

/** Hranice fází stavby (podíl průběhu, návrh Clauda podle rešerše – 20 čd). */
export const FLOOR_PHASES: readonly { phase: FloorPhase; from: number; label: string }[] = [
  { phase: 'staking', from: 0, label: 'vytyčení – kolíky a provázek' },
  { phase: 'turf', from: 0.05, label: 'sejmutí drnu a srovnání' },
  { phase: 'clay', from: 0.35, label: 'hlína na mazanici' },
  { phase: 'ramming', from: 0.6, label: 'kropení a dusání' },
  { phase: 'smearing', from: 0.9, label: 'vymazání mlatu' },
];

export function floorPhase(floor: Pick<SceneThreshingFloor, 'built' | 'progress'>): FloorPhase {
  if (floor.built) return 'built';
  let phase: FloorPhase = 'staking';
  for (const p of FLOOR_PHASES) if (floor.progress >= p.from) phase = p.phase;
  return phase;
}

/**
 * Co ze staveniště humna stojí (po dvacetinách průběhu): kolíky s provázkem, krytí obtisku mlatu
 * 0–1, hromada drnů a hlíny (měřítko 0–1).
 */
export interface FloorSiteLook {
  staking: boolean;
  decal: number;
  turf: number;
  clay: number;
}

export function floorSiteLook(
  floor: Pick<SceneThreshingFloor, 'built' | 'progress'>,
): FloorSiteLook {
  if (floor.built) return { staking: false, decal: 1, turf: 0, clay: 0 };
  const p = Math.round(floor.progress * 20) / 20;
  const span = (from: number, to: number): number =>
    Math.min(1, Math.max(0, (p - from) / (to - from)));
  return {
    staking: p < 0.35,
    decal: p < 0.05 ? 0 : 0.35 + 0.65 * span(0.05, 1),
    // drny se skládají na hromadu, s mazanicí se jimi obloží kraj mlatu
    turf: p < 0.05 ? 0 : 0.3 + 0.7 * span(0.05, 0.35) - 0.6 * span(0.6, 1),
    // hlínu přinesou, při dusání a mazání ubývá
    clay: p < 0.35 ? 0 : 0.4 + 0.6 * span(0.35, 0.6) - 0.9 * span(0.6, 1),
  };
}

/** Hromada drnů a hlíny na staveništi (v osách humna). */
export const TURF_HEAP = { lx: -2.6, lz: 3.6, radius: 1.1, height: 0.55 } as const;
export const CLAY_HEAP = { lx: 2.2, lz: 3.3, radius: 1.0, height: 0.6 } as const;

/** Měřítko hromádky zrna podle kg (0,4 m vysoká při ≈ 600 kg, víc neroste). */
export function grainHeapScale(kg: number): number {
  return kg <= 0 ? 0 : Math.min(1, 0.35 + 0.65 * Math.sqrt(kg / 600));
}

/** Klíč humen pro scénu – mění se jen při změně, kterou je vidět. */
export function threshingFloorsKey(floors: readonly SceneThreshingFloor[]): string {
  return floors
    .map((f) => {
      const look = floorSiteLook(f);
      return [
        f.id,
        f.position.x,
        f.position.z,
        f.position.rotation,
        f.built ? 1 : 0,
        look.decal,
        look.turf,
        look.clay,
        look.staking ? 1 : 0,
        f.straw ?? 0,
        f.threshing ? 1 : 0,
        Math.round(grainHeapScale(f.grainKg ?? 0) * 20),
      ].join(',');
    })
    .join(';');
}

/** Kolíky vytyčení: obvod půdorysu (pro sdílené `StakingPegs` – kolíky a provázek). */
export function floorStakingLine(position: Position): Point[] {
  const corners = threshingFloorFootprint(position).map(([x, z]): Point => [x, z]);
  return [...corners, corners[0]!];
}

/** Barvy (vrcholy) hromad a vrstev. */
const TURF = [0.3, 0.33, 0.16] as const;
const TURF_DARK = [0.22, 0.17, 0.1] as const;
const CLAY = [0.6, 0.45, 0.26] as const;
const CLAY_DARK = [0.46, 0.34, 0.2] as const;
const STRAW = [0.84, 0.72, 0.42] as const;
const STRAW_DARK = [0.66, 0.54, 0.3] as const;
const GRAIN = [0.72, 0.55, 0.27] as const;
const GRAIN_DARK = [0.58, 0.42, 0.2] as const;

const SEGMENTS = 14;

function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

/** Kupa (drny, hlína, zrno): střed, tři prstence s hrbolky, okraj zapuštěný pod terén. */
function mound(
  out: ColoredGeometry,
  at: { x: number; z: number },
  radius: number,
  heightM: number,
  light: readonly number[],
  dark: readonly number[],
  height: HeightFn,
): void {
  const rings = 3;
  const base = out.positions.length / 3;
  out.positions.push(at.x, height(at.x, at.z) + heightM, at.z);
  out.colors.push(...light);
  for (let ring = 1; ring <= rings; ring++) {
    const t = ring / rings;
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const lump = hash(at.x + ring, at.z + s, 5);
      const r = radius * t * (0.85 + 0.3 * lump);
      const x = at.x + Math.cos(a) * r;
      const z = at.z + Math.sin(a) * r;
      const up = ring === rings ? -0.03 : heightM * (1 - t * t) * (0.75 + 0.5 * lump);
      out.positions.push(x, height(x, z) + up, z);
      out.colors.push(...mix(dark, light, lump));
    }
  }
  for (let s = 0; s < SEGMENTS; s++) {
    out.indices.push(base, base + 1 + ((s + 1) % SEGMENTS), base + 1 + s);
  }
  for (let ring = 1; ring < rings; ring++) {
    const inner = base + 1 + (ring - 1) * SEGMENTS;
    const outer = inner + SEGMENTS;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      out.indices.push(inner + s, inner + s1, outer + s1, inner + s, outer + s1, outer + s);
    }
  }
}

/**
 * Rozprostřené klasy: nízká nerovná vrstva slámy přes pás uprostřed mlatu (mřížka 0,5 m, kraje
 * zapuštěné), v osách humna.
 */
function sheafBed(out: ColoredGeometry, position: Position, height: HeightFn): void {
  const nx = Math.round((2 * SHEAF_BED.halfX) / 0.5);
  const nz = Math.round((2 * SHEAF_BED.halfZ) / 0.5);
  const base = out.positions.length / 3;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = SHEAF_BED.lx - SHEAF_BED.halfX + (i / nx) * 2 * SHEAF_BED.halfX;
      const lz = SHEAF_BED.lz - SHEAF_BED.halfZ + (j / nz) * 2 * SHEAF_BED.halfZ;
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      const lump = hash(lx + position.x, lz + position.z, 9);
      const p = floorPoint(position, lx, lz);
      out.positions.push(p.x, height(p.x, p.z) + (edge ? -0.02 : 0.05 + 0.1 * lump), p.z);
      out.colors.push(...mix(STRAW_DARK, STRAW, lump));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i;
      const b = a + nx + 1;
      out.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/** Hromady staveniště, rozprostřené klasy a hromádky zrna všech humen – jedna síť. */
export function threshingFloorGeometry(
  floors: readonly SceneThreshingFloor[],
  height: HeightFn,
): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], indices: [], colors: [] };
  for (const f of floors) {
    const look = floorSiteLook(f);
    if (look.turf > 0) {
      const at = floorPoint(f.position, TURF_HEAP.lx, TURF_HEAP.lz);
      const k = look.turf;
      mound(
        out,
        at,
        TURF_HEAP.radius * (0.5 + 0.5 * k),
        TURF_HEAP.height * k,
        TURF,
        TURF_DARK,
        height,
      );
    }
    if (look.clay > 0) {
      const at = floorPoint(f.position, CLAY_HEAP.lx, CLAY_HEAP.lz);
      const k = look.clay;
      mound(
        out,
        at,
        CLAY_HEAP.radius * (0.5 + 0.5 * k),
        CLAY_HEAP.height * k,
        CLAY,
        CLAY_DARK,
        height,
      );
    }
    if (!f.built) continue;
    if (f.threshing) sheafBed(out, f.position, height);
    const grain = grainHeapScale(f.grainKg ?? 0);
    if (grain > 0) {
      const at = floorPoint(f.position, GRAIN_HEAP.lx, GRAIN_HEAP.lz);
      mound(out, at, 0.85 * grain, 0.4 * grain, GRAIN, GRAIN_DARK, height);
    }
  }
  return out;
}
