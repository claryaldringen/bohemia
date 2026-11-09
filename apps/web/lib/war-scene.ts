import 'server-only';
import {
  orderBreakout,
  warSceneFor,
  warSceneOnMap,
  type GridCell,
  type MarchGrid,
  type OrderBreakoutDeps,
  type WarSceneDefender,
  type WarSceneView,
} from '@bohemia/game';
import { currentWorld, LruCache } from '@bohemia/server';
import { campaignCells } from './campaign';
import { gameDeps, playerToday, villageRightsDeps } from './game';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru): composition root use-casu
// `warSceneFor`. Herní logika i mlha války jsou v `packages/game` (`domain/war/scene-view.ts`).

/** Mřížky mapy napadené vsi pro dohled v lese – scéna se ptá 2× za sekundu. */
const SIGHT_GRIDS = new LruCache<string, MarchGrid>(4);
/** Domy a opevnění napadených vsí po herních dnech – stav vsi se nečte při každém dotazu. */
const DEFENDERS = new LruCache<string, WarSceneDefender>(16);

function warSceneDeps(): Parameters<typeof warSceneFor>[0] {
  const deps = gameDeps();
  return {
    settlements: deps.settlements,
    villages: deps.villages,
    campaigns: deps.campaigns,
    cells: campaignCells(),
    grids: SIGHT_GRIDS,
    defenders: DEFENDERS,
  };
}

/** Válka na mapě sídla hráče, kterou vidí ve scéně; null = žádná (nebo sídlo není jeho). */
export function warSceneForPlayer(
  playerId: string,
  settlementId: string,
): Promise<WarSceneView | null> {
  return warSceneFor(warSceneDeps(), { playerId, settlementId });
}

/**
 * Válka na cizí mapě `cell` z pohledu útočníka – účastníka tažení (mlha války); null = hráč tažení
 * nezná, nebo na mapě jeho vojsko nestojí.
 */
export function warSceneOnMapForPlayer(
  playerId: string,
  campaignId: string,
  cell: GridCell,
): Promise<WarSceneView | null> {
  return warSceneOnMap(warSceneDeps(), { playerId, campaignId, cell });
}

function breakoutDeps(): OrderBreakoutDeps {
  return {
    ...villageRightsDeps(),
    campaigns: gameDeps().campaigns,
    cells: campaignCells(),
    world: currentWorld(),
  };
}

/**
 * Rozkaz „Probít se“ obráncům vsi `villageId` (fortifications.md – Obrana bez násobku 3, Bod zlomu
 * a probíjení): use-case `orderBreakout` ověří právo `war` a boj a zapíše záměr do tažení na takt
 * teď + 2. Bez zámku vsi – stav vsi se nemění a rozkaz v boji nesmí čekat na dopočet.
 */
export async function orderBreakoutForPlayer(
  playerId: string,
  villageId: string,
): Promise<{ ok: true } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await orderBreakout(breakoutDeps(), {
    playerId,
    villageId,
    today: today.day,
    nowMs: Date.now(),
  });
  return result.ok ? { ok: true } : { error: result.reason };
}
