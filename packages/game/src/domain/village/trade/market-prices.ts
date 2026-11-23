// Ceny trhu v mincovní míře (markets.md – Pravidla 4; Rozhodnutí plánu 2, bod 3 – návrh Clauda):
// každé zboží má na každém trhu cenu v mincích za kg, kus nebo m³, která se po každém tržním dni
// posune podle poptávky a nabídky; trh si pamatuje poslední cenu (`MarketPrices`).
import { MARKET, TRADE_GOOD_VALUES } from '../rules';
import type { MarketPrices, TradeGood, TradeGoods } from '../types';
import { TRADE_GOODS } from './goods';

/** Výchozí cena zboží v mincích: hodnota v kg obilí ÷ kurz `MARKET.grainKgPerCoin` kg za minci. */
export function initialPrice(good: TradeGood): number {
  return TRADE_GOOD_VALUES[good].valueKg / MARKET.grainKgPerCoin;
}

/** Cena zboží na trhu – zapamatovaná, jinak výchozí. */
export function priceOf(prices: MarketPrices | undefined, good: TradeGood): number {
  return prices?.[good] ?? initialPrice(good);
}

/**
 * Ceny po tržním dni (nový objekt): P' = P × (1 + `MARKET.priceStep` × (D − S) / (D + S)), D =
 * kolik se zboží žádalo (součet seznamů stran), S = kolik se ho nabízelo (součet nabídek) – víc
 * poptávky dráž, víc nabídky levněji, za den nejvýš o `priceStep` a nikdy na nulu. Zboží bez
 * nabídky i poptávky cenu nemění.
 */
export function nextPrices(
  prices: MarketPrices,
  offered: TradeGoods,
  wanted: TradeGoods,
): MarketPrices {
  const next: MarketPrices = { ...prices };
  for (const good of TRADE_GOODS) {
    const floor = initialPrice(good);
    if (next[good] !== undefined && next[good] < floor) next[good] = floor;
    const demand = Math.max(0, wanted[good] ?? 0);
    const supply = Math.max(0, offered[good] ?? 0);
    if (!(demand + supply > 0)) continue;
    next[good] = Math.max(
      floor,
      priceOf(next, good) * (1 + (MARKET.priceStep * (demand - supply)) / (demand + supply)),
    );
  }
  return next;
}
