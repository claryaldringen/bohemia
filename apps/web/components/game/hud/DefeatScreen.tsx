'use client';

import { useState, type ReactElement } from 'react';
import type { VillageLifespan } from '@bohemia/game';
import type { LineEndView } from '@/lib/line-end-view';
import { formatInteger, plural } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

/**
 * Obrazovka porážky jako v 0 A.D. (population.md – Hlad a vymření): přes zamrzlou, zašedlou scénu
 * panel „Rod vymřel“ se jménem vsi, roky jejího života a jediným tlačítkem Začít znovu. Žádné
 * vysvětlování – hráč ví, co se stalo. Vymřel-li rod po meči (`line` – lord.md, Konec rodu),
 * navíc kronika rodu – vojvodové po sobě s roky a poslední muž rodu (`name` a `lifespan` pak
 * patří vsi, kde rod skončil).
 */
export function DefeatScreen({
  name,
  lifespan,
  line,
  onRestart,
}: {
  name: string;
  lifespan: VillageLifespan;
  /** Kronika rodu, který vymřel po meči; bez ní obrazovka vymřelé nebo opuštěné vsi. */
  line?: LineEndView;
  /** Začít znovu na serveru – chyba česky, nebo null (stránka se pak načte znovu). */
  onRestart: () => Promise<string | null>;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restart = (): void => {
    if (pending) return;
    setPending(true);
    setError(null);
    void onRestart().then((failure) => {
      // po úspěchu se stránka načítá znovu – tlačítko zůstane zamčené
      if (failure === null) return;
      setError(failure);
      setPending(false);
    });
  };

  const years = `${formatInteger(lifespan.years)} ${plural(lifespan.years, 'rok', 'roky', 'let')}`;
  return (
    <div
      data-testid="defeat-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="defeat-title"
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(ellipse at center, rgb(10 6 3 / 0.2) 0%, rgb(10 6 3 / 0.65) 70%, rgb(5 3 2 / 0.85) 100%)',
        backdropFilter: 'grayscale(0.85) brightness(0.8)',
        WebkitBackdropFilter: 'grayscale(0.85) brightness(0.8)',
      }}
    >
      <section className="hud-panel w-full max-w-sm px-8 pt-7 pb-6 text-center">
        <div aria-hidden className="mx-auto mb-3 flex items-center justify-center gap-3">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#8a6a3c]" />
          <span className="h-2 w-2 rotate-45 border border-[#8a6a3c] bg-[#15100b]" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#8a6a3c]" />
        </div>
        <h1
          id="defeat-title"
          className="font-serif text-3xl tracking-wide text-[#f3dfb0] [text-shadow:0_2px_6px_rgb(0_0_0/0.8)]"
        >
          Rod vymřel
        </h1>
        {line && (
          <Tooltip content="Vojvodové rodu">
            <ol
              data-testid="defeat-lords"
              tabIndex={0}
              className="mx-auto mt-3 max-h-40 w-max overflow-y-auto font-serif text-[#e6d3a8] tabular-nums"
            >
              {line.lords.map((lord, i) => (
                <li key={i}>
                  {lord.name ?? 'Vojvoda'} {lord.fromYear}–{lord.toYear}
                </li>
              ))}
            </ol>
          </Tooltip>
        )}
        {line?.last !== undefined && (
          <p data-testid="defeat-last" className="mt-2 font-serif text-sm text-[#c9b083] italic">
            Zemřel {line.last} – poslední muž rodu
          </p>
        )}
        <p data-testid="defeat-village" className="mt-1 font-serif text-lg text-[#c9b083]">
          {name}
        </p>
        <div className="hud-inset mx-auto mt-4 flex w-max items-center gap-4 rounded px-4 py-2 text-sm font-semibold tabular-nums">
          <Tooltip content="Založení – vymření">
            <span className="flex items-center gap-1.5" tabIndex={0}>
              <img src="/icons/resources/date.png" alt="" width={22} height={22} />
              <span data-testid="defeat-years-range">
                {lifespan.foundedYear} – {lifespan.extinctYear}
              </span>
            </span>
          </Tooltip>
          <span aria-hidden className="h-5 border-l border-[#5c4526]" />
          <Tooltip content="Lidé">
            <span className="flex items-center gap-1.5" tabIndex={0}>
              <img
                src="/icons/resources/people.png"
                alt=""
                width={22}
                height={22}
                style={{ filter: 'grayscale(1) brightness(0.8)' }}
              />
              <span>0</span>
            </span>
          </Tooltip>
          <span aria-hidden className="h-5 border-l border-[#5c4526]" />
          <span data-testid="defeat-years">{years}</span>
        </div>
        <button
          type="button"
          autoFocus
          disabled={pending}
          onClick={restart}
          className="hud-button mt-6 px-8 py-2 font-serif text-lg disabled:cursor-wait disabled:opacity-60"
        >
          Začít znovu
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[#ff7a66]">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
