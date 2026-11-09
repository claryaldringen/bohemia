'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { BREAKOUT_BLOCKED } from '@bohemia/game';
import { Tooltip } from './Tooltip';
import { useRightDenied } from './rights';

// Rozkaz „Probít se“ obráncům napadené vsi (fortifications.md – Obrana bez násobku 3, Bod zlomu
// a probíjení): držitel vsi, který boj sleduje ve scéně, rozkáže obráncům za hradbou, aby se
// pohromadě probili branou do lesa. Jen ikona – název v popisku, důvod, proč nejde, červeně.

/** Ikona tlačítka (vlastní SVG, CC0 – public/icons/LICENSES.md). */
export const BREAKOUT_ICON = '/icons/war/breakout.svg';

/**
 * Tlačítko „Probít se“ (nad mapou vlevo pod lištou). `denied` – proč rozkaz teď nejde (rozhodl
 * server, `breakoutOf`); bez práva `war` zašedne s důvodem práva. `onOrder` vrátí chybu česky,
 * nebo null; po odeslání tlačítko zašedne, dokud server neukáže jiný stav (důvod `denied`).
 */
export function BreakoutButton({
  denied,
  onOrder,
}: {
  denied: string | null;
  onOrder: () => Promise<string | null>;
}): ReactElement {
  const warDenied = useRightDenied('war');
  const [busy, setBusy] = useState(false);
  // odeslaný rozkaz, nebo chyba serveru – platí, dokud server nepošle jiný stav tlačítka
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => setSent(null), [denied]);
  // pojistka: rozkaz, který takt nepřijal, nezamkne tlačítko natrvalo
  useEffect(() => {
    if (sent === null) return;
    const timer = setTimeout(() => setSent(null), SENT_HOLD_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  const reason = warDenied ?? sent ?? denied;
  return (
    <div className="fixed top-14 left-2 z-20" data-hud-block>
      <Tooltip placement="below-right" denied={reason} content="Probít se">
        <button
          type="button"
          data-testid="breakout"
          aria-label="Probít se"
          disabled={busy || reason !== null}
          onClick={() => {
            if (busy || reason !== null) return;
            setBusy(true);
            void onOrder()
              .then((error) => setSent(error ?? BREAKOUT_BLOCKED.underway))
              .finally(() => setBusy(false));
          }}
          className={`hud-panel h-12 w-12 overflow-hidden rounded p-0.5 ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
        >
          <img
            src={BREAKOUT_ICON}
            alt=""
            width={44}
            height={44}
            className="h-full w-full object-contain p-0.5"
          />
        </button>
      </Tooltip>
    </div>
  );
}

/** Jak dlouho platí odeslaný rozkaz či chyba, když server stav tlačítka nezmění (ms). */
const SENT_HOLD_MS = 10_000;
