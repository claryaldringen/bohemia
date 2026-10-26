import { PLAIN_FRAME, type Craft, type Position, type ShapeFrame } from '@bohemia/game';
import type { SceneCraftYard } from '../village-view';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';
import { shapedToWorld, type Point } from './village-layout';
import type { CraftSpot, WorkshopVent } from './workshop-layout';

// Dvůr kovárny a hrnčíře ve scéně (production-chains.md – Kovář; crafts.md – Hlína hrnčíře):
// redukční pec s ručním měchem před kovárnou (stojí vždy, při tavbě z ní šlehá žár a jiskry),
// houba z tavby vedle pece a hromádka hřiven pod přístřeškem (po stupních podle zásoby), před
// hrnčířem mělká jáma s hlínou, ve které se hlína šlape. Souřadnice v osách modelu dílny (x napříč,
// z k vchodu – jako PORCH_SPOTS ve workshop-layout.ts); s variantou rozměrů domu (`frame`) se
// posunou s přístřeškem. Jen čisté funkce bez Babylonu (testy) – síť s barvami vrcholů, bez textury.

/**
 * Redukční pec (kusová pec – návrh Clauda: nízká hliněná šachta jako nálezy z raného středověku):
 * střed před levým rohem přístřešku kovárny, poloměr u paty a u hrdla, výška (m).
 */
export const BLOOMERY = { lx: -2.1, lz: 6.7, radiusBottom: 0.42, radiusTop: 0.27, height: 1.1 };
/** Ruční klínový měch u paty pece – hubice u pece, zadní konec směrem ke vchodu dílny (+x). */
export const BLOOMERY_BELLOWS = { lx0: -1.62, lx1: -0.95, lz: 6.7, width: 0.34, height: 0.3 };
/** Houba z tavby – hroudy na zemi vedle pece. */
export const BLOOM_PILE = { lx: -2.85, lz: 6.05 } as const;
/** Hromádka hřiven pod přístřeškem u levé stěny. */
export const BAR_PILE = { lx: -2.15, lz: 4.85 } as const;
/**
 * Jáma s hlínou před hrnčířem (střed, poloměr dna a valu – m). Pec, měch, houba i jáma leží ve
 * vyklízené ploše dílny (DWELLING_CLEARING_M – před vchodem do 7,5 m), jiná stavba na ně nepřijde,
 * a v obdélníku dvora pro pěšiny (`WORKSHOP_YARD_PATH_BOX_M` – brána pěšin leží před dvorem).
 */
export const CLAY_PIT = { lx: 1.95, lz: 6.5, radius: 0.7, rim: 0.95 } as const;

/** Hladina hlíny v jámě podle stupně 0–3 (m nad terénem; prázdná jáma má tmavé dno). */
const CLAY_LEVEL = [-0.04, 0.0, 0.05, 0.1] as const;
/** Kolik hrud houby a hřiven (vrstvy po třech) ukazuje stupeň 0–3. */
const BLOOM_LUMPS = [0, 1, 2, 3] as const;
const BAR_LAYERS = [0, 1, 3, 5] as const;

/** Dílna, jejíž dvůr se kreslí (hotová kovárna nebo hrnčíř). */
export interface CraftYardView {
  id: number;
  craft: Craft;
  position: Position;
  frame?: ShapeFrame;
  yard?: SceneCraftYard;
}

/** Má dílna dvůr ve scéně? Kovárna vždy (pec stojí), hrnčíř jen s jámou nebo šlapáním. */
export function hasCraftYard(view: Pick<CraftYardView, 'craft' | 'yard'>): boolean {
  if (view.craft === 'smith') return true;
  return view.craft === 'potter' && ((view.yard?.clay ?? 0) > 0 || !!view.yard?.treading);
}

/** Klíč dvorů – síť se přestaví jen při změně, kterou je vidět. */
export function craftYardsKey(views: readonly CraftYardView[]): string {
  return views
    .filter(hasCraftYard)
    .map((v) => {
      const y = v.yard ?? {};
      const p = v.position;
      const f = v.frame ?? PLAIN_FRAME;
      return [
        v.id,
        v.craft,
        p.x.toFixed(2),
        p.z.toFixed(2),
        p.rotation.toFixed(3),
        JSON.stringify(f),
        // tavba mění pec (žár, uhlí v hrdle); ostatní práce dne dvůr nevidí
        y.task === 'smelt' ? 1 : 0,
        y.bloom ?? 0,
        y.bars ?? 0,
        y.clay ?? 0,
      ].join(':');
    })
    .join('|');
}

function at(view: CraftYardView, lx: number, lz: number): Point {
  return shapedToWorld(view.position, view.frame ?? PLAIN_FRAME, lx, lz);
}

