'use client';

import { useRef, useState, type ReactElement } from 'react';
import { dateOfDayIndex, type ArmsGood } from '@bohemia/game';
import { formatDayMonth } from '@/lib/game-date';
import type { VillageManor } from '@/lib/manor-view';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatCoinPrice } from '@/lib/village-format';
import { useRightDenied } from './rights';
import { Stepper } from './Stepper';
import { Tooltip } from './Tooltip';

// Zbroj u cizích kupců v panelu Trh (markets.md – Rozhodnutí plánu 4, bod 15; Martin 25. 11. 2026:
// „Hráč zadá počet“): kolik mečů, kroužkových košil a helem má ves koupit, cena dne v mincích a den
// příštího příjezdu kupců. Jen pohled a záměr – ceny, objednávku i den posílá server.

/** Kdy kupci přijedou – den příštího příjezdu s ikonou data. */
function MerchantsDate({ day, today }: { day: number; today: number }): ReactElement {
  const date = formatDayMonth(dateOfDayIndex(day));
  return (
    <div data-testid="market-arms-date">
      <Tooltip
        placement="below-right"
        content={day === today ? 'Kupci jsou dnes ve vsi' : `Kupci přijedou ${date}`}
      >
        <span className="flex items-center gap-1.5 text-sm tabular-nums" tabIndex={0}>
          <img src="/icons/resources/merchants.png" alt="" width={24} height={24} />
          <img src="/icons/resources/date.png" alt="" width={18} height={18} />
          {date}
        </span>
      </Tooltip>
    </div>
  );
}

/**
 * Sekce zbroje vlastní vsi u stezky; ves bez kupců (`arms` prázdné) ji nemá. Každý klik jde na server
 * hned a v pořadí (fronta akcí vsi); do odpovědi na poslední změnu zboží se ukazuje naklikaný počet,
 * pak zase počet ze serveru. `onOrder` vrací důvod odmítnutí, nebo null.
 */
export function ArmsOrder({
  market,
  onOrder,
}: {
  market: Pick<VillageManor['market'], 'arms' | 'merchantsDay' | 'day'>;
  onOrder: (good: ArmsGood, amount: number) => Promise<string | null>;
}): ReactElement | null {
  const denied = useRightDenied('trade');
  const [clicked, setClicked] = useState<Partial<Record<ArmsGood, number>>>({});
  const [error, setError] = useState<string | null>(null);
  // pořadí poslední změny každého zboží – odpověď na starší změnu nic nepřepíše
  const changes = useRef(new Map<ArmsGood, number>());
  if (market.arms.length === 0) return null;

  const change = (good: ArmsGood, amount: number): void => {
    const order = (changes.current.get(good) ?? 0) + 1;
    changes.current.set(good, order);
    setError(null);
    setClicked((current) => ({ ...current, [good]: amount }));
    void onOrder(good, amount).then((reason) => {
      if (changes.current.get(good) !== order) return;
      setClicked((current) => {
        const rest = { ...current };
        delete rest[good];
        return rest;
      });
      if (reason !== null) setError(reason);
    });
  };

  return (
    <div
      data-testid="market-arms"
      role="group"
      aria-label="Zbroj od kupců"
      className="hud-inset flex flex-col gap-1.5 rounded p-1.5"
    >
      {market.merchantsDay !== null && (
        <MerchantsDate day={market.merchantsDay} today={market.day} />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {market.arms.map(({ good, price, ordered }) => {
          const { name, icon } = TRADE_GOOD_NAMES[good];
          return (
            <div key={good} data-testid={`market-arms-${good}`}>
              <Tooltip
                placement="below-right"
                denied={denied}
                content={
                  // úzký popisek – u poslední zbroje řádku by ho okraj okna ořízl
                  <span className="block max-w-44">
                    {`${name} – ves je koupí od kupců za své mince`}
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
                    {formatCoinPrice(price)}
                    <img src="/icons/resources/coin.png" alt="" width={16} height={16} />
                  </span>
                  <Stepper
                    testId={`market-arms-${good}`}
                    value={clicked[good] ?? ordered}
                    label={name}
                    disabled={denied !== null}
                    onChange={(amount) => change(good, amount)}
                  />
                </span>
              </Tooltip>
            </div>
          );
        })}
      </div>
      {error && (
        <p data-testid="market-arms-error" className="text-sm font-semibold text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
