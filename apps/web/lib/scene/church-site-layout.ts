// Staveniště kostela a hřbitůvek ve scéně (churches.md – Stavba, Scéna; plán M8): zahloubená vápenná
// pec s kamenným věncem (při pálení žhavý oheň – kouř kreslí `VillageSmoke`), vápenná jáma s bílou
// hladinou, písník ve žluté barvě písku a hromady kamene a písku; po dostavění vše zmizí. Na
// hřbitůvku kolem kostela jsou hroby křesťanů – nízký pahorek s dřevěným křížem v čele (vzor
// `cemetery-layout.ts`, kostrový hrob). Čisté funkce bez Babylonu (testy). Jáma se jako u rudišť
// (`ore-site-layout.ts`) do terénu neprořezává – hloubku dělá val kolem a tmavé dno.
import {
  CHURCH,
  churchFootprintWorld,
  churchLocalToWorld,
  churchParts,
  churchyardGraves,
  churchyardRect,
  wallThickness,
  type ChurchDims,
  type ChurchType,
  type Position,
} from '@bohemia/game';
import type { SceneChurch, SceneChurchSite } from '../church-view';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';

type RGB = readonly [number, number, number];

const SEGMENTS = 16;
/** Barvy (RGB 0–1): kámen věnce pece, popel na dně pece, hlína valu, písek, vápenná hladina. */
const KILN_STONE: RGB = [0.5, 0.48, 0.44];
const KILN_STONE_DARK: RGB = [0.36, 0.34, 0.31];
const KILN_FLOOR: RGB = [0.13, 0.11, 0.1];
const EARTH: RGB = [0.4, 0.31, 0.2];
const SAND_FLOOR: RGB = [0.78, 0.67, 0.42];
const SAND_WALL: RGB = [0.84, 0.74, 0.48];
const SAND_RIM: RGB = [0.8, 0.7, 0.45];
const LIME_PIT_FLOOR: RGB = [0.45, 0.42, 0.36];
const LIME_WHITE: RGB = [0.93, 0.93, 0.9];
const STONE_PILE: [RGB, RGB] = [
  [0.6, 0.58, 0.54],
  [0.38, 0.36, 0.33],
];
const SAND_PILE: [RGB, RGB] = [
  [0.86, 0.77, 0.52],
  [0.7, 0.6, 0.36],
];
const GRAVE_FRESH: RGB = [0.36, 0.26, 0.17];
const GRAVE_OLD: RGB = [0.3, 0.36, 0.17];
const CROSS_WOOD: RGB = [0.42, 0.3, 0.17];

/** Rozměry (m): vnitřní poloměr pece a věnce, vápenná jáma a písník. */
export const KILN_M = { floorR: 0.95, ringR: 1.55, ringH: 0.42 } as const;
export const LIME_PIT_M = { floorR: 0.9, rimR: 1.5, offset: 3.3 } as const;
export const SAND_PIT_M = { radius: 1.7 } as const;

/** Pseudonáhoda 0–1 z polohy – stejné staveniště vypadá vždy stejně. */
function hash(x: number, z: number, salt: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function empty(): ColoredGeometry {
  return { positions: [], colors: [], indices: [] };
}

/** Prstence kolem středu: [podíl poloměru, výška nad terénem, barva] od středu ven. */
type Ring = readonly [number, number, RGB];

/** Jedna zvlněná jáma nebo kopec z prstenců – střed, poloměr, nepravidelnost okraje. */
function ringed(
  out: ColoredGeometry,
  x: number,
  z: number,
  radius: number,
  center: { up: number; color: RGB },
  rings: readonly Ring[],
  height: HeightFn,
  salt: number,
  wobble = 0.1,
): void {
  const phase = hash(x, z, salt) * Math.PI * 2;
  const base = out.positions.length / 3;
  out.positions.push(x, height(x, z) + center.up, z);
  out.colors.push(...center.color);
  for (const [t, up, color] of rings) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const w = 1 + wobble * Math.sin(3 * a + phase) + wobble * 0.5 * Math.sin(5 * a + 2 * phase);
      const px = x + Math.cos(a) * radius * t * w;
      const pz = z + Math.sin(a) * radius * t * w;
      out.positions.push(px, height(px, pz) + up, pz);
      out.colors.push(...color);
    }
  }
  for (let s = 0; s < SEGMENTS; s++) {
    out.indices.push(base, base + 1 + ((s + 1) % SEGMENTS), base + 1 + s);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const inner = base + 1 + ring * SEGMENTS;
    const outer = inner + SEGMENTS;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      out.indices.push(inner + s, inner + s1, outer + s, inner + s1, outer + s1, outer + s);
    }
  }
}

