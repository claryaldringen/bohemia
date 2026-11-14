'use client';

import type { ReactElement } from 'react';
import {
  BAD_YEAR_KINDS,
  FORCED_DISASTER_KINDS,
  type BadYearKind,
  type ForcedDisasterKind,
} from '@bohemia/game';

/** Vynutit pohromu – ikona a popisek druhu zlého roku (vývojový režim). */
const BAD_YEAR_LOOKS: Record<BadYearKind, { icon: string; label: string }> = {
  dry: { icon: 'drought', label: 'Suché léto' },
  drought: { icon: 'drought', label: 'Kruté sucho' },
  wet: { icon: 'rain', label: 'Deštivé léto' },
  wetHarvest: { icon: 'rain', label: 'Mokré žně' },
  blackFrost: { icon: 'frost', label: 'Holomráz' },
  long: { icon: 'frost', label: 'Dlouhá sněžná zima' },
};

/** Vynutit pohromu na zítřek – ikona a popisek druhu (vývojový režim). */
const DISASTER_LOOKS: Record<ForcedDisasterKind, { icon: string; label: string }> = {
  hail: { icon: 'hail', label: 'Kroupy' },
  flood: { icon: 'flood', label: 'Stoletá voda' },
  fire: { icon: 'fire', label: 'Požár' },
  tornado: { icon: 'tornado', label: 'Smršť' },
};

/** Vynucení pohromy ve vývojovém režimu – co čeká na server. */
export type DevDisasterChoice =
  { kind: 'year'; value: BadYearKind } | { kind: 'disaster'; value: ForcedDisasterKind };

/** Vývojářské menu v nabídce hry: stav vynucení a jeho spuštění; bez vývojového režimu null. */
export interface DevMenuControl {
  /** Čeká se na vynucenou pohromu. */
  pending: boolean;
  onForce: (choice: DevDisasterChoice) => void;
}

/**
 * Všechny druhy pohrom pro jedno „Vynutit pohromu“ (disasters.md – plán P10; Martin 14. 11. 2026:
 * „Vynutit zlý rok a vynutit pohromu je jedno a to samé“). Zlý rok se projeví letos (ukáže se, až
 * bude vidět), pohroma zítra – účinek každého druhu je stejný jako dřív, jen výběr je v jedné řadě.
 */
export const DEV_DISASTER_CHOICES: readonly {
  key: string;
  icon: string;
  label: string;
  choice: DevDisasterChoice;
}[] = [
  ...BAD_YEAR_KINDS.map((value) => ({
    key: value,
    ...BAD_YEAR_LOOKS[value],
    choice: { kind: 'year', value } as const,
  })),
  ...FORCED_DISASTER_KINDS.map((value) => ({
    key: value,
    ...DISASTER_LOOKS[value],
    choice: { kind: 'disaster', value } as const,
  })),
];

/** Obsah kroku Vývojářské menu: nadpis Vynutit pohromu a druhy pohrom jako tlačítka s ikonou. */
export function DevMenuPanel({
  pending,
  onForce,
}: {
  pending: boolean;
  onForce: (choice: DevDisasterChoice) => void;
}): ReactElement {
  return (
    <div data-testid="dev-menu" className="flex flex-col gap-2">
      <h2 className="px-1 text-center font-serif text-lg text-[#f0c987]">Vynutit pohromu</h2>
      <div className="grid grid-cols-2 gap-2">
        {DEV_DISASTER_CHOICES.map(({ key, icon, label, choice }) => (
          <button
            key={key}
            type="button"
            data-testid={`dev-force-${key}`}
            disabled={pending}
            onClick={() => onForce(choice)}
            className="hud-button flex items-center gap-2 px-3 py-1.5 font-serif text-base whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
          >
            <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
