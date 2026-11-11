'use client';

import { useEffect, useState } from 'react';
import type { WagonRoadPlan } from '@bohemia/game';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import type { SceneVillage, VillageView } from '@/lib/village-view';

/**
 * Náhled vozové cesty (roads.md – Vozová cesta): vybraná cesta hráče, která vozovou cestu
 * nemá – trasu, cenu a co přinese spočítá scéna stejnou funkcí jako server a vytyčí ji; až po
 * vykreslení výběru (hledání trvá desetiny sekundy). Vrátí plán vybrané cesty, nebo null.
 */
export function useWagonPreview({
  scene,
  current,
  view,
  sceneVillage,
}: {
  scene: LandscapeScene | null;
  current: VillageTarget | null;
  view: VillageView | null;
  sceneVillage: SceneVillage;
}): WagonRoadPlan | null {
  const [wagonPlan, setWagonPlan] = useState<{ roadId: number; plan: WagonRoadPlan } | null>(null);
  const wagonRoadId = current?.kind === 'road' ? current.id : null;
  const wagonRoad =
    wagonRoadId !== null ? view?.roads.find((r) => r.id === wagonRoadId)?.wagon : undefined;
  const wagonOpen = wagonRoad?.status === 'none' && wagonRoad.blocked === null;
  useEffect(() => {
    if (!scene) return;
    if (wagonRoadId === null || !wagonOpen) {
      scene.previewWagonRoad(null);
      return;
    }
    const timer = setTimeout(() => {
      const plan = scene.previewWagonRoad(wagonRoadId);
      if (plan) setWagonPlan({ roadId: wagonRoadId, plan });
    }, 30);
    return () => clearTimeout(timer);
    // nová ves (sceneVillage) vytyčí trasu znovu
  }, [scene, wagonRoadId, wagonOpen, sceneVillage]);
  return wagonPlan && wagonPlan.roadId === wagonRoadId ? wagonPlan.plan : null;
}
