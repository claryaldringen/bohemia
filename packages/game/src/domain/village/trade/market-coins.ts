// Mincovní fáze tržního dne (markets.md – Rozhodnutí plánu 4, body 2 a 3 – návrh Clauda): co
// zápočty (market-clearing.ts) nechaly neuspokojené, smí koupit za mince, kdo je má k útratě.
// Dvojice po dvojici – kupují napřed cizí kupci (jejich mince se tak týž den dostanou k ostatním),
// pak ostatní strany, od prodávajících v pořadí stran (hostitel, pak přespolní podle příjezdu –
// Martin: „napřed zboží hostitelské vsi a pak přespolních“), zboží v pořadí `TRADE_GOODS` za cenu ×
// hladinu trhu (`coinPriceOf`). Platba dvojice je celé číslo mincí – součet hodnot nahoru, takže
// nikdo neprodá pod cenou a kupující přeplatí nejvýš minci; součet pod minci se neobchoduje. Zboží
// v kg se dělí, kus je celý, mince přejdou celé a součet plateb přes všechny strany je nula. Zlato
// (gold.md – Pravidla 2; Rozhodnutí plánu 6, body 2 a 3) stojí vždy minci za gram, kupují ho kupci
// a výpravy podle seznamu a hostitel ho nekupcům vymění za své mince (`exchangesGold`); do C a W
// hladiny nepatří – kov za kov není poptávka po zboží. Čistá funkce, vstup nemění.
import type { MarketPrices, MarketTrade, TradeGood, TradeGoods } from '../types';
import { COIN_GOOD, GOLD_GOOD, TRADE_GOODS, isPieceGood } from './goods';
import { coinPriceOf } from './market-prices';

/**
 * Technická mez, ne pravidlo: šum plovoucí čárky – kusy a mince se zaokrouhlují s touto vůlí, takže
 * 176 mincí ÷ 58,67 jsou tři hříbata, i když dělení vyjde 2,999…, a účet 11,000…2 je 11 mincí, ne 12.
 */
const NOISE = 1e-9;
/**
 * Technická mez, ne pravidlo: zlomek zboží v kg do miligramu se neobchoduje (jako v nabídce hostitele,
 * `marketStance`) – kronika by psala „0 kg“.
 */
const NOISE_KG = 1e-6;

/** Strana mincovní fáze (Rozhodnutí plánu 4, bod 2). */
export interface CoinParty {
  key: string;
  /**
   * Mince k útratě – celé; hostitel je má jen s objednanou zbrojí (bod 15) nebo s výměnou zlata
   * (`exchangesGold`), jinak 0 – jen prodává.
   */
  coins: number;
  /** Co strana prodává (bez mincí) a co po zápočtu shání (bez mincí). */
  stock: TradeGoods;
  wants: TradeGoods;
  /** Cizí kupec – kupuje první (Rozhodnutí plánu 4, bod 2). */
  merchant?: true;
  /** Seznam strany se kupuje jen od cizích kupců (objednaná zbroj hostitele – bod 15). */
  fromMerchants?: true;
  /** Hostitel: zlato nekupců vymění 1:1 za mince ze svého měšce, po vlastním seznamu od kupců. */
  exchangesGold?: true;
}

/** Celé mince od kupujícího k prodávajícímu za dvojici a den. */
export interface CoinPayment {
  buyer: string;
  seller: string;
  coins: number;
}

/** Nákupy a platby mincovní fáze v pořadí nákupů. */
export interface CoinClearing {
  trades: MarketTrade[];
  payments: CoinPayment[];
  /**
   * C – mince, které mohly strany dnes utratit, a W – hodnota zboží, které za ně chtěly a bylo na
   * trhu (obojí ze začátku fáze – pro `nextLevel`).
   */
  available: number;
  sought: number;
}

/** Zboží, které se za mince prodává – všechno kromě mincí, v pořadí `TRADE_GOODS`. */
const SOLD_FOR_COINS: readonly TradeGood[] = TRADE_GOODS.filter((good) => good !== COIN_GOOD);

/**
 * Zboží hladiny trhu (C a W) – bez zlata: zlato za mince je kov za kov, ne poptávka po zboží
 * (Rozhodnutí plánu 6, bod 2), takže strana jen se zlatem na seznamu kupující hladiny není.
 */
