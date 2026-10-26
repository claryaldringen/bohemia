// Krajina zvěře do 1 km od středu vsi (wildlife.md – Kde zvěř žije a kolik jí je).
// Počítá se jen při převodu a 1. 5. – jednou ročně, ne po dílech.

import { streamCenterline, surfaceAt, tileCenterWorld, type Landscape } from '../landscape';
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
function bigPatches(mask: Uint8Array, size: number, minTiles: number): number {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let kept = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let count = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      count++;
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
    if (count >= minTiles) kept += count;
  }
  return kept;
}

/**
 * Krajina zvěře vsi do `reachM` od jejího počátku (`villageOrigin`). Les = políčka lesa a les vsi
 * bez čtverců polí, sadů, hřbitovů, ohrad a obydlí, jen souvislý od `minPatchHa`; paseky
 * (pokácené stromy) se nepočítají – zjednodušení (návrh Clauda). Louky = louky a pole; voda =
 * políčka vody; tůně = úseky osy potoka s `pool` ≥ `poolMin` do dosahu, sloučené po
 * `poolMergeM`. Ves bez obydlí dostane `defaultLand`.
 */
export function wildlifeLandAt(
  landscape: Landscape,
  state: Pick<
    VillageState,
    | 'dwellings'
    | 'constructions'
    | 'parts'
    | 'orchards'
    | 'cemeteries'
    | 'pens'
    | 'woods'
    | 'fields'
  >,
): WildlifeLand {
  const origin = villageOrigin(state);
  if (!origin) return { ...WILDLIFE_LAND.defaultLand };
  const size = landscape.size;
  const total = size * size;
  const cellHa = (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
  const reach2 = WILDLIFE_LAND.reachM * WILDLIFE_LAND.reachM;
  const inReach = new Uint8Array(total);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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
  for (let index = 0; index < total; index++) {
    if (!inReach[index]) continue;
    const surface = surfaceAt(landscape, index % size, Math.floor(index / size));
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
  const forestTiles = bigPatches(forest, size, Math.ceil(WILDLIFE_LAND.minPatchHa / cellHa));
  return {
    forestHa: forestTiles * cellHa,
    openHa: open * cellHa,
    waterHa: water * cellHa,
    pools: poolsInReach(landscape, origin, reach2),
  };
}

/** Tůně potoka do dosahu – po sobě jdoucí body osy s tůní, mezera do `poolMergeM` je jedna tůň. */
function poolsInReach(
  landscape: Landscape,
  origin: { x: number; z: number },
  reach2: number,
): number {
  if (landscape.stream.length < 2) return 0;
  let pools = 0;
  let last: { x: number; z: number } | null = null;
  const merge2 = WILDLIFE_LAND.poolMergeM * WILDLIFE_LAND.poolMergeM;
  for (const point of streamCenterline(landscape).points) {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    if (point.pool < WILDLIFE_LAND.poolMin || dx * dx + dz * dz > reach2) continue;
    if (last === null) {
      pools++;
    } else {
      const lx = point.x - last.x;
      const lz = point.z - last.z;
      if (lx * lx + lz * lz > merge2) pools++;
    }
    last = point;
  }
  return pools;
}
