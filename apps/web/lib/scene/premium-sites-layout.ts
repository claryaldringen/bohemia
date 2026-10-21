import {
  OBSTACLE_SOURCES,
  SURFACE_CODES,
  type Landscape,
  type PathLine,
  type PremiumFeatures,
  type PremiumSite,
  type PremiumSiteKind,
  type PremiumType,
} from '@bohemia/game';
import type { DecorPlacement } from './decor-placement';
import type { ColoredGeometry, HeightFn } from './ore-site-layout';
import { pathRibbons, PATH_WORN_LAYER, type RibbonLayer } from './path-ribbon';
import { hash01 } from './smoke-schedule';
import type { StreamCenterline } from './stream-geometry';
import {
  decalGrid,
  polygonBounds,
  softCoverage,
  smoothstep,
  type DecalGrid,
  type Point,
} from './village-layout';

// Prémiové krajiny ve scéně (premium-landscapes.md – Vzhled: „každý typ musí být vidět“): z prvků
// typu (`premiumFeaturesOf` – stejně na serveru i v prohlížeči) obtisky na terénu (náplavy,
// rudiště, hliniště, slanisko, lom, žíla, stezka, zvěřní stezky), drobné stavby z prken a kůlů
// (přístaviště s člunem, kůly u brodu, klátové úly u brtí, kůl na mohyle v sedle), tůňky (pramen,
// solanka, rezavé louže) a ozdoby z modelů krajiny (mohyla v sedle, kamenný kruh na posvátné hoře,
// rákosí mokřadu). Jen vzhled, žádné překážky – čisté funkce bez Babylonu (testy), kreslí
// premium-sites.ts. Průměrná krajina prvky nemá a nic z toho nevznikne.

type Rgb = [number, number, number];

/**
 * Kam se podívat na prémiovou krajinu: bod hlavního prvku, přiblížení kamery (m) a natočení
 * kamery (Babylon alpha) – kamera stojí na straně vsi a dívá se od vsi k prvku (hřbet průsmyku
 * pak nezakryje sedlo); prvek u vsi natočení nemá (výchozí – k severu).
 */
export interface PremiumFocus {
  x: number;
  z: number;
  radiusM: number;
  alpha?: number;
}

/** Od jaké vzdálenosti od vsi se kamera k prvku natočí (m). */
const FOCUS_TURN_M = 150;

/** Zaměření na bod s natočením kamery od vsi. */
function focusAt(
  x: number,
  z: number,
  radiusM: number,
  village: { x: number; z: number },
): PremiumFocus {
  const d = Math.hypot(village.x - x, village.z - z);
  return d < FOCUS_TURN_M
    ? { x, z, radiusM }
    : { x, z, radiusM, alpha: Math.atan2(village.z - z, village.x - x) };
}

/**
 * Hlavní prvek typu pro kameru (vývojový náhled – tlačítka typů, snímky): druh prvku (nejbližší
 * ke vsi, `village` = místo pro vesnici) a přiblížení, při kterém je celý vidět.
 */
const FOCUS: Record<
  PremiumType,
  { kind: PremiumSiteKind | 'village' | 'forest-edge' | 'bee-yard'; radiusM: number }
> = {
  'deep-gold': { kind: 'deposit', radiusM: 260 },
  'gold-stream': { kind: 'gold-placer', radiusM: 140 },
  'navigable-river': { kind: 'port', radiusM: 170 },
  fertile: { kind: 'village', radiusM: 260 },
  'ford-hill': { kind: 'ford', radiusM: 300 },
  'mountain-pass': { kind: 'pass', radiusM: 520 },
  'iron-ore': { kind: 'iron-ore', radiusM: 120 },
  'fine-clay': { kind: 'clay', radiusM: 120 },
  'oak-beech': { kind: 'forest-edge', radiusM: 200 },
  floodplain: { kind: 'meadow', radiusM: 300 },
  'south-slopes': { kind: 'slope', radiusM: 260 },
  'sacred-mountain': { kind: 'summit', radiusM: 420 },
  'sacred-spring': { kind: 'spring', radiusM: 90 },
  confluence: { kind: 'confluence', radiusM: 300 },
  'natural-fortress': { kind: 'promontory', radiusM: 300 },
  'salt-spring': { kind: 'salt', radiusM: 100 },
  'wild-bees': { kind: 'bee-yard', radiusM: 110 },
  'game-furs': { kind: 'hunting-ground', radiusM: 280 },
  'building-stone': { kind: 'quarry', radiusM: 240 },
};

/** Střed místa pro vesnici ve světě (m). */
export function villageCenter(l: Landscape): { x: number; z: number } {
  const half = (l.size * l.cellSizeM) / 2;
  return {
    x: -half + (l.villageSite.x + 0.5) * l.cellSizeM,
    z: -half + (l.villageSite.y + 0.5) * l.cellSizeM,
  };
}

/** Kam se podívat na prémiovou krajinu; bez prvků null. */
export function premiumFocus(l: Landscape, features: PremiumFeatures | null): PremiumFocus | null {
  if (!features) return null;
  const { kind, radiusM } = FOCUS[features.type];
  const village = villageCenter(l);
  if (kind === 'village') return { ...village, radiusM };
  if (kind === 'forest-edge') {
    const edge = nearestForest(l, village);
    return focusAt(edge.x, edge.z, radiusM, village);
  }
  const siteKind = kind === 'bee-yard' ? 'bee-trees' : kind;
  let best: PremiumSite | null = null;
  for (const site of features.sites) {
    if (site.kind !== siteKind) continue;
    const d = Math.hypot(site.x - village.x, site.z - village.z);
    if (!best || d < Math.hypot(best.x - village.x, best.z - village.z)) best = site;
  }
  const site = best ?? features.sites[0];
  if (!site) return null;
  const yard = kind === 'bee-yard' ? beeYard(l, site, village) : null;
  return yard
    ? focusAt(yard.x, yard.z, radiusM, village)
    : focusAt(site.x, site.z, radiusM, village);
}