const LEVEL_GOODS: readonly TradeGood[] = SOLD_FOR_COINS.filter((good) => good !== GOLD_GOOD);

/** Strana během fáze: měšec, co ještě prodá a co ještě shání (kopie – vstup se nemění). */
interface Ledger {
  key: string;
  merchant: boolean;
  fromMerchants: boolean;
  exchangesGold: boolean;
  purse: number;
  stock: TradeGoods;
  wants: TradeGoods;
}

/** Nákup dvojice: zboží v pořadí `TRADE_GOODS` a součet hodnot v mincích. */
interface Basket {
  goods: { good: TradeGood; amount: number }[];
  bill: number;
}

/**
 * Co kupující koupí od prodávajícího: u každého zboží min(chce, má, zbývající měšec ÷ cena), kus jen
 * celý. Nic nemění – nákup pod minci se zruší celý.
 */
function basketOf(buyer: Ledger, seller: Ledger, price: (good: TradeGood) => number): Basket {
  const basket: Basket = { goods: [], bill: 0 };
  for (const good of SOLD_FOR_COINS) {
    const unit = price(good);
    const most = Math.min(
      buyer.wants[good] ?? 0,
      seller.stock[good] ?? 0,
      (buyer.purse - basket.bill) / unit,
    );
    const amount = isPieceGood(good) ? Math.floor(most + NOISE) : most;
    if (!(amount > NOISE_KG)) continue;
    basket.goods.push({ good, amount });
    basket.bill += amount * unit;
  }
  return basket;
}

/**
 * Výměna hostitele (Rozhodnutí plánu 6, bod 3): celé gramy zlata prodávajícího za cenu `unit`
 * (gram za minci), nejvýš za zbývající měšec – seznam ani jiné zboží nehraje roli. Nic nemění.
 */
function exchangeOf(buyer: Ledger, seller: Ledger, unit: number): Basket {
  const amount = Math.floor(Math.min(seller.stock[GOLD_GOOD] ?? 0, buyer.purse / unit) + NOISE);
  return amount > 0
    ? { goods: [{ good: GOLD_GOOD, amount }], bill: amount * unit }
    : { goods: [], bill: 0 };
}

/**
 * Mince proti zboží na začátku fáze (Rozhodnutí plánu 4, bod 3), bez zlata (`LEVEL_GOODS` –
 * Rozhodnutí plánu 6, bod 2). Kupující = strana s mincemi
 * a hodnotou seznamu nad 0: C = Σ min(mince, hodnota seznamu) – seznam strany `fromMerchants` jen
 * do zboží, které kupci na trhu dnes mají (objednat 50 mečů při 2 u kupců = objednat 2) –, W = Σ přes
 * zboží (O + min(součet ostatních seznamů kupujících, součet nabídek všech stran − O)) × cena, kde
 * O = min(součet seznamů stran `fromMerchants`, součet nabídek kupců) – objednaná zbroj se kupuje
 * jen od kupců, takže meče výprav hladinu kvůli objednávce nesníží.
 */
function coinsAgainstGoods(
  parties: readonly CoinParty[],
  price: (good: TradeGood) => number,
): { available: number; sought: number } {
  const sumOf = (list: readonly TradeGoods[], good: TradeGood): number =>
    list.reduce((sum, goods) => sum + Math.max(0, goods[good] ?? 0), 0);
  const merchantStocks = parties.filter((p) => p.merchant).map((p) => p.stock);
  // seznam strany `fromMerchants` (objednávka zbroje) se počítá nejvýš do zboží, které kupci mají
  const listWorth = (p: CoinParty): number =>
    LEVEL_GOODS.reduce((sum, good) => {
      const wanted = sumOf([p.wants], good);
      const count = p.fromMerchants ? Math.min(wanted, sumOf(merchantStocks, good)) : wanted;
      return sum + count * price(good);
    }, 0);
  const buyers = parties.filter((p) => p.coins > 0 && listWorth(p) > 0);
  const orders = buyers.filter((p) => p.fromMerchants).map((p) => p.wants);
  const wants = buyers.filter((p) => !p.fromMerchants).map((p) => p.wants);
  const stocks = parties.map((p) => p.stock);
  // kolik zboží se dnes za mince opravdu dá koupit: objednávka jen z nabídky kupců, ostatní
  // seznamy z toho, co z nabídek všech stran zbude – kus kupce se nepočítá dvakrát
  const matched = (good: TradeGood): number => {
    const ordered = Math.min(sumOf(orders, good), sumOf(merchantStocks, good));
    return ordered + Math.min(sumOf(wants, good), sumOf(stocks, good) - ordered);
  };
  return {
    available: buyers.reduce((sum, p) => sum + Math.min(p.coins, listWorth(p)), 0),
    sought: LEVEL_GOODS.reduce((sum, good) => sum + matched(good) * price(good), 0),
  };
}

