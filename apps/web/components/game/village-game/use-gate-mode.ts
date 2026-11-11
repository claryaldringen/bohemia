'use client';

import { useEffect, useState, type RefObject } from 'react';
import { addFortificationGate } from '@/app/game/actions';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { fortTargetId, type VillageTarget } from '@/lib/scene/village-picking';
import type { VillageView } from '@/lib/village-view';
import type { ActionResult } from './village-data';

/**
 * Brána opevnění (fortifications.md – Rozhraní): tlačítko v panelu zapne klikání na obvod – další
 * levé kliknutí do krajiny přidá bránu, pravé a Esc zruší; změna výběru režim vypne.
 */
export function useGateMode({
  scene,
  selected,
  viewRef,
  runBuildAction,
}: {
  scene: LandscapeScene | null;
  selected: VillageTarget | null;
  viewRef: RefObject<VillageView | null>;
  runBuildAction: (action: () => Promise<ActionResult>) => Promise<void>;
}): { gateFort: number | null; setGateFort: (fortificationId: number | null) => void } {
  const [gateFort, setGateFort] = useState<number | null>(null);
  useEffect(() => {
    // úsek, brána i celé opevnění – režim brány drží, dokud je vybrané totéž opevnění
    if (gateFort !== null && fortTargetId(selected) !== gateFort) {
      setGateFort(null);
    }
  }, [gateFort, selected]);
  useEffect(() => {
    if (!scene || gateFort === null) return;
    scene.setGatePick((point) => {
      setGateFort(null);
      const villageId = viewRef.current?.id;
      if (point && villageId) {
        void runBuildAction(() =>
          addFortificationGate({ villageId, fortificationId: gateFort, position: point }),
        );
      }
    });
    return () => scene.setGatePick(null);
  }, [scene, gateFort, runBuildAction, viewRef]);
  return { gateFort, setGateFort };
}
