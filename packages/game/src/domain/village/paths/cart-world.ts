// Vozové trasy bez stavu vsi (Martin 31. 10. 2026: „simulace bude počítat jen s odhadem
// vzdáleností a přesné trasy zůstanou prohlížeči“): server pošle do scény data, ze kterých se
// mřížka vozu staví (`cartWorldOf`), a prohlížeč z nich spočítá tytéž trasy jako
// `villageCartRoutes` (`cartWorldRoutes`) – stejné funkce, stejná paměť mřížek.

import { type Landscape, type ObstacleLayer } from '../../landscape';
import { obstacleChangesAt, type ObstacleChanges } from '../obstacles';
import type { CartKind, VillageState } from '../types';
import {
  cartDepots,
  cartGrid,
  cartVillageOf,
  withPartStages,
  type CartGrid,
  type CartRoute,
  type CartTarget,
  type CartVillage,
} from './cart';
import { cartGridKey, memoCartRoutes } from './cart-memo';
import { clearingRouteObstacles, withoutHiddenChanges } from './clearing-routes';
import { pathBounds } from './network';
import { teamPens } from './roads-carts';
import { cartObstacleMask, pathTerrainOf, pathWindowFor } from './terrain';
import { pathVillageOf } from './village';

/**
 * Vstup vozových tras vsi v den: ves pro mřížku vozu (`CartVillage` bez částí, které mřížka
 * nečte – rozdělení práce, louky, stáda, obilní jámy, změny překážek pro chůzi), ohrady se
 * spřežením a změny překážek pro vůz (paseka rozestavěného pole je les). Bez překážek krajiny
 * `changes` null.
 */
export interface CartWorld {
  village: CartVillage;
  pens: readonly number[];
  changes: ObstacleChanges | null;
}

/** Vstup vozových tras ze stavu vsi (jako `villageCartRoutes` – stejná ves, ohrady a změny). */
export function cartWorldOf(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): CartWorld {
  const full = cartVillageOf(pathVillageOf(state, day, landscape), state.roads?.roads ?? []);
  const village: CartVillage = { ...full };
  // mřížka vozu je nečte (cartGridKey) – ve vstupu by jen zbytečně měnily otisk
  delete village.labor;
  delete village.hayMeadows;
  delete village.livestock;
  delete village.grainPits;
  delete village.obstacles;
  return {
    village,
    pens: [...teamPens(state)].sort((a, b) => a - b),
    changes: obstacles
      ? obstacleChangesAt(withoutHiddenChanges(state, clearingRouteObstacles(state)), day)
      : null,
  };
}

/**
 * Trasy vozu `kind` k cílům ze vstupu `world` – totéž co `villageCartRoutes` nad stavem, ze
 * kterého `world` vznikl (od ohrad se spřežením, s `from` odtud; `nearestM` jako tam). Bez ohrady
 * se spřežením (nebo bez obydlí) null.
 */
export function cartWorldRoutes(
  world: CartWorld,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
  kind: CartKind,
  targets: readonly CartTarget[],
  from: { x: number; z: number } | null = null,
  nearestM: number | null = null,
): readonly CartRoute[] | null {
  const { village } = world;
  const pens = cartDepots(village, new Set(world.pens));
  const depots = from && pens.length > 0 ? [{ x: from.x, z: from.z }] : pens;
  const bounds = pathBounds(village);
  if (depots.length === 0 || !bounds) return null;
  const margin = 20;
  const ends = from ? [...targets, { x: from.x, z: from.z, reachM: 0 }] : targets;
  const box = {
    minX: Math.min(bounds.minX, ...ends.map((t) => t.x - t.reachM - margin)),
    minZ: Math.min(bounds.minZ, ...ends.map((t) => t.z - t.reachM - margin)),
    maxX: Math.max(bounds.maxX, ...ends.map((t) => t.x + t.reachM + margin)),
    maxZ: Math.max(bounds.maxZ, ...ends.map((t) => t.z + t.reachM + margin)),
  };
  const window = pathWindowFor(landscape, box);
  const changes = obstacles ? world.changes : null;
  const makeGrid = (similar: CartGrid | null): CartGrid => {
    const derived = similar ? withPartStages(similar, village) : null;
    if (derived) return derived;
    const terrain = pathTerrainOf(landscape, window);
    const blocked = obstacles && changes ? cartObstacleMask(terrain, obstacles, changes) : null;
    return cartGrid({ village, terrain, blocked });
  };
  return memoCartRoutes(
    landscape,
    obstacles,
    cartGridKey(village, window, changes),
    makeGrid,
    kind,
    depots,
    targets,
    nearestM,
  );
}