/**
 * Nákupy za mince jednoho tržního dne za ceny dne `prices` a hladinu `level` (Rozhodnutí plánu 4,
 * body 2 a 3). Pořadí prodávajících je pořadí stran (hostitel, výpravy a kupci podle příjezdu);
 * kupují napřed kupci (`merchant`) v tomto pořadí, pak ostatní v tomto pořadí – hostitel s objednanou
 * zbrojí (`fromMerchants`, bod 15) jen od kupců a po svém seznamu vymění zlato nekupců za mince, co
 * mu zbyly (`exchangesGold` – Rozhodnutí plánu 6, bod 3), než přijdou na řadu výpravy. Utržené mince
 * smí prodávající týž den utratit, je-li v pořadí kupujících za kupujícím. Obchody i platby jsou
 * v pořadí nákupů, takže žádný měšec neklesne pod 0 ani cestou.
 */
export function coinClearing(
  parties: readonly CoinParty[],
  prices: MarketPrices,
  level: number,
): CoinClearing {
  // ceny dne se počítají jednou
  const table = new Map(SOLD_FOR_COINS.map((good) => [good, coinPriceOf(prices, level, good)]));
  const price = (good: TradeGood): number => table.get(good) ?? coinPriceOf(prices, level, good);
  const ledgers = parties.map((party): Ledger => ({
    key: party.key,
    merchant: party.merchant === true,
    fromMerchants: party.fromMerchants === true,
    exchangesGold: party.exchangesGold === true,
    purse: party.coins,
    stock: { ...party.stock },
    wants: { ...party.wants },
  }));
  const trades: MarketTrade[] = [];
  const payments: CoinPayment[] = [];
  /** Nákup dvojice (mutuje strany); `listed` – ze seznamu kupujícího, výměna zlata na něm není. */
  const settle = (
    buyer: Ledger,
    seller: Ledger,
    { goods, bill }: Basket,
    listed: boolean,
  ): void => {
    if (bill < 1 - NOISE) return;
    // měšec je celý a účet se do něj vejde – min jen proti šumu, aby neklesl pod 0
    const coins = Math.min(buyer.purse, Math.ceil(bill - NOISE));
    buyer.purse -= coins;
    seller.purse += coins;
    payments.push({ buyer: buyer.key, seller: seller.key, coins });
    for (const { good, amount } of goods) {
      if (listed) buyer.wants[good] = (buyer.wants[good] ?? 0) - amount;
      seller.stock[good] = (seller.stock[good] ?? 0) - amount;
      trades.push({ seller: seller.key, buyer: buyer.key, good, amount });
    }
  };
  const buyers = [...ledgers.filter((l) => l.merchant), ...ledgers.filter((l) => !l.merchant)];
  for (const buyer of buyers) {
    if (buyer.purse < 1 - NOISE) continue; // měšec pod minci nic nekoupí
    for (const seller of ledgers) {
      if (seller === buyer || (buyer.fromMerchants && !seller.merchant)) continue;
      settle(buyer, seller, basketOf(buyer, seller, price), true);
    }
    if (!buyer.exchangesGold) continue;
    for (const seller of ledgers) {
      if (seller !== buyer && !seller.merchant) {
        settle(buyer, seller, exchangeOf(buyer, seller, price(GOLD_GOOD)), false);
      }
    }
  }
  return { trades, payments, ...coinsAgainstGoods(parties, price) };
}
