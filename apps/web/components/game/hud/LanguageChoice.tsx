'use client';

import { useState, type ReactElement } from 'react';
import { LANGUAGE_GROUPS, type LanguageGroup } from '@bohemia/game';
import { LANGUAGE_NAMES } from '@/lib/newcomer-view';
import { Tooltip } from './Tooltip';

/** Ikona jazykové skupiny (zjednodušená vlajka) – název v `Tooltip` u rodiče. */
export function LanguageIcon({
  language,
  size = 24,
}: {
  language: LanguageGroup;
  size?: number;
}): ReactElement {
  return (
    <img
      src={`/icons/newcomer/${language}.svg`}
      alt=""
      width={size}
      height={Math.round((size * 2) / 3)}
      data-testid={`language-icon-${language}`}
      className="rounded-[2px] border border-[#f3cf86]/60"
    />
  );
}

/**
 * Řádek ikon jazyků pro účet přes Google (newcomers.md – Jazyková skupina: volba při prvním
 * vstupu do hry). Klik zvolí jazyk; `onChoose` vrátí důvod odmítnutí (server), nebo null.
 */
export function LanguageChoice({
  initial = 'cs',
  onChoose,
}: {
  initial?: LanguageGroup;
  onChoose: (language: LanguageGroup) => Promise<string | null>;
}): ReactElement {
  const [chosen, setChosen] = useState<LanguageGroup>(initial);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const choose = (language: LanguageGroup): void => {
    if (busy || language === chosen) return;
    setBusy(true);
    void onChoose(language)
      .then((failure) => {
        setReason(failure);
        if (failure === null) setChosen(language);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div
      role="group"
      aria-label="Jazyk"
      data-testid="language-choice"
      data-hud-block
      className="hud-panel fixed top-[22%] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 p-3"
    >
      {LANGUAGE_GROUPS.map((language) => (
        <Tooltip key={language} content={LANGUAGE_NAMES[language]} placement="below">
          <button
            type="button"
            aria-label={LANGUAGE_NAMES[language]}
            aria-pressed={language === chosen}
            data-testid={`language-choice-${language}`}
            onClick={() => choose(language)}
            className={`hud-icon-button p-1 ${language === chosen ? 'outline-2 outline-[#f3cf86]' : ''}`}
          >
            <LanguageIcon language={language} size={36} />
          </button>
        </Tooltip>
      ))}
      {reason !== null && (
        <span role="alert" data-testid="language-choice-reason" className="sr-only">
          {reason}
        </span>
      )}
    </div>
  );
}
