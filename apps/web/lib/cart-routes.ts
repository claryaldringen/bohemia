// Trasy vozů a spřežení ve scéně počítá prohlížeč (Martin 31. 10. 2026: „simulace bude počítat
// jen s odhadem vzdáleností a přesné trasy zůstanou prohlížeči“): server pošle cíle jízd dne
// (`CartGoal` – village-view-crafts.ts) a vstup vozových tras (`CartWorld` – `cartWorldOf`
// z jádra), prohlížeč z nich spočítá tytéž osy, jaké dřív posílal server (`withCartRoutes`).

import {
  cartWorldRoutes,
  obstaclesOf,
  type CartKind,
  type CartWorld,
  type Landscape,
  type ObstacleLayer,
} from '@bohemia/game';
import type { SceneVillage } from './village-view-scene-types';

type Point = { x: number; z: number };

/**
 * Cíl jízdy dne, ze kterého prohlížeč spočítá trasu (`cartGoalRoute`): vůz jede k `to`; kam
 * k němu nedojede (nebo bez něj), k bodu z `anyOf` nejblíž těžišti, ke kterému dojede (čtyřkolák
 * – wagons.md, Co se vozí a na čem; sad). `reachM` – jak blízko k cíli; `from` – odkud (spřežení
 * od konce bloku), jinak od ohrady; `then` – za trasou dál po této ose (zemská stezka);
 * `reverse` – trasa obráceně (návrat spřežení do ohrady).
 */
export interface CartGoal {
  to?: Point;
  anyOf?: Point[];
  reachM: number;
  from?: Point;
  then?: Point[];
  reverse?: true;
  /**
   * Plný vůz od cíle dál k `via.to` (svoz snopů na humno) a odtud zpět k ohradě
   * (`SceneCart.viaRoute` – `cartViaRoute`).
   */
  via?: { to: Point; reachM: number };
}

/** Nejvýš tolik bodů trasy vozu do scény (osa se zjednoduší). */
const CART_ROUTE_POINTS = 80;
/** Odchylka zjednodušené osy od trasy vozové sítě (m). */
const CART_ROUTE_TOLERANCE_M = 0.6;

/** Trasa vozu `kind` k cíli `goal` ze vstupu `world` (zjednodušená, po cm); nedojede-li, null. */
export function cartGoalRoute(
  world: CartWorld,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind,
  goal: CartGoal,
): Point[] | null {
  const from = goal.from ?? null;
  const routeTo = (target: Point): Point[] | null => {
    const route = cartWorldRoutes(
      world,
      landscape,
      obstacles,
      kind,
      [{ x: target.x, z: target.z, reachM: goal.reachM }],
      from,
    )?.[0];
    return route?.reached && route.points.length >= 2 ? route.points : null;
  };
  const routeToAny = (goals: readonly Point[]): Point[] | null => {
    if (goals.length === 0) return null;
    const routes = cartWorldRoutes(
      world,
      landscape,
      obstacles,
      kind,
      goals.map((g) => ({ x: g.x, z: g.z, reachM: goal.reachM })),
      from,
    );
    const reached = goals.flatMap((g, k) => {
      const route = routes?.[k];
      return route?.reached && route.points.length >= 2 ? [{ x: g.x, z: g.z, k }] : [];
    });
    const best = nearestToCentroid(reached);
    return best ? routes![best.k]!.points : null;
  };
  let axis = goal.to ? routeTo(goal.to) : null;
  if (!axis && goal.anyOf) axis = routeToAny(goal.anyOf);
  if (goal.then) axis = [...(axis ?? []), ...goal.then];
  if (!axis) return null;
  const route = simplifiedRoute(axis);
  return goal.reverse ? route.reverse() : route;
}

/**
 * Pokračování jízdy vozu `kind` od konce osy `axis` (pole) k `via.to` (humno) a odtud k začátku
 * osy (ohrada) – zjednodušená osa po cm; nedojede-li tam nebo zpět, null (vůz jede jako dřív).
 */
export function cartViaRoute(
  world: CartWorld,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind,
  axis: readonly Point[],
  via: NonNullable<CartGoal['via']>,
): { points: Point[]; drop: Point } | null {
  if (axis.length < 2) return null;
  const field = axis[axis.length - 1]!;
  const pen = axis[0]!;
  const leg = (from: Point, to: Point, reachM: number): Point[] | null => {
    const route = cartWorldRoutes(
      world,
      landscape,
      obstacles,
      kind,
      [{ ...to, reachM }],
      from,
    )?.[0];
    return route?.reached && route.points.length >= 2 ? route.points : null;
  };
  const there = leg(field, via.to, via.reachM);
  if (!there) return null;
  const drop = there[there.length - 1]!;
  const back = leg(drop, pen, CART_HOME_REACH_M);
  if (!back) return null;
  // od konce osy (pole) – hledání může začít od nejbližšího uzlu mřížky
  const start = Math.hypot(there[0]!.x - field.x, there[0]!.z - field.z) > 0.01 ? [field] : [];
  return { points: simplifiedRoute([...start, ...there, ...back.slice(1)]), drop };
}

