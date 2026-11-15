'use client';

import { useEffect, useMemo } from 'react';
import type { GridCell } from '@bohemia/game';
import { useJourneyVisitors } from '@/hooks/use-journey-visitors';
import { setE2EHook, type E2EHooks } from '@/lib/e2e-hooks';
import { sceneJourneysOf, type ExpeditionView } from '@/lib/journey-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { SceneJourney } from '@/lib/scene/journey-riders';

/**
 * Hloučky výprav ve scéně vsi (journey.md – Scéna vsi): vlastní z pohledů `own` (poslední
 * stav bez interpolace – muže posouvá scéna), cizí skupiny z návštěvníků vsi. Předá je scéně
 * a vrátí je pro panel výběru (klik na cizí skupinu).
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
  own: readonly ExpeditionView[];
}): SceneJourney[] {
  const visitors = useJourneyVisitors(villageId, scene !== null);
  const journeys = useMemo(
    () => sceneJourneysOf({ own, visitors, cell, villageId }),
    [own, visitors, cell, villageId],
  );

  useEffect(() => {
    scene?.setJourneys(journeys);
  }, [scene, journeys]);

  useEffect(() => {
    if (!scene) return;
    setE2EHook('journeyScene', journeySceneHook(scene));
    return () => setE2EHook('journeyScene', undefined);
  }, [scene]);

  return journeys;
}

/** Háček e2e `journeyScene` scény – vsi i cizí mapy (muži, praporek, odjezd). */
export function journeySceneHook(scene: LandscapeScene): NonNullable<E2EHooks['journeyScene']> {
  return () => {
    const stats = scene.journeyStats();
    return {
      riders: stats.riders.map((p) => ({
        journeyId: p.journeyId,
        own: p.own,
        key: p.key,
        x: p.x,
        z: p.z,
        mounted: p.mounted,
        look: p.look,
        led: p.led,
        speed: p.speed,
      })),
      banner: stats.banner,
      phase: stats.phase,
      led: stats.led,
      groom: stats.groom,
      gate: stats.gate,
      awayHorses: stats.awayHorses,
      selected: stats.selected,
    };
  };
}