/** Střed políčka lesa nejblíž bodu (doubravy – okraj lesa u vsi); bez lesa bod sám. */
function nearestForest(l: Landscape, from: { x: number; z: number }): { x: number; z: number } {
  const half = (l.size * l.cellSizeM) / 2;
  let best = from;
  let bestD = Infinity;
  for (let i = 0; i < l.surface.length; i++) {
    if (l.surface[i] !== SURFACE_CODES.forest) continue;
    const x = -half + ((i % l.size) + 0.5) * l.cellSizeM;
    const z = -half + (Math.floor(i / l.size) + 0.5) * l.cellSizeM;
    const d = Math.hypot(x - from.x, z - from.z);
    if (d < bestD) {
      bestD = d;
      best = { x, z };
    }
  }
  return best;
}

// ── Obtisky ──────────────────────────────────────────────────────────────────────────────────

/** Textura terénu z 0 A.D. (public/textures/terrain/), kterou obtisk nese. */
export type PremiumDecalTexture = 'gravel' | 'sand' | 'mud' | 'shore' | 'grass-dirt';

/** Obtisk prvku: síť s krytím, textura a barva (násobí texturu). */
export interface PremiumDecal {
  name: string;
  texture: PremiumDecalTexture;
  color: Rgb;
  grid: DecalGrid;
}

/** Krok sítě obtisku (m) – položí se na terén bod po bodu. */
const DECAL_STEP_M = 1.25;

/**
 * Barvy obtisků (násobí texturu): zlatonosný náplav – teplý světlý štěrk s pískem; bahenní ruda –
 * rezavé bahno; jemná hlína – šedookrový jíl; slanisko – bílá solná krusta na písku; suť lomu –
 * bledý vápenec; železný klobouk nad žílou – okrová zvětralina; pramen – mokrá stružka.
 */
const COLORS = {
  placer: [1.25, 1.08, 0.62],
  ore: [1.22, 0.8, 0.56],
  clay: [0.98, 0.9, 0.78],
  salt: [1.22, 1.22, 1.2],
  landing: [1.05, 1.0, 0.92],
  scree: [1.22, 1.18, 1.1],
  gossan: [1.32, 1.0, 0.62],
  wallow: [0.78, 0.7, 0.6],
  rivulet: [0.6, 0.66, 0.56],
  yard: [0.9, 0.84, 0.72],
  worn: [0.92, 0.84, 0.7],
  earth: [0.9, 0.74, 0.58],
} as const satisfies Record<string, Rgb>;

