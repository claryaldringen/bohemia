// Mincovní fáze tržního dne (markets.md – Rozhodnutí plánu 4, body 2 a 3 – návrh Clauda): co
// zápočty (market-clearing.ts) nechaly neuspokojené, smí koupit za mince, kdo je má k útratě.
// Dvojice po dvojici – kupují napřed cizí kupci z měšce bez dna (markets.md – Měšec kupců bez dna;
// mince od nich se tak týž den dostanou k ostatním), pak ostatní strany, od prodávajících v pořadí stran (hostitel, pak přespolní podle příjezdu –
// Martin: „napřed zboží hostitelské vsi a pak přespolních“), zboží v pořadí `TRADE_GOODS` za cenu ×
// hladinu trhu (`coinPriceOf`). Platba dvojice je celé číslo mincí – součet hodnot nahoru, takže
// nikdo neprodá pod cenou a kupující přeplatí nejvýš minci; součet pod minci se neobchoduje. Zboží
// v kg se dělí, kus je celý, mince přejdou celé a součet plateb přes všechny strany je nula. Zlato
// (gold.md – Pravidla 2; Rozhodnutí plánu 6, body 2 a 3) stojí vždy 2,4 g za minci (`goldCoinPrice`)
// a mění se jen po celých mincích (Mince 2,4 g zlata za 90 kg obilí, bod 4): za k mincí 2,4·k g, od
// šperkaře prodávajícího 1,6·k g, zbytek pod minci zůstane prodávajícímu a platba za zlato je vždy
// celé číslo mincí – zaokrouhlení nahoru u ostatního zboží minci za zlato nepřidá. Kupují ho kupci
// a výpravy podle seznamu a hostitel ho nekupcům vymění za své mince (`exchangesGold`); do C a W
// hladiny nepatří – kov za kov není poptávka po zboží. Šperkař (gold.md – Pravidla 4; Rozhodnutí
// plánu 6, bod 5) prodávajícímu zdraží zlato a kupujícímu zlevní platbu za ostatní zboží, objednanou
// zbroj hostitel doplatí zlatem (bod 3). Čistá funkce, vstup nemění.
import { GOLD, JEWELLER } from '../rules';
import type { MarketPrices, MarketTrade, TradeGood, TradeGoods } from '../types';
import { COIN_GOOD, GOLD_GOOD, TRADE_GOODS, isPieceGood } from './goods';
import { coinPriceOf, coinsGold, goldCoins, roundGold } from './market-prices';

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
   * (`exchangesGold`), jinak 0 – jen prodává. Cizí kupec platí z měšce bez dna (`Infinity` – jen
   * v paměti fáze, ve stavu kupec mince nemá; markets.md – Měšec kupců bez dna, bod 1).
   */
  coins: number;
  /** Co strana prodává (bez mincí) a co po zápočtu shání (bez mincí). */
  stock: TradeGoods;
  wants: TradeGoods;
  /**
   * Cizí kupec – kupuje první (Rozhodnutí plánu 4, bod 2) a do hladiny nepatří (Měšec kupců bez dna,
   * bod 4).
   */
  merchant?: true;
  /** Seznam strany se kupuje jen od cizích kupců (objednaná zbroj hostitele – bod 15). */
  fromMerchants?: true;
  /**
   * Hostitel: zlato nekupců vymění za mince ze svého měšce (2,4 g za minci, po celých mincích), po
   * vlastním seznamu od kupců.
   */
  exchangesGold?: true;
  /** Kapacita šperkaře strany (g): zlato prodá dráž, mince i zlato platí víc (gold.md – Pravidla 4). */
  jewelleryG?: number;
  /**
   * Zlato (g), kterým strana doplatí po mincích – po celých mincích, 2,4 g za minci (`coinsGold`);
   * jen hostitel v kole zbroje. Platí se z nabídky `stock.gold`: co strana zlata prodá, tím už neplatí.
   */
  goldPurse?: number;
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
  /** Kolik kapacity šperkaře každá strana spotřebovala (g; klíč strany), jen kladné; nikdo – chybí. */
  jewelleryUsed?: Readonly<Record<string, number>>;
}

/** Zboží, které se za mince prodává – všechno kromě mincí, v pořadí `TRADE_GOODS`. */
const SOLD_FOR_COINS: readonly TradeGood[] = TRADE_GOODS.filter((good) => good !== COIN_GOOD);

