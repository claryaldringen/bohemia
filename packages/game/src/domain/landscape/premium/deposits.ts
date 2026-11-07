import { detCos, detSin, length2 } from '../det-math';
import { distanceToMask, smoothstep } from '../grid';
import { createRandom, deriveSeed, type Random } from '../random';
import { buildRelief } from '../relief';
import { streamCenterline, streamStations } from '../stream-geometry';
import type { Terrain } from '../terrain';
import { CELL_SIZE_M, SURFACE_CODES, type Landscape } from '../types';
import { tileCenterWorld, tileOfWorldPoint } from '../world';
import type { PremiumPass, PremiumPassContext } from './generate';
import { ellipseOutline, type WorldPoint } from './geometry';
import {
  cellPointWorld,
  heightAtCell,
  pickSite,
  planInputOf,
  planInputOfTerrain,
  range,
  reliefKeep,
  type PlanInput,
} from './relief';
import { landRegion } from './river';
import type { PremiumSite } from './types';

// Prémiové typy nalezišť (premium-landscapes.md – Typy krajin): stavební kámen (lom ve skalní
// stěně), hluboká ložiska drahých kovů (skalnatý hřbet s rudnými výchozy), bohatá železná ruda
// (rudiště) a dobrá keramická hlína (hliniště u potoka). Stěna lomu a hřbet mění terén (jen
// server při generování), kde leží, je čistá funkce vody a místa vsi (`quarryPlan`, `veinPlan`) –
// prvky typu i kameny ve vrstvě překážek (`obstacles/premium-rocks.ts`) z ní najde i prohlížeč.
// Rudiště a hliniště jsou jen místa v průměrné krajině. Naleziště jsou zatím data a vzhled,
// mechanika přijde později. Hodnoty jsou návrh Clauda, doladí je kalibrace.

const MEADOW = SURFACE_CODES.meadow;

/** Prvek reliéfu s osou: střed (políčko) a jednotkový směr ke vsi (`toward`) a podél (`along`). */
export interface AxisPlan {
  readonly x: number;
  readonly y: number;
  readonly toward: { readonly x: number; readonly y: number };
  readonly along: { readonly x: number; readonly y: number };
}

function axisPlan(
  center: { x: number; y: number } | null,
  village: { x: number; y: number },
): AxisPlan | null {
  if (!center) return null;
  const length = length2(village.x - center.x, village.y - center.y);
  const toward = { x: (village.x - center.x) / length, y: (village.y - center.y) / length };
  return { ...center, toward, along: { x: -toward.y, y: toward.x } };
}

/** Bod plánu posunutý o `u` políček ke vsi a `v` podél (políčka). */
function axisPoint(plan: AxisPlan, u: number, v: number): { x: number; y: number } {
  return {
    x: plan.x + plan.toward.x * u + plan.along.x * v,
    y: plan.y + plan.toward.y * u + plan.along.y * v,
  };
}

/** Souřadnice políčka v osách plánu (políčka): `u` ke vsi, `v` podél. */
function axisCoordinates(plan: AxisPlan, x: number, y: number): { u: number; v: number } {
  const dx = x - plan.x;
  const dy = y - plan.y;
  return {
    u: dx * plan.toward.x + dy * plan.toward.y,
    v: dx * plan.along.x + dy * plan.along.y,
  };
}

/** Bod v osách plánu (políčka) ve světě (m). */
export function axisWorld(
  l: Pick<Landscape, 'size' | 'cellSizeM'>,
  plan: AxisPlan,
  u: number,
  v: number,
): WorldPoint {
  const p = axisPoint(plan, u, v);
  return cellPointWorld(l, p.x, p.y);
}

/** Souřadnice bodu světa (m) v osách plánu (políčka). */
export function axisCoordinatesOfWorld(
  l: Pick<Landscape, 'size' | 'cellSizeM'>,
  plan: AxisPlan,
  wx: number,
  wz: number,
): { u: number; v: number } {
  const half = (l.size * l.cellSizeM) / 2;
  return axisCoordinates(plan, (wx + half) / l.cellSizeM - 0.5, (wz + half) / l.cellSizeM - 0.5);
}

