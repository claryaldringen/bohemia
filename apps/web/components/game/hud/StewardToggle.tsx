'use client';

import { useState, type ReactElement } from 'react';
import { Tooltip } from './Tooltip';

// Správce vsi v rozhraní (steward.md – Co hráč vidí): přepínač (ikona klíčů, zapnutý svítí,
// vypnutý je tlumený; popisek jen „Správce“) a značka „Postavil správce“ u jeho staveb.

const ICON = '/icons/resources/steward.svg';

/**
 * Přepínač správce: klik zapne nebo vypne (server action), po odpovědi se pohled obnoví. Dokud
 * akce běží, tlačítko stojí – dvojklik by poslal dva protichůdné požadavky.
 */
export function StewardToggle({
  on,
  onToggle,
  testId = 'steward-toggle',
}: {
  on: boolean;
  /** Zapne / vypne správce (server action) – hotovo, až se vrátí. */
  onToggle?: ((on: boolean) => Promise<unknown>) | undefined;
  testId?: string;
}): ReactElement {
  const [pending, setPending] = useState(false);
  return (
    <Tooltip content="Správce" placement="above">
      <button
        type="button"
        data-testid={testId}
        data-hud-block
        aria-label="Správce"
        aria-pressed={on}
        disabled={pending || !onToggle}
        onClick={() => {
          if (!onToggle) return;
          setPending(true);
          void onToggle(!on).finally(() => setPending(false));
        }}
        className={`hud-icon-button h-7 w-7 shrink-0 ${on ? '' : 'opacity-40'}`}
      >
        <img src={ICON} alt="" width={20} height={20} className="m-auto h-5 w-5" />
      </button>
    </Tooltip>
  );
}

/** Značka u jména vsi v liště, když ji řídí správce. */
export function StewardBadge(): ReactElement {
  return (
    <Tooltip content="Správce" placement="below">
      <img
        src={ICON}
        alt="Správce"
        data-testid="steward-badge"
        width={16}
        height={16}
        className="h-4 w-4 shrink-0"
      />
    </Tooltip>
  );
}

/** Značka „Postavil správce“ v panelu výběru stavby. */
export function StewardBuiltMark(): ReactElement {
  return (
    <Tooltip content="Postavil správce" placement="below-left">
      <span tabIndex={0} data-testid="steward-built" className="flex h-6 w-6 items-center">
        <img src={ICON} alt="Postavil správce" width={20} height={20} className="m-auto h-5 w-5" />
      </span>
    </Tooltip>
  );
}
