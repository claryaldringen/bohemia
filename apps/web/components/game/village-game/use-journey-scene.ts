'use client';

import { useEffect, useMemo } from 'react';
import type { GridCell } from '@bohemia/game';
import { useJourneyVisitors } from '@/hooks/use-journey-visitors';
import { setE2EHook } from '@/lib/e2e-hooks';
import { sceneJourneysOf, type JourneyView } from '@/lib/journey-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { SceneJourney } from '@/lib/scene/journey-riders';

/**
 * Výjezdy vojvody ve scéně vsi (journey.md – Scéna vsi): vlastní výjezd z pohledu `own` (poslední
 * stav bez interpolace – muže posouvá scéna), cizí jezdci z návštěvníků vsi. Předá je scéně
 * a vrátí je pro panel výběru (klik na cizího vojvodu).
 */
export function useJourneyScene({
  scene,
  villageId,
  cell,
  own,
}: {
  scene: LandscapeScene | null;
  villageId: string | null;
  /** Políčko světa vsi ve scéně. */
  cell: GridCell | null;
  own: JourneyView | null;
}): SceneJourney[] {
  const visitors = useJourneyVisitors(villageId, scene !== null);
  const journeys = useMemo(() => sceneJourneysOf({ own, visitors, cell }), [own, visitors, cell]);

  useEffect(() => {
    scene?.setJourneys(journeys);
  }, [scene, journeys]);

  useEffect(() => {
    if (!scene) return;
    setE2EHook('journeyScene', () => {
      const stats = scene.journeyStats();
      return {
        riders: stats.riders.map((p) => ({
          journeyId: p.journeyId,
          own: p.own,
          key: p.key,
          x: p.x,
          z: p.z,
          mounted: p.mounted,
          speed: p.speed,
        })),
        banner: stats.banner,
        hourglass: stats.hourglass,
        phase: stats.phase,
        led: stats.led,
        gate: stats.gate,
        awayHorses: stats.awayHorses,
      };
    });
    return () => setE2EHook('journeyScene', undefined);
  }, [scene]);

  return journeys;
}
