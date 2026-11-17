// Osa zemské stezky (docs/design/trade.md – Zemská stezka): kde stezka začíná, směry a obnova
// úseků stezky z geometrie sítě pevných cest (převod starších vsí). Bez závislosti na síti cest
// (`paths/roads`), ať ji může použít i převod v `withMergedRoads`.
import type { Landscape } from '../../landscape';
import { villageManor } from '../people/manor';
import { DWELLING_PATH_BOX_M } from '../paths/network-grid';
import { EDGE_MARGIN_M } from '../paths/terrain';
import { plotCells } from '../placement/plot-cells';
import { TRAIL } from '../rules';
import type {
  Direction8,
  Dwelling,
  Road,
  RoadJunction,
  Trail,
  TrailPiece,
  VillageState,
} from '../types';

const H = Math.SQRT1_2;
/** Jednotkový směr ve světě – sever je +z, východ +x (minimapa a kamera – sever nahoře). */
export const DIRECTION_VECTORS: Readonly<Record<Direction8, { x: number; z: number }>> = {
  N: { x: 0, z: 1 },
  NE: { x: H, z: H },
  E: { x: 1, z: 0 },
  SE: { x: H, z: -H },
  S: { x: 0, z: -1 },
  SW: { x: -H, z: -H },
  W: { x: -1, z: 0 },
  NW: { x: -H, z: H },
};

/**
 * Kde stezka začíná: u dvorce na pozemku za branou (kus za plotem ve směru vchodu), u volného
 * obydlí kus před vchodem.
 */
export function trailStart(
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
  manor: Dwelling,
): { x: number; z: number } {
  const { position } = manor;
  const fx = Math.sin(position.rotation);
  const fz = Math.cos(position.rotation);
  if (manor.plot) {
    const half = (landscape.size * landscape.cellSizeM) / 2;
    const cells = plotCells(manor.plot);
    const xs = cells.map((c) => -half + c.x * landscape.cellSizeM);
    const zs = cells.map((c) => -half + c.y * landscape.cellSizeM);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + landscape.cellSizeM;
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs) + landscape.cellSizeM;
    for (let t = 0; t < 60; t += 0.5) {
      const x = position.x + fx * t;
      const z = position.z + fz * t;
      if (x < minX || x > maxX || z < minZ || z > maxZ) return { x: x + fx * 1.5, z: z + fz * 1.5 };
    }
  }
  const front = DWELLING_PATH_BOX_M[manor.type].maxZ + 2;
  return { x: position.x + fx * front, z: position.z + fz * front };
}

/** Obnovená osa začíná v uzlu sítě do tolika metrů od začátku stezky (u brány dvorce). */
const START_REACH_M = 30;
/** Přístup k uzlu vzdušnou čarou se počítá tolikrát dráž než po cestě – osa začíná u brány, ne
 * zkratkou k dalšímu rozcestí. */
const OFF_ROAD_FACTOR = 4;
/**
 * Konec úseku na kraji mapy – tolerance k pásu kraje, kde stezka končí (m); týž predikát drží
 * výstupy stezek na kraj mapy (`trailExitsOf`).
 */
export const EDGE_SLACK_M = 1;

