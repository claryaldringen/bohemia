// Ceny trhu v mincovní míře (markets.md – Pravidla 4; Rozhodnutí plánu 2, bod 3 – návrh Clauda):
// každé zboží má na každém trhu cenu v mincích za kg, kus nebo m³, která se po každém tržním dni
// posune podle poptávky a nabídky; trh si pamatuje poslední cenu (`MarketPrices`). Za mince se platí
// cena × hladina trhu (`coinPriceOf`), kterou po mincovní fázi posunou mince proti zboží
// (`nextLevel` – Rozhodnutí plánu 4, bod 3); zápočet na hladině nezávisí.
import { MARKET, TRADE_GOOD_VALUES } from '../rules';
import type { MarketPrices, TradeGood, TradeGoods } from '../types';
import { COIN_GOOD, TRADE_GOODS } from './goods';

/** Výchozí cena zboží v mincích: hodnota v kg obilí ÷ kurz `MARKET.grainKgPerCoin` kg za minci. */
export function initialPrice(good: TradeGood): number {
  return TRADE_GOOD_VALUES[good].valueKg / MARKET.grainKgPerCoin;
}

/** Cena zboží na trhu – zapamatovaná, jinak výchozí. */
export function priceOf(prices: MarketPrices | undefined, good: TradeGood): number {
  return prices?.[good] ?? initialPrice(good);
}

/** Cena zboží na trhu v mincích: relativní cena × hladina trhu (Rozhodnutí plánu 4, bod 3). */
export function coinPriceOf(
  prices: MarketPrices | undefined,
  level: number,
  good: TradeGood,
): number {
  return priceOf(prices, good) * level;
}

/**
 * Hladina trhu po mincovní fázi (Rozhodnutí plánu 4, bod 3): level × (1 + `MARKET.priceStep` ×
 * (C − W) / (C + W)), nejméně 1. C = mince, které mohly strany dnes utratit (`available`), W =
 * hodnota zboží, které za ně chtěly a na trhu bylo (`sought`) – víc mincí než zboží ceny v mincích
 * zvedne (inflace), méně je sníží k výchozím. W = 0 hladinu nemění – jinak by na trhu, který kupcům
 * nemá co prodat, rostla bez konce.
 */
export function nextLevel(level: number, available: number, sought: number): number {
  if (!(sought > 0)) return level;
  const step = (MARKET.priceStep * (available - sought)) / (available + sought);
  return Math.max(1, level * (1 + step));
}

/**
 * Ceny po tržním dni (nový objekt): P' = P × (1 + `MARKET.priceStep` × (D − S) / (D + S)), D =
 * kolik se zboží žádalo (součet seznamů stran), S = kolik se ho nabízelo (součet nabídek) – víc
 * poptávky dráž, víc nabídky levněji, za den nejvýš o `priceStep`; cena neklesne pod výchozí
 * (`initialPrice`, Martin 23. 11. 2026 – Spodní cena) a nahoru je bez meze (Horní cena). Zboží bez
 * nabídky i poptávky cenu nemění. Mince cenu nemají – kolik jich je proti zboží, nese hladina trhu
 * (`nextLevel`; Rozhodnutí plánu 4, bod 1).
 */
export function nextPrices(
  prices: MarketPrices,
  offered: TradeGoods,
  wanted: TradeGoods,
): MarketPrices {
  const next: MarketPrices = { ...prices };
  for (const good of TRADE_GOODS) {
    if (good === COIN_GOOD) continue;
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
