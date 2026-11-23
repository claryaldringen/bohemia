// Zápočet tržního dne (markets.md – Pravidla 5, Martin 22. 11. 2026: „ANo, přesně tak“;
// Rozhodnutí plánu 2, bod 4): vyrovnaný barter v mincovní míře – každá strana (hostitel, výpravy
// podle příjezdu) prodá přesně za tolik, za kolik koupí. Strana bez protějšku nic neprodá ani
// nekoupí, dluh ani přeplatek nevzniká a nic se nepřenáší do dalšího dne. Kus (kráva, kůň, kláda,
// kůže, m³ kamene) se prodá jen celý, kg se dělí libovolně.
//
// Algoritmus (návrh Clauda – testy ho neurčují):
// 1. strop V každé strany = min(hodnota celé nabídky, hodnota celého seznamu) v cenách dne;
// 2. kolo: strana smí prodat nejvýš za V a nakoupit nejvýš za V (rozpočet); kupci v pořadí stran,
//    u každého zboží svého seznamu v pořadí `TRADE_GOODS` koupí min(zbývá na seznamu, co ostatní
//    strany téhož kruhu ještě smějí prodat, zbývá rozpočtu ÷ cena) – od prodávajících v pořadí
//    stran (napřed hostitel, pak výpravy podle příjezdu – Martin);
// 3. |utrženo − utraceno| ≤ EPS u všech stran → hotovo;
// 4. jinak V = min(V, utrženo, utraceno) u každé strany a nové kolo od nuly – stropy jen klesají,
//    a když se nehnou, je každá strana vyrovnaná;
// 5. strana nevyrovnaná po posledním kole ten den neobchoduje: vyřadí se (z nevyrovnaných ta
//    poslední v pořadí) a počítá se znovu bez ní.
// Proti zadání plánu dvě změny (změřeno na náhodných trzích – víc trhů obchoduje, víc zboží se
// vymění, méně kol): strop omezuje, za kolik strana prodá, ne které zboží – nabídka oříznutá na V
// předem v pořadí `TRADE_GOODS` by nechala obilí hostitele vytlačit z trhu jeho klády a dobytek,
// o které kupci stojí; a kupující koupí jen od strany ze svého kruhu (`tradeCircles`) – prodej, za
// který se hodnota nemůže vrátit, by prodávajícího nechal nevyrovnaného a stropy by klesaly kolo
// po kole o kousek.
import type { MarketClearing, MarketParty, MarketPrices, MarketTrade, TradeGoods } from '../types';
import { TRADE_GOODS, isPieceGood } from './goods';
import { priceOf } from './market-prices';

// Technické meze algoritmu, ne pravidla hry (proto ne v rules*.ts):
/** Strana je vyrovnaná, když se utrženo a utraceno liší nejvýš o tolik mincí. */
const EPS = 1e-6;
/** Šum plovoucí čárky: kusy se počítají ⌊x + NOISE⌋, zbytek do NOISE × původní hodnoty je nula. */
const NOISE = 1e-9;
/** Nejvýš tolik kol zápočtu – strana nevyrovnaná po posledním kole ten den neobchoduje. */
const CLEARING_ROUNDS = 32;

/** Strana v kole zápočtu: strop kola, co ještě prodá, za kolik smí prodat a koupit, utrženo. */
interface Ledger {
  party: MarketParty;
  /** Strop kola V (mince). */
  cap: number;
  stock: TradeGoods;
  sellLeft: number;
  budget: number;
  earned: number;
  spent: number;
}

/** Kolo zápočtu: obchody v pořadí přidělení a účty stran (v pořadí stran). */
interface ClearingRound {
  trades: MarketTrade[];
  ledgers: Ledger[];
}

/** Součty zboží (jen kladná množství, v pořadí `TRADE_GOODS`). */
function totalGoods(list: readonly TradeGoods[]): TradeGoods {
  const total: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    let sum = 0;
    for (const goods of list) {
      const amount = goods[good] ?? 0;
      if (amount > 0) sum += amount;
    }
    if (sum > 0) total[good] = sum;
  }
  return total;
}

/** Hodnota zboží v mincích za ceny dne. */
function worth(goods: TradeGoods, prices: MarketPrices): number {
  let sum = 0;
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (amount > 0) sum += amount * priceOf(prices, good);
  }
  return sum;
}

/** Kusové zboží jen po celých kusech, kg přesně. */
function whole(amount: number, piece: boolean): number {
  return piece ? Math.floor(amount + NOISE) : amount;
}

/** a − b; zbytek, který je jen šum plovoucí čárky (do NOISE × a), je nula. */
function minus(a: number, b: number): number {
  const rest = a - b;
  return rest > a * NOISE ? rest : 0;
}

/**
 * Kruhy obchodu (návrh Clauda): `[b][s]` – kupující b smí koupit od prodávajícího s. Jen ve stejném
 * kruhu – s (přímo nebo přes další strany) kupuje od b, takže se mu hodnota může vrátit; jinak by
 * prodávající zůstal nevyrovnaný. Silně souvislé komponenty grafu „kupuje od“ (chce zboží, které
 * druhá strana nabízí) mezi stranami s kladným stropem.
 */
