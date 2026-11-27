// Kurz cen v mincích (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 3; markets.md – Hodnota mince):
// ceny, které si trh vsi, zprávy o trzích a výsledky výprav pamatují, jsou v mincích po
// `MARKET.grainKgPerCoin` kg obilí. Každé takové místo nese kurz, ve kterém ceny zapsalo (`coinKg`);
// chybí-li, jsou z doby 15 kg za minci (`MARKET.legacyGrainKgPerCoin`) a převod `coin-rate` je jednou
// přepočte – mince 90 kg je šestkrát cennější, ceny se vydělí šesti. Počty mincí (ves, výpravy, pošta,
// kupci, objednávky, kronika) se nepřevádějí – mince je mince. Značka je u cen, ne u vsi: ves bez trhu
// a bez zpráv s cenami se nezmění vůbec (zlatý otisk vsi) a výsledek výpravy ze starší schránky se
// přepočte až při návratu (`newsPricesOf`).
import { MARKET } from '../rules/rules-market';
import type {
  MarketPrices,
  MarketResult,
  VillageMarket,
  VillageNews,
  VillageState,
} from '../types';

/** Trh nové vsi – bez cen (výchozí) a s kurzem, ve kterém bude ceny zapisovat. */
export function newMarket(): VillageMarket {
  return { prices: {}, coinKg: MARKET.grainKgPerCoin, visitors: [], nextOrder: 1, arrivals: [] };
}

/** Ceny zapsané v kurzu `coinKg` (chybí = 15 kg za minci) v dnešním kurzu – kopie; týž kurz = týž objekt. */
function atCoinRate(prices: MarketPrices, coinKg: number | undefined): MarketPrices {
  const from = coinKg ?? MARKET.legacyGrainKgPerCoin;
  if (from === MARKET.grainKgPerCoin) return prices;
  const out: MarketPrices = {};
  for (const [good, price] of Object.entries(prices) as [keyof MarketPrices, number][]) {
    out[good] = (price * from) / MARKET.grainKgPerCoin;
  }
  return out;
}

/** Nese místo s cenami starší kurz? */
function isOld(holder: { coinKg?: number }): boolean {
  return holder.coinKg !== MARKET.grainKgPerCoin;
}

/**
 * Ceny výsledku výpravy pro zprávu o trhu (`rememberNews`) v dnešním kurzu i se značkou; výsledek bez
 * cen nic. Starší výsledek bez kurzu (schránka vsi ho mohla držet přes převod) se přepočte tady.
 */
export function newsPricesOf(result: MarketResult): Pick<VillageNews, 'prices' | 'coinKg'> {
  if (!result.prices) return {};
  return { prices: atCoinRate(result.prices, result.coinKg), coinKg: MARKET.grainKgPerCoin };
}

/**
 * Převod `coin-rate` (2026-11-27): ceny trhu vsi (`VillageMarket.prices`) a zpráv o trzích
 * (`VillageNews.prices`) bez dnešního kurzu se přepočtou (÷ 6) a dostanou značku `coinKg`; hladina,
 * mince a zprávy bez cen zůstanou. Ves, která nic takového nemá, vrací týž objekt – podruhé převod nic
 * nezmění. Vstupní stav nemění.
 */
export function withCoinRate(state: VillageState): VillageState {
  const market = state.market && isOld(state.market) ? state.market : null;
  const news = state.news?.some((n) => n.prices !== undefined && isOld(n)) ? state.news : null;
  if (!market && !news) return state;
  return {
    ...state,
    ...(market
      ? {
          market: {
            ...market,
            prices: atCoinRate(market.prices, market.coinKg),
            coinKg: MARKET.grainKgPerCoin,
          },
        }
      : {}),
    ...(news
      ? {
          news: news.map((n) =>
            n.prices !== undefined && isOld(n)
              ? { ...n, prices: atCoinRate(n.prices, n.coinKg), coinKg: MARKET.grainKgPerCoin }
              : n,
          ),
        }
      : {}),
  };
}
