/**
 * Zásoby zboží vsi v panelu dvorce: kůže, kožešiny, med a vosk (hides-honey.md), mince a zbroj
 * (markets.md – Rozhodnutí plánu 4, bod 12).
 */
import { type ReactElement } from 'react';
import { ARMS_GOODS, COIN_GOOD, type WaresView } from '@bohemia/game';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatInteger } from '@/lib/village-format';
import { ROW, Stat } from './parts';

/**
 * Čtyři ikony zboží s čísly a k nim mince a každý druh zbroje, který ves má. Zboží se samými nulami,
 * mince ani zbroj s nulou se nevykreslí – ves jen s mincemi ukáže jen je.
 */
export function WaresStock({ wares }: { wares: WaresView | null }): ReactElement | null {
  if (!wares) return null;
  const { hides, furs, sheepFurs, honeyKg, waxKg, smallHides, coins = 0, arms = {} } = wares;
  const anyWares = hides + furs + honeyKg + waxKg > 0;
  const pieces = [
    { good: COIN_GOOD, count: coins },
    ...ARMS_GOODS.map((good) => ({ good, count: arms[good] ?? 0 })),
  ].filter(({ count }) => count > 0);
  if (!anyWares && pieces.length === 0) return null;
  const hideName =
    smallHides === undefined ? 'Kůže' : `Kůže – v přepočtu na skot, z toho malých ${smallHides}`;
  return (
    <div className={ROW} data-testid="selection-wares">
      {anyWares && (
        <>
          <Stat icon="hide" name={hideName} testId="wares-hides">
            {hides}
          </Stat>
          <Stat icon="fur" name={`Kožešiny – ovčí ${sheepFurs}`} testId="wares-furs">
            {furs}
          </Stat>
          <Stat icon="honey" name="Med" testId="wares-honey">
            {honeyKg}
          </Stat>
          <Stat icon="wax" name="Vosk" testId="wares-wax">
            {waxKg}
          </Stat>
        </>
      )}
      {pieces.map(({ good, count }) => (
        <Stat
          key={good}
          icon={TRADE_GOOD_NAMES[good].icon}
          name={TRADE_GOOD_NAMES[good].name}
          testId={`wares-${good}`}
        >
          {formatInteger(count)}
        </Stat>
      ))}
    </div>
  );
}
