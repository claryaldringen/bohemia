'use client';

import { useEffect, type ReactElement } from 'react';
import type { VillageNotice } from '@/lib/village-notices';

/** Upozornění vsi jako toast – `id` rozliší dvě stejná upozornění v různý čas. */
export type NoticeToast = VillageNotice & { id: number };

/** Jak dlouho toast zůstane, když ho hráč nezavře (ms). */
const NOTICE_MS = 9000;

const TONES: Record<VillageNotice['tone'], string> = {
  good: 'border-emerald-600 bg-emerald-50/95 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-50',
  warn: 'border-amber-600 bg-amber-50/95 text-amber-950 dark:bg-amber-950/90 dark:text-amber-50',
};

function Toast({
  notice,
  onDismiss,
}: {
  notice: NoticeToast;
  onDismiss: (id: number) => void;
}): ReactElement {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notice.id), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice.id, onDismiss]);

  return (
    <li
      data-testid="village-notice"
      data-kind={notice.kind}
      className={`pointer-events-auto flex items-start gap-2 rounded border-l-4 px-3 py-2 text-sm shadow-lg backdrop-blur ${TONES[notice.tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{notice.title}</p>
        <p className="text-xs leading-snug opacity-90">{notice.text}</p>
      </div>
      <button
        type="button"
        aria-label="Zavřít upozornění"
        onClick={() => onDismiss(notice.id)}
        className="rounded px-1 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
      >
        ×
      </button>
    </li>
  );
}

/**
 * Nová upozornění vsi vpravo nahoře (plná domácnost, hlad, stojící stavby) – ukážou se jednou
 * při změně stavu a samy zmizí. Trvající stav ukazuje panel vsi.
 */
export function NoticeToasts({
  notices,
  onDismiss,
}: {
  notices: readonly NoticeToast[];
  onDismiss: (id: number) => void;
}): ReactElement {
  // Oblast aria-live existuje pořád – čtečka pak ohlásí i první upozornění.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-24 right-2 z-20 w-80 max-w-[calc(100vw-1rem)]"
    >
      <ol className="flex flex-col gap-2">
        {notices.map((notice) => (
          <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />
        ))}
      </ol>
    </div>
  );
}
