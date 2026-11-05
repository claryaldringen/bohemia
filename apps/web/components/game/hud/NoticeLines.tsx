'use client';

import { useEffect, type CSSProperties, type ReactElement } from 'react';

/** Řádek oznámení nahoře uprostřed – upozornění vsi nebo chyba akce. */
export interface NoticeLine {
  id: number;
  /** Druh pro testy a barvu (upozornění vsi, nebo `error` – akce selhala). */
  kind: string;
  tone: 'info' | 'warn' | 'error';
  text: string;
  /** Klik na řádek (upozornění mezi hráči otevře svůj panel); bez něj řádek klik nechytá. */
  onOpen?: () => void;
}

/** Jak dlouho řádek zůstane, než zmizí (ms). */
export const NOTICE_MS = 6000;

const TONES: Record<NoticeLine['tone'], string> = {
  info: 'text-[#f3dfb0]',
  warn: 'text-[#ffb35c]',
  error: 'text-[#ff7a66]',
};

function Line({
  notice,
  onExpire,
}: {
  notice: NoticeLine;
  onExpire: (id: number) => void;
}): ReactElement {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(notice.id), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice.id, onExpire]);
  return (
    <li
      data-testid="village-notice"
      data-kind={notice.kind}
      className={`hud-notice font-serif text-base ${TONES[notice.tone]}`}
      style={{ '--hud-notice-ms': `${NOTICE_MS}ms` } as CSSProperties}
    >
      {notice.onOpen ? (
        <button
          type="button"
          onClick={notice.onOpen}
          className="pointer-events-auto cursor-pointer underline-offset-2 hover:underline"
        >
          {notice.text}
        </button>
      ) : (
        notice.text
      )}
    </li>
  );
}

/**
 * Trvalé upozornění, které čeká na hráče (lord.md – Kde se jméno zadává: „Syn vojvody čeká na
 * jméno“) – nemizí po `NOTICE_MS`, klik ho vyřeší (otevře panel).
 */
export interface PinnedNotice {
  kind: string;
  text: string;
  /** Kolik jich čeká – číslo se ukáže od dvou. */
  count: number;
  onOpen: () => void;
}

/**
 * Krátká oznámení nahoře uprostřed, která po pár sekundách zmizí (jako zprávy v 0 A.D.).
 * `status` je trvalý řádek (ves teď nejde zobrazit), nemizí; `pinned` také ne – čeká na hráče.
 */
export function NoticeLines({
  notices,
  status,
  pinned = null,
  onExpire,
}: {
  notices: readonly NoticeLine[];
  status: string | null;
  pinned?: PinnedNotice | null;
  onExpire: (id: number) => void;
}): ReactElement {
  // Oblast aria-live existuje pořád – čtečka pak ohlásí i první oznámení.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-14 left-1/2 z-20 w-max max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 text-center"
    >
      {status && (
        <p
          data-testid="village-status"
          className="font-serif text-[#ff7a66] [text-shadow:0_1px_2px_rgb(0_0_0/0.95)]"
        >
          {status}
        </p>
      )}
      {pinned && (
        <button
          type="button"
          data-testid="pinned-notice"
          data-kind={pinned.kind}
          onClick={pinned.onOpen}
          className="pointer-events-auto cursor-pointer font-serif text-base text-[#ffb35c] underline-offset-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.95)] hover:underline"
        >
          {pinned.text}
          {pinned.count > 1 && (
            <span data-testid="pinned-notice-count" className="ml-1.5 tabular-nums">
              {pinned.count}
            </span>
          )}
        </button>
      )}
      <ol className="flex flex-col items-center gap-0.5">
        {notices.map((notice) => (
          <Line key={notice.id} notice={notice} onExpire={onExpire} />
        ))}
      </ol>
    </div>
  );
}
