'use client';

import { useEffect, type ReactElement } from 'react';
import type { NoticePage } from '@/lib/notice-page';
import { Tooltip } from './Tooltip';

const ICON = '/icons/house';

/**
 * Panel Upozornění (absence.md – Návrat): uložená upozornění mezi hráči od nejnovějších, s herním
 * datem; nová od posledního otevření zvýrazněná. Upozornění je ze své podstaty text; ovládání jen
 * ikonami s popiskem. Starší se načítají po stránkách (`onOlder`), Esc panel zavře.
 */
export function NoticesPanel({
  page,
  highlightAfter,
  loading,
  error,
  onOlder,
  onClose,
}: {
  /** Načtená upozornění; null – první stránka se teprve načítá. */
  page: NoticePage | null;
  /** Upozornění s větším `id` jsou nová. */
  highlightAfter: number;
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
    <div
      role="dialog"
      aria-label="Upozornění"
      data-testid="notices-panel"
      data-hud-block
      className="hud-panel fixed top-12 right-2 z-40 flex max-h-[calc(100vh-4rem)] w-[22rem] max-w-[calc(100vw-1rem)] flex-col p-3"
    >
      <div className="flex items-center gap-1.5 pb-2">
        <Tooltip content="Upozornění">
          <img src="/icons/resources/bell.png" alt="" width={24} height={24} draggable={false} />
        </Tooltip>
        <Tooltip content="Zavřít">
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="notices-close"
            className="hud-icon-button ml-auto flex h-6 w-6 items-center justify-center"
            onClick={onClose}
          >
            <img src={`${ICON}/cross.svg`} alt="" width={12} height={12} draggable={false} />
          </button>
        </Tooltip>
      </div>
      {error && (
        <p data-testid="notices-error" className="pb-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {!page ? (
        <div className="py-2 text-center text-sm opacity-70" aria-busy>
          …
        </div>
      ) : (
        <div className="min-h-0 overflow-y-auto pr-1" data-testid="notices-list">
          <ol className="flex flex-col gap-1 py-1">
            {page.items.map((item) => {
              const fresh = item.id > highlightAfter;
              return (
                <li
                  key={item.id}
                  data-testid="notice-entry"
                  data-kind={item.kind}
                  data-unread={fresh}
                  className={`flex flex-col rounded-sm border-l-2 px-1.5 py-0.5 text-sm leading-snug ${
                    fresh ? 'border-[#f3cf86] bg-[#f3cf86]/10' : 'border-transparent'
                  }`}
                >
                  <span className="text-xs whitespace-nowrap opacity-70">{item.dateLabel}</span>
                  <span>{item.text}</span>
                </li>
              );
            })}
          </ol>
          {page.olderThan !== null && (
            <div className="flex justify-center py-1">
              <Tooltip content="Starší upozornění">
                <button
                  type="button"
                  aria-label="Starší upozornění"
                  data-testid="notices-older"
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
        </div>
      )}
    </div>
  );
}
