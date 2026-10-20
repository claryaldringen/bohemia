import { detCos, detSin, length2, smoothstep } from '../det-math';
import { distanceToMask } from '../grid';
import { createRandom, deriveSeed, type Random } from '../random';
import type { Terrain } from '../terrain';
import {
  CELL_SIZE_M,
  promontoriesOf,
  SURFACE_CODES,
  type Landscape,
  type Promontory,
} from '../types';
import { sampleTilesAtWorld, tileCenterWorld } from '../world';
import type { PremiumPass, PremiumPassContext } from './generate';
import { polygonAreaM2, type WorldPoint } from './geometry';
import { landRegion } from './river';
import {
  cellWorld,
  cellXY,
  lineKeepsAway,
  lineToEdges,
  onBorder,
  routeLeg,
  smoothLine,
  trailCellCost,
  VILLAGE_ROUTE,
  villageBypass,
} from './route';
import type { PremiumSite } from './types';

// Prémiové typy reliéfu (premium-landscapes.md – Typy krajin): horský průsmyk se stezkou,
// posvátná hora a přirozená pevnost. Průsmyk a hora mění terén (jen server při generování);
// kde leží, je čistá funkce vody a místa pro vesnici (`passPlan`, `mountainPlan`), takže prvky
// typu najde z hotové krajiny i prohlížeč – jen det-math. Pevnost je ostrožna nad zaříznutým
// meandrem z terénu 2 (`stream-rocks.ts`) s jinými mezemi (`PremiumPass.terrainOptions`).
// Hodnoty jsou návrh Clauda, doladí je kalibrace.

const WATER = SURFACE_CODES.water;

/** Vstup plánu prvku: voda a místo pro vesnici – v terénu i v hotové krajině stejné. */
export interface PlanInput {
  readonly size: number;
  readonly water: Uint8Array;
  readonly villageSite: { readonly x: number; readonly y: number };
}

/** Plán z hotové krajiny – voda z povrchu (vegetace přebírá vodu terénu beze změny). */
export function planInputOf(l: Landscape): PlanInput {
  return {
    size: l.size,
    water: l.surface.map((v) => (v === WATER ? 1 : 0)),
    villageSite: l.villageSite,
  };
}

/** Plán z terénu při generování. */
export function planInputOfTerrain(terrain: Terrain): PlanInput {
  return { size: terrain.size, water: terrain.water, villageSite: terrain.villageSite };
}

/**
 * Úpravy reliéfu nemění rovinu kolem místa pro vesnici (políčka – jako řeka) ani okolí vody:
 * u vody nic, naplno od druhé meze (políčka od vody).
 */
export const RELIEF_KEEP = {
  village: [17, 27],
  water: [3, 10],
} as const;

/** Jak moc smí úprava reliéfu měnit políčko (0 = beze změny). */
export function reliefKeep(
  x: number,
  y: number,
  village: { readonly x: number; readonly y: number },
  waterDistance: number,
): number {
  return (
    smoothstep(
      RELIEF_KEEP.village[0],
      RELIEF_KEEP.village[1],
      length2(x - village.x, y - village.y),
    ) * smoothstep(RELIEF_KEEP.water[0], RELIEF_KEEP.water[1], waterDistance)
  );
}

export function range(random: Random, [min, max]: readonly [number, number]): number {
  return min + random.next() * (max - min);
}

