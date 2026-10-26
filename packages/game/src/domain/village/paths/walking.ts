import { length2, type Landscape } from '../../landscape';
import { PATH_WALK, ROAD_WALK } from '../rules';
import type { RoadGrade, RoadGround, RoadLining } from '../types';
import { roadBridged } from '../types-roads';
import { nearestPartFinder } from './nearest';
import { PathHeap, squareCells, type PathLine, type PathPoint, type PathVillage } from './network';
import {
  PATH_WATER,
  PATH_WATER_SPOT,
  PATH_WETLAND,
  pathTerrainOf,
  pathWindowFor,
  type PathTerrain,
} from './terrain';
import {
  isCropPart,
  partWalkSpeed,
  pathCostFactor,
  roadTreeSpeed,
  roadWalkSpeed,
} from './walk-speed';

// Chůze po vyšlapaných pěšinách a pevných cestách (paths.md – Pěšiny a práce, roads.md –
// Rychlejší chůze): vzdálenost chůze = nejkratší z: rovně, nebo rovně k pěšině či cestě, po ní
// a rovně od ní k cíli. Rychlosti proti louce jsou stejné jako v síti pěšin (walk-speed.ts –
// Martin, 19. 10. 2026): po plné pěšině dne 1,3× (slabší úměrně síle – PATH_WALK), po pevné cestě
// podle stupně (ROAD_WALK – vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes
// mokřinu; stromy u cesty přidají až 0,03, jabloně 0,05 – roads.md, Stromy u cesty zrychlí chůzi).
// Mokřina 0,5× (bahno), brod + 30 m (po lávce bez zdržení), díl pole stálou rychlostí 0,875×
// v každém stadiu (FIELD_WALK – pěšina dne přes pole nezrychlí, pevná cesta jde rychlostí cesty).
// S krajinou (`WalkGround`) se mokřina, voda a pole počítají i rovně; bez ní (kalibrace) jen
// délka. Čistá deterministická funkce – stejně na serveru i v prohlížeči; použije ji každý, kdo
// měří cestu na pole, do sadu, do lesa.

/** Graf chůze – body a úseky s délkou a cenou chůze (rozcestí sdílejí bod). */
export interface WalkGraph {
  x: number[];
  z: number[];
  links: { to: number; length: number; cost: number }[][];
}

/** Pevná cesta pro chůzi – osa, stupeň, mokřina s brody na ose a stromy u cesty. */
export interface WalkRoad {
  points: readonly PathPoint[];
  grade: RoadGrade;
  /** Upravená cesta bez hatě a lávky (`Road.unbridged`) – v mokřině i na brodu jako vyšlapaná. */
  unbridged?: boolean | undefined;
  ground?: RoadGround;
  /** Olemování stromy a jabloněmi (`Road.lined`) – zrychlí chůzi mimo mokřinu; chybí = bez. */
  lined?: RoadLining;
}

/**
 * Půda pro chůzi rovně: terén pěšin v pevném okně kolem místa vsi (stejném na serveru
 * i v prohlížeči – na kouscích ani na tom, co je kde v mezipaměti, výsledek nezávisí). Mimo okno
 * je to louka.
 */
export interface WalkGround {
  terrain: PathTerrain;
  /**
   * Pole vsi po buňkách terénu (`withFieldWalk`): rychlost chůze přes díl (`partWalkSpeed` – v osevu
   * 0,5, strniště 0,8; jinde 1) a díly v osevu, které pěšina dne nezrychlí. Bez údaje bez polí.
   */
  fields?: { speed: Float32Array; crop: Uint8Array };
}

/** Okno půdy pro chůzi: tolik metrů od středu místa vsi na každou stranu. */
const WALK_GROUND_HALF_M = 700;
const groundCache = new WeakMap<Landscape, WalkGround>();

