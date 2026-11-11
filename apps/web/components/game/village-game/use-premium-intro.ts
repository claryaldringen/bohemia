'use client';

import { useEffect, useRef } from 'react';
import type { Landscape } from '@bohemia/game';
import { premiumIntroNotice } from '@/lib/premium-view';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { NoticeLine } from '../hud/NoticeLines';

/**
 * Představení prémiové krajiny při prvním vstupu do hry, až je scéna (premium-landscapes.md;
 * web-ui.md – Prémiová krajina v rozhraní) – jednou za načtení stránky.
 */
export function usePremiumIntro({
  scene,
  decoded,
  hasVillage,
  pushNotice,
}: {
  scene: LandscapeScene | null;
  decoded: Landscape;
  hasVillage: boolean;
  pushNotice: (notice: Omit<NoticeLine, 'id'>) => void;
}): void {
  const introShown = useRef(false);
  useEffect(() => {
    if (introShown.current || scene === null) return;
    introShown.current = true;
    const intro = premiumIntroNotice(decoded.premium, hasVillage);
    if (intro) pushNotice(intro);
  }, [scene, decoded, hasVillage, pushNotice]);
}
