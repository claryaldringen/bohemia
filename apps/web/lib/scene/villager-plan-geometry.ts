// Pomocné geometrie plánu postav: boxy domů, schůdná země, čtverce, trasy kolem domů (walkRoute).
import {
  DWELLING_CLEARING_M,
  PLAIN_FRAME,
  rotationCosSin,
  shapeRect,
  type DwellingType,
  type Position,
  type ShapeFrame,
} from '@bohemia/game';
import type { LaborTarget } from '../village-view';
import { chickenBox } from './livestock-placement';
import { localToWorld } from './village-layout';
import { WALK_PACE_MAX } from './path-router';
import { route, stand, type PoseFn, type Route, type VillagerClip } from './villager-motion';
import {
  HOUSE_MARGIN_M,
  ROUTE_STEP_M,
  ROW_MARGIN_M,
  SITE_FRONT_M,
  gap,
  type Box,
  type Context,
  type House,
  type Identity,
  type Point,
  type Square,
  type VillagerPaths,
} from './villager-plan-types';

/**
 * Staveniště zabere i s hromadou hlíny, drnem, dřevem a nářadím kolem jámy celou vyklízenou
 * plochu (village-construction.ts) – stavitelé stojí za ní.
 */
export function siteBox(type: DwellingType, frame: ShapeFrame = PLAIN_FRAME): Box {
  const clearance = shapeRect(frame, DWELLING_CLEARING_M[type]);
  return {
    minX: clearance.minX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(chickenBox(type, frame).maxZ, SITE_FRONT_M),
  };
}

/** Hotové volné obydlí: dům se střechou a šíjí (jako pro slepice – `chickenBox`). */
export function houseBox(type: DwellingType, frame: ShapeFrame = PLAIN_FRAME): Box {
  const house = chickenBox(type, frame);
  return { minX: -house.halfX, maxX: house.halfX, minZ: house.minZ, maxZ: house.maxZ };
}

/**
 * Obydlí na pozemku (hotové i staveniště): celé oplocené políčko v osách modelu domu – lidé
 * stojí za plotem (před brankou), dovnitř cizích pozemků nechodí.
 */
export function plotBox(
  position: Position,
  plot: { x: number; z: number; size: number; rotation?: number; yard?: { x: number; z: number } },
): Box {
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  // u dvorce i dvůr – druhé políčko pozemku za plotem (trade.md); stojí na něm jen vojvodova
  // rodina (lord.md – Ve scéně, villager-plan-lord.ts)
  const corners = [
    ...squareCorners(plot),
    ...(plot.yard ? squareCorners({ x: plot.yard.x, z: plot.yard.z, size: plot.size }) : []),
  ];
  // rohy políčka (natočeného pozemku) do os modelu (inverze localToWorld)
  const local = corners.map(([x, z]) => {
    const dx = x! - position.x;
    const dz = z! - position.z;
    return [dx * c - dz * s, dx * s + dz * c] as const;
  });
  return {
    minX: Math.min(...local.map((p) => p[0])),
    maxX: Math.max(...local.map((p) => p[0])),
    minZ: Math.min(...local.map((p) => p[1])),
    maxZ: Math.max(...local.map((p) => p[1])),
  };
}

/** Bod v obdélníku domu (se šíjí) rozšířeném o `margin`. */
export function inBox(h: House, x: number, z: number, margin: number): boolean {
  const dx = x - h.position.x;
  const dz = z - h.position.z;
  if (h.reach !== undefined) {
    const r = h.reach + Math.max(0, margin);
    if (dx > r || dx < -r || dz > r || dz < -r) return false;
  }
  const c = h.cos ?? Math.cos(h.position.rotation);
  const s = h.sin ?? Math.sin(h.position.rotation);
  // inverze localToWorld (x napříč, z k vchodu)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    lx > h.box.minX - margin &&
    lx < h.box.maxX + margin &&
    lz > h.box.minZ - margin &&
    lz < h.box.maxZ + margin
  );
}