/** Směr v osách modelu → svět (jednotkový jako `modelSpots`). */
function direction(view: CraftYardView, dx: number, dz: number): { x: number; z: number } {
  const c = Math.cos(view.position.rotation);
  const s = Math.sin(view.position.rotation);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

type Rgb = readonly [number, number, number];
const CLAY_WALL: Rgb = [0.62, 0.42, 0.27];
const CLAY_BURNT: Rgb = [0.5, 0.27, 0.16];
const SOOT: Rgb = [0.16, 0.13, 0.11];
const EMBERS: Rgb = [0.72, 0.22, 0.06];
const WOOD: Rgb = [0.42, 0.3, 0.19];
const LEATHER: Rgb = [0.3, 0.2, 0.13];
const BLOOM: Rgb = [0.24, 0.22, 0.22];
const RUST: Rgb = [0.38, 0.22, 0.14];
const IRON: Rgb = [0.26, 0.26, 0.28];
const EARTH: Rgb = [0.36, 0.28, 0.18];
const EARTH_DARK: Rgb = [0.22, 0.17, 0.11];
const CLAY_WET: Rgb = [0.5, 0.47, 0.4];
const CLAY_LIGHT: Rgb = [0.62, 0.58, 0.48];

function mix(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Rotační těleso kolem svislé osy v bodě `c`: prstence [poloměr, výška nad `base`, barva] zdola
 * nahoru, poloměr s mírnými hrbolky (ručně vymazaná hlína).
 */
function lathe(
  out: ColoredGeometry,
  c: Point,
  base: number,
  rings: readonly (readonly [number, number, Rgb])[],
  segments: number,
  bumps: number,
): void {
  const first = out.positions.length / 3;
  rings.forEach(([r, y, color], k) => {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const rr = r * (1 + bumps * (hash(c[0] + k, c[1] + s, 3) - 0.5));
      out.positions.push(c[0] + Math.cos(a) * rr, base + y, c[1] + Math.sin(a) * rr);
      out.colors.push(...color);
    }
  });
  for (let k = 0; k + 1 < rings.length; k++) {
    const lo = first + k * segments;
    const hi = lo + segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      out.indices.push(lo + s, hi + s, hi + s1, lo + s, hi + s1, lo + s1);
    }
  }
}

/** Kruhová plocha (víko prstence) – střed a obvod ve výšce `y`. */
function disc(
  out: ColoredGeometry,
  c: Point,
  r: number,
  y: number,
  color: Rgb,
  edge: Rgb,
  segments: number,
): void {
  const first = out.positions.length / 3;
  out.positions.push(c[0], y, c[1]);
  out.colors.push(...color);
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    out.positions.push(c[0] + Math.cos(a) * r, y, c[1] + Math.sin(a) * r);
    out.colors.push(...edge);
  }
  for (let s = 0; s < segments; s++) {
    out.indices.push(first, first + 1 + ((s + 1) % segments), first + 1 + s);
  }
}

