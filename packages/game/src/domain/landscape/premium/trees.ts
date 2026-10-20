import { length2, scatterHash, smoothstep } from '../det-math';
import { distanceToMask } from '../grid';
import type { SpeciesWeights } from '../obstacles/species';
import type { TreeLook } from '../obstacles/types';
import { deriveSeed } from '../random';
import { SURFACE_CODES, type Landscape } from '../types';
import { tileCenterWorld } from '../world';
import { tileDistance } from './geometry';

// Úpravy vrstvy překážek prémiových typů lesa (premium-landscapes.md – Doubravy a bučiny, Brtě
// a lesní včely). Vrstvu generuje server i prohlížeč, proto je čtou rozmisťovače překážek podle
// `landscape.premium` (jde přenosem) – ne prémiový průchod při generování krajiny. Krajina bez
// typu se nemění.

/**
 * Doubravy a bučiny (návrh Clauda): do 900 m od vsi je les dubový a bukový – jedle a bříza
 * ustoupí buku (zůstane desetina jedlí a pětina bříz). Duby jsou tytéž stromy jako v průměrné
 * krajině – víc dubů by z lesa u vsi udělalo samé posvátné háje (nekácí se a vyjmou se z polí
 * a staveb). Za 900 m se skladba plynule vrátí k průměrné krajině (do 1000 m), ať kolem není
 * ostrý kruh.
 */
export const OAK_BEECH = {
  radiusM: 900,
  fadeM: 1000,
  /** Kolik jedlí a bříz v dosahu zůstane (podíl z průměrné krajiny). */
  coniferKept: 0.1,
  birchKept: 0.2,
} as const;

/** Výběr modelu stromu lesa – `pickForestLook` a poloha stromu ve světě. */
export type ForestLook = (
  kind: number,
  weights: SpeciesWeights,
  variant: number,
  worldX: number,
  worldZ: number,
) => TreeLook;

/**
 * Model stromu lesa typu `oak-beech`: strom vybere `pick` průměrné krajiny, jedle a bříza
 * v dosahu se změní na buk (tutéž podobu 1 či 2) – kromě dolní části jejich intervalu losu
 * (`coniferKept`, `birchKept`), takže zůstane jejich podíl. Dub, buk ani místa stromů se nemění.
 * Ostatní typy (a krajina bez typu) mají výběr průměrné krajiny.
 */
export function premiumForestLook(
  landscape: Landscape,
  pick: (kind: number, weights: SpeciesWeights, variant: number) => TreeLook,
): ForestLook {
  if (landscape.premium !== 'oak-beech')
    return (kind, weights, variant) => pick(kind, weights, variant);
  const village = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  return (kind, weights, variant, worldX, worldZ) => {
    const look = pick(kind, weights, variant);
    const reach =
      1 -
      smoothstep(
        OAK_BEECH.radiusM,
        OAK_BEECH.fadeM,
        length2(worldX - village.x, worldZ - village.z),
      );
    if (reach === 0) return look;
    const v = variant < 0.5 ? 1 : 2;
    if (look.startsWith('spruce')) {
      const kept = 1 - (1 - OAK_BEECH.coniferKept) * reach;
      return kind < weights.conifer * kept ? look : `beech-${v}`;
    }
    if (look.startsWith('birch')) {
      const kept = 1 - (1 - OAK_BEECH.birchKept) * reach;
      // Začátek intervalu bříz stejně jako v `pickForestLook` (sčítá se v tomtéž pořadí).
      const birchFrom = weights.conifer + weights.oak + weights.beech;
      return kind - birchFrom < weights.birch * kept ? look : `beech-${v}`;
    }
    return look;
  };
}

/**
 * Brtě (návrh Clauda): staré duby s dutinou v lese do 900 m od vsi – 30–90 m od okraje lesa,
 * kam včely létají z luk, rozptýlené aspoň 45 m od sebe. Lípa zatím nemá model, brtě jsou duby.
 */
export const BEE_TREES = {
  count: 16,
  radiusM: 900,
  /** Hloubka v lese – vzdálenost políčka od nejbližšího políčka bez lesa (políčka). */
  depthCells: [2, 6],
  spacingM: 45,
  /** Posun kmene ze středu políčka (m, na každou stranu). */
  jitterM: 4,
} as const;

/** Místo brtě – políčko (pro id překážky) a pata kmene ve světě. */
export interface BeeTreeSpot {
  readonly cell: number;
  readonly x: number;
  readonly z: number;
}

/**
 * Brtě krajiny typu `wild-bees` – čistá funkce povrchu, místa pro vesnici a seedu vrstvy
 * překážek, takže rozmisťovač (strom ve vrstvě) i prvky typu (`premiumFeaturesOf`) vyjdou
 * stejně na serveru i v prohlížeči. Seřazené podle políčka (id rostou). Jiný typ = žádné.
 */
export function beeTreeSpots(landscape: Landscape): readonly BeeTreeSpot[] {
  if (landscape.premium !== 'wild-bees' || landscape.obstacleLayer === null) return [];
  const { size, surface, villageSite, cellSizeM } = landscape;
  const open = surface.map((v) => (v === SURFACE_CODES.forest ? 0 : 1));
  const depth = distanceToMask(open, size);
  const hash = scatterHash(deriveSeed(landscape.obstacleLayer.seed, 'bee-trees'));
  // Políčko musí mít kmen i s posunem do 900 m.
  const reachCells = (BEE_TREES.radiusM - BEE_TREES.jitterM * Math.SQRT2) / cellSizeM;
  const candidates: { cell: number; score: number }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const d = depth[i]!;
      if (d < BEE_TREES.depthCells[0] || d > BEE_TREES.depthCells[1]) continue;
      if (tileDistance(x, y, villageSite) > reachCells) continue;
      candidates.push({ cell: i, score: hash(x, y, 1) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.cell - b.cell);
  const spots: BeeTreeSpot[] = [];
  for (const { cell } of candidates) {
    if (spots.length >= BEE_TREES.count) break;
    const x = cell % size;
    const y = Math.floor(cell / size);
    const center = tileCenterWorld(landscape, x, y);
    const spot = {
      cell,
      x: center.x + (hash(x, y, 2) - 0.5) * 2 * BEE_TREES.jitterM,
      z: center.z + (hash(x, y, 3) - 0.5) * 2 * BEE_TREES.jitterM,
    };
    if (spots.some((s) => length2(s.x - spot.x, s.z - spot.z) < BEE_TREES.spacingM)) continue;
    spots.push(spot);
  }
  return spots.sort((a, b) => a.cell - b.cell);
}
