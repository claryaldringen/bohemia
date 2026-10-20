import type { SceneOrePit, SceneOreSite } from '../village-view';

// Rudiště kováře ve scéně (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „To místo, kde
// kope rudu, chci na mapě vidět.“): mělké jámy v drnu s vodou na dně a val vykopané hlíny kolem,
// u místa hromádka rezavé bahenní rudy. Jen vzhled – čisté funkce bez Babylonu (testy). Jáma se
// do terénu neprořezává (prořezávání má jen pár slotů pro obydlí): dno leží těsně nad terénem
// a hloubku dělá val kolem a tmavé mokré dno s vodou. S léty jáma zarůstá – val se slehne, voda
// vyschne a vše zezelená; po SMITH_SUPPLY.pitYears jáma zmizí (jádro ji odebere). Dno leží nad
// obtisky vsi (pole, pěšiny – ≈ 5 cm), ať je jáma vidět i na kraji pole.

/** Výška terénu ve světě (m). */
export type HeightFn = (x: number, z: number) => number;

/** Síť s barvami vrcholů (RGB 0–1) – pro jedno spojení do meshe. */
export interface ColoredGeometry {
  positions: number[];
  colors: number[];
  indices: number[];
}

/** Počet úseků po obvodu jámy a hromady. */
const SEGMENTS = 18;
/**
 * Profil jámy od středu ven (podíl poloměru, výška nad terénem čerstvé jámy v m): voda, mokré
 * dno, stěna, hřbet valu a jeho vnější svah zanořený pod terén (val navazuje na drn).
 */
const PIT_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.04],
  [0.3, 0.05],
  [0.55, 0.09],
  [0.8, 0.17],
  [1, 0.27],
  [1.3, 0.13],
  [1.65, -0.03],
];
/** Hřbet valu je na tomto prstenci profilu (od něj ven vnější svah). */
const RIM_RING = 4;

/** Barvy (RGB 0–1): mokré dno, rezavá stěna, čerstvá hlína valu, drn (zarostlá jáma). */
const MUD = [0.3, 0.22, 0.13] as const;
const RUST = [0.42, 0.22, 0.1] as const;
const EARTH = [0.4, 0.31, 0.2] as const;
const SOD = [0.32, 0.38, 0.17] as const;
/** Rezavá ruda na hromadě – světlejší a tmavší hroudy. */
const ORE_LIGHT = [0.5, 0.25, 0.09] as const;
const ORE_DARK = [0.27, 0.12, 0.05] as const;

/** Poloměr jámy (m) podle rudy, která z ní vzešla – 30 kg ≈ 0,85 m, 400 kg ≈ 1,5 m. */
export function orePitRadius(kg: number): number {
  return Math.min(1.8, 0.6 + 0.9 * Math.sqrt(Math.max(0, kg) / 400));
}

/** Poloměr hromady rudy u jámy (m): kope-li se, aspoň malá hromádka; bez rudy a kopání 0. */
export function oreHeapRadius(site: Pick<SceneOreSite, 'heapKg' | 'digging'>): number {
  if (site.heapKg <= 0 && !site.digging) return 0;
  return Math.max(0.45, 0.35 + 0.6 * Math.cbrt(Math.max(0, site.heapKg) / 400));
}

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
 * Jámy po rudě jako jedna síť: prstence profilu (PIT_PROFILE) kolem středu s nepravidelným
 * okrajem podle polohy; výška nad terénem každého vrcholu (`height`), val se zarůstáním slehne,
 * barvy od mokrého dna přes rezavou stěnu a hlínu valu k drnu – zarostlá jáma je drn.
 */
