'use client';

import { useRef, useState, type ReactElement } from 'react';
import type { VillageManor } from '@/lib/manor-view';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatCoinPrice, formatInteger } from '@/lib/village-format';
import { useRightDenied } from './rights';
import { Stepper } from './Stepper';
import { Tooltip } from './Tooltip';

// Prodej otroků v panelu Trh vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8; vzor `ArmsOrder`):
// kolik otroků ves nabízí, jejich zásoba a cena dne v mincích. Jen pohled a záměr – kdo jde prodat
// i cenu počítá server (`VillageManor.market.slaveSale`).

/**
 * Sekce prodeje otroků; ves bez prodejních otroků a bez nabídky (`slaveSale` null) ji nemá. Každý klik
 * jde na server hned a v pořadí (fronta akcí vsi); do odpovědi na poslední změnu se ukazuje naklikaný
 * počet, pak zase počet ze serveru. `onOffer` vrací důvod odmítnutí, nebo null.
 */
export function SlaveSale({
  slaveSale,
  onOffer,
}: {
  slaveSale: VillageManor['market']['slaveSale'];
  onOffer: (count: number) => Promise<string | null>;
}): ReactElement | null {
  const denied = useRightDenied('trade');
  const [clicked, setClicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // pořadí poslední změny – odpověď na starší změnu nic nepřepíše
  const changes = useRef(0);
  if (slaveSale === null) return null;

  const change = (count: number): void => {
    const order = ++changes.current;
    setError(null);
    setClicked(count);
    void onOffer(count).then((reason) => {
      if (changes.current !== order) return;
      setClicked(null);
      if (reason !== null) setError(reason);
    });
  };

  const { name, icon } = TRADE_GOOD_NAMES.slaves;
  return (
    <div
      data-testid="market-slaves"
      role="group"
      aria-label="Prodej otroků"
      className="hud-inset flex flex-col gap-1.5 rounded p-1.5"
    >
      <Tooltip
        placement="below-right"
        denied={denied}
        content={
          <span className="block max-w-44">
            Otroci na prodej – ves je prodá kupcům a výpravám na svém trhu za cenu dne
          </span>
        }
      >
        <span className="flex items-center gap-1.5" tabIndex={0}>
          <span
            className={`flex items-center gap-1 text-sm tabular-nums ${denied === null ? '' : 'opacity-45 grayscale'}`}
          >
            <img
              src={`/icons/resources/${icon}.png`}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0"
            />
            <span data-testid="market-slaves-stock">{formatInteger(slaveSale.stock)}</span>
            {formatCoinPrice(slaveSale.price)}
            <img src="/icons/resources/coin.png" alt="" width={16} height={16} />
          </span>
          <Stepper
            testId="market-slaves"
            value={clicked ?? slaveSale.forSale}
            max={Math.max(slaveSale.stock, slaveSale.forSale)}
            label={name}
            disabled={denied !== null}
            onChange={change}
          />
        </span>
      </Tooltip>
      {error && (
        <p data-testid="market-slaves-error" className="text-sm font-semibold text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