/** Výška v bodě (políčka, celé číslo = střed políčka) – bilineárně, oříznutá na krajinu. */
export function heightAtCell(heights: Float32Array, size: number, x: number, y: number): number {
  const fx = Math.min(size - 1, Math.max(0, x));
  const fy = Math.min(size - 1, Math.max(0, y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const v = (tx: number, ty: number): number => heights[ty * size + tx]!;
  const top = v(x0, y0) + (v(x1, y0) - v(x0, y0)) * (fx - x0);
  const bottom = v(x0, y1) + (v(x1, y1) - v(x0, y1)) * (fx - x0);
  return top + (bottom - top) * (fy - y0);
}

/** Bod v políčkách ve světě (m). */
export function cellPointWorld(
  l: Pick<Landscape, 'size' | 'cellSizeM'>,
  x: number,
  y: number,
): WorldPoint {
  const half = (l.size * l.cellSizeM) / 2;
  return [-half + (x + 0.5) * l.cellSizeM, -half + (y + 0.5) * l.cellSizeM];
}

/** Kde smí ležet prvek reliéfu (`pickSite`). */
export interface SiteRule {
  /** Vzdálenost od místa pro vesnici (m) a nejraději. */
  readonly distanceM: readonly [number, number];
  readonly targetM: number;
  /** Střed aspoň tolik políček od vody a od okraje mapy. */
  readonly waterMinCells: number;
  readonly edgeMinCells: number;
  /** Dosah prvku od středu (políčka) – nejraději celý na mapě a dál od vody. */
  readonly reachCells: number;
  /** Další podmínka celé podoby prvku (políčko středu a směr ke vsi). */
  readonly fits?: (x: number, y: number, toward: { x: number; y: number }) => boolean;
}

/**
 * Střed prvku reliéfu (políčko) – nejblíž `targetM` od vsi, nejraději na straně vody se vsí,
 * s dosahem celým na mapě a dál od vody. Čistá funkce vody a místa vsi (terén i hotová krajina).
 */
export function pickSite(input: PlanInput, rule: SiteRule): { x: number; y: number } | null {
  const { size, water, villageSite: village } = input;
  const waterDistance = distanceToMask(water, size);
  const region = landRegion(water, size, village);
  let best: { i: number; score: number } | null = null;
  for (let i = 0; i < size * size; i++) {
    const { x, y } = cellXY(i, size);
    const d = length2(x - village.x, y - village.y) * CELL_SIZE_M;
    if (d < rule.distanceM[0] || d > rule.distanceM[1]) continue;
    const margin = Math.min(x, y, size - 1 - x, size - 1 - y);
    if (margin < rule.edgeMinCells || waterDistance[i]! < rule.waterMinCells) continue;
    const score =
      Math.abs(d - rule.targetM) / 150 +
      Math.max(0, rule.reachCells - margin) * 0.15 +
      (region[i] ? 0 : 1.5) +
      Math.max(0, rule.reachCells + 2 - waterDistance[i]!) * 0.05;
    if (best && score >= best.score) continue;
    if (rule.fits) {
      const length = length2(village.x - x, village.y - y);
      const toward = { x: (village.x - x) / length, y: (village.y - y) / length };
      if (!rule.fits(x, y, toward)) continue;
    }
    best = { i, score };
  }
  return best ? cellXY(best.i, size) : null;
}

// ── Horský průsmyk ───────────────────────────────────────────────────────────────────────────

/**
 * Horský průsmyk se stezkou (návrh Clauda): pohoří rovnoběžně s okrajem mapy (pohraniční hory
 * jako kolem Čech), hřeben `crestCells` políček od okraje. V hřebeni sedlo, po stranách dva
 * hřbety aspoň `minRidgeCells` políček dlouhé (nejvýš `maxRidgeCells`), `ridgeRiseM` nad sedlem –
 * od sedla stoupají na `riseCells`, na koncích dozní na `endCells`. Hřbet končí `waterGapCells`
 * od vody (potok pohořím neprochází) a celé pohoří (i se svahy `flankCells`) leží za loukami vsi –
 * hřeben aspoň `villageMinCells` od místa vsi. Sedlo `saddleRiseM` nad nejvyšším terénem kolem
 * (`saddleAroundCells`) – stezka přes něj vede od okraje k okraji kolem vsi.
 */
export const MOUNTAIN_PASS = {
  crestCells: 7,
  minRidgeCells: 24,
  maxRidgeCells: 40,
  waterGapCells: 12,
  flankCells: 16,
  villageMinCells: 56,
  saddleRiseM: [6, 10],
  saddleAroundCells: 3,
  ridgeRiseM: [68, 80],
  riseCells: 12,
  endCells: 8,
  /** Kontrola typu: oba hřbety aspoň tolik nad sedlem (m). */
  minRiseM: 60,
} as const;

/** Strana mapy, podél které vede pohoří: 0 nahoře (y = 0), 1 dole, 2 vlevo (x = 0), 3 vpravo. */
type Side = 0 | 1 | 2 | 3;

/** Plán průsmyku: strana, sedlo (souřadnice podél hřebene) a délky hřbetů na obě strany. */
export interface PassPlan {
  readonly side: Side;
  /** Souřadnice sedla podél hřebene (políčka – x u stran 0 a 1, y u stran 2 a 3). */
  readonly t: number;
  /** Délka hřbetu k menším a k větším souřadnicím (políčka). */
  readonly before: number;
  readonly after: number;
}

/** Políčko hřebene strany `side` v souřadnici `t` podél něj. */
function crestCell(side: Side, t: number, size: number): { x: number; y: number } {
  const c = MOUNTAIN_PASS.crestCells;
  if (side === 0) return { x: t, y: c };
  if (side === 1) return { x: t, y: size - 1 - c };
  if (side === 2) return { x: c, y: t };
  return { x: size - 1 - c, y: t };
}

/** Souřadnice políčka podél hřebene a kolmo od něj (políčka). */
function crestCoordinates(
  side: Side,
  x: number,
  y: number,
  size: number,
): { along: number; across: number } {
  const c = MOUNTAIN_PASS.crestCells;
  if (side === 0) return { along: x, across: Math.abs(y - c) };
  if (side === 1) return { along: x, across: Math.abs(size - 1 - c - y) };
  if (side === 2) return { along: y, across: Math.abs(x - c) };
  return { along: y, across: Math.abs(size - 1 - c - x) };
}

/** Políčko okraje mapy za sedlem (kolmo k hřebeni). */
function edgeCellBeyond(side: Side, t: number, size: number): number {
  if (side === 0) return t;
  if (side === 1) return (size - 1) * size + t;
  if (side === 2) return t * size;
  return t * size + size - 1;
}

/**
 * Kde leží průsmyk: ze všech stran mapy a míst sedla to, kde jsou oba hřbety aspoň
 * `minRidgeCells` dlouhé (do vody ani rohu mapy), sedlo na straně vody se vsí a celé pohoří
 * za loukami vsi; nejlépe dlouhé hřbety a sedlo naproti vsi. Čistá funkce vody a místa vsi.
 */
export function passPlan(input: PlanInput): PassPlan | null {
  const { size, water, villageSite: village } = input;
  const waterDistance = distanceToMask(water, size);
  const region = landRegion(water, size, village);
  const P = MOUNTAIN_PASS;
  const dry = (side: Side, t: number): boolean => {
    if (t < 1 || t > size - 2) return false;
    const c = crestCell(side, t, size);
    return waterDistance[c.y * size + c.x]! >= P.waterGapCells;
  };
  let best: (PassPlan & { score: number }) | null = null;
  for (const side of [0, 1, 2, 3] as const) {
    const villageAlong = side < 2 ? village.x : village.y;
    const villageAcross = crestCoordinates(side, village.x, village.y, size).across;
    for (let t = 1 + P.minRidgeCells; t <= size - 2 - P.minRidgeCells; t++) {
      const s = crestCell(side, t, size);
      if (!region[s.y * size + s.x] || !dry(side, t)) continue;
      let before = 0;
      while (before < P.maxRidgeCells && dry(side, t - before - 1)) before++;
      let after = 0;
      while (after < P.maxRidgeCells && dry(side, t + after + 1)) after++;
      if (before < P.minRidgeCells || after < P.minRidgeCells) continue;
      const nearestAlong = Math.min(t + after, Math.max(t - before, villageAlong));
      if (length2(nearestAlong - villageAlong, villageAcross) < P.villageMinCells) continue;
      const score = -Math.min(before, after) + 0.5 * Math.abs(t - villageAlong);
      if (!best || score < best.score) best = { side, t, before, after, score };
    }
  }
  return best ? { side: best.side, t: best.t, before: best.before, after: best.after } : null;
}

/** Pohoří s průsmykem: zvedne terén do tvaru hřbetů a sedla (vodu a rovinu vsi nemění). */
function sculptPass(terrain: Terrain, plan: PassPlan, random: Random): void {
  const { size, heights, villageSite } = terrain;
  const P = MOUNTAIN_PASS;
  const saddleRise = range(random, P.saddleRiseM);
  const ridgeRise = range(random, P.ridgeRiseM);
  const s = crestCell(plan.side, plan.t, size);
  let around = -Infinity;
  for (let dy = -P.saddleAroundCells; dy <= P.saddleAroundCells; dy++) {
    for (let dx = -P.saddleAroundCells; dx <= P.saddleAroundCells; dx++) {
      const x = s.x + dx;
      const y = s.y + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (length2(dx, dy) > P.saddleAroundCells) continue;
      around = Math.max(around, heights[y * size + x]!);
    }
  }
  const saddle = around + saddleRise;
  const ridge = saddle + ridgeRise;
  const waterDistance = distanceToMask(terrain.water, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (terrain.water[i]) continue;
      const { along, across } = crestCoordinates(plan.side, x, y, size);
      const t = along - plan.t;
      const length = t < 0 ? plan.before : plan.after;
      if (Math.abs(t) > length || across >= P.flankCells) continue;
      const crest = saddle + (ridge - saddle) * smoothstep(0, P.riseCells, Math.abs(t));
      const share =
        (1 - smoothstep(0, P.flankCells, across)) * smoothstep(0, P.endCells, length - Math.abs(t));
      const ground = heights[i]!;
      const target = ground + (crest - ground) * share;
      if (target <= ground) continue;
      heights[i] = ground + (target - ground) * reliefKeep(x, y, villageSite, waterDistance[i]!);
    }
  }
}

/**
 * Stezka přes průsmyk: od okraje mapy za sedlem přes sedlo, dolů ke vsi, kolem ní (nejblíž
 * 150 m – bod obejití jako u brodu) a dál k okraji za vsí; po souši na straně vsi, mimo břehy.
 */
function passRoute(l: Landscape, plan: PassPlan): WorldPoint[] | null {
  const { size } = l;
  const water = planInputOf(l).water;
  const nearWater = distanceToMask(water, size);
  const village = l.villageSite;
  const region = landRegion(water, size, village);
  const cellCost = trailCellCost(l);
  const allowed = (i: number): boolean => {
    if (!region[i] || water[i] || nearWater[i]! < 1.5) return false;
    const c = cellXY(i, size);
    return length2(c.x - village.x, c.y - village.y) >= VILLAGE_ROUTE.villageMinCells;
  };
  const s = crestCell(plan.side, plan.t, size);
  const saddle = s.y * size + s.x;
  const edge = edgeCellBeyond(plan.side, plan.t, size);
  if (!allowed(saddle) || !allowed(edge)) return null;
  const outer = routeLeg(size, edge, allowed, cellCost, (i) => i === saddle);
  const pass = villageBypass(size, village, s, allowed);
  if (!outer || pass < 0) return null;
  const down = routeLeg(size, saddle, allowed, cellCost, (i) => i === pass);
  // Za obejitím dál od průsmyku – k okraji za vsí, jinak k jakémukoli okraji.
  const ux = village.x - s.x;
  const uy = village.y - s.y;
  const border = (i: number): boolean => onBorder(i, size) && i !== edge;
  const beyond = (i: number): boolean => {
    const c = cellXY(i, size);
    return border(i) && (c.x - village.x) * ux + (c.y - village.y) * uy > 0;
  };
  const onward =
    routeLeg(size, pass, allowed, cellCost, beyond) ??
    routeLeg(size, pass, allowed, cellCost, border);
  if (!down || !onward) return null;
  const cells = [...outer, ...down.slice(1), ...onward.slice(1)];
  const line = lineToEdges(
    l,
    smoothLine(
      cells.map((i) => cellWorld(l, i)),
      2,
    ),
  );
  const v = tileCenterWorld(l, village.x, village.y);
  return lineKeepsAway(line, v, VILLAGE_ROUTE.villageMinM) ? line : null;
}

/** Prvky průsmyku: sedlo (s osou hřebene obou hřbetů) a stezka přes něj. */
export function mountainPassSites(l: Landscape): PremiumSite[] | null {
  const plan = passPlan(planInputOf(l));
  if (!plan) return null;
  const { size, heights } = l;
  const s = crestCell(plan.side, plan.t, size);
  const saddleHeight = heights[s.y * size + s.x]!;
  // Oba hřbety aspoň `minRiseM` nad sedlem.
  for (const [from, to] of [
    [plan.t - plan.before, plan.t - 1],
    [plan.t + 1, plan.t + plan.after],
  ] as const) {
    let top = -Infinity;
    for (let t = from; t <= to; t++) {
      const c = crestCell(plan.side, t, size);
      top = Math.max(top, heights[c.y * size + c.x]!);
    }
    if (top - saddleHeight < MOUNTAIN_PASS.minRiseM) return null;
  }
  const route = passRoute(l, plan);
  if (!route) return null;
  const a = crestCell(plan.side, plan.t - plan.before, size);
  const b = crestCell(plan.side, plan.t + plan.after, size);
  const [x, z] = cellPointWorld(l, s.x, s.y);
  const middle = route[Math.floor(route.length / 2)]!;
  return [
    {
      kind: 'pass',
      x,
      z,
      line: [cellPointWorld(l, a.x, a.y), [x, z], cellPointWorld(l, b.x, b.y)],
    },
    { kind: 'route', x: middle[0], z: middle[1], line: route },
  ];
}

const mountainPass = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    const plan = passPlan(planInputOfTerrain(terrain));
    if (plan) sculptPass(terrain, plan, createRandom(deriveSeed(ctx.seed, 'mountain-pass')));
    return terrain;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    return mountainPassSites(landscape);
  },
} satisfies PremiumPass;

