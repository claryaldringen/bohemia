// Typy trhu – ceny v mincovní míře a zápočet tržního dne (markets.md – Pravidla 4 a 5,
// Rozhodnutí plánu 2, body 3 a 4). Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { Craft } from './types-crafts';
import type { TradeGood, TradeGoods } from './types-trade';

/**
 * Ceny trhu v mincích za kg, kus nebo m³ (markets.md – Rozhodnutí plánu 2, bod 3): trh si pamatuje
 * cenu každého zboží, které na něm bylo; chybí = výchozí cena (`initialPrice`).
 */
export type MarketPrices = Partial<Record<TradeGood, number>>;

/**
 * Strana tržního dne (markets.md – Pravidla 3 a 5): hostitelská ves nebo výprava – co nabízí
 * (`offer`) a co shání (`wants`, seznam bez cenových mezí). Pořadí stran je pořadí prodávajících
 * i kupujících: napřed hostitel, pak výpravy podle příjezdu (Martin 22. 11. 2026).
 */
export interface MarketParty {
  key: string;
  offer: TradeGoods;
  wants: TradeGoods;
}

/** Obchod tržního dne: prodávající dal kupujícímu `amount` kg, kusů nebo m³ zboží. */
export interface MarketTrade {
  seller: string;
  buyer: string;
  good: TradeGood;
  amount: number;
}

/**
 * Obchody dne v pořadí přidělení; offered / wanted = součty celých nabídek a seznamů (pro cenu).
 */
export interface MarketClearing {
  trades: MarketTrade[];
  offered: TradeGoods;
  wanted: TradeGoods;
}

/**
 * Co hostitelská ves na trhu nabízí a shání (markets.md – Rozhodnutí plánu 2, bod 5): jen
 * makrokomodity výhledu dávek.
 */
export interface MarketStance {
  offer: TradeGoods;
  wants: TradeGoods;
}

/** Příjezd obchodníka na trh vsi: odkud, v který den a s jakým zbožím (markets.md – Pravidla 8). */
export interface MarketArrivalNote {
  name: string;
  day: number;
  goods: TradeGood[];
}

/** Trh vsi (markets.md – Rozhodnutí plánu 2) – zatím jen paměť příjezdů, další části přijdou s trhem. */
export interface VillageMarket {
  /** Posledních `MARKET.report.traders` příjezdů, pořadí zápisu. */
  arrivals: MarketArrivalNote[];
}

/** Zpráva na pivo o vsi (markets.md – Pravidla 8). */
export interface VillageReport {
  day: number;
  people: number;
  houses: number;
  crafts: Craft[];
  traders: MarketArrivalNote[];
}
