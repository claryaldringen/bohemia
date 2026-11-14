'use client';

import { useEffect, type ReactElement } from 'react';
import type { ChronicleEntryView, ChroniclePage } from '@/lib/chronicle-view';
import { Tooltip } from './Tooltip';

const ICON = '/icons/house';

/** Záznamy jednoho dne za sebou – datum se píše jednou (Martin 14. 11. 2026). */
export function groupByDay(entries: readonly ChronicleEntryView[]): ChronicleEntryView[][] {
  const groups: ChronicleEntryView[][] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0]?.day === entry.day) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

/**
 * Panel Kronika (absence.md – Návrat): zápisy kroniky zobrazené vsi od nejnovějších, po herních
 * letech a v nich po dnech. Modální okno uprostřed obrazovky jako nabídka hry; kliknutí mimo ho zavře. Kronika je ze své podstaty text; ovládání jen ikonami s popiskem. Starší roky se
 * načítají po stránkách (`onOlder`), Esc panel zavře.
 */
export function ChroniclePanel({
  page,
  loading,
  error,
  onOlder,
  onClose,
}: {
  /** Načtené roky; null – první stránka se teprve načítá. */
  page: ChroniclePage | null;
  /** Probíhá dotaz na server (první nebo starší stránka). */
  loading: boolean;
  error: string | null;
  onOlder: () => void;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      {/* Kliknutí mimo panel kroniku zavře (až click, jako u nabídky hry). */}
      <div
        data-hud-block
        aria-hidden
        data-testid="chronicle-backdrop"
        className="fixed inset-0 z-30 bg-black/40"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onClose}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kronika"
        data-testid="chronicle-panel"
        data-hud-block
        className="hud-panel fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100vh-4rem)] w-[26rem] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col p-3"
      >
        <div className="flex items-center gap-1.5 pb-2">
          <Tooltip content="Kronika">
            <img
              src="/icons/resources/chronicle.png"
              alt=""
              width={24}
              height={24}
              draggable={false}
            />
          </Tooltip>
          <Tooltip content="Zavřít">
            <button
              type="button"
              aria-label="Zavřít"
              data-testid="chronicle-close"
              className="hud-icon-button ml-auto flex h-6 w-6 items-center justify-center"
              onClick={onClose}
            >
              <img src={`${ICON}/cross.png`} alt="" width={12} height={12} draggable={false} />
            </button>
          </Tooltip>
        </div>
        {error && (
          <p data-testid="chronicle-error" className="pb-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {!page ? (
          <div className="py-2 text-center text-sm opacity-70" aria-busy>
            …
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1" data-testid="chronicle-years">
            {page.years.map((year) => (
              <section key={year.year} data-testid="chronicle-year" data-year={year.year}>
                <h3 className="sticky top-0 border-b border-[#5c4526] bg-[#2b2219] py-0.5 font-serif text-sm font-semibold text-[#f3cf86]">
                  {year.year}
                </h3>
                <div className="flex flex-col gap-1.5 py-1.5">
                  {groupByDay(year.entries).map((group) => (
                    <div
                      key={group[0]?.day}
                      data-testid="chronicle-day"
                      data-day={group[0]?.day}
                      className="flex gap-2 text-sm leading-snug"
                    >
                      <span
                        data-testid="chronicle-day-label"
                        className="w-[4.5rem] shrink-0 text-xs leading-5 whitespace-nowrap opacity-70"
                      >
                        {group[0]?.dateLabel}
                      </span>
                      <ol className="flex flex-col gap-0.5">
                        {group.map((entry, index) => (
                          <li
                            key={`${entry.day}:${index}`}
                            data-testid="chronicle-entry"
                            data-kind={entry.kind}
                            data-day={entry.day}
                          >
                            {entry.text}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {page.olderThan !== null && (
              <div className="flex justify-center py-1">
                <Tooltip content="Starší zápisy">
                  <button
                    type="button"
                    aria-label="Starší zápisy"
                    data-testid="chronicle-older"
                    disabled={loading}
                    className="hud-icon-button flex h-7 w-9 items-center justify-center disabled:opacity-40"
                    onClick={onOlder}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 8l6 6 6-6" />
                      <path d="M6 13l6 6 6-6" opacity={0.5} />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            )}
            {page.lost && (
              <p
                data-testid="chronicle-lost"
                className="py-1 text-center text-xs italic opacity-70"
              >
                Starší zápisy se nedochovaly.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