export function onGrave(graves: readonly Square[], x: number, z: number): boolean {
  // natočený hřbitov (fields.md – Natočené stavby) v osách čtverce
  return graves.some((g) => inSquare(g, x, z, -0.2));
}

/** Smí tu postava stát: suchá schůdná zem mimo domy a hroby. */
export function free(ctx: Context, x: number, z: number): boolean {
  return (
    ctx.ground.walkable(x, z) &&
    !onGrave(ctx.graves, x, z) &&
    !ctx.houses.some((h) => inBox(h, x, z, HOUSE_MARGIN_M))
  );
}

/** Volné místo co nejblíž bodu (spirála do `reach` m), nebo null. */
export function nearestFree(ctx: Context, x: number, z: number, reach: number): Point | null {
  if (free(ctx, x, z)) return { x, z };
  for (let r = 0.6; r <= reach; r += 0.6) {
    const steps = Math.max(6, Math.round((2 * Math.PI * r) / 0.8));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (free(ctx, px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

export function targetKey(target: LaborTarget): string {
  if (target.kind === 'village') return 'village';
  if (target.kind === 'trees') return `trees-${target.ids[0] ?? 0}`;
  if (target.kind === 'meadow') {
    const first = target.cells[0];
    return first ? `meadow-${first.x}-${first.y}` : 'meadow';
  }
  if (target.kind === 'pool') return `pool-${target.index}`;
  if (target.kind === 'edge') return `edge-${target.direction}`;
  if (target.kind === 'water') return `water-${target.x}-${target.z}`;
  return `${target.kind}-${target.id}`;
}

export function stringHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

export function unit(x: number, z: number): Point {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 1 };
}

export function worldPoint(position: Position, lx: number, lz: number): Point {
  const [x, z] = localToWorld(position, lx, lz);
  return { x, z };
}

/** Před vchodem domu (na konci šíje), `side` napříč (m). */
export function doorPoint(h: House, side = 0): Point {
  return worldPoint(h.position, side, h.box.maxZ + gap(0.6));
}

export function nearestHouse(list: readonly House[], p: Point): House | null {
  let best: House | null = null;
  let bestD = Infinity;
  for (const h of list) {
    const d = Math.hypot(h.position.x - p.x, h.position.z - p.z);
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

// --- podle činnosti ------------------------------------------------------------------------

/** Osy čtverce ve světě – místní x a z (natočený čtverec natočené stavby). */
export function squareAxes(square: { rotation?: number }): [Point, Point] {
  if (!square.rotation) {
    return [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ];
  }
  const [c, s] = rotationCosSin(square.rotation);
  return [
    { x: c, z: -s },
    { x: s, z: c },
  ];
}

/** Rohy čtverce ve světě (místní −−, +−, ++, −+). */
export function squareCorners(square: {
  x: number;
  z: number;
  size: number;
  rotation?: number;
}): [number, number][] {
  const h = square.size / 2;
  const [ax, az] = squareAxes(square);
  return (
    [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ] as const
  ).map(([u, v]): [number, number] => [
    square.x + ax.x * u + az.x * v,
    square.z + ax.z * u + az.z * v,
  ]);
}

/** Bod do souřadnic čtverce (u podél místní x, v podél místní z). */
export function squareLocal(square: Square, x: number, z: number): [number, number] {
  const [ax, az] = squareAxes(square);
  const dx = x - square.x;
  const dz = z - square.z;
  return [dx * ax.x + dz * ax.z, dx * az.x + dz * az.z];
}

/** Bod ve čtverci rozšířeném o `margin` (ostrá nerovnost, v osách čtverce). */
export function inSquare(square: Square, x: number, z: number, margin: number): boolean {
  const h = square.size / 2 + margin;
  if (!square.rotation) return Math.abs(x - square.x) < h && Math.abs(z - square.z) < h;
  const [u, v] = squareLocal(square, x, z);
  return Math.abs(u) < h && Math.abs(v) < h;
}

/** Postava u kmene stromu (`reach` m od něj) čelem ke kmeni. */
export function atTree(
  ctx: Context,
  tree: Point,
  who: Identity,
  clip: VillagerClip,
  reach: number,
): PoseFn | null {
  const base = who.phase * Math.PI * 2;
  for (let k = 0; k < 8; k++) {
    const a = base + (k * Math.PI) / 4;
    const x = tree.x + Math.cos(a) * reach;
    const z = tree.z + Math.sin(a) * reach;
    if (!free(ctx, x, z)) continue;
    const h = unit(tree.x - x, tree.z - z);
    return stand(x, z, h.x, h.z, clip);
  }
  return null;
}

/** Nejbližší z bodů do `reach` m od `p`, jinak null. */
export function nearestPoint<T extends Point>(
  list: readonly T[],
  p: Point,
  reach: number,
): T | null {
  let best: T | null = null;
  let bestD = reach;
  for (const q of list) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d <= bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

/** Kruh `radius` kolem bodu je volný a mimo pole, sady a hřbitovy (mlat na udusané zemi). */
export function openGround(ctx: Context, p: Point, radius: number): boolean {
  const squares: Square[] = [
    ...ctx.village.fields.flatMap((f) => f.parts),
    ...(ctx.village.orchards ?? []).flatMap((o) => o.squares),
    ...ctx.graves,
  ];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = k === 8 ? 0 : radius;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    if (!free(ctx, x, z)) return false;
    if (squares.some((s) => inSquare(s, x, z, 0.5))) return false;
    if (ctx.houses.some((h) => inBox(h, x, z, 1.5))) return false;
  }
  return true;
}

/** Bod `distance` m od středu `center` směrem k bodu `to`. */
export function towards(center: { x: number; z: number }, to: Point, distance: number): Point {
  const dx = to.x - center.x;
  const dz = to.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: center.x + (dx / len) * distance, z: center.z + (dz / len) * distance };
}

/** O kolik metrů smí trasa po pěšinách zasáhnout do obdélníku domu, pozemku nebo ohrady. */
export const ROUTE_HOUSE_SLACK_M = 1.5;

/**
 * Trasa po pěšinách pro provoz na cestách projde: odbočka na pěšinu a (`lastLeg`) z ní k cíli po
 * suchu mimo hroby; nikde přes dům nebo pozemek – vyhlazená pěšina smí jen o kousek
 * (ROUTE_HOUSE_SLACK_M) zasáhnout do rohu (síť pěšin domy obchází sama); k brance ohrady vede
 * pěšina krmení; ploty ohrad (`houses`) se kontrolují v `pathRouteOk`, tady ne.
 */
export function trafficRouteOk(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'>,
  points: readonly (readonly [number, number])[],
  lastLeg = true,
): boolean {
  const last = points.length - 1;
  for (let i = 1; i <= last; i++) {
    const [px, pz] = points[i - 1]!;
    const [qx, qz] = points[i]!;
    const leg = i === 1 || (lastLeg && i === last);
    const length = Math.hypot(qx - px, qz - pz);
    const steps = Math.max(1, Math.ceil(length / ROUTE_STEP_M));
    for (let s = 0; s <= steps; s++) {
      const x = px + ((qx - px) * s) / steps;
      const z = pz + ((qz - pz) * s) / steps;
      if (ctx.houses.some((h) => !h.pen && inBox(h, x, z, -ROUTE_HOUSE_SLACK_M))) return false;
      if (leg && (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z))) return false;
    }
  }
  return true;
}

/** Jak daleko od vchodu může být místo, odkud člověk vyjde na cestu (sousední pozemky – m). */
export const TRAFFIC_DOOR_REACH_M = 16;

/**
 * Kde člověk z domu vychází na cestu: před vchodem (u pozemku před plotem), nejbližší volné místo
 * – mezi sousedními pozemky i o pár metrů dál.
 */
export function trafficDoor(ctx: Context, home: House): Point | null {
  const door = doorPoint(home);
  return nearestFree(ctx, door.x, door.z, TRAFFIC_DOOR_REACH_M);
}

/** Bod na kraji čtverce nejblíž bodu `p` (v osách čtverce – i natočeného). */
export function squareEdge(square: Square, p: Point): Point {
  const half = square.size / 2 - ROW_MARGIN_M;
  const [u, v] = squareLocal(square, p.x, p.z);
  const [ax, az] = squareAxes(square);
  const cu = Math.min(half, Math.max(-half, u));
  const cv = Math.min(half, Math.max(-half, v));
  return { x: square.x + ax.x * cu + az.x * cv, z: square.z + ax.z * cu + az.z * cv };
}

/**
 * O kolik smí být chůze po uložené trasě domácnosti delší než nejkratší chůze podle odhadu
 * simulace (`VillagerPaths.walkLength`), aby po ní postava ještě šla – trasa domácnosti má
 * přednost, jen když je skoro stejně dobrá (návrh Clauda 1. 11. 2026; jen vzhled).
 */
export const STORED_ROUTE_SLACK = 0.1;

/**
 * Trasa chodce z `a` do `b` (paths.md – Odhad vzdáleností, kudy chodí postavy ve scéně) týmž
 * modelem jako odhad simulace: kratší z „rovně“ a „rovně k síti, po pěšinách a pevných cestách
 * a rovně k cíli“ (`VillagerPaths.network`). Uložená trasa domácnosti `homeId` (nebo jiná), která
 * začíná u `a` a končí u `b`, má přednost, když je chůze po ní nejvýš o STORED_ROUTE_SLACK delší
 * a v čase rozvrhu se po ní jde nejvýš WALK_PACE_MAX× přirozenou chůzí.
 * Trasa po síti i uložená musí projít (`pathRouteOk` – odbočky po suchu mimo hroby, celá mimo
 * domy a ploty); rovně se po suchu obchází domy (`straightRoute`). Když neprojde nic z toho,
 * uložená trasa i delší, pak trasa po síti s mírnějším měřítkem provozu (`trafficRouteOk` – roh
 * domu, ploty ohrad ne), jinak null (voda, hrob, dům).
 */
export function walkRoute(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'> & { paths?: VillagerPaths | null },
  a: Point,
  b: Point,
  homeId?: number,
): Route | null {
  const paths = ctx.paths;
  const along = paths?.route(a, b, undefined, homeId);
  const stored =
    along && along.points.length >= 2 && pathRouteOk(ctx, along.points)
      ? route(along.points, along.pace)
      : null;
  // délka chůze nejkratší trasy pro rozvrh – po uložené trasě v témže čase postava nesmí jít
  // rychleji než WALK_PACE_MAX (path-router.ts)
  const best = paths?.walkLength?.(a, b);
  if (
    stored &&
    (best === undefined ||
      (walkOf(stored) <= best * (1 + STORED_ROUTE_SLACK) && stored.length <= best * WALK_PACE_MAX))
  ) {
    return stored;
  }
  const net = paths?.network?.(a, b) ?? null;
  if (net && net.points.length >= 2 && pathRouteOk(ctx, net.points)) {
    return route(net.points, net.pace);
  }
  const straight = straightRoute(ctx, a, b);
  if (straight) return straight;
  if (stored) return stored;
  if (net && net.points.length >= 2 && trafficRouteOk(ctx, net.points)) {
    return route(net.points, net.pace);
  }
  return null;
}

/** Délka chůze trasy (s tempem úseků – po pěšině kratší). */
function walkOf(r: Route): number {
  return r.walkLength ?? r.length;
}

/**
 * Trasa z `a` do `b` rovně po suchu, která obchází domy: když úsečka protne dům, vloží se bod
 * stranou od domu (až třikrát). Stěnou opevnění mimo bránu nejde – objížďkou přes bránu
 * (`VillagerPaths.gates`). Když trasa vede vodou, hrobem nebo domem, null.
 */
export function straightRoute(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'> & { paths?: VillagerPaths | null },
  a: Point,
  b: Point,
): Route | null {
  let points: Point[] = [a, ...(ctx.paths?.gates?.(a, b) ?? []), b];
  for (let pass = 0; pass < 4; pass++) {
    const next: Point[] = [points[0]!];
    let changed = false;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1]!;
      const q = points[i]!;
      const house = ctx.houses.find(
        (h) => !inBox(h, p.x, p.z, 0.2) && !inBox(h, q.x, q.z, 0.2) && segmentHitsBox(h, p, q),
      );
      if (house) {
        next.push(aroundHouse(house, p, q));
        changed = true;
      }
      next.push(q);
    }
    points = next;
    if (!changed) break;
  }
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const steps = Math.max(1, Math.ceil(length / ROUTE_STEP_M));
    for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
      const x = p.x + ((q.x - p.x) * s) / steps;
      const z = p.z + ((q.z - p.z) * s) / steps;
      if (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z)) return null;
      if (ctx.houses.some((h) => inBox(h, x, z, 0))) return null;
    }
  }
  return route(points.map((p) => [p.x, p.z] as const));
}