// ── Posvátná hora ────────────────────────────────────────────────────────────────────────────

/**
 * Posvátná hora (návrh Clauda – jako Říp): osamělý vrch `distanceM` od vsi (nejraději
 * `targetM`), vrcholová plošina o poloměru `plateauM` (≈ 0,8 ha), úpatí `footM` od středu.
 * Plošina `heightM` nad průměrem terénu na úpatí, svahy od plošiny strmé a k úpatí mírné
 * ((1 − t)²). Střed aspoň `waterMinCells` od vody a `edgeMinCells` od okraje mapy, nejraději na
 * straně potoka se vsí a s celým úpatím na mapě.
 */
export const SACRED_MOUNTAIN = {
  distanceM: [650, 950],
  targetM: 800,
  plateauM: 52,
  footM: 330,
  heightM: [56, 64],
  waterMinCells: 16,
  edgeMinCells: 12,
  /** Kontrola typu: plošina aspoň (ha) a aspoň tolik m nad úpatím, nejvýš tolik m od vsi. */
  minPlateauHa: 0.5,
  minHeightM: 50,
  maxDistanceM: 1000,
  /** Plošina = místa do tolika m pod vrcholem. */
  plateauDropM: 1,
} as const;

/** Body úpatí, nad jejichž průměrem se výška hory měří. */
const FOOT_SAMPLES = 32;

