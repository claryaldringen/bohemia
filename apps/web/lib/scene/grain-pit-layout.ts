import type { SceneGrainPit } from '../grain-pit-view';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';

// Otevřená obilná jáma ve scéně (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „Označit
// půjde jen otevřená jáma - zavřená nebude vidět“): hrdlo jámy s nízkým valem hlíny z odkryté
// pečeti, uvnitř tmavá stěna a zrno – čím víc ho v jámě je, tím víc ho z hrdla prosvítá. Vedle
// leží hroudy hlíny z pečeti. Zapečetěná jáma není vidět vůbec (scéna ji nemá). Jen vzhled – čisté
// funkce bez Babylonu (testy); podrobný model jámy přinese úloha scény (humno a jámy). Jáma se do
// terénu neprořezává (jako rudiště – ore-site-layout.ts): dno leží nad obtisky vsi a hloubku dělá
// val a tmavá stěna.

/** Poloměr hrdla jámy s valem (m) – vnější okraj valu je o PROFILE poslední prstenec dál. */
export const GRAIN_PIT_RADIUS_M = 0.75;
/** Výběr kliknutím: do tolika metrů od středu jámy (val, hroudy pečeti, nepřesná ruka). */
export const GRAIN_PIT_PICK_M = 1.6;
/** Kroužek výběru kolem jámy (m). */
export const GRAIN_PIT_RING_M = 1.9;

/** Počet úseků po obvodu. */
const SEGMENTS = 20;
/**
 * Profil od středu ven (podíl poloměru, výška nad terénem v m): zrno uvnitř hrdla, tmavá stěna,
 * hřbet valu a vnější svah zanořený pod terén.
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.05],
  [0.3, 0.05],
  [0.55, 0.06],
  [0.8, 0.1],
  [1, 0.16],
  [1.45, -0.03],
];
/** Barvy (RGB 0–1): zrno, stín v hrdle, hlína valu a pečeti. */
const GRAIN = [0.74, 0.57, 0.27] as const;
const DARK = [0.1, 0.075, 0.05] as const;
const CLAY = [0.5, 0.38, 0.23] as const;
const CLAY_DARK = [0.38, 0.28, 0.17] as const;
/** Hroudy pečeti leží vedle hrdla (m od středu) – poloměr a výška hromádky. */
const SEAL = { offsetM: 1.35, radiusM: 0.42, heightM: 0.18 } as const;

/** Pseudonáhoda 0–1 z polohy (stejná jáma vypadá vždy stejně). */
function hash(x: number, z: number, salt: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, t));
  return [a[0]! + (b[0]! - a[0]!) * k, a[1]! + (b[1]! - a[1]!) * k, a[2]! + (b[2]! - a[2]!) * k];
}

/**
 * Barva prstence `ring` profilu podle toho, jak je jáma plná: zrno sahá od středu do poloměru
 * (0,3 + 0,5 × plnost) hrdla, za ním stín stěny, val z hlíny.
 */
function ringColor(ring: number, fill: number): [number, number, number] {
  const [t] = PROFILE[ring]!;
  if (ring >= 4) return [...CLAY];
  if (ring === 3) return mix(DARK, CLAY_DARK, 0.5);
  if (fill <= 0) return [...DARK];
  const grainTo = 0.3 + 0.5 * Math.min(1, fill);
  return t < grainTo ? [...GRAIN] : t < grainTo + 0.15 ? mix(GRAIN, DARK, 0.6) : [...DARK];
}

/** Kde vedle jámy leží hroudy pečeti (pevně podle polohy jámy). */
export function sealSpot(pit: Pick<SceneGrainPit, 'x' | 'z'>): { x: number; z: number } {
  const a = hash(pit.x, pit.z, 4) * Math.PI * 2;
  return { x: pit.x + Math.cos(a) * SEAL.offsetM, z: pit.z + Math.sin(a) * SEAL.offsetM };
}