/** Střed vápenné jámy: kus od pece (na straně od staveniště – směr podle polohy pece). */
export function limePitCenter(site: Pick<SceneChurchSite, 'kiln'>): { x: number; z: number } {
  const a = hash(site.kiln.x, site.kiln.z, 9) * Math.PI * 2;
  return {
    x: site.kiln.x + Math.cos(a) * LIME_PIT_M.offset,
    z: site.kiln.z + Math.sin(a) * LIME_PIT_M.offset,
  };
}

/** Hromady kamene a písku: kus od pece a od písníku (poloměr roste s hotovou prací). */
export function stoneHeapAt(site: Pick<SceneChurchSite, 'kiln'>): { x: number; z: number } {
  const a = hash(site.kiln.x, site.kiln.z, 11) * Math.PI * 2;
  return {
    x: site.kiln.x + Math.cos(a) * 5.2,
    z: site.kiln.z + Math.sin(a) * 5.2,
  };
}
export function sandHeapAt(site: Pick<SceneChurchSite, 'sandPit'>): { x: number; z: number } {
  const a = hash(site.sandPit.x, site.sandPit.z, 13) * Math.PI * 2;
  return {
    x: site.sandPit.x + Math.cos(a) * (SAND_PIT_M.radius + 1.4),
    z: site.sandPit.z + Math.sin(a) * (SAND_PIT_M.radius + 1.4),
  };
}

/** Poloměr hromady 0–1,4 m podle hotové práce (0 = nic nenalámáno / nevykopáno). */
export function heapRadius(done: number): number {
  return done <= 0 ? 0 : 0.5 + 0.9 * Math.min(1, done);
}

/** Staveniště kostela ke kreslení (bez dostavěných). */
function yards(churches: readonly SceneChurch[]): SceneChurchSite[] {
  return churches.flatMap((c) => (c.site ? [c.site] : []));
}

/**
 * Jámy staveniště: pec (kamenný věnec kolem tmavého dna; do dostavění pece jen výkop bez věnce),
 * vápenná jáma s valem a písník ve žluté barvě písku.
 */
export function churchSitePits(
  churches: readonly SceneChurch[],
  height: HeightFn,
): ColoredGeometry {
  const out = empty();
  for (const site of yards(churches)) {
    const { kiln, sandPit } = site;
    const ringColor = site.kilnBuilt ? KILN_STONE : EARTH;
    ringed(
      out,
      kiln.x,
      kiln.z,
      KILN_M.ringR,
      { up: 0.04, color: KILN_FLOOR },
      [
        [KILN_M.floorR / KILN_M.ringR, 0.08, KILN_FLOOR],
        [0.72, KILN_M.ringH * 0.8, mix(ringColor, KILN_STONE_DARK, 0.4)],
        [0.9, KILN_M.ringH, ringColor],
        [1.1, KILN_M.ringH * 0.7, mix(ringColor, EARTH, 0.4)],
        [1.4, -0.03, EARTH],
      ],
      height,
      21,
      0.04,
    );
    const lime = limePitCenter(site);
    ringed(
      out,
      lime.x,
      lime.z,
      LIME_PIT_M.rimR,
      { up: 0.04, color: LIME_PIT_FLOOR },
      [
        [0.5, 0.06, LIME_PIT_FLOOR],
        [0.75, 0.16, EARTH],
        [1, 0.26, EARTH],
        [1.35, -0.03, EARTH],
      ],
      height,
      22,
    );
    ringed(
      out,
      sandPit.x,
      sandPit.z,
      SAND_PIT_M.radius,
      { up: 0.04, color: SAND_FLOOR },
      [
        [0.45, 0.06, SAND_FLOOR],
        [0.75, 0.15, SAND_WALL],
        [1, 0.26, SAND_RIM],
        [1.4, -0.03, mix(SAND_RIM, EARTH, 0.5)],
      ],
      height,
      23,
    );
  }
  return out;
}