/** Hladký hodnotový šum 0–1 (skvrny obtisku – okraj a krytí nejsou jednolité). */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iz, seed);
  const b = hash01(ix + 1, iz, seed);
  const c = hash01(ix, iz + 1, seed);
  const d = hash01(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Skvrnité krytí 0–1: dvě oktávy šumu s velikostí skvrn ≈ `sizeM`, nejméně `floor`. */
function blotch(x: number, z: number, sizeM: number, seed: number, floor: number): number {
  const n =
    0.65 * valueNoise(x / sizeM, z / sizeM, seed) +
    0.35 * valueNoise(x / (sizeM * 0.4) + 7.1, z / (sizeM * 0.4) - 3.3, seed + 1);
  return floor + (1 - floor) * smoothstep(0.25, 0.7, n);
}

/** Obrys prvku jako body scény. */
function outlineOf(site: PremiumSite): Point[] {
  return (site.outline ?? []).map(([x, z]) => [x, z] as Point);
}

/** Obtisk plochy obrysu se skvrnami a měkkým okrajem. */
function outlineDecal(
  polygon: readonly Point[],
  softM: number,
  sizeM: number,
  seed: number,
  floor: number,
): DecalGrid {
  const inside = softCoverage(polygon, softM);
  const bounds = polygonBounds(polygon);
  const margin = softM;
  return decalGrid(
    {
      minX: bounds.minX - margin,
      maxX: bounds.maxX + margin,
      minZ: bounds.minZ - margin,
      maxZ: bounds.maxZ + margin,
    },
    DECAL_STEP_M,
    (x, z) => inside(x, z) * blotch(x, z, sizeM, seed, floor),
  );
}

/** Obtisk kruhu s nepravidelným okrajem (poloměr kolísá o `ragged`). */
function discDecal(
  x0: number,
  z0: number,
  radiusM: number,
  softM: number,
  seed: number,
  floor: number,
  ragged = 0.25,
): DecalGrid {
  const reach = radiusM * (1 + ragged) + softM;
  return decalGrid(
    { minX: x0 - reach, maxX: x0 + reach, minZ: z0 - reach, maxZ: z0 + reach },
    DECAL_STEP_M,
    (x, z) => {
      const angle = Math.atan2(z - z0, x - x0);
      const r =
        radiusM *
        (1 +
          ragged * (valueNoise(Math.cos(angle) * 1.6 + 5, Math.sin(angle) * 1.6 + 5, seed) - 0.5));
      const d = Math.hypot(x - x0, z - z0);
      return (1 - smoothstep(r - softM, r + softM * 0.5, d)) * blotch(x, z, 4, seed, floor);
    },
  );
}

/** Pás podél čáry (žíla, stružka) – průřez s měkkým okrajem, krytí ve skvrnách. */
const GOSSAN_LAYER: RibbonLayer = {
  width: { weak: 12, strong: 12 },
  softM: 3.5,
  alpha: () => 0.8,
  widthFactor: 1,
  wobble: 1.2,
};
const RIVULET_LAYER: RibbonLayer = {
  width: { weak: 3.2, strong: 3.2 },
  softM: 1.1,
  alpha: () => 0.85,
  widthFactor: 1,
  wobble: 0.3,
};
/**
 * Stezka prvku (obchodní stezka přes brod a sedlo – kostra světa): vyšlapaná stezka jako pevná
 * vyšlapaná cesta vsi (path-ribbon.ts – ROAD_WORN_LAYER / ROAD_EARTH_LAYER), jen o kus užší –
 * ves ji s účinky typu dostane jako svou cestu – obtisk pak leží pod pásem cesty vsi.
 */
const ROUTE_WORN_LAYER: RibbonLayer = {
  width: { weak: 1.6, strong: 1.6 },
  softM: 0.6,
  alpha: () => 0.85,
  widthFactor: 1,
};
const ROUTE_EARTH_LAYER: RibbonLayer = {
  width: { weak: 1.6, strong: 1.6 },
  softM: 0.35,
  alpha: () => 0.8,
  widthFactor: 0.5,
};

/** Čára prvku jako pěšina (síla 1, volné konce). */
function lineOf(points: readonly (readonly [number, number])[], strength = 1): PathLine {
  return {
    points: points.map(([x, z]) => ({ x, z })),
    strength: points.map(() => strength),
    years: points.map(() => 0),
    openStart: true,
    openEnd: true,
  };
}

/**
 * Obtisky prvků prémiové krajiny. `waters` – voda krajiny (potok i řeka), `height` – výška
 * terénu ve scéně (směr stružky pramene z kopce).
 */
export function premiumDecals(
  l: Landscape,
  features: PremiumFeatures | null,
  height: HeightFn,
  waters: StreamCenterline,
): PremiumDecal[] {
  if (!features) return [];
  const out: PremiumDecal[] = [];
  const add = (
    name: string,
    texture: PremiumDecalTexture,
    color: Rgb,
    grid: DecalGrid | null,
  ): void => {
    if (grid && grid.indices.length > 0) out.push({ name, texture, color, grid });
  };
  const routes: PathLine[] = [];
  features.sites.forEach((site, k) => {
    const seed = 911 + k * 7;
    switch (site.kind) {
      case 'gold-placer':
        add(
          'premium-placer',
          'sand',
          COLORS.placer,
          outlineDecal(onBank(outlineOf(site), site, waters, PLACER_SCALE), 4, 4, seed, 0.7),
        );
        break;
      case 'iron-ore':
        add('premium-ore-bog', 'mud', COLORS.ore, outlineDecal(outlineOf(site), 5, 7, seed, 0.45));
        break;
      case 'clay':
        add(
          'premium-clay',
          'sand',
          COLORS.clay,
          outlineDecal(onBank(outlineOf(site), site, waters, 1), 4, 6, seed, 0.65),
        );
        break;
      case 'salt': {
        const at = awayFromWater(waters, site, SALT_BANK_M);
        add('premium-salt', 'sand', COLORS.salt, discDecal(at.x, at.z, 9, 2.5, seed, 0.35, 0.35));
        break;
      }
      case 'port':
        add(
          'premium-landing',
          'sand',
          COLORS.landing,
          discDecal(site.x, site.z, 5.5, 2, seed, 0.75),
        );
        break;
      case 'quarry':
        add(
          'premium-scree',
          'gravel',
          COLORS.scree,
          outlineDecal(outlineOf(site), 4, 6, seed, 0.4),
        );
        break;
      case 'deposit':
        if (site.line) {
          add(
            'premium-gossan',
            'mud',
            COLORS.gossan,
            maskedRibbon([lineOf(site.line)], GOSSAN_LAYER, (x, z) => blotch(x, z, 9, seed, 0.25)),
          );
        }
        break;
      case 'spring':
        add(
          'premium-rivulet',
          'shore',
          COLORS.rivulet,
          maskedRibbon([rivulet(site, height)], RIVULET_LAYER),
        );
        break;
      case 'bee-trees': {
        const yard = beeYard(l, site, villageCenter(l));
        if (yard)
          add(
            'premium-bee-yard',
            'grass-dirt',
            COLORS.yard,
            discDecal(yard.x, yard.z, 2.6, 1.2, seed, 0.7),
          );
        break;
      }
      case 'route':
        if (site.line) routes.push(lineOf(site.line));
        break;
      case 'hunting-ground':
        add('premium-game-trails', 'grass-dirt', COLORS.worn, gameTrails(l, site));
        for (const w of wallows(site, waters)) {
          add(
            'premium-wallow',
            'mud',
            COLORS.wallow,
            discDecal(w.x, w.z, w.r, 1.2, seed + w.k, 0.75),
          );
        }
        break;
      default:
        break;
    }
  });
  if (routes.length > 0) {
    add('premium-route-worn', 'grass-dirt', COLORS.worn, maskedRibbon(routes, ROUTE_WORN_LAYER));
    add('premium-route-earth', 'mud', COLORS.earth, maskedRibbon(routes, ROUTE_EARTH_LAYER));
  }
  return out;
}

/** Náplav ve scéně o tolik větší než čočka prvku (z kamery je čočka 30 × 10 m malá). */
const PLACER_SCALE = 1.35;
/**
 * Slanisko ve scéně nejméně tolik metrů od vody: místo prvku leží 6 m od vody po políčkách,
 * vyhlazené koryto scény (tůně) bývá širší a slanisko by se utopilo.
 */
const SALT_BANK_M = 9;

/** Náplav a hliniště ve scéně nejméně tolik metrů od okraje vody (střed obrysu). */
const BANK_PATCH_M = 3;

/**
 * Obrys plochy u vody ve scéně: zvětšený `k`× kolem bodu prvku a posunutý od vody, až je střed
 * aspoň BANK_PATCH_M na břehu – čočka prvku sahá do vody po políčkách, vyhlazené koryto scény je
 * jinde a pod kalnou hladinou by plocha zmizela.
 */
function onBank(
  polygon: readonly Point[],
  center: { x: number; z: number },
  waters: StreamCenterline,
  k: number,
): Point[] {
  const at = awayFromWater(waters, center, BANK_PATCH_M);
  return polygon.map(([x, z]) => [at.x + (x - center.x) * k, at.z + (z - center.z) * k]);
}

/**
 * Kaliště zvěře (hojná zvěř, návrh Clauda): bahnité plochy na břehu mokřadu honitby po ≈ 90 m
 * podél `line` prvku, střídavě na obou stranách, 4–7 m od vody.
 */
export function wallows(
  site: PremiumSite,
  waters: StreamCenterline,
): { x: number; z: number; r: number; k: number }[] {
  const line = site.line ?? [];
  const out: { x: number; z: number; r: number; k: number }[] = [];
  let travelled = 0;
  let next = 30;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    const length = Math.hypot(bx - ax, bz - az);
    travelled += length;
    if (travelled < next || length < 1e-6) continue;
    next += 90;
    const k = out.length;
    const side = k % 2 === 0 ? 1 : -1;
    const nx = (-(bz - az) / length) * side;
    const nz = ((bx - ax) / length) * side;
    let d = 0;
    while (d < 40 && waters.nearest(bx + nx * d, bz + nz * d, 60).bankDistance < 4) d += 0.5;
    out.push({ x: bx + nx * (d + 1.5), z: bz + nz * (d + 1.5), r: 3 + hash01(k, 1, 91) * 2, k });
  }
  return out;
}

