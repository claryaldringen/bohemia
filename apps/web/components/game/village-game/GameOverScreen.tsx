'use client';

import type { ReactElement } from 'react';
import type { VillageView } from '@/lib/village-view';
import { DefeatScreen } from '../hud/DefeatScreen';

/**
 * Obrazovka porážky po konci hry (web-ui.md – Obrazovka porážky – konec rodu): konec rodu má
 * přednost před vymřelou a opuštěnou vsí. Jediné tlačítko Začít znovu. Klíč podle druhu: jiný
 * druh konce je nová obrazovka (jako dřív tři samostatná místa ve `VillageGame`).
 */
export function GameOverScreen({
  view,
  onRestart,
}: {
  view: VillageView | null;
  onRestart: () => Promise<string | null>;
}): ReactElement | null {
  if (view?.gameOver !== true) return null;
  if (view.lineEnded) {
    return (
      <DefeatScreen
        key="line"
        name={view.lineEnded.village}
        lifespan={{
          foundedYear: view.lineEnded.foundedYear,
          extinctYear: view.lineEnded.endedYear,
          years: view.lineEnded.years,
        }}
        line={view.lineEnded}
        onRestart={onRestart}
      />
    );
  }
  if (view.extinct) {
    return (
      <DefeatScreen key="extinct" name={view.name} lifespan={view.extinct} onRestart={onRestart} />
    );
  }
  if (view.abandoned) {
    return (
      <DefeatScreen
        key="abandoned"
        name={view.name}
        lifespan={{
          foundedYear: view.abandoned.foundedYear,
          extinctYear: view.abandoned.abandonedYear,
          years: view.abandoned.years,
        }}
        onRestart={onRestart}
      />
    );
  }
  return null;
}