/** Hromady kamene (šedé) a písku (žluté) u staveniště – jen kde už se pracovalo. */
export function churchSiteHeaps(
  churches: readonly SceneChurch[],
  height: HeightFn,
): ColoredGeometry {
  const out = empty();
  for (const site of yards(churches)) {
    const heaps: [{ x: number; z: number }, number, [RGB, RGB]][] = [
      [stoneHeapAt(site), heapRadius(site.stone), STONE_PILE],
      [sandHeapAt(site), heapRadius(site.sand), SAND_PILE],
    ];
    for (const [at, radius, [light, dark]] of heaps) {
      if (radius <= 0) continue;
      const top = radius * 0.55;
      const lump = (k: number): RGB => mix(dark, light, hash(at.x + k, at.z, 5));
      ringed(
        out,
        at.x,
        at.z,
        radius,
        { up: top, color: light },
        [
          [0.35, top * 0.85, lump(1)],
          [0.65, top * 0.5, lump(2)],
          [0.95, top * 0.12, lump(3)],
          [1.05, -0.03, dark],
        ],
        height,
        24,
        0.14,
      );
    }
  }
  return out;
}

/**
 * Světle bílá hladina hašeného vápna v jámě (jen když už je co vypáleno – `limeT > 0`) a žhavý
 * oheň na dně pece (jen při pálení). Barvy jsou bez stínování (materiál svítí sám).
 */
export function churchSiteGlow(
  churches: readonly SceneChurch[],
  height: HeightFn,
): { lime: ColoredGeometry; fire: ColoredGeometry } {
  const lime = empty();
  const fire = empty();
  for (const site of yards(churches)) {
    if (site.limeT > 0) {
      const c = limePitCenter(site);
      const r = LIME_PIT_M.floorR * (0.55 + 0.45 * Math.min(1, site.limeT / CHURCH_LIME_FULL_T));
      disc(lime, c.x, c.z, r, height(c.x, c.z) + 0.1, LIME_WHITE, LIME_WHITE);
    }
    if (site.burning) {
      const { x, z } = site.kiln;
      const y = height(x, z) + 0.12;
      disc(fire, x, z, KILN_M.floorR * 0.95, y, [1, 0.62, 0.12], [0.8, 0.18, 0.04]);
    }
  }
  return { lime, fire };
}

/** Vápna (t), od kterého je jáma plná – hladina dosáhne největšího kruhu. */
const CHURCH_LIME_FULL_T = 3;

function disc(
  out: ColoredGeometry,
  x: number,
  z: number,
  radius: number,
  y: number,
  centerColor: RGB,
  edgeColor: RGB,
): void {
  const base = out.positions.length / 3;
  out.positions.push(x, y, z);
  out.colors.push(...centerColor);
  const phase = hash(x, z, 31) * Math.PI * 2;
  for (let s = 0; s < SEGMENTS; s++) {
    const a = (s / SEGMENTS) * Math.PI * 2;
    const r = radius * (1 + 0.1 * Math.sin(3 * a + phase));
    out.positions.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    out.colors.push(...edgeColor);
  }
  for (let s = 0; s < SEGMENTS; s++) {
    out.indices.push(base, base + 1 + ((s + 1) % SEGMENTS), base + 1 + s);
  }
}