/**
 * Zboží hladiny trhu (C a W) – bez zlata: zlato za mince je kov za kov, ne poptávka po zboží
 * (Rozhodnutí plánu 6, bod 2), takže strana jen se zlatem na seznamu kupující hladiny není.
 */
const LEVEL_GOODS: readonly TradeGood[] = SOLD_FOR_COINS.filter((good) => good !== GOLD_GOOD);

/**
 * Strana během fáze: měšec, zlato k doplacení, zbývající a spotřebovaná kapacita šperkaře, co ještě
 * prodá a co ještě shání (kopie – vstup se nemění).
 */
interface Ledger {
  key: string;
  merchant: boolean;
  fromMerchants: boolean;
  exchangesGold: boolean;
  purse: number;
  goldPurse: number;
  jewellery: number;
  used: number;
  stock: TradeGoods;
  wants: TradeGoods;
}

/**
 * Nákup dvojice: zboží v pořadí `TRADE_GOODS`, součet hodnot v mincích (`bill`, zlato za cenu
 * dvojice), z něj účet za zlato a za ostatní zboží a gramy zlata za cenu se šperkařem prodávajícího.
 */
interface Basket {
  goods: { good: TradeGood; amount: number }[];
  bill: number;
  goldBill: number;
  otherBill: number;
  dearG: number;
}

/** Prázdný nákup. */
function emptyBasket(): Basket {
  return { goods: [], bill: 0, goldBill: 0, otherBill: 0, dearG: 0 };
}

/**
 * Kolik mincí zaplatí kupující s kapacitou `budget` (g) za zboží (ne zlato) v hodnotě `bill` (gold.md –
 * Pravidla 4; Rozhodnutí plánu 6, bod 5; Mince 2,4 g, bod 6): mince do kapacity počítá po
 * `GOLD.coinGrams` gramech – prvních `budget` ÷ 2,4 mincí platí za `JEWELLER.factor`, zbytek 1:1
 * (kapacita 1,5 g = 0,625 mince). `used` – kolik kapacity (g) platba spotřebuje, min(mince × 2,4,
 * `budget`).
 */
export function jewelledPayment(bill: number, budget: number): { coins: number; used: number } {
  const cap = budget / GOLD.coinGrams;
  const coins =
    bill <= JEWELLER.factor * cap ? bill / JEWELLER.factor : bill - (JEWELLER.factor - 1) * cap;
  return { coins, used: Math.min(coins * GOLD.coinGrams, budget) };
}

/** Hodnota zboží (ne zlata), kterou `coins` mincí zaplatí kupující s kapacitou `budget` (g). */
function jewelledWorth(coins: number, budget: number): number {
  return coins + (JEWELLER.factor - 1) * Math.min(coins, budget / GOLD.coinGrams);
}

/**
 * Gramy zlata za `coins` mincí od prodávajícího s kapacitou `dear` (g): prvních `dear` gramů za
 * `JEWELLER.factor` × `unit`, další za `unit` (cena zlata).
 */
function goldForCoins(coins: number, unit: number, dear: number): number {
  const high = JEWELLER.factor * unit;
  return coins <= high * dear ? coins / high : dear + (coins - high * dear) / unit;
}

/** Hodnota `grams` gramů zlata v mincích od prodávajícího s kapacitou `dear` (g) – obrácené `goldForCoins`. */
function goldWorth(grams: number, unit: number, dear: number): number {
  const high = Math.min(grams, dear);
  return high * JEWELLER.factor * unit + (grams - high) * unit;
}

/**
 * Měšec kupujícího i se zlatem k doplacení – celé mince, na které stačí zlato, které mu v nabídce
 * zbylo (`goldCoins`).
 */
function meansOf(ledger: Ledger): number {
  const gold = Math.min(ledger.goldPurse, ledger.stock[GOLD_GOOD] ?? 0);
  return ledger.purse + (gold > 0 ? goldCoins(gold) : 0);
}