/**
 * Otevřené jámy jako jedna síť: prstence profilu (PROFILE) kolem středu s nepravidelným okrajem
 * valu, výška nad terénem každého vrcholu (`height`), barvy od zrna přes tmavou stěnu k hlíně
 * valu; vedle hrbolatá hromádka hrud z pečeti.
 */
export function grainPitGeometry(
  pits: readonly SceneGrainPit[],
  height: HeightFn,
): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], colors: [], indices: [] };
  for (const pit of pits) {
    const phase = hash(pit.x, pit.z, 1) * Math.PI * 2;
    const base = out.positions.length / 3;
    out.positions.push(pit.x, height(pit.x, pit.z) + PROFILE[0]![1], pit.z);
    out.colors.push(...ringColor(0, pit.fill));
    for (let ring = 1; ring < PROFILE.length; ring++) {
      const [t, up] = PROFILE[ring]!;
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const wobble = ring >= 3 ? 1 + 0.08 * Math.sin(3 * a + phase) : 1;
        const r = GRAIN_PIT_RADIUS_M * t * wobble;
        const x = pit.x + Math.cos(a) * r;
        const z = pit.z + Math.sin(a) * r;
        out.positions.push(x, height(x, z) + up, z);
        const lump = ring >= 4 ? hash(x, z, 2) * 0.2 : 0;
        out.colors.push(...mix(ringColor(ring, pit.fill), CLAY_DARK, lump));
      }
    }
    fan(out, base, PROFILE.length - 1);
    heap(out, sealSpot(pit), height);
  }
  return out;
}

/** Hromádka hrud hlíny z pečeti: hrbolatý nízký kužel. */
function heap(out: ColoredGeometry, at: { x: number; z: number }, height: HeightFn): void {
  const rings = 3;
  const base = out.positions.length / 3;
  out.positions.push(at.x, height(at.x, at.z) + SEAL.heightM, at.z);
  out.colors.push(...CLAY);
  for (let ring = 1; ring <= rings; ring++) {
    const t = ring / rings;
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const lump = hash(at.x + ring, at.z + s, 3);
      const r = SEAL.radiusM * t * (0.85 + 0.3 * lump);
      const x = at.x + Math.cos(a) * r;
      const z = at.z + Math.sin(a) * r;
      const up = ring === rings ? -0.02 : SEAL.heightM * (1 - t * t) * (0.7 + 0.6 * lump);
      out.positions.push(x, height(x, z) + up, z);
      out.colors.push(...mix(CLAY_DARK, CLAY, lump));
    }
  }
  fan(out, base, rings);
}

/** Trojúhelníky středu a prstenců (`rings` prstenců po SEGMENTS vrcholech za středem `base`). */
function fan(out: ColoredGeometry, base: number, rings: number): void {
  for (let s = 0; s < SEGMENTS; s++) {
    out.indices.push(base, base + 1 + ((s + 1) % SEGMENTS), base + 1 + s);
  }
  for (let ring = 1; ring < rings; ring++) {
    const inner = base + 1 + (ring - 1) * SEGMENTS;
    const outer = inner + SEGMENTS;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      out.indices.push(inner + s, inner + s1, outer + s, inner + s1, outer + s1, outer + s);
    }
  }
}

/** Je bod (x, z) na otevřené jámě – do GRAIN_PIT_PICK_M od středu? */
export function insideGrainPit(
  point: { x: number; z: number },
  pit: Pick<SceneGrainPit, 'x' | 'z'>,
): boolean {
  return Math.hypot(point.x - pit.x, point.z - pit.z) <= GRAIN_PIT_PICK_M;
}

/** Klíč otevřených jam – síť se přestaví jen při změně jámy nebo její plnosti (po 5 %). */
export function grainPitsKey(pits: readonly SceneGrainPit[] | undefined): string {
  return (pits ?? []).map((p) => `${p.id}:${p.x},${p.z}:${p.fill}`).join(';');
}
