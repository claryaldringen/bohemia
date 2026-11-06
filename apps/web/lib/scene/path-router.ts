import {
  cutsWall,
  GATE_SLACK_M,
  PATH_WALK,
  routeLine,
  walkGraph,
  walkingRoute,
  type PathLine,
  type StoredRoute,
  type WalkGraph,
  type WalkGround,
  type WalkingRoute,
  type WalkRoad,
  type WalkWalls,
  wallDetour,
} from '@bohemia/game';
import type { VillagerPaths } from './villager-plan-types';

// Chůze postav po síti vsi (paths.md – Odhad vzdáleností, kudy chodí postavy ve scéně): kudy lidé
// chodí, rozhoduje simulace (stálé trasy, vyšlapanost, pevné cesty); scéna hledá přesnou trasu
// postavy týmž modelem jako odhad simulace (`walkingRoute` z jádra) – kratší z rovně a rovně
// k síti, po pěšinách stálých tras a pevných cestách a rovně k cíli. Trasa domácnosti, která
// začíná u brány a končí u cíle, má přednost (`route`). Osa trasy se dekóduje stejnou funkcí jádra
// jako pěšiny (`routeLine`). Po pěšině a cestě se chodí rychleji. Stěnou opevnění se jde jen
// branou (půda chůze nese stěny – `withFortWalk`; fortifications.md – Brány). Jen vzhled.

/** Z takové dálky (m) od začátku trasy (brány domu) vyjde postava na trasu. */
const START_REACH_M = 30;
/** Kolik hotových dotazů si zapamatuje (pak začne znovu). */
const MEMO_SIZE = 4000;

interface WalkedRoute {
  readonly route: StoredRoute;
  readonly home: string;
  readonly points: readonly (readonly [number, number])[];
  /** Osa trasy jde stěnou opevnění mimo bránu (spočítá se při prvním dotazu). */
  cutsWall?: boolean;
}

/** Jde osa `points` stěnou mimo bránu (osa stálé trasy s rezervou u brány – `GATE_SLACK_M`)? */
function axisCutsWall(walls: WalkWalls, points: readonly (readonly [number, number])[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    if (cutsWall(walls, { x: ax, z: az }, { x: bx, z: bz }, GATE_SLACK_M)) return true;
  }
  return false;
}

type Found = ReturnType<VillagerPaths['route']>;

/** Síť chůze vsi pro postavy – tatáž data jako odhad chůze simulace (paths.md – Odhad vzdáleností). */
export interface WalkNetwork {
  /**
   * Pěšiny ze stálých tras se silou z vyšlapanosti (`routeLinesOf` – tytéž jako v simulaci); bez
   * údaje (ves bez vyšlapanosti) osy uložených tras plnou silou pěšiny.
   */
  lines?: readonly PathLine[] | null;
  /** Pevné cesty vsi (roads.md) – po nich chodec podle stupně, mokřiny a brodů na ose. */
  roads?: readonly WalkRoad[];
  /**
   * Půda chůze rovně (krajina a pole – `walkGroundOf` a `withFieldWalk`), spočítá se až při prvním
   * dotazu; bez ní je rovně délka úsečky.
   */
  ground?: (() => WalkGround | null) | null;
}

/**
 * Postavy po síti vsi: `route(a, b)` najde uloženou trasu, která začíná u `a` (brána domu) a končí
 * u `b` (nejvýš `reach` m), nebo opačně (trasa domácnosti `dwellingId` má přednost); `network(a, b)`
 * trasu po pěšinách a pevných cestách týmž modelem jako odhad simulace (`walkingRoute`) a
 * `walkLength(a, b)` délku chůze po ní pro rozvrh (tempem nejvýš WALK_PACE_MAX); `errand` je konec
 * trasy domácnosti pro vodu nebo dřevo.
 */