/**
 * Co kupující koupí od prodávajícího: u každého zboží min(chce, má, kolik se vejde do měšce), kus
 * jen celý, zlato po celých mincích (gramy na setiny, `coinsGold`) – účet za zlato je celé číslo
 * mincí. Bez šperkaře se vejde zbývající měšec ÷ cena. Šperkař prodávajícího zdraží zlato –
 * prvních tolik gramů, kolik mu zbývá kapacity, stojí `JEWELLER.factor` × cenu (kupující se
 * `exchangesGold` platí vždy cenu zlata). Kupující se šperkařem platí zlato bez výhody a ostatní
 * zboží `jewelledPayment` – platba za košík (účet za zlato + `jewelledPayment(ostatní).coins`) tak
 * měšec nikdy nepřeroste, ať je zlato v pořadí zboží kdekoli: zboží mimo zlato se vejde do
 * `jewelledWorth(měšec − účet za zlato)`, zlato do mincí, které zbudou po platbě za ostatní zboží.
 * Nic nemění – nákup pod minci se zruší celý.
 */
function basketOf(buyer: Ledger, seller: Ledger, price: (good: TradeGood) => number): Basket {
  const basket = emptyBasket();
  const means = meansOf(buyer);
  const dear = buyer.exchangesGold ? 0 : seller.jewellery;
  for (const good of SOLD_FOR_COINS) {
    const unit = price(good);
    const gold = good === GOLD_GOOD;
    // kolik se zboží vejde do měšce
    let room: number;
    if (buyer.jewellery > 0 && gold) {
      room = means - jewelledPayment(basket.otherBill, buyer.jewellery).coins;
    } else if (buyer.jewellery > 0) {
      room = jewelledWorth(means - basket.goldBill, buyer.jewellery) - basket.otherBill;
    } else {
      room = means - basket.bill;
    }
    const most = Math.min(buyer.wants[good] ?? 0, seller.stock[good] ?? 0);
    if (gold) {
      // celé mince, na které stačí měšec i zlato (Mince 2,4 g, bod 4) – zbytek pod minci zůstane
      const coins = Math.floor(Math.min(room, goldWorth(most, unit, dear)) + NOISE);
      if (!(coins > 0)) continue;
      const amount = Math.min(most, roundGold(goldForCoins(coins, unit, dear)));
      basket.goods.push({ good, amount });
      basket.dearG = Math.min(amount, dear);
      basket.bill += coins;
      basket.goldBill += coins;
      continue;
    }
    const fits = Math.min(most, room / unit);
    const amount = isPieceGood(good) ? Math.floor(fits + NOISE) : fits;
    if (!(amount > NOISE_KG)) continue;
    basket.goods.push({ good, amount });
    basket.bill += amount * unit;
    basket.otherBill += amount * unit;
  }
  return basket;
}

/**
 * Výměna hostitele (Rozhodnutí plánu 6, bod 3; Mince 2,4 g, bod 4): zlato prodávajícího za cenu
 * `unit` (2,4 g za minci) po celých mincích, nejvýš za zbývající měšec – seznam, jiné zboží ani
 * šperkař nehrají roli (kov za kov); zbytek pod minci zůstane prodávajícímu. Nic nemění.
 */
function exchangeOf(buyer: Ledger, seller: Ledger, unit: number): Basket {
  const stock = seller.stock[GOLD_GOOD] ?? 0;
  const coins = Math.floor(Math.min(stock * unit, buyer.purse) + NOISE);
  if (!(coins > 0)) return emptyBasket();
  const amount = Math.min(stock, roundGold(coins / unit));
  return {
    goods: [{ good: GOLD_GOOD, amount }],
    bill: coins,
    goldBill: coins,
    otherBill: 0,
    dearG: 0,
  };
}