/** Obdélník v osách plánu (políčka) ve světě. */
function axisRect(
  l: Landscape,
  plan: AxisPlan,
  [u0, u1]: readonly [number, number],
  [v0, v1]: readonly [number, number],
): WorldPoint[] {
  return [
    axisWorld(l, plan, u0, v0),
    axisWorld(l, plan, u1, v0),
    axisWorld(l, plan, u1, v1),
    axisWorld(l, plan, u0, v1),
  ];
}

// ── Stavební kámen a vápenec ─────────────────────────────────────────────────────────────────

/**
 * Lom ve skalní stěně (návrh Clauda): stěna `2 × halfLengthM` dlouhá a `heightM` vysoká
 * `distanceM` od vsi (nejraději `targetM`), čelem ke vsi – terén za stěnou se zvedne
 * (plně `backFullM`, do `backFadeM` dozní), čelo spadne na `faceM`, konce stěny dozní na
 * `endFadeM`. Podél čela skalní výchozy po `rockStepM` a pod ním suť (vrstva překážek).
 */
export const QUARRY = {
  distanceM: [550, 900],
  targetM: 700,
  halfLengthM: 120,
  heightM: [13, 17],
  faceM: 12,
  backFullM: 75,
  backFadeM: 120,
  endFadeM: 60,
  waterMinCells: 12,
  edgeMinCells: 16,
  /** Lom (prvek): pás od hrany stěny (záporné – za ní) k úpatí se sutí (m). */
  stripM: [-6, 24],
  rockStepM: 8,
  /** Kontrola typu: stěna aspoň tolik m (terén za hranou − pod čelem). */
  minWallM: 10,
} as const;

/** Lom – čistá funkce vody a místa vsi. */
export function quarryPlan(input: PlanInput): AxisPlan | null {
  const Q = QUARRY;
  const center = pickSite(input, {
    distanceM: Q.distanceM,
    targetM: Q.targetM,
    waterMinCells: Q.waterMinCells,
    edgeMinCells: Q.edgeMinCells,
    reachCells: (Q.backFullM + Q.backFadeM) / CELL_SIZE_M,
  });
  return axisPlan(center, input.villageSite);
}

/** Stěna lomu: terén za hranou zvednutý o výšku stěny (vodu a rovinu vsi nemění). */
function sculptQuarry(terrain: Terrain, plan: AxisPlan, random: Random): void {
  const { size, heights, villageSite } = terrain;
  const Q = QUARRY;
  const height = range(random, Q.heightM);
  const half = Q.halfLengthM / CELL_SIZE_M;
  const face = Q.faceM / CELL_SIZE_M;
  const backFull = Q.backFullM / CELL_SIZE_M;
  const backFade = Q.backFadeM / CELL_SIZE_M;
  const endFade = Q.endFadeM / CELL_SIZE_M;
  const waterDistance = distanceToMask(terrain.water, size);
  for (let i = 0; i < size * size; i++) {
    if (terrain.water[i]) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    const { u, v } = axisCoordinates(plan, x, y);
    if (u >= face || u <= -(backFull + backFade) || Math.abs(v) >= half + endFade) continue;
    const along = 1 - smoothstep((Math.abs(v) - half) / endFade);
    const across = u > 0 ? 1 - smoothstep(u / face) : 1 - smoothstep((-u - backFull) / backFade);
    const raise = height * along * across;
    if (raise <= 0) continue;
    heights[i] = heights[i]! + raise * reliefKeep(x, y, villageSite, waterDistance[i]!);
  }
}

/** Výška stěny lomu (m): průměr rozdílu terénu za hranou a pod čelem podél stěny. */
export function quarryWallHeight(l: Landscape, plan: AxisPlan): number {
  const half = QUARRY.halfLengthM / CELL_SIZE_M;
  const samples = 9;
  let sum = 0;
  for (let k = 0; k < samples; k++) {
    const v = -0.8 * half + (1.6 * half * k) / (samples - 1);
    const back = axisPoint(plan, -1.5, v);
    const front = axisPoint(plan, 1.8, v);
    sum +=
      heightAtCell(l.heights, l.size, back.x, back.y) -
      heightAtCell(l.heights, l.size, front.x, front.y);
  }
  return sum / samples;
}

