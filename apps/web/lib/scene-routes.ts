// Trasy a vyšlapanost ve scéně jdou klientovi jen při změně (roads-v2 plán, Úloha 4a): klient
// v dotazu na ves pošle klíč tras a den vyšlapanosti, které má, server při shodě pošle `null`
// a klient drží poslední.

import {
  decodeWear,
  routePaths,
  routesCacheKey,
  type PathLine,
  type VillageRoutes,
} from '@bohemia/game';
import type { SceneVillage } from './village-view-scene-types';

/** Klíče, které klient má – příloha dotazu na ves. */
export interface KnownSceneData {
  routesKey?: string;
  wearDay?: number;
  /** Strana políčka vyšlapanosti, kterou klient má (převod 7,5 → 3,75 m týž den – `SceneWear`). */
  wearCellM?: number;
}

/**
 * Klíč tras pro scénu: otisk mapy tras (`VillageRoutes.key`) se nemění, když se 1. dne v měsíci
 * jen převáží cesty za den nebo přepočítají trasy k práci dne (paths.md – Stálé trasy, pravidlo 5)
 * – klíč scény proto nese i místa práce a součet cest za den.
 */
export function sceneRoutesKey(routes: VillageRoutes): string {
  return `${routes.key}/${routes.workKey ?? ''}/${routesCacheKey(routes.list)}`;
}

/** Klíče tras a vyšlapanosti pohledu (pro dotaz na ves). */
export function knownSceneData(scene: SceneVillage | undefined): KnownSceneData {
  return {
    ...(scene?.routes?.list ? { routesKey: scene.routes.key } : {}),
    ...(scene?.wear?.cells !== null && scene?.wear ? { wearDay: scene.wear.day } : {}),
    ...(scene?.wear?.cells !== null && scene?.wear?.cellM !== undefined
      ? { wearCellM: scene.wear.cellM }
      : {}),
  };
}

/** Server: trasy a vyšlapanost, které klient už má (`known`), se neposílají (`null`). */
export function trimKnownSceneData(scene: SceneVillage, known: KnownSceneData): SceneVillage {
  const sameRoutes =
    scene.routes !== undefined &&
    known.routesKey !== undefined &&
    scene.routes.key === known.routesKey;
  const sameWear =
    scene.wear !== undefined &&
    known.wearDay !== undefined &&
    scene.wear.day === known.wearDay &&
    scene.wear.cellM === known.wearCellM;
  if (!sameRoutes && !sameWear) return scene;
  return {
    ...scene,
    ...(sameRoutes && scene.routes ? { routes: { key: scene.routes.key, list: null } } : {}),
    ...(sameWear && scene.wear ? { wear: { ...scene.wear, cells: null } } : {}),
  };
}

/** Klient: server trasy nebo vyšlapanost vynechal, ale předchozí pohled je nemá (zahozeno). */
export function lostSceneData(received: SceneVillage, kept: SceneVillage): boolean {
  return (
    (received.routes?.list === null && !kept.routes) ||
    (received.wear?.cells === null && !kept.wear)
  );
}

/** Klient: doplní vynechané trasy a vyšlapanost z předchozího pohledu (téhož klíče). */
export function keepSceneData(
  next: SceneVillage,
  previous: SceneVillage | undefined,
): SceneVillage {
  let routes = next.routes;
  if (routes && routes.list === null) {
    const old = previous?.routes;
    routes = old && old.list !== null && old.key === routes.key ? old : undefined;
  }
  let wear = next.wear;
  if (wear && wear.cells === null) {
    const old = previous?.wear;
    wear = old && old.cells !== null && old.day === wear.day ? old : undefined;
  }
  if (routes === next.routes && wear === next.wear) return next;
  const rest: SceneVillage = { ...next };
  delete rest.routes;
  delete rest.wear;
  return { ...rest, ...(routes ? { routes } : {}), ...(wear ? { wear } : {}) };
}

/**
 * Čáry pěšin z tras a vyšlapanosti. Bez tras nebo bez vyšlapanosti (ves bez `state.roads`,
 * zahozená data) `null` – scéna pak kreslí čáry sítě, pěšiny nezmizí.
 */
export function routeLinesOf(scene: SceneVillage, cellM: number): PathLine[] | null {
  const list = scene.routes?.list ?? null;
  const cells = scene.wear?.cells ?? null;
  return list && cells !== null ? routePaths(list, decodeWear(cells), cellM) : null;
}
