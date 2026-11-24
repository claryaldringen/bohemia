// Typy trhu – ceny v mincovní míře, zápočet tržního dne, trh ve vsi hostitele a výprava na trh
// (markets.md – Pravidla 2, 3, 4, 5 a 8, Rozhodnutí plánu 2, body 2–7). Rozcestník je `types.ts`;
// tento soubor jen drží část typů.

import type { Craft } from './types-crafts';
import type { TradedHorse } from './types-livestock';
import type { Direction8 } from './types-state';
import type { HorseGood, TradeGood, TradeGoods } from './types-trade';

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

/**
 * Kůň na trhu (markets.md – Rozhodnutí plánu 2, bod 4): druh, pod kterým se prodává (počty po
 * druzích jdou zápočtem), a kus s věkem a výcvikem – kupující dostane tytéž koně.
 */
export interface MarketHorse {
  good: HorseGood;
  horse: TradedHorse;
}

/**
 * Výprava přijela na trh vsi – tělo události schránky `market-arrive` (markets.md – Pravidla 2
 * a 3, Rozhodnutí plánu 2, body 2 a 6).
 */
export interface MarketArrival {
  /** Klíč výpravy `market:<domovská ves>:<id výpravy>`. */
  key: string;
  fromVillageId: string;
  fromName: string;
  /** Dní na trhu (tržní dny příjezd … příjezd + `stayDays` − 1). */
  stayDays: number;
  /** Dní cesty domů – výsledek dojde v den po posledním tržním dni + `travelDays`. */
  travelDays: number;
  /** Co výprava veze na prodej – koně i tady jako počty po druzích. */
  goods: TradeGoods;
  /** Koně výpravy po kusech. */
  horses: MarketHorse[];
  /** Co výprava shání (seznam bez cenových mezí – Martin 22. 11. 2026). */
  wants: TradeGoods;
  /** Zpráva na pivo o domovské vsi – „obchodník, který přijel k nám“ (Pravidla 8). */
  report: VillageReport;
}

/**
 * Výprava na trhu vsi hostitele (markets.md – Pravidla 3): v pořadí příjezdu (`order`) prodává
 * a kupuje každý tržní den až do `lastDay` včetně, pak odjede.
 */
export interface MarketVisitor {
  key: string;
  fromVillageId: string;
  fromName: string;
  /** Pořadí příjezdu – mezi přespolními prodává a kupuje dřív, kdo přijel dřív (Martin). */
  order: number;
  arrivedDay: number;
  /** Poslední tržní den výpravy – večer odjede. */
  lastDay: number;
  travelDays: number;
  /** Co zbývá prodat (koně jako počty po druzích). */
  goods: TradeGoods;
  /** Neprodaní koně výpravy po kusech. */
  horses: MarketHorse[];
  /** Co zbývá koupit. */
  wants: TradeGoods;
  /** Co výprava na trhu prodala a koupila (součty za všechny tržní dny). */
  sold: TradeGoods;
  bought: TradeGoods;
  /** Koupení koně po kusech. */
  boughtHorses: MarketHorse[];
}

/**
 * Trh vsi (markets.md – Pravidla 3 a 4, Rozhodnutí plánu 2): ceny, výpravy na trhu a paměť
 * příjezdů obchodníků. Chybí = na trhu ještě nikdo nebyl.
 */
export interface VillageMarket {
  /** Ceny trhu po posledním tržním dni; chybí = výchozí cena. */
  prices: MarketPrices;
  /** Výpravy, které na trhu stojí, v pořadí příjezdu. */
  visitors: MarketVisitor[];
  /** Pořadí příští výpravy, která přijede. */
  nextOrder: number;
  /** Posledních `MARKET.report.traders` příjezdů, pořadí zápisu. */
  arrivals: MarketArrivalNote[];
}

/**
 * Výsledek trhu pro výpravu – tělo události schránky `market-result` domovské vsi (markets.md –
 * Pravidla 3, Rozhodnutí plánu 2, bod 6). Vzniká jen v `marketResult`.
 */
export interface MarketResult {
  key: string;
  sold: TradeGoods;
  bought: TradeGoods;
  /** Co se neprodalo a jde domů (koně jako počty po druzích). */
  unsold: TradeGoods;
  /** Koně domů po kusech – neprodaní i koupení. */
  horses: MarketHorse[];
  /** Zpráva na pivo o hostiteli v den odjezdu. */
  report?: VillageReport;
  /** Ceny trhu v den odjezdu. */
  prices?: MarketPrices;
  /** Hostitel zanikl – výprava se vrátila se vším, co drží. */
  returned?: true;
}

