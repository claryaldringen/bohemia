import {
  lookSpecies,
  OBSTACLE_KINDS,
  OBSTACLE_LOOKS,
  type ObstacleKind,
  type ObstacleLayer,
  type ObstacleLook,
  type TreeSpecies,
} from './types';

/** Index překážky s daným id ve vrstvě (půlením), nebo −1. */
export function obstacleIndex(layer: ObstacleLayer, id: number): number {
  let lo = 0;
  let hi = layer.count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = layer.id[mid]!;
    if (value === id) return mid;
    if (value < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function obstacleKind(layer: ObstacleLayer, index: number): ObstacleKind {
  return OBSTACLE_KINDS[layer.kind[index]!]!;
}

export function obstacleLook(layer: ObstacleLayer, index: number): ObstacleLook {
  return OBSTACLE_LOOKS[layer.look[index]!]!;
}

export function obstacleSpecies(layer: ObstacleLayer, index: number): TreeSpecies | null {
  return lookSpecies(obstacleLook(layer, index));
}

/** Indexy překážek, jejichž pata leží v políčku (x, y). */
export function obstaclesInTile(layer: ObstacleLayer, x: number, y: number): Uint32Array {
  if (x < 0 || y < 0 || x >= layer.size || y >= layer.size) return new Uint32Array(0);
  const tile = y * layer.size + x;
  return layer.tileItems.subarray(layer.tileStart[tile]!, layer.tileStart[tile + 1]!);
}

/** Indexy překážek z políček, která zasahují do obdélníku světa (pak je třeba zúžit). */
export function obstaclesNear(
  layer: ObstacleLayer,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): number[] {
  const half = (layer.size * layer.cellSizeM) / 2;
  const toTile = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  const out: number[] = [];
  for (let y = toTile(minZ); y <= toTile(maxZ); y++) {
    for (let x = toTile(minX); x <= toTile(maxX); x++) {
      for (const i of obstaclesInTile(layer, x, y)) out.push(i);
    }
  }
  return out;
}