/** Střed posvátné hory (políčko) – čistá funkce vody a místa vsi. */
export function mountainPlan(input: PlanInput): { x: number; y: number } | null {
  const M = SACRED_MOUNTAIN;
  return pickSite(input, {
    distanceM: M.distanceM,
    targetM: M.targetM,
    waterMinCells: M.waterMinCells,
    edgeMinCells: M.edgeMinCells,
    reachCells: M.footM / CELL_SIZE_M,
  });
}

/** Průměrná výška na kružnici úpatí (políčka, bilineárně). */
function footMean(heights: Float32Array, size: number, cx: number, cy: number, r: number): number {
  let sum = 0;
  for (let k = 0; k < FOOT_SAMPLES; k++) {
    const angle = (2 * Math.PI * k) / FOOT_SAMPLES;
    sum += heightAtCell(heights, size, cx + detCos(angle) * r, cy + detSin(angle) * r);
  }
  return sum / FOOT_SAMPLES;
}

/** Posvátná hora: plošina a svahy nad terén (vodu a rovinu vsi nemění). */
function sculptMountain(terrain: Terrain, center: { x: number; y: number }, random: Random): void {
  const { size, heights, villageSite } = terrain;
  const M = SACRED_MOUNTAIN;
  const r0 = M.plateauM / CELL_SIZE_M;
  const foot = M.footM / CELL_SIZE_M;
  const base = footMean(heights, size, center.x, center.y, foot);
  const top = base + range(random, M.heightM);
  const waterDistance = distanceToMask(terrain.water, size);
  const reach = Math.ceil(foot);
  for (let y = Math.max(0, center.y - reach); y <= Math.min(size - 1, center.y + reach); y++) {
    for (let x = Math.max(0, center.x - reach); x <= Math.min(size - 1, center.x + reach); x++) {
      const i = y * size + x;
      if (terrain.water[i]) continue;
      const r = length2(x - center.x, y - center.y);
      if (r >= foot) continue;
      const t = Math.max(0, (r - r0) / (foot - r0));
      const target = base + (top - base) * (1 - t) * (1 - t);
      const ground = heights[i]!;
      if (target <= ground) continue;
      heights[i] = ground + (target - ground) * reliefKeep(x, y, villageSite, waterDistance[i]!);
    }
  }
}