/** Půda pro chůzi v krajině sídla (terén pěšin kolem místa vsi; v mezipaměti podle krajiny). */
export function walkGroundOf(landscape: Landscape): WalkGround {
  const cached = groundCache.get(landscape);
  if (cached) return cached;
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const cx = -half + (landscape.villageSite.x + 0.5) * landscape.cellSizeM;
  const cz = -half + (landscape.villageSite.y + 0.5) * landscape.cellSizeM;
  const window = pathWindowFor(landscape, {
    minX: cx - WALK_GROUND_HALF_M,
    minZ: cz - WALK_GROUND_HALF_M,
    maxX: cx + WALK_GROUND_HALF_M,
    maxZ: cz + WALK_GROUND_HALF_M,
  });
  const ground = { terrain: pathTerrainOf(landscape, window) };
  groundCache.set(landscape, ground);
  return ground;
}

/**
 * Půda pro chůzi s poli vsi (fields.md – Vzdálenost): rychlost chůze přes díly polí podle stadia
 * a vzhledu (`partWalkSpeed`) po buňkách terénu půdy – stejně jako cena buněk sítě pěšin. Bez polí
 * půda beze změny.
 */
export function withFieldWalk(ground: WalkGround, fields: PathVillage['fields']): WalkGround {
  if (fields.every((f) => f.parts.length === 0)) return ground;
  const t = ground.terrain;
  const speed = new Float32Array(t.width * t.height).fill(1);
  const crop = new Uint8Array(t.width * t.height);
  for (const field of fields) {
    // hrana mezi díly téhož pole je uvnitř pole – podle nejbližšího dílu (jako síť pěšin)
    const nearestPart = nearestPartFinder(field.parts, field.parts[0]?.size ?? 0);
    for (const c of squareCells(t, field.parts).inside) {
      const part = nearestPart(
        t.originX + (c % t.width) * t.cellM,
        t.originZ + Math.floor(c / t.width) * t.cellM,
      );
      speed[c] = Math.min(speed[c]!, partWalkSpeed(part));
      if (isCropPart(part)) crop[c] = 1;
    }
  }
  return { terrain: t, fields: { speed, crop } };
}

/**
 * Délka chůze rovně z `a` do `b` (m) – po pěšině dne síly `strength` (bez údaje bez pěšiny): po
 * půlbuňkách terénu – mokřina a díl pole podle rychlosti (nejpomalejší platí; přes díl v osevu
 * pěšina nezrychlí), každé vstoupení do vody (brod, potok) + ROAD_WALK.fordExtraM. Bez půdy délka
 * úsečky (po pěšině zkrácená).
 */
export function groundWalkLength(
  ground: WalkGround | null | undefined,
  a: PathPoint,
  b: PathPoint,
  strength = 0,
): number {
  const length = length2(b.x - a.x, b.z - a.z);
  if (!ground || length === 0) return pathWalkLength(length, strength);
  const t = ground.terrain;
  const fields = ground.fields;
  const tread = pathCostFactor(strength);
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const piece = length / n;
  let cost = 0;
  let inWater = false;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const i = Math.round((a.x + (b.x - a.x) * u - t.originX) / t.cellM);
    const j = Math.round((a.z + (b.z - a.z) * u - t.originZ) / t.cellM);
    let speed = 1;
    let water = false;
    let factor = tread;
    if (i >= 0 && j >= 0 && i < t.width && j < t.height) {
      const c = j * t.width + i;
      const flags = t.flags[c]!;
      water = (flags & PATH_WATER) !== 0;
      if (flags & PATH_WETLAND) speed = ROAD_WALK.wetSpeed;
      if (fields) {
        speed = Math.min(speed, fields.speed[c]!);
        if (fields.crop[c]) factor = 1;
      }
    }
    if (water && !inWater) cost += ROAD_WALK.fordExtraM;
    inWater = water;
    cost += (piece / speed) * factor;
  }
  return cost;
}

/** Délka chůze úsekem pěšiny se silou `strength` 0–1 (m) – po pěšině se jde rychleji. */
export function pathWalkLength(length: number, strength: number): number {
  return length * pathCostFactor(strength);
}

