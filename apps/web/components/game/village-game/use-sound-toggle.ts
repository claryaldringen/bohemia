'use client';

import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { useSoundPreference } from '../SoundToggle';

/**
 * Zvuk scény (scene.md – Zvuky): uložená volba hráče a přepínač v liště. Scéna dostane změnu
 * přímo v obsluze kliknutí – Safari pustí zvuk jen v gestu uživatele.
 */
export function useSoundToggle(scene: LandscapeScene | null): {
  soundOn: boolean;
  toggleSound: () => void;
} {
  const [soundOn, setSoundOn] = useSoundPreference();
  const toggleSound = (): void => {
    const next = !soundOn;
    setSoundOn(next);
    // Přímo v obsluze kliknutí – Safari pustí zvuk jen v gestu uživatele.
    scene?.setSoundEnabled(next);
  };
  return { soundOn, toggleSound };
}