/** Jak blízko ohrady (začátku osy) končí návrat od humna (m) – pak smyčka u ohrady. */
const CART_HOME_REACH_M = 3;

/**
 * Scéna s trasami vozů a spřežení spočítanými z cílů (`SceneCart.goal`, `ScenePloughLegs`
 * `outGoals` / `homeGoals`) a vstupu `scene.cartWorld`: vůz bez trasy stojí u ohrady, spřežení
 * stojí na poli (`stand`) jen v den bez cesty tam ani zpět. Bez cílů scéna beze změny.
 */
export function withCartRoutes(scene: SceneVillage, landscape: Landscape): SceneVillage {
  const request = cartRoutesRequest(scene);
  return request ? withCartRouteResult(scene, cartRoutesOf(request, landscape)) : scene;
}

/**
 * Co výpočet tras potřebuje ze scény (cíle vozů a spřežení, vstup mřížky vozu) – jde i do Web
 * Workeru (cart-routes.worker.ts); bez cílů null (scéna se nemění).
 */
export interface CartRoutesRequest {
  world: CartWorld | null;
  carts: { kind: CartKind; goal: CartGoal | null }[];
  outGoals: CartGoal[];
  homeGoals: CartGoal[];
}

/** Spočítané trasy – po vozech scény (null = bez trasy) a spřežení tam a zpět. */
export interface CartRoutesResult {
  carts: (Point[] | null)[];
  /** Pokračování k humnu a zpět (`cartViaRoute`) po vozech; bez něj null. */
  vias?: ({ points: Point[]; drop: Point } | null)[];
  out: Point[] | null;
  home: Point[] | null;
}

export function cartRoutesRequest(scene: SceneVillage): CartRoutesRequest | null {
  const legs = scene.ploughLegs;
  const hasGoals =
    (scene.carts ?? []).some((c) => c.goal !== undefined) ||
    legs?.outGoals !== undefined ||
    legs?.homeGoals !== undefined;
  if (!hasGoals) return null;
  const sent = scene.cartWorld;
  return {
    world: sent
      ? {
          pens: sent.pens,
          village: {
            ...sent.village,
            ...(sent.fieldsAsScene ? { fields: cartFieldsOf(scene) } : {}),
            ...(sent.earthworksAsScene ? { earthworks: cartEarthworksOf(scene) } : {}),
          },
          changes: sent.changes === 'obstacles' ? (scene.obstacles ?? null) : sent.changes,
        }
      : null,
    carts: (scene.carts ?? []).map((c) => ({ kind: c.kind, goal: c.goal ?? null })),
    outGoals: legs?.outGoals ?? [],
    homeGoals: legs?.homeGoals ?? [],
  };
}

/** Trasy z požadavku – deterministicky, stejně v hlavním vlákně i ve Web Workeru. */
export function cartRoutesOf(request: CartRoutesRequest, landscape: Landscape): CartRoutesResult {
  const { world } = request;
  const obstacles = obstaclesOf(landscape);
  const routeOf = (kind: CartKind, goal: CartGoal): Point[] | null =>
    world ? cartGoalRoute(world, landscape, obstacles, kind, goal) : null;
  const firstRoute = (goals: readonly CartGoal[]): Point[] | null => {
    for (const goal of goals) {
      const route = routeOf('two-wheel', goal);
      if (route) return route;
    }
    return null;
  };
  const carts = request.carts.map((c) => (c.goal ? routeOf(c.kind, c.goal) : null));
  const vias = request.carts.map((c, i) => {
    const axis = carts[i];
    const via = c.goal?.via;
    return world && axis && via
      ? cartViaRoute(world, landscape, obstacles, c.kind, axis, via)
      : null;
  });
  return {
    carts,
    ...(vias.some((v) => v !== null) ? { vias } : {}),
    out: firstRoute(request.outGoals),
    home: firstRoute(request.homeGoals),
  };
}

/** Scéna s trasami: vůz bez trasy stojí u ohrady, spřežení stojí na poli jen bez cesty tam i zpět. */
export function withCartRouteResult(scene: SceneVillage, result: CartRoutesResult): SceneVillage {
  const carts = scene.carts?.map((c, i) => {
    const route = result.carts[i] ?? null;
    const viaRoute = route ? (result.vias?.[i] ?? null) : null;
    return route ? { ...c, route, ...(viaRoute ? { viaRoute } : {}) } : c;
  });
  const { out, home } = result;
  const stand = !out && !home ? scene.ploughLegs?.stand : undefined;
  const rest: SceneVillage = { ...scene };
  delete rest.ploughLegs;
  return {
    ...rest,
    ...(carts ? { carts } : {}),
    ...(out || home || stand
      ? {
          ploughLegs: {
            ...(out ? { out } : {}),
            ...(home ? { home } : {}),
            ...(stand ? { stand } : {}),
          },
        }
      : {}),
  };
}