/** Střed vchodu kostela ve světě a směr ven (jednotkový) – západní stěna nejzápadnější části. */
export function churchDoorWorld(
  type: ChurchType,
  dims: ChurchDims,
  position: Position,
): { x: number; z: number; outX: number; outZ: number } {
  let door: { cx: number; cz: number; minX: number } | null = null;
  for (const part of churchParts(type, dims)) {
    if (part.kind === 'aisle') continue;
    const s = part.shape;
    const t = wallThickness(part.height);
    const x =
      s.kind === 'rect'
        ? s.cx - s.length / 2 - t
        : s.kind === 'circle'
          ? s.cx - s.r - t
          : s.cx - (s.facing === 1 ? 0 : s.r + t);
    if (door === null || x < door.minX) door = { cx: x, cz: s.cz, minX: x };
  }
  const local = door ?? { cx: 0, cz: 0, minX: 0 };
  const at = churchLocalToWorld(position, local.cx, local.cz);
  const out = churchLocalToWorld({ ...position, x: 0, z: 0 }, -1, 0);
  return { x: at.x, z: at.z, outX: out.x, outZ: out.z };
}

/** Hrob na hřbitůvku: střed ve světě a natočení osy hrobu (podél osy kostela), `fresh` = čerstvý. */
export interface ChurchGravePlace {
  x: number;
  z: number;
  /** Natočení kolem y (stejné jako kostel – hrob leží podél jeho osy). */
  rotationY: number;
  fresh: boolean;
}

/** Hrob je od zdi kostela aspoň tolik metrů (m) – mimo zdi i jejich základy. */
const GRAVE_WALL_CLEAR_M = 1.1;
/** Hrob zabírá 2 × 1,25 m (`CHURCH.graveM2` = 2,5 m²). */
const GRAVE_CELL = { along: 2, across: CHURCH.graveM2 / 2 } as const;
/** Kolik posledních hrobů je čerstvých (holá hlína). */
const FRESH_CHURCH_GRAVES = 3;

function distToSegment(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function insidePolygon(
  p: { x: number; z: number },
  poly: readonly { x: number; z: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Místa hrobů na hřbitůvku (světové souřadnice): mřížka po 2 × 1,25 m uvnitř obdélníku
 * `churchyardRect`, mimo zdi kostela (`GRAVE_WALL_CLEAR_M`), od východu (kněžiště) k západu.
 * Hrob č. i je vždy na místě č. i – deterministicky z indexu (nezmění se, když přibude další).
 * Míst je nejvýš `churchyardGraves`; kreslí se prvních `count`.
 */
export function churchGravePlaces(
  type: ChurchType,
  dims: ChurchDims,
  position: Position,
  count: number,
): ChurchGravePlace[] {
  const rect = churchyardRect(type, dims);
  const footprint = churchFootprintWorld(type, dims, position);
  const total = churchyardGraves(type, dims);
  const places: { lx: number; lz: number; x: number; z: number }[] = [];
  const nx = Math.floor((rect.length - 1.6) / GRAVE_CELL.along);
  const nz = Math.floor((rect.width - 1.6) / GRAVE_CELL.across);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const lx = rect.offsetX + rect.length / 2 - 0.8 - (i + 0.5) * GRAVE_CELL.along;
      const lz = -rect.width / 2 + 0.8 + (k + 0.5) * GRAVE_CELL.across;
      const w = churchLocalToWorld(position, lx, lz);
      const blocked = footprint.some(
        (poly) =>
          insidePolygon(w, poly) ||
          poly.some(
            (a, n) => distToSegment(w, a, poly[(n + 1) % poly.length]!) < GRAVE_WALL_CLEAR_M,
          ),
      );
      if (!blocked) places.push({ lx, lz, x: w.x, z: w.z });
    }
  }
  const shown = Math.max(0, Math.min(Math.floor(count), total, places.length));
  return places.slice(0, shown).map((p, i) => ({
    x: p.x,
    z: p.z,
    rotationY: position.rotation,
    fresh: i >= shown - FRESH_CHURCH_GRAVES,
  }));
}

/** Pahorek hrobu: délka × šířka × výška (m) – nízký, oblý. */
const MOUND = { length: 1.5, width: 0.7, height: 0.22 } as const;
/** Dřevěný kříž v čele (na západním konci hrobu): výška, ramena, tloušťka (m). */
const CROSS = { h: 0.85, arm: 0.5, armY: 0.62, thick: 0.07 } as const;

/** Kvádr (osy podél hrobu) otočený o `rot` kolem y – pro kříž. */
function box(
  out: ColoredGeometry,
  cx: number,
  cz: number,
  rot: number,
  /** Půlrozměry podél osy hrobu (x) a napříč (z) a výška nad terénem od–do. */
  hx: number,
  hz: number,
  y0: number,
  y1: number,
  baseY: number,
  color: RGB,
): void {
  // místní osa x hrobu míří do (cos r, −sin r) – jako `churchLocalToWorld`
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corner = (lx: number, lz: number): [number, number] => [
    cx + lx * c + lz * s,
    cz - lx * s + lz * c,
  ];
  const quad = [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)];
  const base = out.positions.length / 3;
  for (const y of [y0, y1]) {
    for (const [px, pz] of quad) {
      out.positions.push(px, baseY + y, pz);
      out.colors.push(...color);
    }
  }
  out.indices.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.indices.push(base + i, base + j, base + 4 + i, base + j, base + 4 + j, base + 4 + i);
  }
}

