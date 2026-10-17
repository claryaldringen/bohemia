import { buildForestField } from '../forest-field';
import { transferPrecision } from '../quantize';
import { buildRelief } from '../relief';
import { streamCenterline } from '../stream-geometry';
import type { Landscape } from '../types';
import type { ScatterContext } from './context';
import { edgeTreePlacements, forestScatter, impostorTreePlacements } from './forest-trees';
import { meadowTreePlacements } from './meadow-trees';
import { rockAndShrubPlacements } from './rocks-shrubs';
import {
  OBSTACLE_KINDS,
  OBSTACLE_LOOKS,
  type ObstacleKind,
  type ObstacleLayer,
  type ObstacleLook,
  type ObstaclePlacement,
} from './types';
import { deadwoodPlacements, pinePlacements, youngTreePlacements } from './woodland';

/** Rozmisťovače vrstvy překážek nad krajinou s přesností prohlížeče. */
export interface ObstacleGroups {
  /** 3D stromy okraje lesa (2–3 řady, lem a ojedinělé stromy v louce). */
  edge: ObstaclePlacement[];
  /** Vnitřek lesa (impostory). */
  interior: ObstaclePlacement[];
  /** Břehový porost a stromy v loukách. */
  meadow: ObstaclePlacement[];
  pines: ObstaclePlacement[];
  young: ObstaclePlacement[];
  /** Souše, padlé stromy a pařezy. */
  deadwood: ObstaclePlacement[];
  /** Keře, kameny, balvany, skalní výchozy a vrby. */
  rocksAndShrubs: ObstaclePlacement[];
}

/** Kontext rozmisťovačů – pole lesa, osa potoka a tvar terénu z krajiny s přesností prohlížeče. */
export function scatterContext(landscape: Landscape, seed: number): ScatterContext {
  const l = transferPrecision(landscape);
  let maxHeight = 0;
  for (const h of l.heights) maxHeight = Math.max(maxHeight, h);
  return {
    landscape: l,
    // pole lesa jen převezme, když ho už má scéna – na serveru se po vygenerování zahodí
    field: buildForestField(l, { remember: false }),
    stream: streamCenterline(l),
    relief: buildRelief(l),
    seed,
    maxHeight,
  };
}

/** Všechny překážky po skupinách (pro testy a měření; vrstvu skládá `generateObstacles`). */
export function obstacleGroups(ctx: ScatterContext): ObstacleGroups {
  const forest = forestScatter(ctx);
  const meadow = meadowTreePlacements(ctx);
  const pines = pinePlacements(ctx, meadow);
  return {
    edge: edgeTreePlacements(ctx, forest),
    interior: impostorTreePlacements(ctx, forest),
    meadow,
    pines,
    young: youngTreePlacements(ctx),
    deadwood: deadwoodPlacements(ctx),
    rocksAndShrubs: rockAndShrubPlacements(ctx, [...meadow, ...pines]),
  };
}

const EMPTY_LAYER_CACHE = new Map<string, ObstacleLayer>();

/**
 * Vrstva překážek krajiny – čistá funkce krajiny a seedu vrstvy (`landscape.obstacleLayer`).
 * Server i prohlížeč ji generují stejně: vychází z krajiny s přesností prohlížeče
 * (`transferPrecision`) a jen z deterministické matematiky. Krajina bez vrstvy (null) nemá
 * žádné překážky.
 */
export function generateObstacles(landscape: Landscape): ObstacleLayer {
  const layer = landscape.obstacleLayer;
  if (layer === null) return emptyLayer(landscape.size, landscape.cellSizeM);
  if (layer.version !== 1) {
    throw new RangeError(`Neznámá verze vrstvy překážek: ${String(layer.version)}`);
  }
  const groups = obstacleGroups(scatterContext(landscape, layer.seed));
  return packObstacles(
    [
      ...groups.edge,
      ...groups.interior,
      ...groups.meadow,
      ...groups.pines,
      ...groups.young,
      ...groups.deadwood,
      ...groups.rocksAndShrubs,
    ],
    landscape.size,
    landscape.cellSizeM,
  );
}

const layerCache = new WeakMap<Landscape, ObstacleLayer>();

/**
 * Vrstva překážek krajiny, spočítaná jednou na objekt krajiny (generování trvá stovky ms).
 * Server drží krajiny v mezipaměti, prohlížeč má jednu – mezipaměť podle identity stačí.
 */
export function obstaclesOf(landscape: Landscape): ObstacleLayer {
  const cached = layerCache.get(landscape);
  if (cached) return cached;
  const layer = generateObstacles(landscape);
  layerCache.set(landscape, layer);
  return layer;
}

function emptyLayer(size: number, cellSizeM: number): ObstacleLayer {
  const key = `${size}|${cellSizeM}`;
  const cached = EMPTY_LAYER_CACHE.get(key);
  if (cached) return cached;
  const layer = packObstacles([], size, cellSizeM);
  EMPTY_LAYER_CACHE.set(key, layer);
  return layer;
}

const KIND_CODES = new Map<ObstacleKind, number>(OBSTACLE_KINDS.map((k, i) => [k, i]));
const LOOK_CODES = new Map<ObstacleLook, number>(OBSTACLE_LOOKS.map((k, i) => [k, i]));

/**
 * Překážky do sloupců vrstvy a index po políčkách. Id musí přicházet vzestupně (rozmisťovače
 * je tak vytvářejí) – jinak chyba, protože by nešlo hledat půlením.
 */
export function packObstacles(
  placements: readonly ObstaclePlacement[],
  size: number,
  cellSizeM: number,
): ObstacleLayer {
  const count = placements.length;
  const id = new Uint32Array(count);
  const x = new Float32Array(count);
  const z = new Float32Array(count);
  const kind = new Uint8Array(count);
  const look = new Uint8Array(count);
  const rotation = new Float32Array(count);
  const scale = new Float32Array(count);
  const impostor = new Uint8Array(count);
  const tileOf = new Int32Array(count);
  const tileCounts = new Uint32Array(size * size + 1);
  const half = (size * cellSizeM) / 2;
  const toTile = (v: number): number =>
    Math.min(size - 1, Math.max(0, Math.floor((v + half) / cellSizeM)));
  placements.forEach((p, i) => {
    if (i > 0 && p.id <= placements[i - 1]!.id) {
      throw new Error(`Id překážek musí růst: ${placements[i - 1]!.id} → ${p.id}.`);
    }
    id[i] = p.id;
    x[i] = p.x;
    z[i] = p.z;
    kind[i] = KIND_CODES.get(p.kind)!;
    look[i] = LOOK_CODES.get(p.look)!;
    rotation[i] = p.rotation;
    scale[i] = p.scale;
    impostor[i] = p.impostor ? 1 : 0;
    // políčko podle uložené (Float32) polohy – stejně jako při dotazech
    const tile = toTile(z[i]!) * size + toTile(x[i]!);
    tileOf[i] = tile;
    tileCounts[tile + 1]!++;
  });
  const tileStart = new Uint32Array(size * size + 1);
  for (let t = 0; t < size * size; t++) tileStart[t + 1] = tileStart[t]! + tileCounts[t + 1]!;
  const tileItems = new Uint32Array(count);
  const fill = tileStart.slice(0, size * size);
  for (let i = 0; i < count; i++) tileItems[fill[tileOf[i]!]!++] = i;
  return {
    version: 1,
    count,
    id,
    x,
    z,
    kind,
    look,
    rotation,
    scale,
    impostor,
    tileStart,
    tileItems,
    size,
    cellSizeM,
  };
}
