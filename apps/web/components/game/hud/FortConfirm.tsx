'use client';

import type { ReactElement } from 'react';
import { Tooltip } from './Tooltip';

/**
 * Ikona kladiva při úpravě obvodu opevnění (fortifications.md – Obvod): položí stavbu jako Enter.
 * Neprošlý obvod – zašedlé s důvodem v popisku (UI jako 0 A.D. – slova jen v popisku).
 */
export function FortConfirm({
  reason,
  onConfirm,
}: {
  /** Proč obvod nejde položit; null – projde. */
  reason: string | null;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div className="hud-panel fixed bottom-2 left-1/2 z-20 -translate-x-1/2 p-1.5" data-hud-block>
      <Tooltip content="Postavit opevnění (Enter)" denied={reason} placement="above">
        <button
          type="button"
          data-testid="fort-confirm"
          aria-label="Postavit opevnění"
          aria-disabled={reason !== null}
          onClick={() => {
            if (reason === null) onConfirm();
          }}
          className={`hud-icon-button h-9 w-9 ${reason === null ? '' : 'opacity-40'}`}
        >
          <img
            src="/icons/resources/labor.png"
            alt=""
            width={28}
            height={28}
            className="m-auto h-7 w-7"
          />
        </button>
      </Tooltip>
    </div>
  );
}