/**
 * Nejmenší podíl přímé vzdálenosti, na který chůze může klesnout – nejrychlejší chůze (plná
 * pěšina, pevná cesta podle stupně, hať – bez stromů u cest, s nimi `fastestWalkShare`): chůze
 * z A do B je nejméně přímá vzdálenost × tento podíl. Kdo měří jen kandidáty v dosahu (seč luk –
 * hay.ts), podle něj odhadne, co měřit.
 */
export const FASTEST_WALK_SHARE = Math.min(
  1 / PATH_WALK.speed,
  ...Object.values(ROAD_WALK.speed).map((speed) => 1 / speed),
  1 / ROAD_WALK.causewayWetSpeed,
);

/**
 * Nejmenší podíl přímé vzdálenosti pro chůzi po pevných cestách `roads` – jako FASTEST_WALK_SHARE,
 * jen se stromy u cest (roads.md – Stromy u cesty zrychlí chůzi): cesta lemovaná stromy jde
 * rychleji než její stupeň. Bez stromů u cest přesně FASTEST_WALK_SHARE.
 */
export function fastestWalkShare(
  roads: readonly Pick<WalkRoad, 'grade' | 'lined'>[] | undefined,
): number {
  let share = FASTEST_WALK_SHARE;
  for (const road of roads ?? []) {
    const trees = roadTreeSpeed(road.lined);
    if (trees > 0) share = Math.min(share, 1 / roadWalkSpeed(road.grade, false, trees));
  }
  return share;
}

/**
 * Cena chůze úsekem osy pevné cesty od `from` do `to` m od začátku osy: kusy v mokřině a mimo ni
 * podle rychlosti (mimo mokřinu i se stromy u cesty – `roadTreeSpeed`), brody v úseku
 * + ROAD_WALK.fordExtraM (po lávce – hať a lávka – nic).
 */
export function roadPieceCost(road: WalkRoad, from: number, to: number): number {
  const wet = road.ground?.wet ?? [];
  const dry = roadWalkSpeed(road.grade, false, roadTreeSpeed(road.lined));
  let cost = 0;
  let at = from;
  for (const [a, b] of wet) {
    if (b <= at || a >= to) continue;
    const start = Math.max(at, a);
    const end = Math.min(to, b);
    cost += (start - at) / dry;
    cost += (end - start) / roadWalkSpeed(road.grade, true, 0, road.unbridged === true);
    at = end;
  }
  cost += Math.max(0, to - at) / dry;
  if (!roadBridged(road)) {
    for (const ford of road.ground?.fords ?? []) {
      if (ford >= from && ford < to) cost += ROAD_WALK.fordExtraM;
    }
  }
  return cost;
}

/**
 * Graf chůze z os pěšin (úsek mezi body osy – cena podle průměrné síly, s mokřinou a vodou
 * z `ground`) a pevných cest (`roads` – podle stupně, mokřiny a brodů na ose). Konce os se stejnými
 * souřadnicemi sdílejí bod (rozcestí).
 */
export function walkGraph(
  lines: readonly PathLine[],
  options: { roads?: readonly WalkRoad[]; ground?: WalkGround | null } = {},
): WalkGraph {
  const graph: WalkGraph = { x: [], z: [], links: [] };
  const shared = new Map<string, number>();
  const node = (p: PathPoint, end: boolean): number => {
    const key = end ? `${p.x}|${p.z}` : null;
    if (key !== null) {
      const found = shared.get(key);
      if (found !== undefined) return found;
    }
    graph.x.push(p.x);
    graph.z.push(p.z);
    graph.links.push([]);
    const id = graph.x.length - 1;
    if (key !== null) shared.set(key, id);
    return id;
  };
  const link = (a: number, b: number, length: number, cost: number): void => {
    graph.links[a]!.push({ to: b, length, cost });
    graph.links[b]!.push({ to: a, length, cost });
  };
  for (const line of lines) {
    let prev = -1;
    line.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === line.points.length - 1);
      if (prev >= 0 && prev !== id) {
        const a = { x: graph.x[prev]!, z: graph.z[prev]! };
        const length = length2(p.x - a.x, p.z - a.z);
        const strength = (line.strength[k - 1]! + line.strength[k]!) / 2;
        link(prev, id, length, groundWalkLength(options.ground, a, p, strength));
      }
      prev = id;
    });
  }
  for (const road of options.roads ?? []) {
    let prev = -1;
    let along = 0;
    road.points.forEach((p, k) => {
      const id = node(p, k === 0 || k === road.points.length - 1);
      if (prev >= 0) {
        const length = length2(p.x - graph.x[prev]!, p.z - graph.z[prev]!);
        if (prev !== id) link(prev, id, length, roadPieceCost(road, along, along + length));
        along += length;
      }
      prev = id;
    });
  }
  return graph;
}

