import 'server-only';
import { warSceneFor, type MarchGrid, type WarSceneView } from '@bohemia/game';
import { LruCache } from '@bohemia/server';
import { campaignCells } from './campaign';
import { gameDeps } from './game';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru): composition root use-casu
// `warSceneFor`. Herní logika i mlha války jsou v `packages/game` (`domain/war/scene-view.ts`).

/** Mřížky mapy napadené vsi pro dohled v lese – scéna se ptá 2× za sekundu. */
const SIGHT_GRIDS = new LruCache<string, MarchGrid>(4);

/** Válka na mapě sídla hráče, kterou vidí ve scéně; null = žádná (nebo sídlo není jeho). */
export function warSceneForPlayer(
  playerId: string,
  settlementId: string,
): Promise<WarSceneView | null> {
  const deps = gameDeps();
  return warSceneFor(
    {
      settlements: deps.settlements,
      villages: deps.villages,
      campaigns: deps.campaigns,
      cells: campaignCells(),
      grids: SIGHT_GRIDS,
    },
    { playerId, settlementId },
  );
}
