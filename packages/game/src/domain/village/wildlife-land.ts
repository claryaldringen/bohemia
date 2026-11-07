// Krajina zvěře do 1 km od středu vsi (wildlife.md – Kde zvěř žije a kolik jí je).
// Počítá se jen při převodu a 1. 5. – jednou ročně, ne po dílech.

import {
  riverCenterline,
  streamCenterline,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
} from '../landscape';
import { villageOrigin } from './placement-squares';
import { villageLandSquares } from './squares';
import type { VillageState, WildlifeLand } from './types';
import { WILDLIFE_LAND } from './rules-wildlife';

const M2_PER_HA = 10_000;

/** Políčko krajiny pod bodem světa (nebo -1 mimo mapu). */
function tileOfPoint(landscape: Landscape, point: { x: number; z: number }): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const x = Math.floor((point.x + half) / landscape.cellSizeM);
  const y = Math.floor((point.z + half) / landscape.cellSizeM);
  if (x < 0 || y < 0 || x >= landscape.size || y >= landscape.size) return -1;
  return y * landscape.size + x;
}

/** Souvislé kusy lesa (4 sousedů) z masky; kusy pod `minTiles` políček se vyřadí. */
function bigPatches(
  mask: Uint8Array,
  size: number,
  minTiles: number,
): { count: number; mask: Uint8Array } {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const kept = new Uint8Array(mask.length);
  const members: number[] = [];
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    members.length = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      members.push(index);
      const x = index % size;
      const y = (index - x) / size;
      const near = [
        x > 0 ? index - 1 : -1,
        x < size - 1 ? index + 1 : -1,
        y > 0 ? index - size : -1,
        y < size - 1 ? index + size : -1,
      ];
      for (const n of near) {
        if (n < 0 || !mask[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (members.length >= minTiles) {
      count += members.length;
      for (const index of members) kept[index] = 1;
    }
  }
  return { count, mask: kept };
}

/**
 * Krajina zvěře vsi do `reachM` od jejího počátku (`villageOrigin`). Les = políčka lesa a les vsi
 * bez čtverců polí, sadů, hřbitovů, ohrad a obydlí, jen souvislý od `minPatchHa`; paseky
 * (pokácené stromy) se nepočítají – zjednodušení (návrh Clauda). Louky = louky a pole; voda =
 * políčka vody; tůně = úseky osy potoka s `pool` ≥ `poolMin` do dosahu, sloučené po
 * `poolMergeM`. Ves bez obydlí dostane `defaultLand`.
 */
export function wildlifeLandAt(landscape: Landscape, state: LandState): WildlifeLand {
  return scanLand(landscape, state)?.land ?? { ...WILDLIFE_LAND.defaultLand };
}

/** Obdélník políček krajiny (včetně krajních). */
type Rect = { x0: number; x1: number; y0: number; y1: number };

type LandState = Pick<
  VillageState,
  'dwellings' | 'constructions' | 'parts' | 'orchards' | 'cemeteries' | 'pens' | 'woods' | 'fields'
>;

/** Krajina zvěře a maska lesa (souvislý les od `minPatchHa`) v dosahu; null = ves bez obydlí. */
function scanLand(
  landscape: Landscape,
  state: LandState,
): { land: WildlifeLand; forest: Uint8Array; rect: Rect } | null {
  const origin = villageOrigin(state);
  if (!origin) return null;
  const size = landscape.size;
  const total = size * size;
  const cellHa = (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
  const reach2 = WILDLIFE_LAND.reachM * WILDLIFE_LAND.reachM;
  // jen obdélník kolem počátku vsi ± dosah, ne celá mapa
  const half = (size * landscape.cellSizeM) / 2;
  const lo = (v: number): number =>
    Math.max(0, Math.floor((v - WILDLIFE_LAND.reachM + half) / landscape.cellSizeM) - 1);
  const hi = (v: number): number =>
    Math.min(size - 1, Math.floor((v + WILDLIFE_LAND.reachM + half) / landscape.cellSizeM) + 1);
  const [x0, x1, y0, y1] = [lo(origin.x), hi(origin.x), lo(origin.z), hi(origin.z)];
  const inReach = new Uint8Array(total);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = tileCenterWorld(landscape, x, y);
      const dx = c.x - origin.x;
      const dz = c.z - origin.z;
      if (dx * dx + dz * dz <= reach2) inReach[y * size + x] = 1;
    }
  }
  // čtverce vsi: pole se počítají k loukám, ostatní jsou pryč; les vsi je les
  const taken = new Uint8Array(total);
  const fieldTiles = new Uint8Array(total);
  const woodTiles = new Uint8Array(total);
  for (const sq of villageLandSquares(landscape, state)) {
    const tile = sq.tile ?? tileOfPoint(landscape, sq.center);
    if (tile < 0) continue;
    if (sq.kind === 'field') fieldTiles[tile] = 1;
    else if (sq.kind === 'wood') woodTiles[tile] = 1;
    else taken[tile] = 1;
  }
  const homes = [
    ...state.dwellings.map((d) => d.position),
    ...state.constructions.flatMap((c) =>
      c.kind === 'dwelling' && c.position !== null ? [c.position] : [],
    ),
  ];
  for (const home of homes) {
    const tile = tileOfPoint(landscape, home);
    if (tile >= 0) taken[tile] = 1;
  }
  const forest = new Uint8Array(total);
  let open = 0;
  let water = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * size + x;
      if (!inReach[index]) continue;
      const surface = surfaceAt(landscape, x, y);
      if (surface === 'water') {
        water++;
      } else if (fieldTiles[index]) {
        open++;
      } else if (!taken[index] && (surface === 'forest' || woodTiles[index])) {
        forest[index] = 1;
      } else if (surface === 'meadow' && !taken[index]) {
        open++;
      }
    }
  }
  const patches = bigPatches(forest, size, Math.ceil(WILDLIFE_LAND.minPatchHa / cellHa));
  return {
    land: {
      forestHa: patches.count * cellHa,
      openHa: open * cellHa,
      waterHa: water * cellHa,
      pools: poolsInReach(landscape, origin, reach2),
    },
    forest: patches.mask,
    rect: { x0, x1, y0, y1 },
  };
}