/** Bod posunutý od vody, až je aspoň `bankM` od jejího okraje (nejvýš o 25 m). */
export function awayFromWater(
  waters: StreamCenterline,
  site: { x: number; z: number },
  bankM: number,
): { x: number; z: number } {
  const [dx, dz] = towardWater(waters, site.x, site.z);
  let x = site.x;
  let z = site.z;
  for (let d = 0; d < 25; d += 0.5) {
    if (waters.nearest(x, z, 60).bankDistance >= bankM) break;
    x = site.x - dx * d;
    z = site.z - dz * d;
  }
  return { x, z };
}

/** Pás čar `lines` (path-ribbon.ts) s krytím násobeným `alphaAt`, bez plácků rozcestí. */
function maskedRibbon(
  lines: readonly PathLine[],
  layer: RibbonLayer,
  alphaAt: (x: number, z: number) => number = () => 1,
): DecalGrid {
  return pathRibbons(lines, layer, undefined, alphaAt, []);
}

/** Délka stružky pramene (m) a krok po spádu. */
const RIVULET_STEPS = 26;
const RIVULET_STEP_M = 1.5;

/** Stružka pramene: z pramene po spádu terénu (≈ 40 m), kroky po 1,5 m. */
export function rivulet(site: { x: number; z: number }, height: HeightFn): PathLine {
  const points: [number, number][] = [[site.x, site.z]];
  let x = site.x;
  let z = site.z;
  for (let k = 0; k < RIVULET_STEPS; k++) {
    const e = 1.5;
    const gx = height(x + e, z) - height(x - e, z);
    const gz = height(x, z + e) - height(x, z - e);
    const g = Math.hypot(gx, gz);
    if (g < 1e-4) break;
    x -= (gx / g) * RIVULET_STEP_M;
    z -= (gz / g) * RIVULET_STEP_M;
    points.push([x, z]);
  }
  return lineOf(points, 1);
}

/**
 * Zvěřní stezky honitby (hojná zvěř): z mokřadu u potoka (`line` prvku) do lesa honitby – slabě
 * prošlapané stopy po ≈ 70 m mokřadu, směrem od vody ke středu honitby, 35–60 m dlouhé.
 */
export function gameTrailLines(l: Landscape, site: PremiumSite): PathLine[] {
  if (!site.line || site.line.length < 2) return [];
  const outline = site.outline ?? [];
  let cx = site.x;
  let cz = site.z;
  if (outline.length > 0) {
    cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length;
    cz = outline.reduce((sum, p) => sum + p[1], 0) / outline.length;
  }
  const lines: PathLine[] = [];
  let travelled = 0;
  let next = 20;
  for (let i = 1; i < site.line.length; i++) {
    const [ax, az] = site.line[i - 1]!;
    const [bx, bz] = site.line[i]!;
    travelled += Math.hypot(bx - ax, bz - az);
    if (travelled < next) continue;
    next += 70;
    const k = lines.length;
    // od vody ke středu honitby, s odchylkou ±35°
    const base = Math.atan2(cz - bz, cx - bx) + (hash01(k, 3, 77) - 0.5) * 1.2;
    const length = 35 + hash01(k, 4, 77) * 25;
    const points: [number, number][] = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      const bend = Math.sin(t * Math.PI * 1.5 + k) * 0.25;
      const angle = base + bend;
      const prev = points[points.length - 1] ?? [bx, bz];
      points.push(
        s === 0
          ? [bx, bz]
          : [prev[0] + Math.cos(angle) * (length / 8), prev[1] + Math.sin(angle) * (length / 8)],
      );
    }
    if (points.every(([x, z]) => insideMap(l, x, z))) lines.push(lineOf(points, 0.7));
  }
  return lines;
}

function gameTrails(l: Landscape, site: PremiumSite): DecalGrid | null {
  const lines = gameTrailLines(l, site);
  return lines.length > 0 ? maskedRibbon(lines, PATH_WORN_LAYER) : null;
}

function insideMap(l: Landscape, x: number, z: number): boolean {
  const half = (l.size * l.cellSizeM) / 2 - l.cellSizeM;
  return Math.abs(x) < half && Math.abs(z) < half;
}

// ── Stavby z prken a kůlů, tůňky ──────────────────────────────────────────────────────────────

/** Dřevo (prkna, kůly, úly, člun) a voda tůněk – sítě s barvami vrcholů. */
export interface PremiumProps {
  wood: ColoredGeometry;
  pools: ColoredGeometry;
}

/** Barvy dřeva a vody (RGB 0–1). */
const WOOD = {
  plank: [0.46, 0.36, 0.25],
  post: [0.33, 0.25, 0.17],
  hull: [0.5, 0.36, 0.22],
  hullInside: [0.3, 0.2, 0.12],
  hive: [0.58, 0.47, 0.33],
  roof: [0.3, 0.23, 0.16],
  hole: [0.08, 0.06, 0.04],
  straw: [0.72, 0.62, 0.36],
} as const satisfies Record<string, Rgb>;
const POOL = {
  spring: { center: [0.42, 0.56, 0.62], edge: [0.46, 0.58, 0.58] },
  brine: { center: [0.42, 0.46, 0.4], edge: [0.78, 0.78, 0.74] },
  rust: { center: [0.3, 0.17, 0.07], edge: [0.4, 0.24, 0.12] },
} as const satisfies Record<string, { center: Rgb; edge: Rgb }>;