/** Prvek lomu: pás stěny od hrany k úpatí se sutí (obrys). */
export function quarrySites(l: Landscape): PremiumSite[] | null {
  const plan = quarryPlan(planInputOf(l));
  if (!plan || quarryWallHeight(l, plan) < QUARRY.minWallM) return null;
  const half = QUARRY.halfLengthM / CELL_SIZE_M;
  const strip = QUARRY.stripM.map((m) => m / CELL_SIZE_M) as [number, number];
  const [x, z] = axisWorld(l, plan, 0, 0);
  return [{ kind: 'quarry', x, z, outline: axisRect(l, plan, strip, [-half, half]) }];
}

const buildingStone = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    const plan = quarryPlan(planInputOfTerrain(terrain));
    if (plan) sculptQuarry(terrain, plan, createRandom(deriveSeed(ctx.seed, 'quarry')));
    return terrain;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    return quarrySites(landscape);
  },
} satisfies PremiumPass;

// ── Hluboká ložiska drahých kovů ─────────────────────────────────────────────────────────────

/**
 * Skalnatý hřbet se žílou (návrh Clauda): hřbet `2 × halfLengthM` dlouhý, bokem ke vsi,
 * `distanceM` od ní (nejraději `targetM`); hřeben `heightM` nad terénem (ke koncům o třetinu
 * nižší), svahy ostré ((1 − q)²) do `flankM`. Podél hřebene žíla – rudné výchozy po
 * `outcropStepM` (vrstva překážek); naleziště je pás `veinHalfWidthM` kolem ní.
 */
export const GOLD_VEIN = {
  distanceM: [600, 1000],
  targetM: 800,
  halfLengthM: 165,
  heightM: [24, 32],
  flankM: 75,
  waterMinCells: 12,
  edgeMinCells: 16,
  veinHalfWidthM: 22,
  outcropStepM: 12,
  /** Kontrola typu: hřeben aspoň tolik m nad úpatím. */
  minHeightM: 18,
} as const;

/** Hřbet se žílou – čistá funkce vody a místa vsi. */
export function veinPlan(input: PlanInput): AxisPlan | null {
  const G = GOLD_VEIN;
  const { size } = input;
  const waterDistance = distanceToMask(input.water, size);
  const half = G.halfLengthM / CELL_SIZE_M;
  const flank = G.flankM / CELL_SIZE_M;
  // Celý hřeben daleko od vody a na mapě.
  const fits = (x: number, y: number, toward: { x: number; y: number }): boolean => {
    for (let v = -half; v <= half; v += 1) {
      const px = Math.round(x - toward.y * v);
      const py = Math.round(y + toward.x * v);
      if (px < 4 || py < 4 || px > size - 5 || py > size - 5) return false;
      if (waterDistance[py * size + px]! < flank + 2) return false;
    }
    return true;
  };
  const center = pickSite(input, {
    distanceM: G.distanceM,
    targetM: G.targetM,
    waterMinCells: G.waterMinCells,
    edgeMinCells: G.edgeMinCells,
    reachCells: flank,
    fits,
  });
  return axisPlan(center, input.villageSite);
}

/** Výška hřebene nad terénem (m) v místě `v` podél hřbetu (políčka). */
function crestShare(v: number): number {
  const t = v / (GOLD_VEIN.halfLengthM / CELL_SIZE_M);
  return 1 - 0.35 * t * t;
}

/** Skalnatý hřbet: ostrý hřeben nad terén (vodu a rovinu vsi nemění). */
function sculptVein(terrain: Terrain, plan: AxisPlan, random: Random): void {
  const { size, heights, villageSite } = terrain;
  const G = GOLD_VEIN;
  const height = range(random, G.heightM);
  const half = G.halfLengthM / CELL_SIZE_M;
  const flank = G.flankM / CELL_SIZE_M;
  const waterDistance = distanceToMask(terrain.water, size);
  for (let i = 0; i < size * size; i++) {
    if (terrain.water[i]) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    const { u, v } = axisCoordinates(plan, x, y);
    const onAxis = Math.min(half, Math.max(-half, v));
    const d = length2(u, v - onAxis);
    if (d >= flank) continue;
    const q = 1 - d / flank;
    const raise = height * crestShare(onAxis) * q * q;
    heights[i] = heights[i]! + raise * reliefKeep(x, y, villageSite, waterDistance[i]!);
  }
}

