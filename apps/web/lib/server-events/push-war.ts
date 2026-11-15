import 'server-only';
import type { CampaignView, GridCell, WarSceneView } from '@bohemia/game';
import type { Computers } from './hub';
import { warKeyOfScene, warKeyOfSettlement, warSceneKey } from './protocol';

// Počítadla tažení a války pro události ze serveru (docs/code/server-events.md – Válka): stav
// počítají tytéž funkce jako routes – pohled na tažení `campaignViewForPlayer` (`GET
// /api/campaign/<id>`), válka na vlastní mapě `warSceneForPlayer` (`GET /api/war-scene/<sídlo>`)
// a na cizí mapě `warSceneOnMapForPlayer` (`?scene=x,y`) – hráč nedostane nic, co by přes route
// neviděl, válku jen po mlze války. Klíč výsledku je takt (u tažení i fáze), takže se stejný stav
// spojení neposílá dvakrát.

/** Závislosti počítadel – `pushers.ts` je napojí na `lib/campaign.ts` a `lib/war-scene.ts`. */
export interface WarComputeDeps {
  /** Pohled na tažení; null – hráč tažení nezná (route 404). */
  campaign(playerId: string, campaignId: string): Promise<CampaignView | null>;
  /** Válka na mapě sídla hráče; null – na mapě nic k vidění. */
  home(playerId: string, settlementId: string): Promise<WarSceneView | null>;
  /** Válka na cizí mapě z pohledu útočníka; null – vojsko na mapě nestojí, tažení skončilo. */
  scene(playerId: string, campaignId: string, cell: GridCell): Promise<WarSceneView | null>;
}

/** Klíč pohledu na tažení – takt a fáze (konec tažení v témž taktu je změna); null = `none`. */
function campaignKey(view: CampaignView | null): string {
  return view === null ? 'none' : `${view.tick}@${view.phase}`;
}

export function createWarComputers(
  deps: WarComputeDeps,
): Pick<Computers, 'campaign' | 'war-home' | 'war-scene'> {
  return {
    async campaign(task) {
      if (task.what !== 'campaign') throw new Error(`Špatná úloha: ${task.what}`);
      const view = await deps.campaign(task.playerId, task.campaignId);
      return {
        name: 'campaign',
        data: { campaignId: task.campaignId, view },
        key: campaignKey(view),
      };
    },
    async 'war-home'(task) {
      if (task.what !== 'war-home') throw new Error(`Špatná úloha: ${task.what}`);
      const war = await deps.home(task.playerId, task.settlementId);
      return {
        name: 'war',
        data: { key: warKeyOfSettlement(task.settlementId), war },
        key: warSceneKey(war),
      };
    },
    async 'war-scene'(task) {
      if (task.what !== 'war-scene') throw new Error(`Špatná úloha: ${task.what}`);
      const war = await deps.scene(task.playerId, task.campaignId, task.cell);
      return {
        name: 'war',
        data: { key: warKeyOfScene(task.campaignId, task.cell), war },
        key: warSceneKey(war),
      };
    },
  };
}
