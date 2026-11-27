// Ceny trhu v mincovní míře (markets.md – Pravidla 4; Rozhodnutí plánu 2, bod 3 – návrh Clauda):
// každé zboží má na každém trhu cenu v mincích za kg, kus nebo m³, která se po každém tržním dni
// posune podle poptávky a nabídky; trh si pamatuje poslední cenu (`MarketPrices`). Za mince se platí
// cena × hladina trhu (`coinPriceOf`), kterou po mincovní fázi posunou mince proti zboží
// (`nextLevel` – Rozhodnutí plánu 4, bod 3); zápočet na hladině nezávisí.
import { GOLD, MARKET, TRADE_GOOD_VALUES } from '../rules';
import type { MarketPrices, TradeGood, TradeGoods } from '../types';
import { COIN_GOOD, GOLD_GOOD, TRADE_GOODS } from './goods';

/**
 * Technická mez, ne pravidlo: cena je nejvýš tolikrát výchozí. Nahoru jsou ceny bez meze (Martin
 * 23. 11. 2026: „Nechat bez stropu“), po tisících tržních dnů jen s poptávkou by ale cena přerostla
 * rozsah čísla do `Infinity`. To JSON uloží jako `null` a po načtení je cena zase výchozí, takže by
 * ves dopočítaná po kouscích (uložená mezi nimi) měla jiné ceny než dopočítaná vcelku.
 */
const MAX_PRICE_RATIO = 1e9;

/** Výchozí cena zboží v mincích: hodnota v kg obilí ÷ kurz `MARKET.grainKgPerCoin` kg za minci. */
export function initialPrice(good: TradeGood): number {
  return TRADE_GOOD_VALUES[good].valueKg / MARKET.grainKgPerCoin;
}

/** Cena zboží na trhu – zapamatovaná, jinak výchozí. */
export function priceOf(prices: MarketPrices | undefined, good: TradeGood): number {
  return prices?.[good] ?? initialPrice(good);
}

/** Pevná cena gramu zlata v mincích (1 ÷ `GOLD.coinGrams`) – nezávisí na trhu ani hladině. */
export function goldCoinPrice(): number {
  return 1 / GOLD.coinGrams;
}

/**
 * Technická mez, ne pravidlo: šum plovoucí čárky u celých mincí ze zlata – 4,8 g ÷ 2,4 g jsou dvě
 * mince, i když dělení vyjde 1,999….
 */
const COIN_NOISE = 1e-9;

/**
 * Gramy zlata na setiny gramu (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 4) – jediné místo,
 * které zlato zaokrouhluje: zásoba vsi (`addGood`), rýžování, mince ze zlata a obchody. Šum plovoucí
 * čárky (2,4 + 2,4 + 2,4 = 7,199…) se tak nehromadí; setina gramu je pod rozlišením hry.
 */
export function roundGold(grams: number): number {
  return Math.round(grams * 100) / 100;
}

/**
 * Kolik celých mincí zlato `grams` stojí za pevnou cenu (`goldCoinPrice`; bod 4): zlato se za mince
 * mění jen po celých mincích, zbytek pod minci zůstane prodávajícímu. Nikdy záporné.
 */
export function goldCoins(grams: number): number {
  return Math.max(0, Math.floor(grams * goldCoinPrice() + COIN_NOISE));
}

/** Gramy zlata za `coins` celých mincí – 2,4 g za minci (`goldCoinPrice`), na setiny. */
export function coinsGold(coins: number): number {
  return roundGold(coins / goldCoinPrice());
}

/** Cena zboží na trhu v mincích: relativní cena × hladina trhu (Rozhodnutí plánu 4, bod 3). */
export function coinPriceOf(
  prices: MarketPrices | undefined,
  level: number,
  good: TradeGood,
): number {
  if (good === GOLD_GOOD) return goldCoinPrice();
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

/** Cena v mezích: nejméně výchozí (Martin 23. 11. 2026 – Spodní cena), nahoře jen technická mez. */
function boundedPrice(good: TradeGood, price: number): number {
  const floor = initialPrice(good);
  return Math.min(floor * MAX_PRICE_RATIO, Math.max(floor, price));
}

/**
 * Ceny po tržním dni (nový objekt): P' = P × (1 + `MARKET.priceStep` × (D − S) / (D + S)), D =
 * kolik se zboží žádalo (součet seznamů stran), S = kolik se ho nabízelo (součet nabídek) – víc
 * poptávky dráž, víc nabídky levněji, za den nejvýš o `priceStep`; cena neklesne pod výchozí
 * (`initialPrice`, Martin 23. 11. 2026 – Spodní cena) a nahoru je bez meze (Horní cena; jen
 * technická `MAX_PRICE_RATIO`). Zboží bez nabídky i poptávky cenu nemění. Mince cenu nemají – kolik
 * jich je proti zboží, nese hladina trhu (`nextLevel`; Rozhodnutí plánu 4, bod 1). Co do D a S patří
 * v den cizích kupců, určuje `priceTotals` (market.ts).
 */
export function nextPrices(
  prices: MarketPrices,
  offered: TradeGoods,
  wanted: TradeGoods,
): MarketPrices {
  const next: MarketPrices = { ...prices };
  for (const good of TRADE_GOODS) {
    if (good === COIN_GOOD || good === GOLD_GOOD) continue;
    // uložená cena mimo meze (starší stav pod dnem) se vrátí na ně
    if (next[good] !== undefined) next[good] = boundedPrice(good, next[good]);
    const demand = Math.max(0, wanted[good] ?? 0);
    const supply = Math.max(0, offered[good] ?? 0);
    if (!(demand + supply > 0)) continue;
    const step = (MARKET.priceStep * (demand - supply)) / (demand + supply);
    next[good] = boundedPrice(good, priceOf(next, good) * (1 + step));
  }
  return next;
}