/** Výška hřebene nad úpatím (m) uprostřed hřbetu. */
export function veinRidgeHeight(l: Landscape, plan: AxisPlan): number {
  const flank = GOLD_VEIN.flankM / CELL_SIZE_M;
  const crest = heightAtCell(l.heights, l.size, plan.x, plan.y);
  const a = axisPoint(plan, flank + 1, 0);
  const b = axisPoint(plan, -flank - 1, 0);
  const foot =
    (heightAtCell(l.heights, l.size, a.x, a.y) + heightAtCell(l.heights, l.size, b.x, b.y)) / 2;
  return crest - foot;
}

/** Žíla – osa hřebene od konce ke konci (body v políčkách). */
export function veinLine(plan: AxisPlan): [{ x: number; y: number }, { x: number; y: number }] {
  const half = GOLD_VEIN.halfLengthM / CELL_SIZE_M;
  return [axisPoint(plan, 0, -half), axisPoint(plan, 0, half)];
}

/** Obrys pásu kolem úsečky ve světě (půlkruhy na koncích, 2 × 9 vrcholů). */
function capsuleOutline(a: WorldPoint, b: WorldPoint, radius: number): WorldPoint[] {
  const length = length2(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / length;
  const tz = (b[1] - a[1]) / length;
  const out: WorldPoint[] = [];
  const STEPS = 8;
  for (const [end, sign] of [
    [b, 1],
    [a, -1],
  ] as const) {
    for (let k = 0; k <= STEPS; k++) {
      // Půlkruh od pravé strany přes čelo k levé (u druhého konce opačně).
      const angle = -Math.PI / 2 + (Math.PI * k) / STEPS;
      const c = detCos(angle) * sign;
      const s = detSin(angle) * sign;
      out.push([end[0] + (tx * c - tz * s) * radius, end[1] + (tz * c + tx * s) * radius]);
    }
  }
  return out;
}

/** Prvek naleziště: pás kolem žíly (obrys) a žíla (osa). */
export function deepGoldSites(l: Landscape): PremiumSite[] | null {
  const plan = veinPlan(planInputOf(l));
  if (!plan || veinRidgeHeight(l, plan) < GOLD_VEIN.minHeightM) return null;
  const [a, b] = veinLine(plan).map((p) => cellPointWorld(l, p.x, p.y)) as [WorldPoint, WorldPoint];
  const [x, z] = cellPointWorld(l, plan.x, plan.y);
  return [
    {
      kind: 'deposit',
      x,
      z,
      line: [a, b],
      outline: capsuleOutline(a, b, GOLD_VEIN.veinHalfWidthM),
    },
  ];
}

const deepGold = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    const plan = veinPlan(planInputOfTerrain(terrain));
    if (plan) sculptVein(terrain, plan, createRandom(deriveSeed(ctx.seed, 'gold-vein')));
    return terrain;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    return deepGoldSites(landscape);
  },
} satisfies PremiumPass;

// ── Rudiště a hliniště u potoka ──────────────────────────────────────────────────────────────

/** Místo na břehu potoka (rudiště, hliniště) – podmínky a obrys. */
interface BankRule {
  readonly distanceM: readonly [number, number];
  readonly targetM: number;
  /** Střed místa tolik m od okraje vody. */
  readonly bankM: number;
  readonly maxSlope: number;
  readonly edgeM: number;
  /** Obrys – elipsa podél toku. */
  readonly halfLengthM: number;
  readonly halfWidthM: number;
  /** Kontrola typu: celé místo (obrys) nejvýš tolik m od vsi. */
  readonly maxDistanceM: number;
}

/**
 * Bohatá železná ruda (návrh Clauda): rudiště (bažinná ruda – limonit s krevelem) na mokré rovné
 * louce u potoka `distanceM` od vsi (nejraději `targetM`) na straně vsi – kovář sem chodí kopat
 * (smith-supply.ts, úloha účinků). Nejraději u klidné vody.
 */
export const IRON_ORE = {
  distanceM: [200, 480],
  targetM: 320,
  bankM: 9,
  maxSlope: 0.05,
  edgeM: 60,
  halfLengthM: 18,
  halfWidthM: 10,
  /** Kontrola typu: celé rudiště nejvýš tolik m od vsi. */
  maxDistanceM: 500,
} as const;

/**
 * Dobrá keramická hlína (návrh Clauda): hliniště u potoka `distanceM` od vsi na straně vsi –
 * jemná povodňová hlína na vnitřní straně oblouku, kde proud slábne (nejraději).
 */