function tradeCircles(parties: readonly MarketParty[], caps: readonly number[]): boolean[][] {
  const open = (i: number): boolean => (caps[i] ?? 0) > 0;
  const reach = parties.map((buyer, b) =>
    parties.map(
      (seller, s) =>
        b !== s &&
        open(b) &&
        open(s) &&
        TRADE_GOODS.some((good) => (buyer.wants[good] ?? 0) > 0 && (seller.offer[good] ?? 0) > 0),
    ),
  );
  // tranzitivní uzávěr (Floydův–Warshallův) – stran je na trhu málo
  for (const [k, via] of reach.entries()) {
    for (const row of reach) {
      if (!row[k]) continue;
      via.forEach((to, j) => {
        if (to) row[j] = true;
      });
    }
  }
  return parties.map((_, b) =>
    parties.map((_, s) => b !== s && reach[b]?.[s] === true && reach[s]?.[b] === true),
  );
}

/** Kolo zápočtu se stropy `caps` (kroky 2 a 3 algoritmu). */
function clearingRound(
  parties: readonly MarketParty[],
  caps: readonly number[],
  prices: MarketPrices,
): ClearingRound {
  const circles = tradeCircles(parties, caps);
  const ledgers = parties.map((party, i): Ledger => ({
    party,
    cap: caps[i] ?? 0,
    stock: { ...party.offer },
    sellLeft: caps[i] ?? 0,
    budget: caps[i] ?? 0,
    earned: 0,
    spent: 0,
  }));
  const trades: MarketTrade[] = [];
  ledgers.forEach((buyer, b) => {
    for (const good of TRADE_GOODS) {
      const want = buyer.party.wants[good] ?? 0;
      if (!(want > 0 && buyer.budget > 0)) continue;
      const piece = isPieceGood(good);
      const price = priceOf(prices, good);
      // kolik smí prodat každá strana kruhu: co jí zbývá, nejvýš za její zbytek stropu
      const sellers = ledgers.map((seller, s) => ({
        seller,
        can:
          circles[b]?.[s] === true
            ? Math.max(0, whole(Math.min(seller.stock[good] ?? 0, seller.sellLeft / price), piece))
            : 0,
      }));
      let left = Math.min(
        whole(want, piece),
        sellers.reduce((sum, x) => sum + x.can, 0),
        whole(buyer.budget / price, piece),
      );
      for (const { seller, can } of sellers) {
        if (!(left > 0)) break;
        const amount = Math.min(can, left);
        if (!(amount > 0)) continue;
        const value = amount * price;
        trades.push({ seller: seller.party.key, buyer: buyer.party.key, good, amount });
        seller.stock[good] = minus(seller.stock[good] ?? 0, amount);
        seller.sellLeft = minus(seller.sellLeft, value);
        seller.earned += value;
        buyer.budget = minus(buyer.budget, value);
        buyer.spent += value;
        left = minus(left, amount);
      }
    }
  });
  return { trades, ledgers };
}

/** Vyrovnaná strana: utrženo a utraceno se liší nejvýš o EPS. */
function isBalanced(ledger: Ledger): boolean {
  return Math.abs(ledger.earned - ledger.spent) <= EPS;
}

/** Kola zápočtu (kroky 1–4): poslední kolo – vyrovnané, nebo po `CLEARING_ROUNDS` kolech. */
function settle(parties: readonly MarketParty[], prices: MarketPrices): ClearingRound {
  let round = clearingRound(
    parties,
    parties.map((p) => Math.min(worth(p.offer, prices), worth(p.wants, prices))),
    prices,
  );
  for (let n = 1; n < CLEARING_ROUNDS && !round.ledgers.every(isBalanced); n++) {
    const caps = round.ledgers.map((l) => Math.min(l.cap, l.earned, l.spent));
    round = clearingRound(parties, caps, prices);
  }
  return round;
}

/**
 * Zápočet tržního dne za ceny dne: strany v pořadí (hostitel, pak výpravy podle příjezdu), obchody
 * v pořadí přidělení. `offered` / `wanted` = součty celých nabídek a seznamů všech stran (i těch,
 * které ten den neobchodovaly) – z nich se počítá cena dalšího dne (`nextPrices`).
 */
export function clearMarket(parties: readonly MarketParty[], prices: MarketPrices): MarketClearing {
  const offered = totalGoods(parties.map((p) => p.offer));
  const wanted = totalGoods(parties.map((p) => p.wants));
  // krok 5: každé opakování ubere jednu stranu a trh bez stran je vyrovnaný – stačí nejvýš tolik
  // opakování, kolik je stran
  let active = parties;
  for (let attempt = 0; attempt <= parties.length; attempt++) {
    const round = settle(active, prices);
    const out = round.ledgers.map(isBalanced).lastIndexOf(false);
    if (out < 0) return { trades: round.trades, offered, wanted };
    active = active.filter((_, i) => i !== out);
  }
  return { trades: [], offered, wanted };
}

/** Co strana `key` ten den prodala a koupila (součty jejích obchodů). */
export function partyTotals(
  c: MarketClearing,
  key: string,
): { sold: TradeGoods; bought: TradeGoods } {
  const sold: TradeGoods = {};
  const bought: TradeGoods = {};
  for (const trade of c.trades) {
    if (trade.seller === key) sold[trade.good] = (sold[trade.good] ?? 0) + trade.amount;
    if (trade.buyer === key) bought[trade.good] = (bought[trade.good] ?? 0) + trade.amount;
  }
  return { sold, bought };
}