/** Dřevo a tůňky prvků; `height` – výška terénu ve scéně, `water` – hladina ve scéně (m). */
export function premiumProps(
  l: Landscape,
  features: PremiumFeatures | null,
  height: HeightFn,
  waters: StreamCenterline,
  heightScale: number,
): PremiumProps {
  const wood: ColoredGeometry = { positions: [], colors: [], indices: [] };
  const pools: ColoredGeometry = { positions: [], colors: [], indices: [] };
  if (!features) return { wood, pools };
  const village = villageCenter(l);
  features.sites.forEach((site, k) => {
    switch (site.kind) {
      case 'port':
        addLanding(wood, site, height, waters, heightScale);
        break;
      case 'ford':
        addFordPoles(wood, site, height, waters);
        break;
      case 'bee-trees': {
        const yard = beeYard(l, site, village);
        if (yard) {
          for (let h = 0; h < 3; h++) {
            const side = h - 1;
            addHive(
              wood,
              yard.x - yard.dz * side * 1.3,
              yard.z + yard.dx * side * 1.3,
              height,
              Math.atan2(yard.dz, yard.dx),
              k * 3 + h,
            );
          }
        }
        break;
      }
      case 'pass':
        addPole(wood, site.x, site.z, height(site.x, site.z), 3.2, 0.09, true);
        break;
      case 'spring':
        addPool(pools, site.x, site.z, 2, height, POOL.spring, k);
        addStrip(pools, rivulet(site, height), 1.1, height, POOL.spring);
        break;
      case 'salt': {
        const at = awayFromWater(waters, site, SALT_BANK_M);
        addPool(pools, at.x, at.z, 2.8, height, POOL.brine, k);
        break;
      }
      case 'hunting-ground':
        for (const w of wallows(site, waters)) {
          addPool(pools, w.x, w.z, w.r * 0.35, height, POOL.rust, k * 50 + w.k);
        }
        break;
      case 'iron-ore':
        for (let p = 0; p < 4; p++) {
          const a = hash01(k, p, 31) * Math.PI * 2;
          const r = 3 + hash01(k, p, 32) * 7;
          const x = site.x + Math.cos(a) * r * 1.6;
          const z = site.z + Math.sin(a) * r * 0.8;
          addPool(pools, x, z, 0.7 + hash01(k, p, 33) * 0.7, height, POOL.rust, k * 8 + p);
        }
        break;
      default:
        break;
    }
  });
  return { wood, pools };
}

/** Směr k vodě (jednotkový vektor) z bodu na břehu – proti nárůstu vzdálenosti od vody. */
function towardWater(waters: StreamCenterline, x: number, z: number): [number, number] {
  const e = 1.5;
  const d = (px: number, pz: number): number => waters.nearest(px, pz, 60).bankDistance;
  const gx = d(x + e, z) - d(x - e, z);
  const gz = d(x, z + e) - d(x, z - e);
  const g = Math.hypot(gx, gz);
  return g > 1e-6 && Number.isFinite(g) ? [-gx / g, -gz / g] : [1, 0];
}

/**
 * Přístaviště: mola z prken na kůlech od břehu do vody (8 m) a vydlabaný člun (monoxyl)
 * vytažený na písčitém břehu vedle něj.
 */
function addLanding(
  out: ColoredGeometry,
  site: PremiumSite,
  height: HeightFn,
  waters: StreamCenterline,
  heightScale: number,
): void {
  const [dx, dz] = towardWater(waters, site.x, site.z);
  // okraj vody po směru k vodě
  let edge = 0;
  while (edge < 30 && waters.nearest(site.x + dx * edge, site.z + dz * edge, 60).bankDistance > 0) {
    edge += 0.5;
  }
  const near = waters.nearest(site.x + dx * edge, site.z + dz * edge, 60);
  const level = Number.isFinite(near.level) ? near.level * heightScale : height(site.x, site.z);
  // molo začíná, kde břeh sklesne skoro k hladině (terén je ve scéně převýšený)
  const deckY = level + 0.45;
  let start = Math.max(0, edge - 8);
  while (start < edge && height(site.x + dx * start, site.z + dz * start) > deckY - 0.1) {
    start += 0.25;
  }
  start = Math.max(0, start - 0.8);
  const length = 8;
  const cx = site.x + dx * (start + length / 2);
  const cz = site.z + dz * (start + length / 2);
  const angle = Math.atan2(dx, dz);
  addBox(out, cx, deckY, cz, 1.9, 0.14, length, angle, WOOD.plank);
  // kůly po stranách mola – ode dna kousek nad prkna
  for (let s = 0; s < 4; s++) {
    const along = start + 0.4 + (s / 3) * (length - 0.8);
    for (const side of [-1, 1]) {
      const px = site.x + dx * along + dz * side * 1.05;
      const pz = site.z + dz * along - dx * side * 1.05;
      const bottom = Math.min(height(px, pz), level) - 0.6;
      addCylinder(out, px, bottom, pz, 0.11, deckY + 0.3 - bottom, 6, WOOD.post, WOOD.post);
    }
  }
  // člun vytažený na písku přístaviště, bokem k vodě
  const bx = site.x + dz * 3.2;
  const bz = site.z - dx * 3.2;
  addDugout(out, bx, height(bx, bz) + 0.02, bz, angle + Math.PI / 2 + 0.2);
}

/** Kůly u brodu: na obou březích dva kůly s otýpkou slámy (značka brodu). */
function addFordPoles(
  out: ColoredGeometry,
  site: PremiumSite,
  height: HeightFn,
  waters: StreamCenterline,
): void {
  const here = waters.nearest(site.x, site.z, 60);
  if (!Number.isFinite(here.distance)) return;
  const nx = -here.flowZ;
  const nz = here.flowX;
  for (const side of [-1, 1]) {
    let d = 0;
    while (
      d < 60 &&
      waters.nearest(site.x + nx * side * d, site.z + nz * side * d, 60).bankDistance < 1.5
    ) {
      d += 0.5;
    }
    for (const along of [-2.2, 2.2]) {
      const x = site.x + nx * side * d + here.flowX * along;
      const z = site.z + nz * side * d + here.flowZ * along;
      addPole(out, x, z, height(x, z), 2.6, 0.1, true);
    }
  }
}