/**
 * Vzdálenost od okraje lesa (m) pro díly polí vsi: distanční transformace 3–4 (chamfer) masky lesa
 * z `wildlifeLandAt` po políčkách krajiny, od středu políčka dílu mínus půl políčka (okraj lesa).
 * Počítá se jednou 1. 6., ne po dílech. Bez lesa v mapě je vzdálenost nekonečná; díl bez
 * údaje (bez čtverce, ves bez obydlí) v mapě chybí – volající použije výchozí.
 */
export function forestEdgeDistances(landscape: Landscape, state: LandState): Map<number, number> {
  return greenEdgeScan(landscape, state, []).distances;
}

/**
 * Vzdálenost dílů polí k okraji lesa a k dalším políčkům zeleně `seedTiles` (např. sady –
 * disasters.md – Ochrana dílu) a maska lesa (souvislý les od `minPatchHa`, indexy políček
 * krajiny; mimo obdélník kolem vsi 0). Sdílí ji zvěř (jen les) i ochrana dílu.
 */
export function greenEdgeScan(
  landscape: Landscape,
  state: LandState,
  seedTiles: readonly number[],
): { distances: Map<number, number>; forest: Uint8Array } {
  const out = new Map<number, number>();
  const scan = scanLand(landscape, state);
  if (!scan) return { distances: out, forest: new Uint8Array(landscape.size * landscape.size) };
  const size = landscape.size;
  const INF = 1 << 28;
  // díly polí (políčka) a obdélník, který pokryje i les v dosahu; mimo něj se nepočítá
  const fields: { partId: number; tile: number }[] = [];
  let { x0, x1, y0, y1 } = scan.rect;
  const grow = (tile: number): void => {
    const fx = tile % size;
    const fy = (tile - fx) / size;
    x0 = Math.min(x0, fx);
    x1 = Math.max(x1, fx);
    y0 = Math.min(y0, fy);
    y1 = Math.max(y1, fy);
  };
  for (const sq of villageLandSquares(landscape, state, ['field'])) {
    if (sq.partId === undefined) continue;
    const tile = sq.tile ?? tileOfPoint(landscape, sq.center);
    if (tile < 0) continue;
    fields.push({ partId: sq.partId, tile });
    grow(tile);
  }
  const seeds = new Uint8Array(size * size);
  for (const tile of seedTiles) {
    if (tile < 0 || tile >= seeds.length) continue;
    seeds[tile] = 1;
    grow(tile);
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const dist = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (y + y0) * size + x + x0;
      dist[y * w + x] = scan.forest[t] || seeds[t] ? 0 : INF;
    }
  }
  // přední průchod
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let d = dist[i]!;
      if (x > 0) d = Math.min(d, dist[i - 1]! + 3);
      if (y > 0) {
        d = Math.min(d, dist[i - w]! + 3);
        if (x > 0) d = Math.min(d, dist[i - w - 1]! + 4);
        if (x < w - 1) d = Math.min(d, dist[i - w + 1]! + 4);
      }
      dist[i] = d;
    }
  }
  // zpětný průchod
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let d = dist[i]!;
      if (x < w - 1) d = Math.min(d, dist[i + 1]! + 3);
      if (y < h - 1) {
        d = Math.min(d, dist[i + w]! + 3);
        if (x < w - 1) d = Math.min(d, dist[i + w + 1]! + 4);
        if (x > 0) d = Math.min(d, dist[i + w - 1]! + 4);
      }
      dist[i] = d;
    }
  }
  for (const { partId, tile } of fields) {
    const fx = tile % size;
    const d = dist[((tile - fx) / size - y0) * w + fx - x0]!;
    out.set(
      partId,
      d >= INF ? Infinity : Math.max(0, (d / 3) * landscape.cellSizeM - landscape.cellSizeM / 2),
    );
  }
  return { distances: out, forest: scan.forest };
}

