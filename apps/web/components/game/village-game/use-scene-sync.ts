'use client';

import { useEffect } from 'react';
import type { Position, WorldClock } from '@bohemia/game';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { SceneVillage } from '@/lib/village-view';

/**
 * Předá scéně hodiny hráče a ves (i se staveništi, která čekají na server) a nastaví návrat
 * pohledu (R) na první obydlí.
 */
export function useSceneSync({
  scene,
  clock,
  sceneVillage,
  home,
}: {
  scene: LandscapeScene | null;
  clock: WorldClock;
  sceneVillage: SceneVillage;
  /** První obydlí vsi – kam vrací pohled R (null – ves ještě nestojí). */
  home: Position | null;
}): void {
  useEffect(() => {
    scene?.setWorldClock(clock);
  }, [scene, clock]);

  useEffect(() => {
    scene?.setVillage(sceneVillage);
  }, [scene, sceneVillage]);

  // R vrací pohled na ves – na první obydlí, jakmile ves stojí.
  useEffect(() => {
    if (scene && home) scene.setCameraHome(home.x, home.z);
  }, [scene, home]);
}

/**
 * Testovací háčky scény (`lib/e2e-hooks.ts`): kde je bod krajiny na obrazovce (kliknutí na
 * obydlí v e2e testu), maso po porážce, divoká zvěř, kamera a vojska.
 */
export function useSceneE2EHooks(scene: LandscapeScene | null): void {
  useEffect(() => {
    if (!scene) return;
    setE2EHook('projectToScreen', (x, z) => scene.projectToScreen(x, z));
    setE2EHook('slaughterMeshes', () => scene.slaughterMeshes());
    setE2EHook('wildAnimals', () => scene.wildAnimals());
    setE2EHook('moveCameraTo', (x, z) => scene.moveCameraTo(x, z));
    setE2EHook('armyStats', () => scene.armyStats());
    return () => {
      setE2EHook('armyStats', undefined);
      setE2EHook('projectToScreen', undefined);
      setE2EHook('slaughterMeshes', undefined);
      setE2EHook('wildAnimals', undefined);
      setE2EHook('moveCameraTo', undefined);
    };
  }, [scene]);
}