export function routeWalker(
  routes: readonly StoredRoute[],
  cellM: number,
  network: WalkNetwork = {},
): VillagerPaths {
  const walked: WalkedRoute[] = [];
  for (const route of routes) {
    const line = routeLine(route, cellM);
    if (line.length < 2) continue;
    walked.push({
      route,
      home: route.from,
      points: line.map((p) => [p.x, p.z] as const),
    });
  }
  const memo = new Map<string, Found>();
  // půda chůze (krajina, pole, stěny opevnění) se staví až při prvním dotazu
  let ground: WalkGround | null | undefined;
  const groundOf = (): WalkGround | null => (ground ??= network.ground?.() ?? null);
  const dist = (p: readonly [number, number], x: number, z: number): number =>
    Math.hypot(p[0] - x, p[1] - z);
  const find = (
    a: { x: number; z: number },
    b: { x: number; z: number },
    reach: number,
    dwellingId?: number,
  ): Found => {
    type Pick = { points: readonly (readonly [number, number])[]; cost: number };
    let own: Pick | null = null;
    let other: Pick | null = null;
    for (const w of walked) {
      const first = w.points[0]!;
      const last = w.points[w.points.length - 1]!;
      for (const reversed of [false, true]) {
        const from = reversed ? last : first;
        const to = reversed ? first : last;
        const near = dist(from, a.x, a.z);
        const far = dist(to, b.x, b.z);
        if (near > START_REACH_M || far > reach) continue;
        // blíž k oběma koncům; při shodě víc používaná trasa
        const cost = near + far - w.route.trips / 1e6;
        const mine = dwellingId !== undefined && w.home === `d:${dwellingId}`;
        const current = mine ? own : other;
        if (current && current.cost <= cost) continue;
        // stěnou opevnění jen branou – odbočky na trasu a z ní rovně ani osa trasy jinudy
        const walls = groundOf()?.walls;
        if (walls) {
          w.cutsWall ??= axisCutsWall(walls, w.points);
          if (
            w.cutsWall ||
            cutsWall(walls, a, { x: from[0], z: from[1] }) ||
            cutsWall(walls, { x: to[0], z: to[1] }, b)
          ) {
            continue;
          }
        }
        const pick = { points: reversed ? [...w.points].reverse() : w.points, cost };
        if (mine) own = pick;
        else other = pick;
      }
    }
    // trasa domácnosti má přednost před geometricky bližší trasou cizí domácnosti
    const best: Pick | null = own ?? other;
    if (!best) return null;
    const points: [number, number][] = [
      [a.x, a.z],
      ...best.points.map((p) => [p[0], p[1]] as [number, number]),
      [b.x, b.z],
    ];
    // odbočka na trasu a z ní k cíli jde mimo cestu (1), po trase PATH_WALK
    const pace = points
      .slice(1)
      .map((_, i) => (i === 0 || i === points.length - 2 ? 1 : PATH_WALK.speed));
    return { points, pace };
  };
  // síť chůze (paths.md – Odhad vzdáleností): pěšiny stálých tras se silou z vyšlapanosti
  // (bez ní osy tras plnou silou) a pevné cesty, rovně po půdě krajiny a polí – jako simulace;
  // graf i půda se staví až při prvním dotazu
  let graph: WalkGraph | null = null;
  const graphOf = (): WalkGraph =>
    (graph ??= walkGraph(
      network.lines ??
        walked.map((w): PathLine => ({
          points: w.points.map(([x, z]) => ({ x, z })),
          strength: w.points.map(() => 1),
          years: [],
          openStart: true,
          openEnd: true,
        })),
      { roads: network.roads ?? [], ground: groundOf() },
    ));
  const walks = new Map<string, SceneWalk>();
  const walking = (a: { x: number; z: number }, b: { x: number; z: number }): SceneWalk => {
    const key = `${a.x.toFixed(1)},${a.z.toFixed(1)},${b.x.toFixed(1)},${b.z.toFixed(1)}`;
    const known = walks.get(key);
    if (known) return known;
    const found = sceneWalk(walkingRoute(graphOf(), a, b, groundOf()));
    if (walks.size >= MEMO_SIZE) walks.clear();
    walks.set(key, found);
    return found;
  };
  return {
    gates(a, b) {
      const walls = groundOf()?.walls;
      if (!walls || !cutsWall(walls, a, b)) return [];
      const via = wallDetour(walls, a, b);
      return Array.isArray(via) ? via : [];
    },
    walkLength(a, b) {
      const { span } = walking(a, b);
      return Number.isFinite(span) ? span : Math.hypot(b.x - a.x, b.z - a.z);
    },
    network(a, b) {
      const found = walking(a, b);
      if (!found.network) return null;
      // přesné konce (paměť dotazů zaokrouhluje)
      const points = found.points.slice();
      points[0] = [a.x, a.z];
      points[points.length - 1] = [b.x, b.z];
      return { points, pace: found.pace };
    },
    route(a, b, reach = START_REACH_M, dwellingId) {
      const key = `${a.x.toFixed(2)},${a.z.toFixed(2)},${b.x.toFixed(2)},${b.z.toFixed(2)},${reach},${dwellingId ?? ''}`;
      if (memo.has(key)) return memo.get(key)!;
      if (memo.size >= MEMO_SIZE) memo.clear();
      const found = find(a, b, reach, dwellingId);
      memo.set(key, found);
      return found;
    },
    errand(dwellingId, kind) {
      let best: WalkedRoute | null = null;
      for (const w of walked) {
        if (w.home !== `d:${dwellingId}` || w.route.to !== kind) continue;
        if (!best || w.route.trips > best.route.trips) best = w;
      }
      const end = best?.points[best.points.length - 1];
      return end ? { x: end[0], z: end[1] } : null;
    },
  };
}