/** Tůň potoka – bod osy u nejhlubšího místa, směr toku a polovina šířky vody vlevo a vpravo (m). */
export interface FishingPool {
  x: number;
  z: number;
  flowX: number;
  flowZ: number;
  halfLeft: number;
  halfRight: number;
}

/** Tůně potoka do dosahu – po sobě jdoucí body osy s tůní, mezera do `poolMergeM` je jedna tůň. */
function poolsInReach(
  landscape: Landscape,
  origin: { x: number; z: number },
  reach2: number,
): number {
  return poolGroups(landscape, origin, reach2).length;
}

/** Tůně do dosahu jako skupiny bodů osy (pořadí po proudu) – jejich počet je `land.pools`. */
function poolGroups(
  landscape: Landscape,
  origin: { x: number; z: number },
  reach2: number,
): FishingPool[] {
  if (landscape.stream.length < 2) return [];
  const out: FishingPool[] = [];
  let best = -1;
  let last: { x: number; z: number } | null = null;
  const merge2 = WILDLIFE_LAND.poolMergeM * WILDLIFE_LAND.poolMergeM;
  const points = streamCenterline(landscape).points;
  points.forEach((point, k) => {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    if (point.pool < WILDLIFE_LAND.poolMin || dx * dx + dz * dz > reach2) return;
    const fresh =
      last === null ||
      (point.x - last.x) * (point.x - last.x) + (point.z - last.z) * (point.z - last.z) > merge2;
    last = point;
    const width = point.halfLeft + point.halfRight;
    if (!fresh && width <= best) return;
    const next = points[Math.min(points.length - 1, k + 1)]!;
    const prev = points[Math.max(0, k - 1)]!;
    const fx = next.x - prev.x;
    const fz = next.z - prev.z;
    const n = Math.sqrt(fx * fx + fz * fz) || 1;
    const pool: FishingPool = {
      x: point.x,
      z: point.z,
      flowX: fx / n,
      flowZ: fz / n,
      halfLeft: point.halfLeft,
      halfRight: point.halfRight,
    };
    if (fresh) out.push(pool);
    else out[out.length - 1] = pool;
    best = width;
  });
  return out;
}

/**
 * Loviště ryb vsi (wildlife.md – Drobná zvěř a ryby; scéna – rybáři s prutem): tůně do dosahu
 * jako `land.pools`, od nejbližší k počátku vsi (index cíle `{ kind: 'pool', index }`), každá
 * nejhlubším místem. Bez tůně do dosahu jádro rybaří na vodě vsi (`waterHa`) jako na jedné tůni –
 * lovištěm je pak bod potoka nejblíž počátku vsi (návrh Clauda); bez potoka do dosahu nic.
 * Ves bez obydlí nic.
 */
export function fishingPools(
  landscape: Landscape,
  state: Pick<VillageState, 'dwellings' | 'constructions'>,
): FishingPool[] {
  const origin = villageOrigin(state);
  if (!origin) return [];
  const d2 = (p: FishingPool): number =>
    (p.x - origin.x) * (p.x - origin.x) + (p.z - origin.z) * (p.z - origin.z);
  const reach2 = WILDLIFE_LAND.reachM * WILDLIFE_LAND.reachM;
  const groups = poolGroups(landscape, origin, reach2);
  if (groups.length === 0) {
    const bank = streamSpot(landscape, origin, reach2);
    return bank ? [bank] : [];
  }
  return groups
    .map((p, i) => ({ p, i, d: d2(p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ p }) => p);
}

/** Bod osy potoka nejblíž `origin` do dosahu (lovištěm bez tůně), nebo null. */
function streamSpot(
  landscape: Landscape,
  origin: { x: number; z: number },
  reach2: number,
): FishingPool | null {
  // potok i řeka prémiové krajiny (osa řeky tůně nemá – loviště jen bodem nejblíž vsi)
  const river = riverCenterline(landscape);
  const lines = [
    ...(landscape.stream.length >= 2 ? [streamCenterline(landscape).points] : []),
    ...(river ? [river.points] : []),
  ];
  let points = lines[0] ?? [];
  let best = -1;
  let bestD = reach2;
  for (const line of lines) {
    line.forEach((p, k) => {
      const d = (p.x - origin.x) * (p.x - origin.x) + (p.z - origin.z) * (p.z - origin.z);
      if (d <= bestD) {
        bestD = d;
        best = k;
        points = line;
      }
    });
  }
  if (best < 0) return null;
  const point = points[best]!;
  const next = points[Math.min(points.length - 1, best + 1)]!;
  const prev = points[Math.max(0, best - 1)]!;
  const fx = next.x - prev.x;
  const fz = next.z - prev.z;
  const n = Math.sqrt(fx * fx + fz * fz) || 1;
  return {
    x: point.x,
    z: point.z,
    flowX: fx / n,
    flowZ: fz / n,
    halfLeft: point.halfLeft,
    halfRight: point.halfRight,
  };
}