/** Zpráva trhu pro jinou ves (markets.md – Rozhodnutí plánu 2, bod 6). */
export type MarketMailBody =
  | { kind: 'market-arrive'; arrival: MarketArrival }
  | { kind: 'market-result'; result: MarketResult };

/**
 * Zpráva v odchozí schránce vsi (`VillageState.outbox`) – do schránky vsi `villageId` na den `day`
 * s jedinečným `ref` (stejný tvar jako nová událost schránky, `NewVillageEvent`).
 */
export interface VillageMail {
  villageId: string;
  day: number;
  ref: string;
  body: MarketMailBody;
}

/**
 * Zpráva na pivo o jiné vsi (markets.md – Pravidla 8): od obchodníka, který přijel k nám, nebo
 * od vlastní výpravy, která se vrátila – ta přinese i ceny trhu.
 */
export interface VillageNews {
  villageId: string;
  name: string;
  report: VillageReport;
  prices?: MarketPrices;
}

/**
 * Co hráč výpravě na trh zadá (markets.md – Pravidla 2 a 3; Martin 22. 11. 2026: „Výprava bude
 * mít určeno, jak dlouho na místě zůstane.“): zboží na prodej `give` (koně jako počty po druzích),
 * seznam `wants` (bez cenových mezí) a celé dny na trhu `stayDays`.
 */
export interface MarketOrder {
  give: TradeGoods;
  wants: TradeGoods;
  stayDays: number;
}

/**
 * Kam výprava na trh jede (markets.md – Rozhodnutí plánu 2, body 2 a 6): hostitelská ves, kolik
 * políček mapy světa je daleko, první krok cesty (karavana ve scéně jde ke kraji mapy v tom směru)
 * a domovská ves výpravy (klíč výpravy a jméno pro hostitele).
 */
export interface MarketTarget {
  villageId: string;
  name: string;
  cells: number;
  firstStep: Direction8;
  homeVillageId: string;
  homeName: string;
}

/**
 * Výprava na trh na cestě (`TradeExpedition.market` – markets.md, Rozhodnutí plánu 2, body 2
 * a 6): klíč `market:<domovská ves>:<id výpravy>`, hostitelská ves, seznam, dny pobytu a cesty
 * tam, den příjezdu na trh a `returnDay` – první den doma (lidé a vozy jsou pryč ve dnech
 * `startedDay` … `returnDay` − 1). Zboží přijde s výsledkem trhu (`applyMarketResult`).
 */
export interface MarketTrip {
  key: string;
  villageId: string;
  name: string;
  wants: TradeGoods;
  stayDays: number;
  travelDays: number;
  arriveDay: number;
  returnDay: number;
  /**
   * Vycvičení voli bez vozu, kteří jdou s výpravou a potáhnou koupené vozy domů (markets.md –
   * Rozhodnutí plánu 3, bod 4; `oxenForCarts` ze seznamu) – pryč jako voli vozů výpravy
   * (`oxenAway`), v `returnDay` je `marketTripsDay` smaže. Chybí = žádní.
   */
  oxen?: number;
}

/**
 * Ves okolí (markets.md – Rozhodnutí plánu 3, bod 1): ves na jedné z 8 sousedních map, kolik
 * políček mapy světa je daleko a první krok cesty k ní (jako `MarketTarget`).
 */
export interface NearbyVillage {
  villageId: string;
  name: string;
  cells: number;
  firstStep: Direction8;
}

/**
 * Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): snímek žijících vsí na 8 sousedních mapách –
 * i vsí téhož hráče –, který ves dostane událostí schránky `nearby` a další snímek ho celý nahradí.
 * Simulace nezná ostatní vsi ani své id; vesničané se podle okolí rozhodují uvnitř dne.
 */
export interface VillageNearby {
  /** Den, kdy ves okolí dostala (událost `nearby`). */
  day: number;
  self: { villageId: string; name: string };
  /** Vsi na 8 sousedních mapách, řazené podle `cells`, pak `villageId`. */
  villages: NearbyVillage[];
}

/** Zpráva na pivo o vsi (markets.md – Pravidla 8). */
export interface VillageReport {
  day: number;
  people: number;
  houses: number;
  crafts: Craft[];
  traders: MarketArrivalNote[];
}