/** Uzel sítě – konec úseku (na setinu metru, jako `endKey` v roads-form.ts). */
function nodeKey(p: { x: number; z: number }): string {
  return `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
}

function axisLength(road: Pick<Road, 'points'>): number {
  let sum = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1]!;
    const b = road.points[i]!;
    sum += Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
  }
  return sum;
}

interface Arm {
  road: Road;
  to: string;
}

/**
 * Osa stezky ve směru `direction` po síti pevných cest (upravené a vozové, ne opuštěné): nejkratší
 * cesta po úsecích z uzlu u začátku stezky (do `START_REACH_M`, přístup vzdušnou čarou dráž)
 * do konce úseku na kraji mapy ve směru – ten nejblíž paprsku směru (v rozmezí ±`wideConeDeg`).
 * Úseky od vsi ven; bez spojení null. Deterministicky – při shodě rozhoduje klíč uzlu a id úseku.
 */
export function trailAxisRoads(
  roads: readonly Road[],
  direction: Direction8,
  start: { x: number; z: number },
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
  junctions: readonly RoadJunction[] = [],
  /** I vyšlapané cesty (přestavba sítě – stezka se po nich znovu upraví). */
  trodden = false,
): Road[] | null {
  const fixed = roads
    .filter((r) => !r.abandoned && (trodden || r.grade !== 'trodden') && r.points.length >= 2)
    .sort((a, b) => a.id - b.id);
  // konce ramen křižovatky leží ve vchodech, ne v jednom bodě – uzel je celá křižovatka
  // (paths.md – Křižovatky; Jednorázová přestavba sítě)
  const atJunction = new Map<string, { key: string; x: number; z: number }>();
  for (const j of junctions) {
    for (const id of j.arms) {
      const road = fixed.find((r) => r.id === id);
      if (!road) continue;
      const a = road.points[0]!;
      const b = road.points[road.points.length - 1]!;
      const end =
        (a.x - j.x) ** 2 + (a.z - j.z) ** 2 <= (b.x - j.x) ** 2 + (b.z - j.z) ** 2 ? a : b;
      atJunction.set(`${id}:${nodeKey(end)}`, { key: `j${j.id}`, x: j.x, z: j.z });
    }
  }
  const nodes = new Map<string, { x: number; z: number; arms: Arm[] }>();
  const keyOf = (road: Road, p: { x: number; z: number }): string =>
    atJunction.get(`${road.id}:${nodeKey(p)}`)?.key ?? nodeKey(p);
  const node = (road: Road, p: { x: number; z: number }): { arms: Arm[] } => {
    const junction = atJunction.get(`${road.id}:${nodeKey(p)}`);
    const key = junction?.key ?? nodeKey(p);
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { x: junction?.x ?? p.x, z: junction?.z ?? p.z, arms: [] }));
    return n;
  };
  for (const road of fixed) {
    const a = road.points[0]!;
    const b = road.points[road.points.length - 1]!;
    node(road, a).arms.push({ road, to: keyOf(road, b) });
    node(road, b).arms.push({ road, to: keyOf(road, a) });
  }
  // Dijkstra (sítě jsou malé – výběr nejbližšího uzlu průchodem, při shodě menší klíč)
  const dist = new Map<string, number>();
  const via = new Map<string, { from: string; road: Road }>();
  for (const [key, n] of nodes) {
    const d = Math.sqrt((n.x - start.x) ** 2 + (n.z - start.z) ** 2);
    if (d <= START_REACH_M) dist.set(key, d * OFF_ROAD_FACTOR);
  }
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    for (const [key, d] of dist) {
      if (done.has(key)) continue;
      const best = current === null ? Infinity : dist.get(current)!;
      if (d < best || (d === best && key < current!)) current = key;
    }
    if (current === null) break;
    done.add(current);
    const base = dist.get(current)!;
    for (const arm of nodes.get(current)!.arms) {
      const d = base + axisLength(arm.road);
      if (d < (dist.get(arm.to) ?? Infinity)) {
        dist.set(arm.to, d);
        via.set(arm.to, { from: current, road: arm.road });
      }
    }
  }
  // cíl: dosažitelný konec úseku v pásu kraje mapy ve směru, nejblíž paprsku
  const v = DIRECTION_VECTORS[direction];
  const limit =
    (landscape.size * landscape.cellSizeM) / 2 - EDGE_MARGIN_M - TRAIL.edgeBandM - EDGE_SLACK_M;
  const cone = Math.cos((TRAIL.wideConeDeg * Math.PI) / 180);
  let target: { key: string; along: number; d: number } | null = null;
  for (const [key, d] of dist) {
    if (!via.has(key)) continue;
    const { x, z } = nodes.get(key)!;
    const edge =
      (v.x > 0 && x >= limit) ||
      (v.x < 0 && x <= -limit) ||
      (v.z > 0 && z >= limit) ||
      (v.z < 0 && z <= -limit);
    if (!edge) continue;
    const dx = x - start.x;
    const dz = z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const along = length > 0 ? (dx * v.x + dz * v.z) / length : -1;
    if (along < cone) continue;
    const better =
      !target ||
      along > target.along ||
      (along === target.along && (d < target.d || (d === target.d && key < target.key)));
    if (better) target = { key, along, d };
  }
  if (!target) return null;
  const path: Road[] = [];
  for (let key = target.key, step = via.get(key); step; step = via.get(key)) {
    path.push(step.road);
    key = step.from;
  }
  return path.reverse();
}

/** Hotová stezka, která přišla o úseky (žádný, nebo odkaz na neexistující úsek)? */
function trailLost(trail: Trail, ids: ReadonlySet<number>): boolean {
  if (typeof trail.builtDay !== 'number') return false;
  return trail.pieces.length === 0 || trail.pieces.some((p) => !ids.has(p.roadId));
}

/**
 * Úseky pro hotové stezky, které o své úseky přišly (převod starších vsí – staré spojování úseků
 * stezkám nepřepsalo id): osa po síti pevných cest od dvorce ke kraji mapy (`trailAxisRoads`),
 * stupeň z cesty, práce 0 (stezka je hotová). Podle id stezky; stezka bez spojení chybí.
 */
export function restoredTrailPieces(
  state: Pick<VillageState, 'roads' | 'trails' | 'manorId' | 'dwellings' | 'constructions'>,
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
): Map<number, TrailPiece[]> {
  const restored = new Map<number, TrailPiece[]>();
  const roads = state.roads?.roads ?? [];
  const ids = new Set(roads.map((r) => r.id));
  const lost = (state.trails ?? []).filter((t) => trailLost(t, ids));
  if (lost.length === 0) return restored;
  const manor = villageManor(state);
  if (!manor) return restored;
  const start = trailStart(landscape, manor);
  for (const trail of lost) {
    const axis = trailAxisRoads(roads, trail.direction, start, landscape, state.roads?.junctions);
    if (!axis || axis.length === 0) continue;
    restored.set(
      trail.id,
      axis.map((r) => ({ roadId: r.id, grade: r.grade as TrailPiece['grade'], manDays: 0 })),
    );
  }
  return restored;
}