/**
 * Místo pro úly u brtě (návrh Clauda – brtě stojí 30–90 m v lese, pod korunami by z kamery
 * nebyly vidět): okraj lesa nejblíž brti po směru ke vsi – včely létají z lesa na louky. Bod
 * 3 m za okrajem lesa a směr od brtě k louce; bez okraje do 200 m null.
 */
export function beeYard(
  l: Landscape,
  site: { x: number; z: number },
  village: { x: number; z: number },
): { x: number; z: number; dx: number; dz: number } | null {
  const toward = Math.hypot(village.x - site.x, village.z - site.z) || 1;
  const dx = (village.x - site.x) / toward;
  const dz = (village.z - site.z) / toward;
  for (let d = 0; d <= 200; d += 1.5) {
    const x = site.x + dx * d;
    const z = site.z + dz * d;
    if (surfaceCode(l, x, z) === SURFACE_CODES.forest) continue;
    if (surfaceCode(l, x, z) === SURFACE_CODES.water) return null;
    return { x: x + dx * 3, z: z + dz * 3, dx, dz };
  }
  return null;
}

function surfaceCode(l: Landscape, x: number, z: number): number {
  const half = (l.size * l.cellSizeM) / 2;
  const tx = Math.min(l.size - 1, Math.max(0, Math.floor((x + half) / l.cellSizeM)));
  const tz = Math.min(l.size - 1, Math.max(0, Math.floor((z + half) / l.cellSizeM)));
  return l.surface[tz * l.size + tx]!;
}

/** Klátový úl: špalek dutého kmene (≈ 1,3 m) s prkennou stříškou a česnem ve směru `facing`. */
function addHive(
  out: ColoredGeometry,
  x: number,
  z: number,
  height: HeightFn,
  facing: number,
  k: number,
): void {
  const ground = height(x, z);
  const h = 1.45 + hash01(k, 2, 41) * 0.3;
  addCylinder(out, x, ground - 0.1, z, 0.4, h + 0.1, 8, WOOD.hive, WOOD.hive);
  addBox(out, x, ground + h + 0.05, z, 1.15, 0.09, 1.15, facing, WOOD.roof);
  // česno – tmavý otvor na straně k louce
  const hx = x + Math.cos(facing) * 0.39;
  const hz = z + Math.sin(facing) * 0.39;
  addBox(out, hx, ground + h * 0.55, hz, 0.14, 0.22, 0.05, Math.PI / 2 - facing, WOOD.hole);
}

/** Kůl (válec) s otýpkou slámy navrchu (`bundle`). */
function addPole(
  out: ColoredGeometry,
  x: number,
  z: number,
  ground: number,
  heightM: number,
  radius: number,
  bundle: boolean,
): void {
  addCylinder(out, x, ground - 0.3, z, radius, heightM + 0.3, 6, WOOD.post, WOOD.post);
  if (bundle)
    addCylinder(out, x, ground + heightM - 0.55, z, radius * 2.6, 0.5, 6, WOOD.straw, WOOD.straw);
}

/** Svislý válec od `y` nahoru (víko nahoře). */
export function addCylinder(
  out: ColoredGeometry,
  x: number,
  y: number,
  z: number,
  radius: number,
  heightM: number,
  segments: number,
  side: Rgb | readonly number[],
  top: Rgb | readonly number[],
): void {
  const base = out.positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const cx = x + Math.cos(a) * radius;
    const cz = z + Math.sin(a) * radius;
    out.positions.push(cx, y, cz, cx, y + heightM, cz);
    out.colors.push(...side, ...side);
  }
  const center = out.positions.length / 3;
  out.positions.push(x, y + heightM, z);
  out.colors.push(...top);
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    const a = base + s * 2;
    const b = base + s1 * 2;
    out.indices.push(a, b, a + 1, b, b + 1, a + 1);
    out.indices.push(center, a + 1, b + 1);
  }
}

/** Kvádr se středem (x, y, z), rozměry šířka (x) × výška × délka (z), otočený o `angle`. */
export function addBox(
  out: ColoredGeometry,
  x: number,
  y: number,
  z: number,
  width: number,
  heightM: number,
  length: number,
  angle: number,
  color: Rgb | readonly number[],
): void {
  const base = out.positions.length / 3;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const [lx, ly, lz] of [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [-1, 1, 1],
  ] as const) {
    const ox = (lx * width) / 2;
    const oz = (lz * length) / 2;
    out.positions.push(x + ox * c + oz * s, y + (ly * heightM) / 2, z - ox * s + oz * c);
    out.colors.push(...color);
  }
  for (const [a, b, cc, d] of [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ] as const) {
    out.indices.push(base + a, base + b, base + cc, base + a, base + cc, base + d);
  }
}

/** Vydlabaný člun (6 × 0,85 m): průřezy ve tvaru U podél délky, uvnitř tmavší. */
function addDugout(out: ColoredGeometry, x: number, y: number, z: number, angle: number): void {
  const length = 6;
  const stations = 9;
  const profile: readonly [number, number, boolean][] = [
    [-1, 1, false],
    [-0.8, 0.2, false],
    [0, 0, false],
    [0.8, 0.2, false],
    [1, 1, false],
    [0.75, 0.95, true],
    [0, 0.25, true],
    [-0.75, 0.95, true],
  ];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const base = out.positions.length / 3;
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const along = (t - 0.5) * length;
    // příď a záď se zužují a zvedají
    const taper = Math.sqrt(Math.max(0.05, 1 - Math.pow(2 * t - 1, 4)));
    const rise = Math.pow(2 * t - 1, 2) * 0.12;
    for (const [px, py, inside] of profile) {
      const ox = px * 0.43 * taper;
      const oy = py * 0.48 * (0.6 + 0.4 * taper) + rise;
      out.positions.push(x + ox * c + along * s, y + oy, z - ox * s + along * c);
      out.colors.push(...(inside ? WOOD.hullInside : WOOD.hull));
    }
  }
  const n = profile.length;
  for (let i = 0; i < stations - 1; i++) {
    for (let p = 0; p < n; p++) {
      const p1 = (p + 1) % n;
      const a = base + i * n + p;
      const b = base + i * n + p1;
      const cc = a + n;
      const d = b + n;
      out.indices.push(a, cc, b, b, cc, d);
    }
  }
  // čela příďi a zádi
  for (const i of [0, stations - 1]) {
    const first = base + i * n;
    for (let p = 1; p < n - 1; p++) out.indices.push(first, first + p, first + p + 1);
  }
}