/**
 * Vrcholová plošina posvátné hory ve světě: obrys (32 paprsků od středu – místa do
 * `plateauDropM` pod vrcholem), výška vrcholu a průměr úpatí.
 */
export function summitOf(
  l: Landscape,
  center: { x: number; y: number },
): { outline: WorldPoint[]; topM: number; footM: number } {
  const [cx, cz] = cellPointWorld(l, center.x, center.y);
  const topM = l.heights[center.y * l.size + center.x]!;
  const outline: WorldPoint[] = [];
  const RAYS = 32;
  const limit = SACRED_MOUNTAIN.footM;
  for (let j = 0; j < RAYS; j++) {
    const angle = (2 * Math.PI * j) / RAYS;
    const dx = detCos(angle);
    const dz = detSin(angle);
    let r = 0;
    while (
      r < limit &&
      sampleTilesAtWorld(l, l.heights, cx + dx * (r + 1), cz + dz * (r + 1)) >=
        topM - SACRED_MOUNTAIN.plateauDropM
    ) {
      r += 1;
    }
    outline.push([cx + dx * r, cz + dz * r]);
  }
  const footM = footMean(
    l.heights,
    l.size,
    center.x,
    center.y,
    SACRED_MOUNTAIN.footM / l.cellSizeM,
  );
  return { outline, topM, footM };
}

