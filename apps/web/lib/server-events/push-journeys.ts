import 'server-only';
import type { ExpeditionView, ExpeditionVisitor } from '@bohemia/game';
import { expeditionsKey, visitorsKey } from '@/lib/journey-view';
import type { Computers } from './hub';

// Počítadla výprav pro události ze serveru (docs/code/server-events.md – Výpravy): stav počítají
// tytéž funkce jako `GET /api/journey` (`expeditionViewsForPlayer`, `expeditionVisitorsOnVillage`
// z `lib/journey.ts`) – hráč nedostane nic, co by přes route neviděl. Klíč výsledku je takt
// (pohledy) a skupiny s takty (jezdci), takže se stejný stav spojení neposílá dvakrát.

/** Závislosti počítadel – `pushers.ts` je napojí na `lib/journey.ts`, testy podstrčí vlastní. */
export interface JourneyComputeDeps {
  views(playerId: string): Promise<ExpeditionView[]>;
  visitors(playerId: string, villageId: string): Promise<ExpeditionVisitor[]>;
}

export function createJourneyComputers(
  deps: JourneyComputeDeps,
): Pick<Computers, 'journeys' | 'visitors'> {
  return {
    async journeys(task) {
      if (task.what !== 'journeys') throw new Error(`Špatná úloha: ${task.what}`);
      const views = await deps.views(task.playerId);
      return { name: 'journeys', data: { views }, key: expeditionsKey(views) };
    },
    async visitors(task) {
      if (task.what !== 'visitors') throw new Error(`Špatná úloha: ${task.what}`);
      const visitors = await deps.visitors(task.playerId, task.villageId);
      return {
        name: 'visitors',
        data: { villageId: task.villageId, visitors },
        key: task.villageId + visitorsKey(visitors),
      };
    },
  };
}
