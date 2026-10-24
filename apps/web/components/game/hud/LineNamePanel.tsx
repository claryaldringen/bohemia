'use client';

import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import {
  checkPersonName,
  LORD_NAME_MISSING,
  SON_NAME_MISSING,
  suggestLineName,
} from '@bohemia/game';
import { Tooltip } from './Tooltip';

// Panel jména muže rodu (lord.md – Kde se jméno zadává): portrét, textové pole (jediná výjimka
// z „bez popisků“), kostka „Navrhni jméno“ a fajfka (i Enter). Důvod, proč jméno neprojde, je
// u kurzoru (popisek pole a fajfky) – stejná kontrola jako na serveru (`checkPersonName`).

/** Popisek panelu – vojvoda (při založení hry, převod, výprava), jinak jeho syn. */
export function lineNameLabel(lord: boolean): string {
  return lord ? 'Jméno vojvody' : 'Jméno syna';
}

/** Proč jméno neprojde (`checkPersonName`), nebo null. Prázdné pole – „… potřebuje jméno“. */
export function lineNameReason(draft: string, lord: boolean): string | null {
  return checkPersonName(draft, lord ? LORD_NAME_MISSING : SON_NAME_MISSING).reason;
}

/** Jméno z kostky – ze seznamu rodu, přednostně jméno, které žijící muži rodu nenosí. */
export function rollLineName(taken: readonly string[], random: () => number): string {
  return suggestLineName(Math.floor(random() * 0x7fffffff), taken);
}

export function LineNamePanel({
  lord,
  portrait,
  initialName = '',
  taken,
  onConfirm,
  onClose,
}: {
  /** Pojmenovává se vojvoda („Jméno vojvody“), jinak syn („Jméno syna“). */
  lord: boolean;
  /** Portrét z ikon lidí (`personPortrait`) – muž, dítě… */
  portrait: string;
  /** Předvyplněné jméno (Začít znovu – poslední jméno vojvody). */
  initialName?: string;
  /** Jména žijících mužů rodu – kostka nabízí přednostně jiná. */
  taken: readonly string[];
  /** Potvrdí jméno – vrátí důvod odmítnutí (server), nebo null. */
  onConfirm: (name: string) => Promise<string | null>;
  /** Zavře panel (Esc); chybí – panel nejde zavřít (jméno vojvody při založení hry). */
  onClose?: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [serverReason, setServerReason] = useState<string | null>(null);
  const label = lineNameLabel(lord);
  const reason = lineNameReason(draft, lord) ?? serverReason;

  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const change = (value: string): void => {
    setDraft(value);
    setServerReason(null);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || lineNameReason(draft, lord) !== null) return;
    setBusy(true);
    void onConfirm(draft)
      .then((failure) => setServerReason(failure))
      .finally(() => setBusy(false));
  };

  return (
    <form
      role="dialog"
      aria-label={label}
      data-testid="line-name-panel"
      data-hud-block
      data-lord={lord}
      onSubmit={submit}
      className="hud-panel fixed top-1/3 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 p-3"
    >
      <Tooltip content={label} placement="above">
        <div className="hud-inset h-14 w-14 overflow-hidden rounded" tabIndex={0}>
          <img
            src={`/icons/resources/${portrait}.png`}
            alt=""
            width={64}
            height={64}
            data-testid="line-name-portrait"
            className="h-full w-full"
          />
        </div>
      </Tooltip>
      <Tooltip content={draft.trim() === '' ? label : (reason ?? label)} placement="below">
        <input
          type="text"
          value={draft}
          onChange={(event) => change(event.target.value)}
          aria-label={label}
          aria-invalid={draft.trim() !== '' && reason !== null}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          data-testid="line-name-input"
          className="hud-inset w-44 rounded px-2 py-1 font-serif text-base text-[#f3dfb0] outline-none aria-invalid:text-[#ff7a66]"
        />
      </Tooltip>
      <Tooltip content="Navrhni jméno" placement="above">
        <button
          type="button"
          aria-label="Navrhni jméno"
          data-testid="line-name-dice"
          className="hud-icon-button h-9 w-9 text-2xl leading-none text-[#f3dfb0]"
          onClick={() => change(rollLineName(taken, Math.random))}
        >
          <span aria-hidden>⚄</span>
        </button>
      </Tooltip>
      <Tooltip content={reason ?? 'Potvrdit'} placement="above">
        <button
          type="submit"
          aria-label="Potvrdit"
          data-testid="line-name-confirm"
          disabled={reason !== null || busy}
          className="hud-icon-button h-9 w-9 text-xl leading-none text-[#b8e07a] disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
        >
          <span aria-hidden>✓</span>
        </button>
      </Tooltip>
    </form>
  );
}