/** Prvek posvátné hory: vrcholová plošina (obrys) – jen když je hora dost vysoká a plošina dost velká. */
export function sacredMountainSites(l: Landscape): PremiumSite[] | null {
  const center = mountainPlan(planInputOf(l));
  if (!center) return null;
  const summit = summitOf(l, center);
  if (polygonAreaM2(summit.outline) < SACRED_MOUNTAIN.minPlateauHa * 10_000) return null;
  if (summit.topM - summit.footM < SACRED_MOUNTAIN.minHeightM) return null;
  const [x, z] = cellPointWorld(l, center.x, center.y);
  const v = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  if (length2(x - v.x, z - v.z) > SACRED_MOUNTAIN.maxDistanceM) return null;
  return [{ kind: 'summit', x, z, outline: summit.outline }];
}

const sacredMountain = {
  terrain(terrain: Terrain, ctx: PremiumPassContext): Terrain {
    const center = mountainPlan(planInputOfTerrain(terrain));
    if (center) {
      sculptMountain(terrain, center, createRandom(deriveSeed(ctx.seed, 'sacred-mountain')));
    }
    return terrain;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    return sacredMountainSites(landscape);
  },
} satisfies PremiumPass;

// ── Přirozená pevnost ────────────────────────────────────────────────────────────────────────

/**
 * Přirozená pevnost (návrh Clauda): jistá ostrožna nad zaříznutým meandrem (terén 2 – skály
 * u potoka) s plochou aspoň `minAreaHa`. Terén se generuje se stejným seedem s jinými mezemi
 * ostrožny (`terrainOptions`): větší smyčka, vyšší plocha, i v rovině (bez převýšení okolí)
 * a smyčka smí nahradit úsek s tůní nebo mělčinou. Místo chráněné bažinou se nedělá – ostrožna
 * je jistější a scéna ji umí (skály, stěny, obrys).
 */
export const NATURAL_FORTRESS = {
  promontory: {
    radius: [6, 6.8],
    heightM: [10, 14],
    hillMinM: 0,
    keepSpots: false,
  },
  minAreaHa: 1,
} as const;

/** Největší ostrožna nad meandrem s plochou aspoň `minAreaHa`, nebo null. */
export function fortressPromontory(l: Landscape): Promontory | null {
  let best: Promontory | null = null;
  for (const p of promontoriesOf(l)) {
    if (p.kind !== 'meander' || p.areaHa < NATURAL_FORTRESS.minAreaHa) continue;
    if (!best || p.areaHa > best.areaHa) best = p;
  }
  return best;
}

const naturalFortress = {
  terrainOptions: { promontory: NATURAL_FORTRESS.promontory },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const promontory = fortressPromontory(landscape);
    if (!promontory) return null;
    const world = (p: { x: number; y: number }): WorldPoint => cellPointWorld(landscape, p.x, p.y);
    const [x, z] = world(promontory.center);
    return [{ kind: 'promontory', x, z, outline: promontory.outline.map(world) }];
  },
} satisfies PremiumPass;

/** Průchody typů reliéfu (registr `PREMIUM_PASSES` v `generate.ts`). */
export const RELIEF_PASSES = {
  'mountain-pass': mountainPass,
  'sacred-mountain': sacredMountain,
  'natural-fortress': naturalFortress,
};
