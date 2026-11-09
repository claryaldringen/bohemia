'use client';

import { useState, type ReactElement } from 'react';
import type { SelectionDetails } from '@/lib/selection-details';
import { formatInteger } from '@/lib/village-format';
import { Tooltip } from '../Tooltip';
import { ROW, Stat } from './parts';

/** Kolik m³ jde zadat jedním tlačítkem „nalámat do zásoby“ (návrh Clauda). */
const ORDERS = [10, 50] as const;

/**
 * Lom (fortifications.md – Kámen): kámen vsi na hromadách a u hotového lomu tlačítka „nalámat do
 * zásoby“ – práce jde ze společné práce vsi jako stavba. Rozestavěný lom jen Zrušit (panel).
 */
export function QuarryBody({
  details,
  onOrder,
}: {
  details: Extract<SelectionDetails, { kind: 'quarry' }>;
  onOrder?: (outcropId: number, m3: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const building = details.constructionId !== undefined;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat
          src="/icons/resources/stone.png"
          name="Kámen na hromadách (m³)"
          testId="selection-quarry-stone"
        >
          {formatInteger(details.stoneM3)}
        </Stat>
      </div>
      {!building && onOrder && (
        <div className={ROW}>
          {ORDERS.map((m3) => (
            <Tooltip key={m3} content={`Nalámat ${m3} m³ kamene do zásoby`}>
              <button
                type="button"
                aria-label={`Nalámat ${m3} m³ kamene do zásoby`}
                data-testid={`selection-quarry-order-${m3}`}
                disabled={busy}
                className="hud-icon-button flex h-8 items-center gap-1 px-2"
                onClick={() => {
                  setBusy(true);
                  void onOrder(details.outcropId, m3).finally(() => setBusy(false));
                }}
              >
                <img src="/icons/resources/stone.png" alt="" width={20} height={20} />
                <span className="text-sm font-semibold tabular-nums">+{m3}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