/**
 * Vzdálenost chůze (m) z nejbližšího výchozího bodu (obydlí) ke každému cíli: rovně, nebo
 * k pěšině či cestě, po ní a od ní k cíli – kratší z obou. Rovně podle půdy (`ground` – mokřina,
 * voda), bez ní délka úsečky. Bez výchozích bodů Infinity.
 */
export function walkingDistances(
  graph: WalkGraph,
  origins: readonly PathPoint[],
  targets: readonly PathPoint[],
  ground: WalkGround | null = null,
): number[] {
  if (targets.length === 0) return [];
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new PathHeap();
  const straight = (a: PathPoint, x: number, z: number): number =>
    ground ? groundWalkLength(ground, a, { x, z }) : length2(x - a.x, z - a.z);
  const bound = new Float64Array(Math.max(n, origins.length));
  /**
   * Nejmenší z `start` a `exact(k)` – rovně je vždy aspoň délka úsečky (rychlosti nejvýš louka),
   * takže dražší výpočet půdy jen u kandidátů v pořadí dolní meze (`lower`, při rovnosti nižší
   * index), dokud může vyjít méně. Horní mez napřed: kandidát s nejmenší dolní mezí se spočítá
   * hned a řadí se jen kandidáti pod ním (výsledek jako průchod všemi).
   */
  const cheapest = (
    count: number,
    lower: (k: number) => number,
    exact: (k: number) => number,
    start = Infinity,
  ): number => {
    let first = -1;
    for (let k = 0; k < count; k++) {
      const lb = lower(k);
      bound[k] = lb;
      if (lb < start && (first < 0 || lb < bound[first]!)) first = k;
    }
    if (first < 0) return start;
    const value = exact(first);
    let best = value < start ? value : start;
    const order: number[] = [];
    for (let k = 0; k < count; k++) if (k !== first && bound[k]! < best) order.push(k);
    order.sort((a, b) => bound[a]! - bound[b]! || a - b);
    for (const k of order) {
      if (bound[k]! >= best) break;
      const value = exact(k);
      if (value < best) best = value;
    }
    return best;
  };
  // rovně z obydlí ke každému cíli – horní mez výsledku; uzel, ke kterému je rovně aspoň tak daleko
  // jako nejdelší z nich, cestu k žádnému cíli nezkrátí a do sítě nevstupuje (výsledek týž)
  const direct = targets.map((t) =>
    cheapest(
      origins.length,
      (k) => length2(t.x - origins[k]!.x, t.z - origins[k]!.z),
      (k) => straight(origins[k]!, t.x, t.z),
    ),
  );
  let limit = 0;
  for (const d of direct) if (d > limit) limit = d;
  for (let id = 0; id < n; id++) {
    const x = graph.x[id]!;
    const z = graph.z[id]!;
    const best = cheapest(
      origins.length,
      (k) => length2(x - origins[k]!.x, z - origins[k]!.z),
      (k) => straight(origins[k]!, x, z),
      limit,
    );
    if (best >= limit) continue;
    dist[id] = best;
    heap.push(id, best);
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    for (const { to, cost } of graph.links[c]!) {
      const nd = d + cost;
      if (nd < dist[to]!) {
        dist[to] = nd;
        heap.push(to, nd);
      }
    }
  }
  // přes pěšiny a cesty (krátké úsečky od bodů u cíle), nebo rovně z obydlí – kratší z obou
  return targets.map((t, q) =>
    cheapest(
      n,
      (id) => dist[id]! + length2(t.x - graph.x[id]!, t.z - graph.z[id]!),
      (id) => dist[id]! + straight({ x: graph.x[id]!, z: graph.z[id]! }, t.x, t.z),
      direct[q]!,
    ),
  );
}

