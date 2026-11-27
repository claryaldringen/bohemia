/**
 * Zásoby zboží vsi v panelu dvorce: kůže, kožešiny, med a vosk (hides-honey.md), zlato a šperky (gold.md), mince a zbroj
 * (markets.md – Rozhodnutí plánu 4, bod 12).
 */
import { type ReactElement } from 'react';
import { ARMS_GOODS, COIN_GOOD, type WaresView } from '@bohemia/game';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatFactor, formatGrams, formatInteger } from '@/lib/village-format';
import { ROW, Stat } from './parts';

/**
 * Gramy, jak je panel ukáže – na desetiny (`formatGrams`); zlato a šperky pod 0,05 g by ukázaly „0“,
 * takže se nevykreslí (gold.md – Mince 2,4 g, bod 4: zásoba má setiny, rozhraní desetiny).
 */
const shownGrams = (grams: number): number => Math.round(grams * 10) / 10;

const goodLook = (good: keyof typeof TRADE_GOOD_NAMES): { icon: string; name: string } => ({
  icon: TRADE_GOOD_NAMES[good].icon,
  name: TRADE_GOOD_NAMES[good].name,
});

/**
 * Čtyři ikony zboží s čísly a k nim mince a každý druh zbroje, který ves má. Zboží se samými nulami,
 * mince ani zbroj s nulou ani zlato a šperky, které by na desetiny byly 0 (`shownGrams`), se
 * nevykreslí – ves jen s mincemi ukáže jen je.
 */
export function WaresStock({ wares }: { wares: WaresView | null }): ReactElement | null {
  if (!wares) return null;
  const {
    hides,
    furs,
    sheepFurs,
    honeyKg,
    waxKg,
    smallHides,
    coins = 0,
    arms = {},
    goldG = 0,
    jewelleryG = 0,
    jewelleryFactor,
  } = wares;
  const anyWares = hides + furs + honeyKg + waxKg > 0;
  const pieces = [
    {
      id: 'gold',
      icon: 'gold',
      count: shownGrams(goldG),
      text: formatGrams(goldG),
      name: `Zlato – ${formatGrams(goldG)} g`,
    },
    {
      id: 'jewellery',
      icon: 'jewellery',
      count: shownGrams(jewelleryG),
      text: formatGrams(jewelleryG),
      name: `Šperky – zlato a mince za ${jewelleryFactor === undefined ? '' : formatFactor(jewelleryFactor)}násobek, ještě pro ${formatGrams(jewelleryG)} g`,
    },
    { id: COIN_GOOD, count: coins, text: formatInteger(coins), ...goodLook(COIN_GOOD) },
    ...ARMS_GOODS.map((good) => ({
      id: good,
      count: arms[good] ?? 0,
      text: formatInteger(arms[good] ?? 0),
      ...goodLook(good),
    })),
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
      {pieces.map(({ id, icon, name, text }) => (
        <Stat key={id} icon={icon} name={name} testId={`wares-${id}`}>
          {text}
        </Stat>
      ))}
    </div>
  );
}
