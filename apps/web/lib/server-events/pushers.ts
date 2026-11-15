import 'server-only';
import { expeditionViewsForPlayer, expeditionVisitorsOnVillage } from '@/lib/journey';
import type { Computers } from './hub';
import { createJourneyComputers } from './push-journeys';

// Počítadla stavu pro události ze serveru (docs/code/server-events.md – Rozbočovač): stav počítají
// tytéž funkce jako routes (`lib/journey.ts`, `lib/campaign.ts`, `lib/war-scene.ts`). Zatím
// bez tažení a války – ty doplní Úloha 5 (plán 2026-11-15); výpravy jsou v `push-journeys.ts`.

/** Počítadla rozbočovače procesu webu. */
export function serverComputers(): Computers {
  return {
    ...createJourneyComputers({
      views: expeditionViewsForPlayer,
      visitors: expeditionVisitorsOnVillage,
    }),
  };
}