/** Pás vody podél čáry (stružka pramene) – těsně nad terénem, užší ke konci. */
function addStrip(
  out: ColoredGeometry,
  line: PathLine,
  widthM: number,
  height: HeightFn,
  colors: { center: Rgb | readonly number[]; edge: Rgb | readonly number[] },
): void {
  const pts = line.points;
  if (pts.length < 2) return;
  const base = out.positions.length / 3;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)]!;
    const b = pts[Math.min(pts.length - 1, k + 1)]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / length;
    const nz = (b.x - a.x) / length;
    const half = (widthM / 2) * (1 - (0.6 * k) / (pts.length - 1));
    for (const side of [-1, 1]) {
      const x = pts[k]!.x + nx * side * half;
      const z = pts[k]!.z + nz * side * half;
      out.positions.push(x, height(x, z) + 0.08, z);
      out.colors.push(...colors.center);
    }
  }
  for (let k = 0; k < pts.length - 1; k++) {
    const a = base + k * 2;
    out.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

/** Tůňka: kotouč vody těsně nad terénem (po vrcholech – i na mírném svahu), okraj nepravidelný. */
function addPool(
  out: ColoredGeometry,
  x: number,
  z: number,
  radius: number,
  height: HeightFn,
  colors: { center: Rgb | readonly number[]; edge: Rgb | readonly number[] },
  seed: number,
): void {
  const segments = 16;
  const base = out.positions.length / 3;
  const lift = 0.07;
  out.positions.push(x, height(x, z) + lift, z);
  out.colors.push(...colors.center);
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const r = radius * (0.85 + 0.3 * hash01(seed, s, 51));
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    out.positions.push(px, height(px, pz) + lift, pz);
    out.colors.push(...colors.edge);
  }
  for (let s = 0; s < segments; s++) {
    out.indices.push(base, base + 1 + ((s + 1) % segments), base + 1 + s);
  }
}

// ── Ozdoby z modelů krajiny ──────────────────────────────────────────────────────────────────

/**
 * Ozdoby prvků z modelů dekorací (bez id – nejsou překážky): mohyla z kamenů v sedle průsmyku,
 * kamenný kruh na plošině posvátné hory, rákosí a orobinec v mokřadu honitby.
 */
export function premiumDecor(
  l: Landscape,
  features: PremiumFeatures | null,
  waters: StreamCenterline,
): DecorPlacement[] {
  if (!features) return [];
  const out: DecorPlacement[] = [];
  features.sites.forEach((site, k) => {
    if (site.kind === 'pass') addCairn(out, site.x, site.z, k);
    else if (site.kind === 'summit') addStoneCircle(out, site.x, site.z, k);
    else if (site.kind === 'hunting-ground') addMarsh(out, l, site, waters, k);
  });
  return out.map((p) => ({ ...p, group: 'site' as const }));
}

/** Mohyla v sedle: kameny na hromadě kolem kůlu (kůl – `premiumProps`). */
function addCairn(out: DecorPlacement[], x: number, z: number, k: number): void {
  out.push({ model: 'boulder', worldX: x + 0.9, worldZ: z - 0.4, rotationY: 1.1, scale: 1.1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + hash01(k, i, 61);
    const r = 0.6 + hash01(k, i, 62) * 1.6;
    out.push({
      model: hash01(k, i, 63) < 0.5 ? 'stone-1' : 'stone-2',
      worldX: x + Math.cos(a) * r,
      worldZ: z + Math.sin(a) * r,
      rotationY: hash01(k, i, 64) * Math.PI * 2,
      scale: 0.8 + hash01(k, i, 65) * 0.6,
    });
  }
}

/** Kamenný kruh: devět vztyčených kamenů v kruhu 11 m a plochý kámen uprostřed. */
function addStoneCircle(out: DecorPlacement[], x: number, z: number, k: number): void {
  const stones = 9;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + hash01(k, i, 71) * 0.15;
    out.push({
      model: 'rock-tower',
      worldX: x + Math.cos(a) * 11,
      worldZ: z + Math.sin(a) * 11,
      rotationY: a + hash01(k, i, 72),
      scale: 0.42 + hash01(k, i, 73) * 0.12,
    });
  }
  out.push({ model: 'rock-boulder', worldX: x, worldZ: z, rotationY: 0.4, scale: 0.7 });
}

/**
 * Mokřad honitby: shluky rákosí a orobince na mokré louce podél potoka (4–18 m od vody) –
 * podél `line` prvku po 7 m na obou stranách.
 */
function addMarsh(
  out: DecorPlacement[],
  l: Landscape,
  site: PremiumSite,
  waters: StreamCenterline,
  k: number,
): void {
  const line = site.line ?? [];
  let n = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) continue;
    const steps = Math.max(1, Math.round(length / 7));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x0 = ax + (bx - ax) * t;
      const z0 = az + (bz - az) * t;
      const nx = -(bz - az) / length;
      const nz = (bx - ax) / length;
      for (const side of [-1, 1]) {
        n++;
        if (hash01(k, n, 81) > 0.55) continue;
        const half = Math.max(0, waters.nearest(x0, z0, 60).halfWidth);
        const off = half + 4 + hash01(k, n, 82) * 14;
        const cx = x0 + nx * side * off;
        const cz = z0 + nz * side * off;
        if (!insideMap(l, cx, cz) || isWaterTile(l, cx, cz)) continue;
        const count = 4 + Math.floor(hash01(k, n, 83) * 5);
        for (let r = 0; r < count; r++) {
          const a = hash01(n, r, 84) * Math.PI * 2;
          const d = Math.sqrt(hash01(n, r, 85)) * 2.2;
          const x = cx + Math.cos(a) * d;
          const z = cz + Math.sin(a) * d;
          if (waters.nearest(x, z, 60).bankDistance < 1) continue;
          out.push({
            model: hash01(n, r, 86) < 0.45 ? 'cattails' : 'reeds',
            worldX: x,
            worldZ: z,
            rotationY: hash01(n, r, 87) * Math.PI * 2,
            scale: 1 + hash01(n, r, 88) * 0.5,
          });
        }
      }
    }
  }
}

