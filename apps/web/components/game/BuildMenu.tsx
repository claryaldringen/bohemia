'use client';

import type { ReactElement } from 'react';
import type { DwellingType } from '@bohemia/game';
import { formatManDays } from '@/lib/village-format';
import type { VillageView } from '@/lib/village-view';

export type BuildItem = DwellingType | 'field';

const ITEM_NAMES: Record<BuildItem, string> = {
  zemnice: 'Zemnice',
  polozemnice: 'Polozemnice',
  field: 'Pole',
};

const HINTS: Record<'dwelling' | 'field', string> = {
  dwelling: 'Klikni na rovné místo na louce · Q/E otáčí · Esc zruší',
  field:
    'Klikáním přidávej body obrysu · Backspace ubere bod · Enter nebo dvojklik uzavře · Esc zruší',
};

const buttonClass =
  'flex flex-col items-start rounded px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45';

/**
 * Nabídka staveb dole uprostřed: obydlí (zašedlá s důvodem, dokud je pravidla nedovolí) a pole.
 * Během umisťování ukazuje, co se staví, nápovědu a tlačítko Zrušit.
 */
export function BuildMenu({
  view,
  placing,
  busy,
  sceneReady,
  onBuild,
  onCancel,
}: {
  view: VillageView;
  placing: { item: BuildItem; kind: 'dwelling' | 'field' } | null;
  busy: boolean;
  sceneReady: boolean;
  onBuild: (item: BuildItem) => void;
  onCancel: () => void;
}): ReactElement {
  const canDwell = view.canBuildDwelling;
  const items: { item: BuildItem; cost: string; disabled: boolean; reason: string | null }[] = [
    {
      item: 'zemnice',
      cost: formatManDays(view.costs.zemnice),
      disabled: !canDwell.ok,
      reason: canDwell.reason,
    },
    {
      item: 'polozemnice',
      cost: formatManDays(view.costs.polozemnice),
      disabled: !canDwell.ok,
      reason: canDwell.reason,
    },
    {
      item: 'field',
      cost: `${formatManDays(view.costs.fieldPerHa)} / ha`,
      disabled: false,
      reason: null,
    },
  ];

  return (
    <nav
      aria-label="Stavby"
      data-testid="build-menu"
      className="fixed bottom-4 left-1/2 z-10 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded bg-stone-100/90 px-2 py-2 text-sm text-stone-800 shadow-lg backdrop-blur dark:bg-stone-950/85 dark:text-stone-200"
    >
      {placing ? (
        <div className="flex items-center gap-3 px-1">
          <div>
            <p className="font-semibold">{ITEM_NAMES[placing.item]}</p>
            <p className="text-xs text-stone-600 dark:text-stone-400">{HINTS[placing.kind]}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-stone-300 px-3 py-1.5 hover:bg-stone-400 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            Zrušit
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-wrap justify-center gap-1.5">
            {items.map(({ item, cost, disabled, reason }) => (
              <li key={item}>
                <button
                  type="button"
                  disabled={disabled || busy || !sceneReady}
                  title={reason ?? undefined}
                  onClick={() => onBuild(item)}
                  className={`${buttonClass} bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700`}
                >
                  <span className="font-semibold">{ITEM_NAMES[item]}</span>
                  <span className="text-xs text-stone-600 dark:text-stone-400">{cost}</span>
                </button>
              </li>
            ))}
          </ul>
          {!canDwell.ok && canDwell.reason && (
            <p className="mt-1.5 max-w-md px-1 text-xs text-stone-600 dark:text-stone-400">
              {canDwell.reason}
            </p>
          )}
          {busy && <p className="mt-1 px-1 text-xs text-stone-600 dark:text-stone-400">Ukládám…</p>}
        </>
      )}
    </nav>
  );
}