/** Poslední spočítané trasy – s požadavkem a id vozů scény, ke kterým patří (`carriedCartRoutes`). */
export interface CartRoutesMemo {
  cartIds: number[];
  request: CartRoutesRequest;
  result: CartRoutesResult;
}

export function cartRoutesMemo(
  scene: SceneVillage,
  request: CartRoutesRequest,
  result: CartRoutesResult,
): CartRoutesMemo {
  return { cartIds: (scene.carts ?? []).map((c) => c.id), request, result };
}

/**
 * Trasy, se kterými se nový pohled použije hned, než Web Worker spočítá jeho vlastní (D63 – pohled
 * ani fronta akcí na trasy nečekají): vůz se stejným id, druhem a cílem jede po poslední spočítané
 * trase, spřežení po poslední cestě tam / zpět se stejnými cíli; jinak zatím bez trasy (vůz stojí
 * u ohrady, spřežení jako v den bez cesty).
 */
export function carriedCartRoutes(
  scene: SceneVillage,
  request: CartRoutesRequest,
  memo: CartRoutesMemo | null,
): CartRoutesResult {
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const lastAt = new Map((memo?.cartIds ?? []).map((id, k) => [id, k]));
  const kept = request.carts.map((c, i) => {
    const id = scene.carts?.[i]?.id;
    const k = id === undefined ? undefined : lastAt.get(id);
    const last = k === undefined ? undefined : memo?.request.carts[k];
    return c.goal !== null && last?.kind === c.kind && same(last.goal, c.goal) ? k! : null;
  });
  const vias = kept.map((k) => (k === null ? null : (memo?.result.vias?.[k] ?? null)));
  return {
    carts: kept.map((k) => (k === null ? null : (memo?.result.carts[k] ?? null))),
    ...(vias.some((v) => v !== null) ? { vias } : {}),
    out: memo && same(memo.request.outGoals, request.outGoals) ? memo.result.out : null,
    home: memo && same(memo.request.homeGoals, request.homeGoals) ? memo.result.home : null,
  };
}

/**
 * Valy vozových cest pro mřížku vozu ze zemních prací scény (tytéž profily a hotová délka, body
 * se stejným pořadím klíčů) – server je posílá jen, když se odtud nedají sestavit
 * (`CartWorld` – `earthworksAsScene`).
 */
export function cartEarthworksOf(
  scene: Pick<SceneVillage, 'earthworks'>,
): NonNullable<CartWorld['village']['earthworks']> {
  return (scene.earthworks ?? []).map((e) => ({
    profile: e.profile.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    reachedM: e.reachedM,
  }));
}

/** Vlastnosti dílu pole, které čte mřížka vozu (`pathVillageOf` – čtverec, stadium, pastva). */
const CART_PART_KEYS = ['cell', 'x', 'z', 'size', 'rotation', 'stage', 'grazed'] as const;

/**
 * Pole pro mřížku vozu z polí scény (díly scény nesou totéž co díly `pathVillageOf` a víc) –
 * server je posílá jen, když se odtud nedají sestavit (`CartWorld` – `fieldsAsScene`).
 */
export function cartFieldsOf(scene: Pick<SceneVillage, 'fields'>): CartWorld['village']['fields'] {
  return scene.fields.map((f) => ({
    id: f.id,
    parts: f.parts.map((p) => {
      const part: Record<string, unknown> = {};
      for (const key of CART_PART_KEYS) if (p[key] !== undefined) part[key] = p[key];
      return part as unknown as CartWorld['village']['fields'][number]['parts'][number];
    }),
  }));
}

/** Bod nejblíž těžišti bodů (díl na čele práce, políčko louky, strom); bez bodů null. */
export function nearestToCentroid<P extends Point>(points: readonly P[]): P | null {
  if (points.length === 0) return null;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p.z, 0) / points.length;
  let best = points[0]!;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Osa trasy pro scénu: bez opakovaných bodů, zjednodušená (Douglas–Peucker s odchylkou
 * CART_ROUTE_TOLERANCE_M, když je bodů moc, s větší) a zaokrouhlená na cm.
 */
export function simplifiedRoute(points: readonly Point[]): Point[] {
  const unique = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) > 0.01,
  );
  let tolerance = CART_ROUTE_TOLERANCE_M;
  let out = douglasPeucker(unique, tolerance);
  while (out.length > CART_ROUTE_POINTS) {
    tolerance *= 1.5;
    out = douglasPeucker(unique, tolerance);
  }
  return out.map((p) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }));
}

function douglasPeucker<P extends Point>(points: readonly P[], tolerance: number): P[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const length = Math.hypot(dx, dz);
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const p = points[i]!;
      const d =
        length > 1e-9
          ? Math.abs((p.x - pa.x) * dz - (p.z - pa.z) * dx) / length
          : Math.hypot(p.x - pa.x, p.z - pa.z);
      if (d > worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