/** Čtyřúhelník se samostatnými vrcholy (ostré hrany kvádrů a měchu). */
function quad(out: ColoredGeometry, corners: readonly number[][], color: Rgb): void {
  const first = out.positions.length / 3;
  for (const p of corners) {
    out.positions.push(p[0]!, p[1]!, p[2]!);
    out.colors.push(...color);
  }
  out.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

/**
 * Kvádr v osách modelu dílny: střed (lx, lz), poloosy, otočení `turn` kolem svislé osy, dno a vršek
 * (m nad `base`) – vršek může mít jinou výšku na začátku a konci délky (`top1` – klín měchu).
 */
function block(
  out: ColoredGeometry,
  view: CraftYardView,
  base: number,
  box: { lx: number; lz: number; halfX: number; halfZ: number; turn: number },
  y0: number,
  top: [number, number],
  side: Rgb,
  lid: Rgb,
): void {
  const c = Math.cos(box.turn);
  const s = Math.sin(box.turn);
  const corner = (u: number, v: number, high: boolean): number[] => {
    const [x, z] = at(
      view,
      box.lx + u * box.halfX * c - v * box.halfZ * s,
      box.lz + u * box.halfX * s + v * box.halfZ * c,
    );
    const y = high ? (u < 0 ? top[0] : top[1]) : y0;
    return [x, base + y, z];
  };
  const p = corner;
  quad(out, [p(-1, -1, true), p(1, -1, true), p(1, 1, true), p(-1, 1, true)], lid);
  quad(out, [p(-1, -1, false), p(1, -1, false), p(1, -1, true), p(-1, -1, true)], side);
  quad(out, [p(1, 1, false), p(-1, 1, false), p(-1, 1, true), p(1, 1, true)], side);
  quad(out, [p(-1, 1, false), p(-1, -1, false), p(-1, -1, true), p(-1, 1, true)], side);
  quad(out, [p(1, -1, false), p(1, 1, false), p(1, 1, true), p(1, -1, true)], side);
}

/** Redukční pec: šachta z hlíny, očazené hrdlo, uvnitř žhavé uhlí při tavbě, jinak saze. */
function bloomery(out: ColoredGeometry, view: CraftYardView, height: HeightFn): void {
  const c = at(view, BLOOMERY.lx, BLOOMERY.lz);
  const base = height(c[0], c[1]);
  const { radiusBottom: rb, radiusTop: rt, height: h } = BLOOMERY;
  const lerp = (t: number): number => rb + (rt - rb) * t;
  const inner = rt - 0.07;
  lathe(
    out,
    c,
    base,
    [
      [rb + 0.06, -0.1, CLAY_BURNT],
      [rb + 0.04, 0.12, CLAY_BURNT],
      [lerp(0.35) + 0.02, h * 0.35, CLAY_WALL],
      [lerp(0.7), h * 0.7, mix(CLAY_WALL, SOOT, 0.25)],
      [rt, h, mix(CLAY_WALL, SOOT, 0.7)],
      [inner, h + 0.02, SOOT],
      [inner - 0.02, h - 0.12, SOOT],
    ],
    14,
    0.08,
  );
  const smelting = view.yard?.task === 'smelt';
  disc(out, c, inner - 0.02, base + h - 0.12, smelting ? EMBERS : SOOT, SOOT, 14);
}

/** Ruční klínový měch u paty pece: spodní prkno, kožený klín a horní prkno s držadlem. */
function bellows(out: ColoredGeometry, view: CraftYardView, height: HeightFn): void {
  const b = BLOOMERY_BELLOWS;
  const lx = (b.lx0 + b.lx1) / 2;
  const half = (b.lx1 - b.lx0) / 2;
  const c = at(view, lx, b.lz);
  const base = height(c[0], c[1]);
  const box = { lx, lz: b.lz, halfX: half, halfZ: b.width / 2, turn: 0 };
  block(out, view, base, box, -0.02, [0.05, 0.05], WOOD, WOOD);
  // kožený klín – u hubice nízký, vzadu vysoký; horní prkno
  block(
    out,
    view,
    base,
    { ...box, halfZ: b.width / 2 - 0.03 },
    0.05,
    [0.1, b.height],
    LEATHER,
    WOOD,
  );
  // hubice do paty pece
  const nozzle = { lx: b.lx0 - 0.08, lz: b.lz, halfX: 0.1, halfZ: 0.04, turn: 0 };
  block(out, view, base, nozzle, 0.05, [0.11, 0.11], CLAY_BURNT, CLAY_BURNT);
}

/** Houba z tavby: 1–3 tmavé hroudy se struskou a rzí vedle pece. */
function bloomLumps(out: ColoredGeometry, view: CraftYardView, height: HeightFn): void {
  const n = BLOOM_LUMPS[view.yard?.bloom ?? 0] ?? 0;
  for (let k = 0; k < n; k++) {
    const c = at(view, BLOOM_PILE.lx + 0.28 * k - 0.1 * (k % 2), BLOOM_PILE.lz + 0.22 * (k % 2));
    const base = height(c[0], c[1]);
    const r = 0.13 + 0.03 * hash(c[0], c[1], 9);
    lathe(
      out,
      c,
      base,
      [
        [r * 0.9, -0.03, RUST],
        [r, 0.05, mix(BLOOM, RUST, 0.4)],
        [r * 0.75, 0.13, BLOOM],
        [r * 0.25, 0.17, BLOOM],
      ],
      9,
      0.35,
    );
  }
}

/** Hromádka hřiven: vrstvy po třech plochých prutech křížem (sekerovité hřivny). */
function barStack(out: ColoredGeometry, view: CraftYardView, height: HeightFn): void {
  const layers = BAR_LAYERS[view.yard?.bars ?? 0] ?? 0;
  const c = at(view, BAR_PILE.lx, BAR_PILE.lz);
  const base = height(c[0], c[1]);
  for (let layer = 0; layer < layers; layer++) {
    const turn = layer % 2 === 0 ? 0 : Math.PI / 2;
    for (let k = -1; k <= 1; k++) {
      const off = k * 0.11;
      const box = {
        lx: BAR_PILE.lx + (layer % 2 === 0 ? 0 : off),
        lz: BAR_PILE.lz + (layer % 2 === 0 ? off : 0),
        halfX: 0.19,
        halfZ: 0.04,
        turn,
      };
      const y0 = 0.035 * layer;
      const tint = hash(layer, k, 4) * 0.5;
      block(
        out,
        view,
        base,
        box,
        y0,
        [y0 + 0.035, y0 + 0.035],
        mix(IRON, RUST, tint),
        mix(IRON, RUST, tint * 0.6),
      );
    }
  }
}

/** Jáma s hlínou: val vykopané země kolem a hladina hlíny podle stupně (prázdná – tmavé dno). */
function clayPit(out: ColoredGeometry, view: CraftYardView, height: HeightFn): void {
  const c = at(view, CLAY_PIT.lx, CLAY_PIT.lz);
  const base = height(c[0], c[1]);
  const stage = view.yard?.clay ?? 0;
  const level = CLAY_LEVEL[stage] ?? 0;
  const { radius: r, rim } = CLAY_PIT;
  lathe(
    out,
    c,
    base,
    [
      [r - 0.04, level - 0.06, EARTH_DARK],
      [r, 0.12, EARTH],
      [(r + rim) / 2, 0.16, EARTH],
      [rim, -0.04, mix(EARTH, EARTH_DARK, 0.3)],
    ],
    16,
    0.1,
  );
  const surface = stage > 0 ? CLAY_WET : EARTH_DARK;
  disc(out, c, r - 0.04, base + level, stage > 0 ? CLAY_LIGHT : EARTH_DARK, surface, 16);
}

/** Síť dvorů dílen (kovárny a hrnčíři) – jedna síť s barvami vrcholů. */
export function craftYardGeometry(
  views: readonly CraftYardView[],
  height: HeightFn,
): ColoredGeometry {
  const out: ColoredGeometry = { positions: [], colors: [], indices: [] };
  for (const view of views) {
    if (!hasCraftYard(view)) continue;
    if (view.craft === 'smith') {
      bloomery(out, view, height);
      bellows(out, view, height);
      bloomLumps(out, view, height);
      barStack(out, view, height);
    } else {
      clayPit(out, view, height);
    }
  }
  return out;
}

/** Hrdlo redukční pece ve světě a výška nad terénem – žár a jiskry při tavbě (`pyre-fire.ts`). */
export function bloomeryTop(view: CraftYardView): { x: number; z: number; y: number } {
  const [x, z] = at(view, BLOOMERY.lx, BLOOMERY.lz);
  return { x, z, y: BLOOMERY.height - 0.1 };
}

/**
 * Dým kovárny podle práce dne: při tavbě z hrdla redukční pece (výheň tehdy stojí), jinak `forge`
 * – dým výhně (`workshopVents`).
 */
export function smeltVents(view: CraftYardView): WorkshopVent[] {
  const top = bloomeryTop(view);
  return [{ kind: 'craft', x: top.x, z: top.z, y: BLOOMERY.height + 0.1 }];
}

/** Kovář u tavby stojí šikmo před pecí (od jejího pláště, m) – uvnitř vyklízené plochy dílny. */
const CHARGE_GAP_M = 0.3;

/**
 * Místa u tavby: kovář sype rudu a uhlí z koše do hrdla pece (klip `seed`) šikmo zpředu od houby,
 * měchař klečí u měchu (`weed` – šlape a tlačí měch). Pak místa kovárny pod přístřeškem
 * (`craftSpots`).
 */
export function smeltSpots(view: CraftYardView): CraftSpot[] {
  const d = (BLOOMERY.radiusBottom + CHARGE_GAP_M) * Math.SQRT1_2;
  const charge = at(view, BLOOMERY.lx - d, BLOOMERY.lz + d);
  const toFurnace = direction(view, Math.SQRT1_2, -Math.SQRT1_2);
  const pump = at(view, BLOOMERY_BELLOWS.lx1 + 0.3, BLOOMERY_BELLOWS.lz);
  const toBellows = direction(view, -1, 0);
  return [
    { x: charge[0], z: charge[1], hx: toFurnace.x, hz: toFurnace.z, clip: 'seed' },
    { x: pump[0], z: pump[1], hx: toBellows.x, hz: toBellows.z, clip: 'weed' },
  ];
}

/** Úsečka, po které hrnčíř šlape hlínu v jámě (tam a zpět napříč jámou – svět). */
export function treadingLine(view: CraftYardView): [Point, Point] {
  const half = CLAY_PIT.radius * 0.55;
  return [at(view, CLAY_PIT.lx - half, CLAY_PIT.lz), at(view, CLAY_PIT.lx + half, CLAY_PIT.lz)];
}