/**
 * Trasa po pěšinách projde: odbočka na pěšinu a z ní k cíli po suchu mimo hroby a domy, celá
 * trasa mimo domy (pěšina sama smí přes brod a prudší svah).
 */
export function pathRouteOk(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'>,
  points: readonly (readonly [number, number])[],
  lastLeg = true,
): boolean {
  const last = points.length - 1;
  for (let i = 1; i <= last; i++) {
    const [px, pz] = points[i - 1]!;
    const [qx, qz] = points[i]!;
    const leg = i === 1 || (lastLeg && i === last);
    const length = Math.hypot(qx - px, qz - pz);
    const steps = Math.max(1, Math.ceil(length / ROUTE_STEP_M));
    for (let s = 0; s <= steps; s++) {
      const x = px + ((qx - px) * s) / steps;
      const z = pz + ((qz - pz) * s) / steps;
      if (ctx.houses.some((h) => inBox(h, x, z, 0))) return false;
      if (leg && (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z))) return false;
    }
  }
  return true;
}

/** Úsečka p–q protne obdélník domu (s okrajem) – Liangův–Barskyho ořez v souřadnicích domu. */
export function segmentHitsBox(h: House, p: Point, q: Point): boolean {
  const toLocal = (x: number, z: number): [number, number] => {
    const c = Math.cos(h.position.rotation);
    const s = Math.sin(h.position.rotation);
    const dx = x - h.position.x;
    const dz = z - h.position.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const [x0, z0] = toLocal(p.x, p.z);
  const [x1, z1] = toLocal(q.x, q.z);
  const m = 0.4;
  const edges: [number, number][] = [
    [-(x1 - x0), x0 - (h.box.minX - m)],
    [x1 - x0, h.box.maxX + m - x0],
    [-(z1 - z0), z0 - (h.box.minZ - m)],
    [z1 - z0, h.box.maxZ + m - z0],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pe, qe] of edges) {
    if (Math.abs(pe) < 1e-9) {
      if (qe < 0) return false;
      continue;
    }
    const r = qe / pe;
    if (pe < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Bod stranou od domu – kolmo k úsečce na tu stranu, kde úsečka dům míjí blíž okraji. */
export function aroundHouse(h: House, p: Point, q: Point): Point {
  const center = worldPoint(
    h.position,
    (h.box.minX + h.box.maxX) / 2,
    (h.box.minZ + h.box.maxZ) / 2,
  );
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const length = Math.max(1e-6, Math.hypot(dx, dz));
  const t = Math.min(
    1,
    Math.max(0, ((center.x - p.x) * dx + (center.z - p.z) * dz) / (length * length)),
  );
  const closest = { x: p.x + dx * t, z: p.z + dz * t };
  let n = unit(closest.x - center.x, closest.z - center.z);
  if (Math.hypot(closest.x - center.x, closest.z - center.z) < 1e-3) n = unit(-dz, dx);
  const halfX = (h.box.maxX - h.box.minX) / 2;
  const halfZ = (h.box.maxZ - h.box.minZ) / 2;
  const reach = Math.hypot(halfX, halfZ) + 1;
  return { x: center.x + n.x * reach, z: center.z + n.z * reach };
}
