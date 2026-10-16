import type { ReactElement } from 'react';
import type { SceneStep } from '@/lib/scene/landscape-scene';

/** Krok přípravy herní plochy: nejdřív načtení 3D enginu, pak kroky scény. */
export type LoadingStep = 'engine' | SceneStep;

const STEP_LABELS: Record<LoadingStep, string> = {
  engine: 'Načítám 3D grafiku…',
  terrain: 'Tvaruji terén…',
  forest: 'Sázím les…',
  surface: 'Kreslím krajinu…',
  models: 'Načítám stromy a textury…',
  shaders: 'Připravuji vykreslení…',
};

/** Ukazatel průběhu přípravy krajiny – po dokončení plynule zmizí. */
export function SceneLoading({
  step,
  done,
  hidden,
}: {
  step: LoadingStep;
  done: number;
  hidden: boolean;
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, done)) * 100);
  return (
    <div
      data-testid="scene-loading"
      aria-hidden={hidden}
      className={`pointer-events-none fixed inset-0 z-20 flex items-center justify-center px-4 transition-opacity duration-500 ${hidden ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="w-full max-w-xs rounded bg-stone-100/90 px-5 py-4 text-stone-800 shadow-lg backdrop-blur dark:bg-stone-900/90 dark:text-stone-200">
        <p className="font-serif text-lg">Připravuji krajinu</p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{STEP_LABELS[step]}</p>
        <div
          role="progressbar"
          aria-label="Příprava krajiny"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 h-2 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700"
        >
          <div
            className="h-full rounded-full bg-emerald-700 transition-[width] duration-300 dark:bg-emerald-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