/**
 * Hroby křesťanů: nízký oblý pahorek (čerstvé z holé hlíny, starší zarostlé) a dřevěný kříž
 * v čele hrobu (na západním konci – hlava k západu, nohy ke kněžišti).
 */
export function churchGraveGeometry(
  places: readonly ChurchGravePlace[],
  height: HeightFn,
): ColoredGeometry {
  const out = empty();
  for (const g of places) {
    const color = g.fresh ? GRAVE_FRESH : GRAVE_OLD;
    const c = Math.cos(g.rotationY);
    const s = Math.sin(g.rotationY);
    const at = (lx: number, lz: number): [number, number] => [
      g.x + lx * c + lz * s,
      g.z - lx * s + lz * c,
    ];
    const base = out.positions.length / 3;
    out.positions.push(g.x, height(g.x, g.z) + MOUND.height, g.z);
    out.colors.push(...mix(color, EARTH, 0.2));
    const rings: [number, number][] = [
      [0.55, 0.78],
      [1, 0],
    ];
    for (const [t, up] of rings) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const [px, pz] = at(
          (Math.cos(a) * MOUND.length * t) / 2,
          (Math.sin(a) * MOUND.width * t) / 2,
        );
        out.positions.push(px, height(px, pz) + MOUND.height * up, pz);
        out.colors.push(...color);
      }
    }
    for (let k = 0; k < 8; k++) out.indices.push(base, base + 1 + ((k + 1) % 8), base + 1 + k);
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      out.indices.push(
        base + 1 + k,
        base + 1 + k1,
        base + 9 + k,
        base + 1 + k1,
        base + 9 + k1,
        base + 9 + k,
      );
    }
    // kříž v čele (západní konec)
    const [cx, cz] = at(-MOUND.length / 2 - 0.1, 0);
    const ground = height(cx, cz);
    box(out, cx, cz, g.rotationY, CROSS.thick / 2, CROSS.thick / 2, 0, CROSS.h, ground, CROSS_WOOD);
    box(
      out,
      cx,
      cz,
      g.rotationY,
      CROSS.thick / 2,
      CROSS.arm / 2,
      CROSS.armY,
      CROSS.armY + CROSS.thick,
      ground,
      CROSS_WOOD,
    );
  }
  return out;
}

/** Klíč kreslené části kostelů (staveniště a hroby) – scéna přestaví jen při změně. */
export function churchSiteKey(churches: readonly SceneChurch[]): string {
  return JSON.stringify(
    churches.map((c) => [c.id, c.type, c.dims, c.position, c.built, c.graves, c.site ?? null]),
  );
}