export const FINE_CLAY = {
  distanceM: [200, 480],
  targetM: 360,
  bankM: 6,
  maxSlope: 0.06,
  edgeM: 60,
  halfLengthM: 20,
  halfWidthM: 8,
  /** Kontrola typu: celé hliniště nejvýš tolik m od vsi. */
  maxDistanceM: 500,
} as const;

/** Rezerva (m) mezi nejvzdálenějším bodem obrysu místa a `maxDistanceM` – zaokrouhlení. */
const BANK_DISTANCE_SLACK_M = 0.01;

/**
 * Místo na louce u potoka na straně vsi: po stanicích osy po 15 m na obou březích; skóre podle
 * vzdálenosti od `targetM`, sklonu a `prefer` (menší = lepší). Obrys elipsa podél toku.
 */
function bankSite(
  l: Landscape,
  rule: BankRule,
  kind: 'iron-ore' | 'clay',
  prefer: (sample: { innerBend: number; speed: number }) => number,
): PremiumSite | null {
  const stream = streamCenterline(l);
  const relief = buildRelief(l);
  const village = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const water = planInputOf(l).water;
  const side = landRegion(water, l.size, l.villageSite);
  const halfMap = (l.size * l.cellSizeM) / 2 - rule.edgeM;
  let best: { x: number; z: number; tx: number; tz: number; score: number } | null = null;
  for (const station of streamStations(stream, 15)) {
    for (const s of [1, -1] as const) {
      const here = stream.nearest(station.x + station.nx * s, station.z + station.nz * s);
      if (!Number.isFinite(here.distance)) continue;
      const reach = here.halfWidth + rule.bankM;
      const x = station.x + station.nx * s * reach;
      const z = station.z + station.nz * s * reach;
      if (Math.abs(x) > halfMap || Math.abs(z) > halfMap) continue;
      const d = length2(x - village.x, z - village.z);
      if (d < rule.distanceM[0] || d > rule.distanceM[1]) continue;
      // obrys sahá nejvýš o půl délky dál než střed – celé místo do `maxDistanceM` (s rezervou
      // na zaokrouhlení vrcholů obrysu)
      if (d + rule.halfLengthM > rule.maxDistanceM - BANK_DISTANCE_SLACK_M) continue;
      const tile = tileOfWorldPoint(l, x, z);
      if (!tile) continue;
      const i = tile.y * l.size + tile.x;
      if (l.surface[i] !== MEADOW || !side[i]) continue;
      const at = stream.nearest(x, z);
      if (at.bankDistance > rule.bankM + 1 || at.bankDistance < rule.bankM - 1) continue;
      const slope = relief.slopeAt(x, z);
      if (slope > rule.maxSlope) continue;
      const score = Math.abs(d - rule.targetM) / 250 + slope * 10 + prefer(at);
      if (!best || score < best.score) {
        best = { x, z, tx: -station.nz * s, tz: station.nx * s, score };
      }
    }
  }
  if (!best) return null;
  const outline = ellipseOutline(
    best.x,
    best.z,
    best.tx,
    best.tz,
    rule.halfLengthM,
    rule.halfWidthM,
  );
  return { kind, x: best.x, z: best.z, outline };
}

/** Rudiště s bohatou rudou u potoka. */
export function ironOreSite(l: Landscape): PremiumSite | null {
  return bankSite(l, IRON_ORE, 'iron-ore', (at) => at.speed);
}

/** Hliniště s dobrou hlínou u potoka. */
export function fineClaySite(l: Landscape): PremiumSite | null {
  return bankSite(l, FINE_CLAY, 'clay', (at) => at.speed - 0.5 * at.innerBend);
}

const ironOre = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const site = ironOreSite(landscape);
    return site ? [site] : null;
  },
} satisfies PremiumPass;

const fineClay = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const site = fineClaySite(landscape);
    return site ? [site] : null;
  },
} satisfies PremiumPass;

/** Průchody typů nalezišť (registr `PREMIUM_PASSES` v `generate.ts`). */
export const DEPOSIT_PASSES = {
  'building-stone': buildingStone,
  'deep-gold': deepGold,
  'iron-ore': ironOre,
  'fine-clay': fineClay,
};