/**
 * Nejsvižnější tempo chůze postavy ve scéně (násobek přirozené chůze): jako po plné pěšině
 * (`PATH_WALK`) – rychleji krok vypadá jako běh. Pevná cesta zrychlí chůzi v ceně simulace
 * (vyšlapaná 1,5×, upravená 1,7× – `ROAD_WALK`), ve scéně jde postava po cestě tímto tempem a délka
 * chůze v rozvrhu se podle toho prodlouží (návrh Clauda 1. 11. 2026; jen vzhled).
 */
export const WALK_PACE_MAX = PATH_WALK.speed;
/** Nejpomalejší tempo úseku (mokřina 0,5× – níž by postava stála). */
const WALK_PACE_MIN = 0.4;

/** Trasa chodce pro scénu – body, tempo úseků a délka chůze pro rozvrh. */
interface SceneWalk {
  points: (readonly [number, number])[];
  pace: number[];
  /** Délka chůze tempem `pace` (m přirozené chůze) – délka činnosti v rozvrhu. */
  span: number;
  /** Trasa jde po síti (jinak rovně). */
  network: boolean;
}

/**
 * Trasa chodce z jádra (`walkingRoute`) pro scénu: bez nulových úseků; tempo úseku = délka ÷ cena
 * chůze (louka 1, pole 0,875, mokřina 0,5, pěšina až 1,3, cesta až 1,7 – `walking.ts`), oříznuté
 * na WALK_PACE_MIN–WALK_PACE_MAX; délka chůze pro rozvrh je pak součet délka ÷ tempo – cena
 * odhadu simulace, kde tempo nepřekročí mez, jinak o kus víc. Postava tak po nakreslené trase
 * v čase z rozvrhu nikdy nejde rychleji než WALK_PACE_MAX× přirozená chůze.
 */
function sceneWalk(found: WalkingRoute): SceneWalk {
  const first = found.points[0]!;
  const points: (readonly [number, number])[] = [[first.x, first.z]];
  const pace: number[] = [];
  let span = 0;
  let extra = 0;
  found.points.forEach((p, i) => {
    if (i === 0) return;
    const [qx, qz] = points[points.length - 1]!;
    const length = Math.hypot(p.x - qx, p.z - qz);
    const cost = found.costs[i - 1]!;
    if (length < 1e-6) {
      // nulový úsek (vstup na síť v bodě) – jeho cena se přičte k dalšímu
      extra += cost;
      return;
    }
    const total = cost + extra;
    extra = 0;
    const k =
      total > 0 && Number.isFinite(total)
        ? Math.min(WALK_PACE_MAX, Math.max(WALK_PACE_MIN, length / total))
        : 1;
    pace.push(k);
    span += length / k;
    points.push([p.x, p.z]);
  });
  if (points.length < 2) {
    points.push([
      found.points[found.points.length - 1]!.x,
      found.points[found.points.length - 1]!.z,
    ]);
    pace.push(1);
  }
  return { points, pace, span, network: found.points.length > 2 };
}