/**
 * Chůze po pevných cestách (bez pěšin dne) s půdou – pro kácení dřeva stavby (roads.md): z místa
 * stavby ke stromům. Stejná data na serveru i v prohlížeči (pevné cesty a krajina), takže cena
 * u kurzoru sedí. Vrátí vzdálenosti chůze z `from` ke každému cíli.
 */
export type Walk = (from: PathPoint, targets: readonly PathPoint[]) => number[];

/** Chůze po pevných cestách `roads` s půdou `ground` (bez pěšin dne). */
export function roadWalk(roads: readonly WalkRoad[], ground: WalkGround | null): Walk {
  const graph = walkGraph([], { roads, ground });
  return (from, targets) => walkingDistances(graph, [from], targets, ground);
}

/** Chůze po pevných cestách vsi s půdou krajiny sídla – kácení dřeva staveb (roads.md). */
export function villageRoadWalk(
  state: { roads?: { roads: readonly WalkRoad[] } },
  landscape: Landscape,
): Walk {
  return roadWalk(state.roads?.roads ?? [], walkGroundOf(landscape));
}

/** Chůze rovně krajinou s půdou `ground` (bez pěšin dne i pevných cest). */
export function straightWalk(ground: WalkGround | null): Walk {
  return (from, targets) => targets.map((t) => groundWalkLength(ground, from, t));
}

const spotsCache = new WeakMap<PathTerrain, Map<number, PathPoint[]>>();

/**
 * Body buněk půdy pro chůzi s příznakem `flag` (PATH_WATER_SPOT – suchý břeh, kam se chodí pro
 * vodu, PATH_FOREST_EDGE – okraj lesa pro dřevo) po řádcích; v mezipaměti podle terénu půdy.
 */
export function groundSpots(ground: WalkGround, flag: number): readonly PathPoint[] {
  const t = ground.terrain;
  let byFlag = spotsCache.get(t);
  if (!byFlag) {
    byFlag = new Map();
    spotsCache.set(t, byFlag);
  }
  const cached = byFlag.get(flag);
  if (cached) return cached;
  const out: PathPoint[] = [];
  for (let j = 0; j < t.height; j++) {
    for (let i = 0; i < t.width; i++) {
      if (t.flags[j * t.width + i]! & flag) {
        out.push({ x: t.originX + i * t.cellM, z: t.originZ + j * t.cellM });
      }
    }
  }
  byFlag.set(flag, out);
  return out;
}

/** Nejbližší bod vzdušnou čarou (při shodě první); bez bodů null. */
export function nearestSpot(points: readonly PathPoint[], from: PathPoint): PathPoint | null {
  let best: PathPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Chůze z `from` k nejbližší vodě (m; paths.md – Pochůzky pro vodu): místo na suchém břehu
 * (PATH_WATER_SPOT) nejblíž vzdušnou čarou v okně půdy pro chůzi, vzdálenost podle `walk` – po
 * pěšinách dne a pevných cestách (`walkGraph` + `walkingDistances`), jen po pevných cestách
 * (`roadWalk`), nebo rovně krajinou (`straightWalk`). Bez vody v okně null.
 */
export function waterWalkDistance(ground: WalkGround, walk: Walk, from: PathPoint): number | null {
  const spot = nearestSpot(groundSpots(ground, PATH_WATER_SPOT), from);
  return spot ? walk(from, [spot])[0]! : null;
}