function isWaterTile(l: Landscape, x: number, z: number): boolean {
  const half = (l.size * l.cellSizeM) / 2;
  const tx = Math.floor((x + half) / l.cellSizeM);
  const tz = Math.floor((z + half) / l.cellSizeM);
  if (tx < 0 || tz < 0 || tx >= l.size || tz >= l.size) return true;
  return l.surface[tz * l.size + tx] === SURFACE_CODES.water;
}

// ── Tón skal ─────────────────────────────────────────────────────────────────────────────────

/**
 * Vlastní skupina dekorací prémiové krajiny: odstín skal nalezišť – rudné výchozy žíly (železný
 * klobouk) a světlý vápenec lomu –, nebo ozdoba prvku bez id (`site`).
 */
export type DecorGroup = 'ore' | 'limestone' | 'site';

/** 2^22 – místo na zdroj v id překážky (obstacleId v jádru). */
const SOURCE_SHIFT = 4_194_304;

/** Odstín skály podle zdroje překážky (id) – jen prémiová naleziště, jinak null. */
export function premiumRockTint(id: number | undefined): 'ore' | 'limestone' | null {
  if (id === undefined) return null;
  const source = Math.floor(id / SOURCE_SHIFT);
  if (source === OBSTACLE_SOURCES.oreRock) return 'ore';
  if (source === OBSTACLE_SOURCES.quarryRock) return 'limestone';
  return null;
}

// ── Povrch louky ─────────────────────────────────────────────────────────────────────────────

/**
 * Úprava louky ve scéně (ground-layers.ts): `lush` 0–1 – svěží hustá tráva a víc květů (velmi
 * úrodná krajina kolem vsi, nivní louky u potoka), `warm` 0–1 – teplý suchý trávník s květy
 * (jižní svahy).
 */
export interface MeadowTweak {
  lush: number;
  warm: number;
}

/** Niva ve scéně: svěží louky do tolika m od vody (políčka vody), plynule do dalších 45 m. */
const FLOODPLAIN_LUSH_M = { full: 75, fade: 120 };
/** Úrodná krajina: svěží louky v kruhu prvku, k okraji kruhu na tolika m dozní. */
const FERTILE_FADE_M = 120;
/** Jižní svah: měkký okraj teplého trávníku (m). */
const SLOPE_SOFT_M = 20;
const NO_TWEAK: MeadowTweak = { lush: 0, warm: 0 };

/** Úprava louky podle prvků typu; typ bez úpravy (i průměrná krajina) null. */
export function premiumMeadow(
  l: Landscape,
  features: PremiumFeatures | null,
): ((x: number, z: number) => MeadowTweak) | null {
  if (!features) return null;
  const site = features.sites[0];
  if (!site) return null;
  if (features.type === 'fertile' && site.kind === 'meadow' && site.outline) {
    // kruh kolem vsi – vzdálenost od středu (rychlejší než obrys pro každý texel)
    const radius = Math.max(...site.outline.map(([x, z]) => Math.hypot(x - site.x, z - site.z)));
    return (x, z) => ({
      lush: 1 - smoothstep(radius - FERTILE_FADE_M, radius, Math.hypot(x - site.x, z - site.z)),
      warm: 0,
    });
  }
  if (features.type === 'floodplain') {
    const distance = waterTileDistance(l);
    const half = (l.size * l.cellSizeM) / 2;
    return (x, z) => {
      const tx = Math.min(l.size - 1, Math.max(0, Math.floor((x + half) / l.cellSizeM)));
      const tz = Math.min(l.size - 1, Math.max(0, Math.floor((z + half) / l.cellSizeM)));
      const d = distance[tz * l.size + tx]! * l.cellSizeM;
      return { lush: 1 - smoothstep(FLOODPLAIN_LUSH_M.full, FLOODPLAIN_LUSH_M.fade, d), warm: 0 };
    };
  }
  if (features.type === 'south-slopes' && site.outline) {
    const polygon = outlineOf(site);
    const inside = softCoverage(polygon, SLOPE_SOFT_M);
    const b = polygonBounds(polygon);
    return (x, z) =>
      x < b.minX - SLOPE_SOFT_M ||
      x > b.maxX + SLOPE_SOFT_M ||
      z < b.minZ - SLOPE_SOFT_M ||
      z > b.maxZ + SLOPE_SOFT_M
        ? NO_TWEAK
        : { lush: 0, warm: inside(x, z) };
  }
  return null;
}

/** Vzdálenost políček od vody (políčka, osmismerně) – dvě průchody (chamfer). */
function waterTileDistance(l: Landscape): Float32Array {
  const { size } = l;
  const d = new Float32Array(size * size).fill(Infinity);
  for (let i = 0; i < d.length; i++) if (l.surface[i] === SURFACE_CODES.water) d[i] = 0;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x > 0) d[i] = Math.min(d[i]!, d[i - 1]! + 1);
      if (y > 0) d[i] = Math.min(d[i]!, d[i - size]! + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i]!, d[i - size - 1]! + diagonal);
      if (x < size - 1 && y > 0) d[i] = Math.min(d[i]!, d[i - size + 1]! + diagonal);
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      if (x < size - 1) d[i] = Math.min(d[i]!, d[i + 1]! + 1);
      if (y < size - 1) d[i] = Math.min(d[i]!, d[i + size]! + 1);
      if (x < size - 1 && y < size - 1) d[i] = Math.min(d[i]!, d[i + size + 1]! + diagonal);
      if (x > 0 && y < size - 1) d[i] = Math.min(d[i]!, d[i + size - 1]! + diagonal);
    }
  }
  return d;
}
