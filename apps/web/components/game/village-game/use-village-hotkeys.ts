'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { Placement } from '@/hooks/use-placement';
import { buildItemForKey, type WebBuildKind } from '@/lib/build-items';
import { opensMenu } from '@/lib/game-menu';
import type { VillageTarget } from '@/lib/scene/village-picking';
import { allDwellingsTarget, selectsAllDwellings } from '@/lib/scene/village-selection';
import type { SceneVillage } from '@/lib/village-view';

/**
 * Klávesy rozhraní: F10 otevře nabídku, zkratky staveb (Z, X, C, V, B, N, M, F, G, H, T, K, O – O
 * otevře rozcestník druhů ohrady), Esc zruší výběr, zavře rozcestník a vypne režim brány, Ctrl + A
 * vybere všechna obydlí. Otevřená nabídka klávesy zachytí dřív (GameMenu) – sem pak nedojdou.
 * Obsluhy `startBuild` a `openMenu` se mění s každým vykreslením – posluchač je čte přes ref.
 */
export function useVillageHotkeys({
  startBuild,
  openMenu,
  placementActive,
  setSelected,
  setBuildGroup,
  setGateFort,
  sceneVillageRef,
}: {
  startBuild: (kind: WebBuildKind) => void;
  openMenu: () => void;
  placementActive: Placement['active'];
  setSelected: (target: VillageTarget | null) => void;
  setBuildGroup: (kind: WebBuildKind | null) => void;
  setGateFort: (fortificationId: number | null) => void;
  sceneVillageRef: RefObject<SceneVillage>;
}): void {
  const startBuildRef = useRef(startBuild);
  useEffect(() => {
    startBuildRef.current = startBuild;
  });
  const openMenuRef = useRef(openMenu);
  useEffect(() => {
    openMenuRef.current = openMenu;
  });
  const placingRef = useRef(placementActive);
  useEffect(() => {
    placingRef.current = placementActive;
  }, [placementActive]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // F10 otevře nabídku i z textového pole (panel jména má kurzor v poli hned po otevření)
      if (opensMenu(event)) {
        event.preventDefault(); // F10 v některých prohlížečích skočí do jejich nabídky
        openMenuRef.current();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      if (event.code === 'Escape' && placingRef.current === null) {
        setSelected(null);
        setBuildGroup(null);
        setGateFort(null);
        return;
      }
      // Ctrl + A – všechna obydlí vsi (migration.md); při umisťování ne (malování po čtvercích)
      if (selectsAllDwellings(event)) {
        event.preventDefault(); // prohlížeč by označil text stránky
        if (placingRef.current === null) setSelected(allDwellingsTarget(sceneVillageRef.current));
        return;
      }
      const item = buildItemForKey(event);
      if (!item || event.repeat) return;
      event.preventDefault();
      startBuildRef.current(item.kind);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSelected, setBuildGroup, setGateFort, sceneVillageRef]);
}
