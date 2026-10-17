'use client';

import { useSyncExternalStore, type ReactElement } from 'react';
import {
  getSoundPreference,
  setSoundPreference,
  subscribeSoundPreference,
} from '@/lib/sound-preference';

/** Zapnuté zvuky krajiny podle volby uložené v prohlížeči (na serveru „zapnuto“). */
export function useSoundPreference(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeSoundPreference, getSoundPreference, () => true);
  return [enabled, setSoundPreference];
}

/**
 * Přepínač zvuků krajiny vpravo nahoře pod datem. Jméno tlačítka je stálé a stav nese
 * `aria-pressed` – čtečka ohlásí „Zvuky krajiny, stisknuto“.
 */
export function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label="Zvuky krajiny"
      aria-pressed={enabled}
      title={enabled ? 'Vypnout zvuky krajiny' : 'Zapnout zvuky krajiny'}
      onClick={onToggle}
      className="fixed top-10 right-2 z-10 flex h-9 w-9 items-center justify-center rounded bg-stone-100/80 text-stone-700 backdrop-blur hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-stone-950/70 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-stone-100"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {enabled ? (
          <>
            <path d="M15.5 9a4.5 4.5 0 0 1 0 6" />
            <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
          </>
        ) : (
          <path d="M16 9.5l5 5m0-5l-5 5" />
        )}
      </svg>
    </button>
  );
}