export function orePitGeometry(pits: readonly SceneOrePit[], height: HeightFn): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], colors: [], indices: [] };
  for (const pit of pits) {
    const radius = orePitRadius(pit.kg);
    const grown = Math.min(1, Math.max(0, pit.overgrowth));
    const phase = hash(pit.x, pit.z, 1) * Math.PI * 2;
    const flatten = 1 - 0.8 * grown;
    const base = out.positions.length / 3;
    // střed
    out.positions.push(pit.x, height(pit.x, pit.z) + PIT_PROFILE[0]![1], pit.z);
    out.colors.push(...mix(MUD, SOD, grown * 1.2));
    for (let ring = 1; ring < PIT_PROFILE.length; ring++) {
      const [t, up] = PIT_PROFILE[ring]!;
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(3 * a + phase) + 0.06 * Math.sin(5 * a + 2 * phase);
        const r = radius * t * wobble;
        const x = pit.x + Math.cos(a) * r;
        const z = pit.z + Math.sin(a) * r;
        const lift = ring === PIT_PROFILE.length - 1 ? up : up * flatten;
        out.positions.push(x, height(x, z) + lift, z);
        const fresh =
          ring <= 2 ? mix(MUD, RUST, (ring - 1) * 0.6) : ring === 3 ? [...RUST] : [...EARTH];
        out.colors.push(...mix(fresh, SOD, grown * (ring >= RIM_RING ? 1.4 : 1.1)));
      }
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      out.indices.push(base, base + 1 + s1, base + 1 + s);
    }
    for (let ring = 1; ring < PIT_PROFILE.length - 1; ring++) {
      const inner = base + 1 + (ring - 1) * SEGMENTS;
      const outer = inner + SEGMENTS;
      for (let s = 0; s < SEGMENTS; s++) {
        const s1 = (s + 1) % SEGMENTS;
        out.indices.push(inner + s, inner + s1, outer + s, inner + s1, outer + s1, outer + s);
      }
    }
  }
  return out;
}

/**
 * Voda na dně čerstvých jam (bahenní ruda leží v mokřině – jáma se hned zalije): kotouč těsně
 * nad dnem, s léty se zmenšuje a od poloviny zarůstání vyschne.
 */
export function orePitWater(pits: readonly SceneOrePit[], height: HeightFn): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], colors: [], indices: [] };
  for (const pit of pits) {
    const dry = Math.min(1, Math.max(0, pit.overgrowth) * 2);
    if (dry >= 1) continue;
    const radius = orePitRadius(pit.kg) * 0.62 * (1 - dry);
    const phase = hash(pit.x, pit.z, 2) * Math.PI * 2;
    const base = out.positions.length / 3;
    const y = height(pit.x, pit.z) + 0.075;
    out.positions.push(pit.x, y, pit.z);
    out.colors.push(0.38, 0.4, 0.3);
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const r = radius * (1 + 0.15 * Math.sin(2 * a + phase));
      out.positions.push(pit.x + Math.cos(a) * r, y, pit.z + Math.sin(a) * r);
      out.colors.push(0.33, 0.36, 0.28);
    }
    for (let s = 0; s < SEGMENTS; s++) {
      out.indices.push(base, base + 1 + ((s + 1) % SEGMENTS), base + 1 + s);
    }
  }
  return out;
}

/**
 * Hromádky rudy u rudišť: hrbolatý kužel rezavých hrud (poloměr `oreHeapRadius`, výška ≈ 0,55
 * poloměru) na terénu u místa.
 */
export function oreHeapGeometry(sites: readonly SceneOreSite[], height: HeightFn): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], colors: [], indices: [] };
  const rings = 5;
  for (const site of sites) {
    const radius = oreHeapRadius(site);
    if (radius <= 0) continue;
    const base = out.positions.length / 3;
    const top = radius * 0.55;
    out.positions.push(site.x, height(site.x, site.z) + top, site.z);
    out.colors.push(...ORE_LIGHT);
    for (let ring = 1; ring <= rings; ring++) {
      const t = ring / rings;
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const lump = hash(site.x + ring, site.z + s, 3);
        const r = radius * t * (0.9 + 0.2 * lump);
        const x = site.x + Math.cos(a) * r;
        const z = site.z + Math.sin(a) * r;
        const up = ring === rings ? -0.03 : top * (1 - t * t) * (0.8 + 0.4 * lump);
        out.positions.push(x, height(x, z) + up, z);
        out.colors.push(...mix(ORE_DARK, ORE_LIGHT, lump));
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
        out.indices.push(inner + s, inner + s1, outer + s, inner + s1, outer + s1, outer + s);
      }
    }
  }
  return out;
}

/** Klíč rudišť a jam – síť se přestaví jen při změně (jámy a hromady jsou po celých kg). */
export function oreSitesKey(
  sites: readonly SceneOreSite[] | undefined,
  pits: readonly SceneOrePit[] | undefined,
): string {
  const a = (sites ?? []).map((s) => `${s.x},${s.z},${s.heapKg},${s.digging ? 1 : 0}`).join(';');
  const b = (pits ?? []).map((p) => `${p.x},${p.z},${p.kg},${p.overgrowth}`).join(';');
  return `${a}|${b}`;
}
