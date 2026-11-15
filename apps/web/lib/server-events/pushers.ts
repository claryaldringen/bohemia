import 'server-only';
import { campaignViewForPlayer } from '@/lib/campaign';
import { expeditionViewsForPlayer, expeditionVisitorsOnVillage } from '@/lib/journey';
import { warSceneForPlayer, warSceneOnMapForPlayer } from '@/lib/war-scene';
import type { Computers } from './hub';
import { createJourneyComputers } from './push-journeys';
import { createWarComputers } from './push-war';

// Počítadla stavu pro události ze serveru (docs/code/server-events.md – Rozbočovač): stav počítají
// tytéž funkce jako routes (`lib/journey.ts`, `lib/campaign.ts`, `lib/war-scene.ts`). Výpravy jsou
// v `push-journeys.ts`, tažení a válka ve scéně v `push-war.ts`.

/** Počítadla rozbočovače procesu webu. */
export function serverComputers(): Computers {
  return {
    ...createJourneyComputers({
      views: expeditionViewsForPlayer,
      visitors: expeditionVisitorsOnVillage,
    }),
    ...createWarComputers({
      // celý pohled jako `GET /api/campaign/<id>?since=-1` – starší takt zahodí prohlížeč sám
      campaign: (playerId, campaignId) => campaignViewForPlayer(playerId, campaignId, -1),
      home: warSceneForPlayer,
      scene: warSceneOnMapForPlayer,
    }),
  };
}