/**
 * Mince proti zboží na začátku fáze (Rozhodnutí plánu 4, bod 3), bez zlata (`LEVEL_GOODS` –
 * Rozhodnutí plánu 6, bod 2). Kupující = strana s mincemi a hodnotou seznamu nad 0 kromě cizích
 * kupců – jejich měšec bez dna ani seznam se nepočítají, jinak by hladinu hnali nahoru bez konce
 * (markets.md – Měšec kupců bez dna, bod 4); jejich zboží v nabídce zůstává. C = Σ min(mince,
 * hodnota seznamu) – seznam strany `fromMerchants` jen do zboží, které kupci na trhu dnes mají
 * (objednat 50 mečů při 2 u kupců = objednat 2) –, W = Σ přes zboží (O + min(součet ostatních seznamů
 * kupujících, součet nabídek všech stran − O)) × cena, kde O = min(součet seznamů stran
 * `fromMerchants`, součet nabídek kupců) – objednaná zbroj se kupuje jen od kupců, takže meče výprav
 * hladinu kvůli objednávce nesníží.
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
  const buyers = parties.filter((p) => !p.merchant && p.coins > 0 && listWorth(p) > 0);
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
 * v pořadí nákupů, takže žádný měšec neklesne pod 0 ani cestou. Kapacita šperkaře strany
 * (`jewelleryG`) je jedna pro celou fázi – prodej zlata i placení (gold.md – Pravidla 4); kolik jí
 * která strana spotřebovala, vrací `jewelleryUsed`.
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
    goldPurse: party.goldPurse ?? 0,
    jewellery: party.jewelleryG ?? 0,
    used: 0,
    stock: { ...party.stock },
    wants: { ...party.wants },
  }));
  const trades: MarketTrade[] = [];
  const payments: CoinPayment[] = [];
  /** Ubere straně kapacitu šperkaře (mutuje). */
  const spend = (ledger: Ledger, grams: number): void => {
    if (!(grams > 0)) return;
    ledger.jewellery -= grams;
    ledger.used += grams;
  };
  /**
   * Nákup dvojice (mutuje strany); `listed` – ze seznamu kupujícího, výměna zlata na něm není.
   * Platba je celé číslo mincí nahoru – kupující se šperkařem platí zlato bez výhody a ostatní zboží
   * `jewelledPayment`. Napřed mince, zbytek zlatem (`goldPurse`) po 2,4 g za minci (`coinsGold`),
   * které prodávající odveze jako koupené. Kapacitu prodávajícího ubere zlato prodané dráž,
   * kupujícího kov, který za zboží mimo zlato opravdu odešel (i s přeplatkem do celé mince, mince po
   * `GOLD.coinGrams` g), nejvýš co mu jí zbývá.
   */
  const settle = (buyer: Ledger, seller: Ledger, basket: Basket, listed: boolean): void => {
    const { goods, bill, goldBill, otherBill, dearG } = basket;
    if (bill < 1 - NOISE) return;
    const due =
      buyer.jewellery > 0 ? goldBill + jewelledPayment(otherBill, buyer.jewellery).coins : bill;
    // měšec je celý a košík se do něj vejde (`basketOf`) – min jen proti šumu, aby neklesl pod 0
    const paid = Math.min(meansOf(buyer), Math.ceil(due - NOISE));
    const coins = Math.min(buyer.purse, paid);
    if (coins > 0) {
      buyer.purse -= coins;
      seller.purse += coins;
      payments.push({ buyer: buyer.key, seller: seller.key, coins });
    }
    for (const { good, amount } of goods) {
      if (listed) buyer.wants[good] = (buyer.wants[good] ?? 0) - amount;
      seller.stock[good] = (seller.stock[good] ?? 0) - amount;
      trades.push({ seller: seller.key, buyer: buyer.key, good, amount });
    }
    // doplatek zlatem – celé mince po 2,4 g (`meansOf` je na ně spočítal)
    const goldPaid = paid - coins;
    if (goldPaid > 0) {
      const grams = Math.min(buyer.stock[GOLD_GOOD] ?? 0, coinsGold(goldPaid));
      buyer.goldPurse -= grams;
      buyer.stock[GOLD_GOOD] = (buyer.stock[GOLD_GOOD] ?? 0) - grams;
      trades.push({ seller: buyer.key, buyer: seller.key, good: GOLD_GOOD, amount: grams });
    }
    spend(seller, dearG);
    if (otherBill > 0) {
      spend(buyer, Math.min(buyer.jewellery, (paid - goldBill) * GOLD.coinGrams));
    }
  };
  const buyers = [...ledgers.filter((l) => l.merchant), ...ledgers.filter((l) => !l.merchant)];
  for (const buyer of buyers) {
    if (meansOf(buyer) < 1 - NOISE) continue; // měšec pod minci nic nekoupí
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
  const used = ledgers.filter((l) => l.used > 0);
  return {
    trades,
    payments,
    ...coinsAgainstGoods(parties, price),
    ...(used.length > 0
      ? { jewelleryUsed: Object.fromEntries(used.map((l) => [l.key, l.used])) }
      : {}),
  };
}
